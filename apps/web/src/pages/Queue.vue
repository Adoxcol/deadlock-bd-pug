<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Check, LogOut, Search, X } from 'lucide-vue-next';
import { matchFound } from '../lib/sfx';
import { api } from '../lib/api';
import { realtime } from '../lib/ws';
import { useSession } from '../stores/session';
import PageHeader from '../components/PageHeader.vue';
import PlayerAvatar from '../components/PlayerAvatar.vue';

interface QueueView { total: number; players: { id: string; displayName: string; avatarUrl: string | null; rating: number | null; ready: boolean }[]; inQueue: boolean; pugId: string | null; readyCheck: { secondsLeft: number; ready: number; inCheck: boolean; iAmReady: boolean } | null }
const session = useSession();
const router = useRouter();
const q = ref<QueueView | null>(null);
const error = ref<string | null>(null);
const pending = ref(false);
const open = computed(() => Math.max(0, (q.value?.total ?? 12) - (q.value?.players.length ?? 0)));

function apply(view: QueueView) {
  q.value = view;
  if (view.pugId) router.push(`/pugs/${view.pugId}`);
}
async function load() {
  try { apply(await api<QueueView>('/queue')); error.value = null; } catch (e) { error.value = (e as Error).message; }
}
async function act(path: 'join' | 'leave' | 'ready') {
  pending.value = true;
  try { apply(await api<QueueView>(`/queue/${path}`, { method: 'POST', body: {} })); error.value = null; }
  catch (e) { error.value = (e as Error).message; }
  finally { pending.value = false; }
}
const myCheck = computed(() => (q.value?.readyCheck?.inCheck ? q.value.readyCheck : null));
const seconds = ref(0);
const notice = ref<string | null>(null);
let countdown: number | undefined; let flash: number | undefined;
const baseTitle = document.title;
function stopAlert() { clearInterval(flash); flash = undefined; document.title = baseTitle; }
watch(myCheck, (now, before) => {
  if (now) {
    seconds.value = now.secondsLeft;
    clearInterval(countdown);
    countdown = window.setInterval(() => { seconds.value = Math.max(0, seconds.value - 1); }, 1000);
    if (!before) { notice.value = null; matchFound(); }
    if (!now.iAmReady && !flash) flash = window.setInterval(() => { document.title = document.title === baseTitle ? 'MATCH FOUND - READY UP' : baseTitle; }, 800);
    if (now.iAmReady) stopAlert();
  } else {
    clearInterval(countdown); stopAlert();
    if (before && !before.iAmReady && !q.value?.inQueue && !q.value?.pugId) notice.value = 'You missed the ready check, so you left the queue.';
  }
});
async function remove(id: string) {
  try { await api(`/admin/queue/${id}/remove`, { method: 'POST', body: {} }); await load(); } catch (e) { error.value = (e as Error).message; }
}
let unsub: (() => void) | undefined; let beat: number | undefined;
onMounted(() => {
  load();
  unsub = realtime.subscribe('dashboard', (m) => { if (m.type === 'queue.updated') load(); });
  // Each load also tells the server this player is still here.
  beat = window.setInterval(load, 20_000);
});
onUnmounted(() => { unsub?.(); clearInterval(beat); clearInterval(countdown); stopAlert(); });
</script>

<template>
  <div class="space-y-6">
    <PageHeader eyebrow="6v6 queue" title="Find Match" />
    <section v-if="myCheck" class="border border-primary bg-primary/10 p-5 flex flex-wrap items-center justify-between gap-4" role="alert">
      <div>
        <div class="font-display text-3xl uppercase">Match found</div>
        <p class="text-sm mt-1"><span class="font-mono tabular-nums font-bold">{{ seconds }}s</span> left · {{ myCheck.ready }}/{{ q!.total }} ready</p>
      </div>
      <div class="flex gap-2">
        <button v-if="!myCheck.iAmReady" class="btn-primary !h-11 !px-6" :disabled="pending" @click="act('ready')"><Check class="w-4 h-4" />Ready</button>
        <span v-else class="font-display uppercase text-accent self-center">You're ready</span>
        <button class="btn-ghost !h-11" :disabled="pending" @click="act('leave')"><X class="w-4 h-4" />Decline</button>
      </div>
    </section>
    <p v-if="notice" role="status" class="card p-3 text-sm border-l-2 border-l-warn">{{ notice }}</p>
    <section class="card-ornate p-5 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div class="font-display text-4xl leading-none tabular-nums">{{ q?.players.length ?? 0 }}<span class="text-muted">/{{ q?.total ?? 12 }}</span></div>
          <p class="text-sm text-muted mt-1" aria-live="polite">{{ q?.inQueue ? `Searching. Waiting for ${open} more. Keep this page open.` : `${open} more needed to start.` }}</p>
        </div>
        <RouterLink v-if="!session.user" to="/login" class="btn-primary !h-11 !px-5">Log in to play</RouterLink>
        <button v-else-if="!q?.inQueue" class="btn-primary !h-11 !px-5" :disabled="pending || !q" @click="act('join')"><Search class="w-4 h-4" />Find Match</button>
        <button v-else class="btn-ghost !h-11 !px-5" :disabled="pending" @click="act('leave')"><LogOut class="w-4 h-4" />Leave queue</button>
      </div>
      <div class="h-2 rounded-full bg-raised overflow-hidden" role="progressbar" :aria-valuenow="q?.players.length ?? 0" aria-valuemin="0" :aria-valuemax="q?.total ?? 12">
        <div class="h-full bg-primary transition-all" :style="{ width: `${((q?.players.length ?? 0) / (q?.total ?? 12)) * 100}%` }" />
      </div>
      <p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p>
      <p class="text-xs text-muted">When the queue is full, everyone gets 30 seconds to ready up. Then a lobby is created and everyone is taken to it. The two highest-rated players become captains; without ratings, captains are random.</p>
    </section>
    <section class="card-ornate p-4" aria-label="Players waiting">
      <h2 class="h-section text-lg mb-3">In queue</h2>
      <p v-if="!q?.players.length" class="text-sm text-muted">Nobody is waiting yet. Be the first.</p>
      <ul v-else class="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
        <li v-for="p in q.players" :key="p.id">
          <RouterLink :to="`/players/${p.id}`" class="flex items-center gap-3 rounded-lg p-2 hover:bg-raised min-w-0">
            <PlayerAvatar :name="p.displayName" :src="p.avatarUrl" class="w-9 h-9 text-sm" />
            <span class="font-medium truncate min-w-0">{{ p.displayName }}</span>
            <Check v-if="p.ready" class="w-4 h-4 text-accent shrink-0" aria-label="Ready" />
            <span class="ml-auto font-mono text-xs tabular-nums text-muted shrink-0">{{ p.rating ?? 'Unrated' }}</span>
          </RouterLink>
          <button v-if="session.can('MODERATOR')" class="text-xs text-danger hover:underline px-2" @click="remove(p.id)">Remove {{ p.displayName }}</button>
        </li>
      </ul>
    </section>
  </div>
</template>
