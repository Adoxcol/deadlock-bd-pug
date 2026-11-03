<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Gamepad2, Copy, Radio, Loader2, AlertTriangle, Clock, RefreshCw } from 'lucide-vue-next';
import { ApiError, api } from '../../lib/api';
import { realtime } from '../../lib/ws';
import StatusBadge from '../StatusBadge.vue';
import { useSession } from '../../stores/session';

interface Lobby { matchRowId: string; partyCode: string | null; deadlockMatchId: string | null; state: string; note: string | null; expiresAt: string | null; webhook: boolean }
const props = defineProps<{ draftId: string; canCreate: boolean; simulated: boolean }>();
const emit = defineEmits<{ copied: [string] }>();
const session = useSession();
const lobby = ref<Lobby | null>(null);
const loaded = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
const retryAt = ref<number | null>(null);
const now = ref(Date.now());

const matched = computed(() => !!lobby.value?.deadlockMatchId);
const msLeft = computed(() => (lobby.value?.expiresAt ? new Date(lobby.value.expiresAt).getTime() - now.value : 0));
const botGone = computed(() => !!lobby.value && !matched.value && msLeft.value <= 0);
const countdown = computed(() => { const s = Math.max(0, Math.floor(msLeft.value / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; });
const retryLeft = computed(() => (retryAt.value == null ? 0 : Math.max(0, retryAt.value - now.value)));
const retryLabel = computed(() => { const s = Math.ceil(retryLeft.value / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; });
const statusKey = computed(() => (matched.value ? 'live' : botGone.value ? 'unavailable' : 'waiting'));

async function load() { try { lobby.value = (await api<{ lobby: Lobby | null }>(`/drafts/${props.draftId}/lobby`)).lobby; } catch (e) { error.value = (e as Error).message; } finally { loaded.value = true; } }
async function create() {
  busy.value = true; error.value = null;
  try { lobby.value = (await api<{ lobby: Lobby }>(`/drafts/${props.draftId}/lobby`, { method: 'POST', body: {} })).lobby; retryAt.value = null; }
  catch (e) {
    error.value = (e as Error).message;
    retryAt.value = e instanceof ApiError && e.retryAfterSec != null ? Date.now() + e.retryAfterSec * 1000 : null;
  } finally { busy.value = false; }
}
async function copyCode() { if (!lobby.value?.partyCode) return; await navigator.clipboard?.writeText(lobby.value.partyCode).catch(() => {}); emit('copied', 'Party code'); }

let unsub = () => {};
let tick: number, poll: number;
onMounted(() => {
  load();
  // Pushes carry no party code (spectators get them too), so refetch: the server decides who may see it.
  unsub = realtime.subscribe(`draft:${props.draftId}`, (m) => { if (m.type === 'draft.lobby' || m.type === 'draft.match') load(); });
  tick = window.setInterval(() => (now.value = Date.now()), 1000);
  poll = window.setInterval(() => { if (lobby.value && !matched.value) load(); }, 15_000);
});
onUnmounted(() => { unsub(); clearInterval(tick); clearInterval(poll); });
</script>

<template>
  <section class="card p-4 space-y-3" aria-labelledby="lobby-h">
    <div class="flex flex-wrap items-center gap-2">
      <h2 id="lobby-h" class="font-semibold flex items-center gap-2"><Gamepad2 class="w-4 h-4 text-accent" />Deadlock lobby</h2>
      <StatusBadge v-if="lobby" :status="statusKey" />
    </div>

    <div v-if="!loaded" class="text-sm text-muted flex items-center gap-2"><Loader2 class="w-4 h-4 animate-spin" />Loading…</div>

    <template v-else-if="!lobby || (botGone && canCreate && !matched)">
      <p v-if="botGone" class="text-sm text-warn flex items-center gap-2"><Clock class="w-4 h-4" />The lobby bot left (15-minute limit) and no match was detected.</p>
      <p class="text-sm text-muted">Create a private custom match in Deadlock. Everyone joins with the party code, picks the hero they were assigned and starts the game. The website detects the match automatically.</p>
      <p v-if="simulated" class="text-xs text-warn">This draft uses simulated data, but the lobby is a real Deadlock lobby.</p>
      <button v-if="canCreate" class="btn-primary" :disabled="busy || retryLeft > 0" @click="create">
        <component :is="busy ? Loader2 : botGone ? RefreshCw : Gamepad2" :class="['w-4 h-4', busy && 'animate-spin']" />{{ busy ? 'Creating lobby… (can take ~30s)' : retryLeft > 0 ? `Next request in ${retryLabel}` : botGone ? 'Create a new lobby' : 'Create Deadlock lobby' }}
      </button>
      <p v-else class="text-sm text-muted">Waiting for a captain to create the lobby.</p>
    </template>

    <template v-else>
      <div v-if="lobby.partyCode && !matched" class="flex flex-wrap items-center gap-4">
        <div>
          <div class="text-xs text-muted">Party code — join in Deadlock</div>
          <button class="mt-1 h-12 px-4 rounded-lg border border-accent/50 bg-accent/10 font-mono text-2xl tracking-[0.25em] flex items-center gap-3 hover:bg-accent/20" title="Copy party code" @click="copyCode">
            {{ lobby.partyCode }}<Copy class="w-4 h-4 text-muted" />
          </button>
        </div>
        <div v-if="!botGone" class="text-sm">
          <div class="text-xs text-muted">Start the match within</div>
          <div :class="['text-xl font-semibold tabular-nums', msLeft < 180_000 ? 'text-warn' : '']">{{ countdown }}</div>
        </div>
      </div>
      <p v-else-if="!matched" class="text-sm text-muted">A lobby is open. The party code is only shown to the captains and players of this draft.</p>

      <ol v-if="!matched" class="text-sm text-muted list-decimal pl-5 space-y-0.5">
        <li>In Deadlock, open <b class="text-text">Play → Custom</b> and join with the party code.</li>
        <li>Each player picks the hero they were assigned above. The lobby bot sits in spectator.</li>
        <li>Start the match. This page switches to the live match automatically.</li>
      </ol>

      <div v-if="matched" class="flex flex-wrap items-center gap-3">
        <span class="text-sm">Match <b class="font-mono">{{ lobby.deadlockMatchId }}</b> detected.</span>
        <RouterLink :to="`/matches/${lobby.matchRowId}/live`" class="btn-primary !h-8"><Radio class="w-4 h-4" />Open live match</RouterLink>
        <RouterLink v-if="session.can('MODERATOR')" :to="`/matches/${lobby.matchRowId}`" class="btn-ghost !h-8">Submit result</RouterLink>
      </div>
      <p v-if="lobby.note" class="text-xs text-muted">{{ lobby.note }}</p>
      <p v-if="!matched && !lobby.webhook" class="text-xs text-muted">Detection checks every 15 seconds and can take a minute after the game starts.</p>
    </template>

    <p v-if="retryLeft > 0" class="text-sm text-warn flex items-center gap-2" role="status"><Clock class="w-4 h-4 shrink-0" />Lobby limit reached. Next request in {{ retryLabel }}.</p>
    <p v-if="error" class="text-sm text-danger flex items-center gap-2" role="alert"><AlertTriangle class="w-4 h-4 shrink-0" />{{ error }}</p>
    <p class="text-xs text-muted">Lobbies are created by the deadlock-api.com bot. Can't use it? Create the lobby in-game and a moderator can enter the Match ID in the <RouterLink to="/tracker" class="text-accent hover:underline">Tracker</RouterLink>.</p>
  </section>
</template>
