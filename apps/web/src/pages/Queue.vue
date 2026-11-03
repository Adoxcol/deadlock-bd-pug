<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { LogOut, Search } from 'lucide-vue-next';
import { api } from '../lib/api';
import { realtime } from '../lib/ws';
import { useSession } from '../stores/session';
import PageHeader from '../components/PageHeader.vue';
import PlayerAvatar from '../components/PlayerAvatar.vue';

interface QueueView { total: number; players: { id: string; displayName: string; avatarUrl: string | null; rating: number | null }[]; inQueue: boolean; pugId: string | null }
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
async function act(path: 'join' | 'leave') {
  pending.value = true;
  try { apply(await api<QueueView>(`/queue/${path}`, { method: 'POST', body: {} })); error.value = null; }
  catch (e) { error.value = (e as Error).message; }
  finally { pending.value = false; }
}
let unsub: (() => void) | undefined; let beat: number | undefined;
onMounted(() => {
  load();
  unsub = realtime.subscribe('dashboard', (m) => { if (m.type === 'queue.updated') load(); });
  // Each load also tells the server this player is still here.
  beat = window.setInterval(load, 20_000);
});
onUnmounted(() => { unsub?.(); clearInterval(beat); });
</script>

<template>
  <div class="space-y-6">
    <PageHeader eyebrow="6v6 queue" title="Find Match" />
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
      <p class="text-xs text-muted">When the queue is full, a lobby is created and everyone is taken to it. The two highest-rated players become captains; without ratings, captains are random.</p>
    </section>
    <section class="card-ornate p-4" aria-label="Players waiting">
      <h2 class="h-section text-lg mb-3">In queue</h2>
      <p v-if="!q?.players.length" class="text-sm text-muted">Nobody is waiting yet. Be the first.</p>
      <ul v-else class="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
        <li v-for="p in q.players" :key="p.id">
          <RouterLink :to="`/players/${p.id}`" class="flex items-center gap-3 rounded-lg p-2 hover:bg-raised min-w-0">
            <PlayerAvatar :name="p.displayName" :src="p.avatarUrl" class="w-9 h-9 text-sm" />
            <span class="font-medium truncate min-w-0">{{ p.displayName }}</span>
            <span class="ml-auto font-mono text-xs tabular-nums text-muted shrink-0">{{ p.rating ?? 'Unrated' }}</span>
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>
