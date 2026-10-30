<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Clock, AlertTriangle, ShieldCheck, Skull, Castle, Pause, Play, Flag } from 'lucide-vue-next';
import { api } from '../lib/api';
import { realtime } from '../lib/ws';
import { duration, dateShort } from '../lib/format';
import { useHeroes } from '../stores/heroes';
import { useSession } from '../stores/session';
import StatusBadge from '../components/StatusBadge.vue';
import HeroPortrait from '../components/HeroPortrait.vue';
import Metric from '../components/Metric.vue';
import PageState from '../components/PageState.vue';
import SimBadge from '../components/SimBadge.vue';

const props = defineProps<{ matchId: string }>();
const heroes = useHeroes();
const session = useSession();
const match = ref<any>(null);
const live = ref<any>(null);
const lastUpdate = ref<number | null>(null);
const error = ref<string | null>(null);
const tab = ref<'scoreboard' | 'timeline' | 'draft'>('scoreboard');
const modView = ref(session.can('MODERATOR'));
const now = ref(Date.now());

const st = computed(() => live.value?.state);
const status = computed(() => {
  const ts = match.value?.trackingState?.toLowerCase();
  if (st.value?.completed || ts === 'match_completed') return 'completed';
  if (st.value?.paused) return 'paused';
  if (st.value) return 'live';
  return ts ?? 'waiting';
});
const stale = computed(() => !!live.value?.stale || (lastUpdate.value !== null && now.value - lastUpdate.value > 15_000 && !st.value?.completed));
const teamName = (t: number) => (t === 2 ? match.value?.pug?.teams?.find((x: any) => x.side === 'AMBER')?.name ?? 'Team Amber' : match.value?.pug?.teams?.find((x: any) => x.side === 'SAPPHIRE')?.name ?? 'Team Sapphire');
const players = (t: number) => Object.values(st.value?.players ?? {}).filter((p: any) => p.team === t).sort((a: any, b: any) => (b.kills ?? 0) - (a.kills ?? 0)) as any[];
const icon = (k: string) => ({ kill: Skull, objective: Castle, pause: Pause, resume: Play, end: Flag } as any)[k];

async function load() {
  try {
    match.value = await api(`/matches/${props.matchId}`);
    const l = await api<any>(`/matches/${props.matchId}/live`);
    if (l.state) { live.value = l; lastUpdate.value = Date.now(); }
  } catch (e) { error.value = (e as Error).message; }
}
let unsub = () => {};
let tick: number;
function subscribe() {
  unsub();
  unsub = realtime.subscribe(`match:${props.matchId}${modView.value ? ':mod' : ''}`, (m) => {
    if (m.type === 'live.state' && m.payload.state) { live.value = m.payload; lastUpdate.value = Date.now(); if (m.payload.state.completed) load(); }
  });
}
onMounted(async () => { await Promise.all([heroes.load().catch(() => {}), load()]); subscribe(); tick = window.setInterval(() => (now.value = Date.now()), 1000); });
onUnmounted(() => { unsub(); clearInterval(tick); });
function toggleView() { modView.value = !modView.value; live.value = null; subscribe(); }
</script>

<template>
  <PageState :loading="!match && !error" :error="!match ? error : null">
    <div v-if="match" class="space-y-4">
      <header class="card p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div>
          <div class="flex items-center gap-2 flex-wrap"><h1 class="text-xl font-semibold">Match {{ match.deadlockMatchId ?? match.id.slice(-6) }}</h1><StatusBadge :status="status" /><SimBadge v-if="match.isSimulated" /></div>
          <p class="text-xs text-muted mt-1">PUG #{{ match.pug?.number ?? '—' }} · <span class="text-amber-team">{{ teamName(2) }}</span> vs <span class="text-sapphire-team">{{ teamName(3) }}</span></p>
        </div>
        <div class="flex items-center gap-6 sm:ml-auto text-sm">
          <div class="text-center"><div class="text-xs text-muted">Score</div><div class="text-2xl font-semibold tabular-nums"><span class="text-amber-team">{{ st?.teams?.['2']?.score ?? '–' }}</span> <span class="text-muted">:</span> <span class="text-sapphire-team">{{ st?.teams?.['3']?.score ?? '–' }}</span></div></div>
          <div><div class="text-xs text-muted">Game time</div><div class="font-semibold tabular-nums">{{ duration(st?.gameTime) }}</div></div>
          <div><div class="text-xs text-muted">Last update</div><div class="font-medium flex items-center gap-1" :class="stale ? 'text-warn' : ''"><Clock class="w-3.5 h-3.5" />{{ lastUpdate ? `${Math.round((now - lastUpdate) / 1000)}s ago` : 'never' }}</div></div>
          <div><div class="text-xs text-muted">Spectator delay</div><div class="font-medium">{{ live?.publicDelaySec ? `${live.publicDelaySec}s (public)` : modView ? 'None (moderator)' : 'Unknown' }}</div></div>
        </div>
      </header>

      <div v-if="stale && status !== 'completed'" class="card border-warn/40 px-4 py-2 text-sm text-warn flex items-center gap-2" role="status"><AlertTriangle class="w-4 h-4" />Data may be stale — no update received in over 15 seconds.</div>
      <div v-if="match.trackingNote" class="text-xs text-muted">{{ match.trackingNote }}</div>

      <div class="flex flex-wrap items-center gap-2">
        <div class="flex rounded-lg border border-line overflow-hidden text-sm">
          <button v-for="t in (['scoreboard', 'timeline', 'draft'] as const)" :key="t" :class="['px-3 h-9 capitalize', tab === t ? 'bg-raised' : 'text-muted hover:text-text']" @click="tab = t">{{ t }}</button>
        </div>
        <button v-if="session.can('MODERATOR')" class="btn-ghost !h-9 ml-auto" @click="toggleView"><ShieldCheck class="w-4 h-4" />{{ modView ? 'Moderator view (full, real-time)' : 'Public view (delayed, redacted)' }}</button>
        <RouterLink v-if="status === 'completed'" :to="`/matches/${matchId}`" class="btn-primary !h-9">Results</RouterLink>
      </div>

      <PageState v-if="tab === 'scoreboard'" :empty="!st" :empty-text="match.trackingState === 'LIVE_UNAVAILABLE' ? 'Live statistics are unavailable for this match.' : !modView ? 'Waiting for delayed public data…' : 'Waiting for live data…'">
        <div class="grid xl:grid-cols-2 gap-4">
          <section v-for="t in [2, 3]" :key="t" :class="['card overflow-hidden border-t-2', t === 2 ? '!border-t-amber-team' : '!border-t-sapphire-team']">
            <h2 :class="['px-4 py-2.5 font-semibold', t === 2 ? 'text-amber-team' : 'text-sapphire-team']">{{ teamName(t) }}</h2>
            <div class="overflow-x-auto">
              <table class="w-full table-compact">
                <thead><tr><th>Player</th><th class="text-right">K</th><th class="text-right">D</th><th class="text-right">A</th><th class="text-right" title="Unspent souls are not exposed by the live data source">Souls</th><th class="text-right">Net worth</th><th class="text-right">Hero dmg</th></tr></thead>
                <tbody>
                  <tr v-for="p in players(t)" :key="p.entityIndex">
                    <td><div class="flex items-center gap-2 min-w-[150px]"><HeroPortrait :name="heroes.byId(p.heroId)?.name ?? '?'" :src="heroes.byId(p.heroId)?.imageUrl" size="sm" /><div class="min-w-0"><div class="font-medium truncate max-w-[140px]">{{ p.name ?? 'Unknown' }}</div><div class="text-[11px] text-muted">{{ heroes.byId(p.heroId)?.name ?? 'Unknown hero' }}</div></div></div></td>
                    <td class="text-right"><Metric :value="p.kills" /></td><td class="text-right"><Metric :value="p.deaths" /></td><td class="text-right"><Metric :value="p.assists" /></td>
                    <td class="text-right"><Metric :value="p.souls" reason="Not exposed by deadlock-api live-events" /></td>
                    <td class="text-right"><Metric :value="p.netWorth" :reason="modView ? undefined : 'Hidden in public view during the match'" /></td>
                    <td class="text-right"><Metric :value="p.heroDamage" /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </PageState>

      <section v-else-if="tab === 'timeline'" class="card p-4">
        <PageState :empty="!st?.timeline?.length" empty-text="No timeline events yet.">
          <ol class="space-y-1.5 max-h-[60vh] overflow-y-auto">
            <li v-for="e in [...st.timeline].reverse()" :key="e.key" class="flex items-center gap-3 text-sm">
              <span class="w-12 text-xs text-muted tabular-nums">{{ duration(e.gameTime) }}</span>
              <component :is="icon(e.kind)" class="w-4 h-4 text-muted" />
              <span v-if="e.kind === 'kill'">{{ st.players[e.detail.attacker]?.name ?? 'Someone' }} killed {{ st.players[e.detail.victim]?.name ?? 'someone' }}</span>
              <span v-else-if="e.kind === 'objective'">Objective destroyed ({{ e.detail.type.replace(/_/g, ' ') }})</span>
              <span v-else class="capitalize">{{ e.kind === 'end' ? 'Match completed' : `Game ${e.kind}d` }}</span>
            </li>
          </ol>
        </PageState>
      </section>

      <section v-else class="card p-4">
        <PageState :empty="!match.draft" empty-text="No native draft linked to this match.">
          <div class="grid sm:grid-cols-2 gap-4">
            <div v-for="team in (['amber', 'sapphire'] as const)" :key="team">
              <h3 :class="['font-semibold mb-2', team === 'amber' ? 'text-amber-team' : 'text-sapphire-team']">{{ match.draft.teamNames[team] }}</h3>
              <div class="flex flex-wrap gap-2 mb-2"><div v-for="h in match.draft.state.picks[team]" :key="h" class="flex items-center gap-1.5 text-sm"><HeroPortrait :name="heroes.byId(h)?.name" :src="heroes.byId(h)?.imageUrl" size="sm" />{{ heroes.byId(h)?.name }}</div></div>
              <div class="text-xs text-muted">Bans: {{ match.draft.state.bans[team].map((h: number) => heroes.byId(h)?.name).join(', ') || 'none' }}</div>
            </div>
          </div>
          <p class="text-xs text-muted mt-3">Provider: Native Draft · Duration {{ duration(match.draft.state.completedAt && match.draft.state.startedAt ? (match.draft.state.completedAt - match.draft.state.startedAt) / 1000 : null) }} · Started {{ match.draft.state.startedAt ? dateShort(new Date(match.draft.state.startedAt).toISOString()) : '—' }}
            · <RouterLink :to="`/draft/${match.draft.id}`" class="text-accent hover:underline">Full pick order</RouterLink></p>
        </PageState>
      </section>
    </div>
  </PageState>
</template>
