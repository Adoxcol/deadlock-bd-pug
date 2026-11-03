<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Clock, AlertTriangle, ShieldCheck, Skull, Castle, Pause, Play, Flag } from 'lucide-vue-next';
import { api } from '../lib/api';
import { realtime } from '../lib/ws';
import { duration, dateShort } from '../lib/format';
import { useHeroes } from '../stores/heroes';
import { useSession } from '../stores/session';
import StatusBadge from '../components/StatusBadge.vue';
import HeroCard from '../components/HeroCard.vue';
import TeamCrest from '../components/draft/TeamCrest.vue';
import Metric from '../components/Metric.vue';
import PageState from '../components/PageState.vue';
import SimBadge from '../components/SimBadge.vue';
import LiveMap from '../components/LiveMap.vue';

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
/** Deadlock team numbers: 2 = Amber (Hidden King), 3 = Sapphire (Archmother). */
const sideOf = (t: number) => (t === 2 ? 'amber' : 'sapphire') as 'amber' | 'sapphire';
const teamName = (t: number) => match.value?.draft?.teamNames?.[sideOf(t)] ?? match.value?.pug?.teams?.find((x: any) => x.side === sideOf(t).toUpperCase())?.name ?? (t === 2 ? 'Team Amber' : 'Team Sapphire');
const players = (t: number) => Object.values(st.value?.players ?? {}).filter((p: any) => p.team === t).sort((a: any, b: any) => (b.kills ?? 0) - (a.kills ?? 0)) as any[];
const teamSouls = (t: number) => {
  const rows = players(t);
  if (!rows.length || rows.some((p) => p.souls == null)) return null;
  return rows.reduce((sum, p) => sum + p.souls, 0);
};
const showVitals = computed(() => Object.values(st.value?.players ?? {}).some((p: any) => p.health != null || p.level != null));
const boardCols = computed(() => showVitals.value
  ? 'grid-cols-[minmax(0,1fr)_2.25rem_2.25rem_2.25rem_4.5rem_4.5rem_3.25rem_2.25rem]'
  : 'grid-cols-[minmax(0,1fr)_2.25rem_2.25rem_2.25rem_4.5rem_4.5rem]');
const who = (idx: unknown) => st.value?.players?.[Number(idx)] ?? null;
const heroName = (heroId: number | null | undefined) => heroes.byId(heroId ?? -1)?.name ?? 'Unknown';
const heroSrc = (heroId: number | null | undefined) => heroes.byId(heroId ?? -1)?.imageUrl;
const mapDots = computed(() => (live.value?.map ?? []).map((d: { heroId: number | null; team: number | null; x: number; y: number }) => ({ ...d, label: `${d.team === 2 ? 'Amber' : d.team === 3 ? 'Sapphire' : 'Player'} · ${heroes.byId(d.heroId)?.name ?? 'Unknown hero'}` })));
const latest = computed(() => [...(st.value?.timeline ?? [])].reverse().slice(0, 4) as any[]);
const ringOf = (t?: number) => (t === 2 ? 'ring-amber-team' : t === 3 ? 'ring-sapphire-team' : 'ring-line');
const textOf = (t?: number) => (t === 2 ? 'text-amber-team' : t === 3 ? 'text-sapphire-team' : '');
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
      <!-- Header -->
      <div class="flex flex-wrap items-center gap-3">
        <div class="min-w-0">
          <div class="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-muted">{{ match.pug ? `PUG #${match.pug.number}` : 'Match' }} · {{ match.deadlockMatchId ?? match.id.slice(-6) }}</div>
          <div class="flex items-center gap-2 flex-wrap mt-1"><h1 class="text-2xl sm:text-4xl leading-none break-words min-w-0">{{ teamName(2) }} vs {{ teamName(3) }}</h1><StatusBadge :status="status" /><SimBadge v-if="match.isSimulated" /></div>
        </div>
        <div class="w-full sm:w-auto sm:ml-auto flex items-center gap-2">
          <button v-if="session.can('MODERATOR')" class="btn-ghost !h-9 flex-1 min-w-0 sm:flex-none !px-2 sm:!px-4 !text-xs sm:!text-sm whitespace-nowrap" @click="toggleView"><ShieldCheck class="w-4 h-4" />{{ modView ? 'Moderator view' : 'Public view' }}</button>
          <RouterLink v-if="status === 'completed' || session.can('MODERATOR')" :to="`/matches/${matchId}`" class="btn-primary !h-9 flex-1 min-w-0 sm:flex-none !px-2 sm:!px-5 !text-xs sm:!text-sm whitespace-nowrap">{{ status === 'completed' ? 'Results' : 'Submit result' }}</RouterLink>
        </div>
      </div>

      <!-- Score banner -->
      <section class="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6 border border-line/70 px-4 sm:px-6 py-4 bg-[linear-gradient(90deg,rgba(232,163,58,.16),rgba(14,12,10,.6)_42%,rgba(14,12,10,.6)_58%,rgba(90,143,224,.16))]">
        <div v-for="(t, i) in [2, 3]" :key="t" :class="['min-w-0', i === 1 && 'order-3']">
          <div :class="['flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3', i === 1 ? 'items-end sm:flex-row-reverse text-right' : 'items-start']">
            <TeamCrest :team="sideOf(t)" :size="44" class="shrink-0 hidden sm:block" />
            <div class="min-w-0">
              <div :class="['font-display text-sm sm:text-2xl uppercase break-words sm:truncate', t === 2 ? 'text-amber-team' : 'text-sapphire-team']">{{ teamName(t) }}</div>
              <div class="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted">{{ players(t).length }} players</div>
            </div>
            <div :class="['shrink-0 font-display text-4xl sm:text-6xl tabular-nums leading-none', i === 1 ? 'sm:mr-auto' : 'sm:ml-auto', t === 2 ? 'text-amber-team' : 'text-sapphire-team']">{{ st?.teams?.[String(t)]?.score ?? '–' }}</div>
          </div>
          <div :class="['mt-1.5', i === 1 ? 'text-right sm:text-left' : 'text-left sm:text-right']">
            <div class="inline-block text-center">
              <div :class="['font-mono text-xs sm:text-sm font-bold tabular-nums leading-none', t === 2 ? 'text-amber-team' : 'text-sapphire-team']"><Metric :value="teamSouls(t)" :reason="modView ? undefined : 'Hidden on the public scoreboard'" /></div>
              <div class="mt-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-muted">souls</div>
            </div>
          </div>
        </div>
        <div class="order-2 text-center">
          <div class="font-display text-2xl tabular-nums">{{ duration(st?.gameTime) }}</div>
          <div class="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Game time</div>
        </div>
      </section>

      <div class="flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-[11px] uppercase tracking-wider text-muted">
        <span :class="['flex items-center gap-1.5', stale && status !== 'completed' && 'text-warn']"><Clock class="w-3.5 h-3.5" />Updated {{ lastUpdate ? `${Math.round((now - lastUpdate) / 1000)}s ago` : 'never' }}</span>
        <span>Spectator delay: {{ live?.publicDelaySec ? `${live.publicDelaySec}s (public)` : modView ? 'none (moderator)' : 'unknown' }}</span>
        <span v-if="match.trackingNote" class="normal-case tracking-normal font-sans text-xs">{{ match.trackingNote }}</span>
      </div>
      <div v-if="stale && status !== 'completed'" class="card border-warn/40 px-4 py-2 text-sm text-warn flex items-center gap-2" role="status"><AlertTriangle class="w-4 h-4" />Data may be stale — no update received in over 15 seconds.</div>

      <section v-if="latest.length" class="card-ornate p-4" aria-label="Latest moments">
        <h2 class="h-section text-lg mb-2">Latest</h2>
        <ol class="grid md:grid-cols-2 gap-2">
          <li v-for="e in latest" :key="e.key" class="flex items-center gap-2 min-w-0 text-sm bg-raised/40 px-2.5 py-2">
            <span class="shrink-0 font-mono text-xs text-muted tabular-nums">{{ duration(e.gameTime) }}</span>
            <template v-if="e.kind === 'kill'">
              <HeroCard size="xs" :class="['shrink-0 ring-2', ringOf(who(e.detail.attacker)?.team)]" :name="heroName(who(e.detail.attacker)?.heroId)" :src="heroSrc(who(e.detail.attacker)?.heroId)" />
              <Skull class="w-3.5 h-3.5 shrink-0 text-danger" aria-label="killed" />
              <HeroCard size="xs" class="shrink-0 grayscale opacity-50" :name="heroName(who(e.detail.victim)?.heroId)" :src="heroSrc(who(e.detail.victim)?.heroId)" />
              <span class="break-words min-w-0"><span :class="['font-semibold', textOf(who(e.detail.attacker)?.team)]">{{ heroName(who(e.detail.attacker)?.heroId) }}</span> <span class="text-muted">killed {{ heroName(who(e.detail.victim)?.heroId) }}</span></span>
            </template>
            <template v-else>
              <component :is="icon(e.kind)" class="w-4 h-4 shrink-0 text-primary" />
              <span class="truncate min-w-0">{{ e.kind === 'objective' ? 'Objective destroyed' : e.kind === 'end' ? 'Match completed' : `Game ${e.kind}d` }}</span>
            </template>
          </li>
        </ol>
      </section>

      <LiveMap v-if="mapDots.length" :dots="mapDots" :delayed="!modView && (live?.publicDelaySec ?? 0) > 0" :unavailable="match.trackingState === 'LIVE_UNAVAILABLE'" />

      <!-- Tabs -->
      <div class="flex gap-1 border-b border-line">
        <button v-for="t in (['scoreboard', 'timeline', 'draft'] as const)" :key="t" :aria-pressed="tab === t"
          :class="['px-4 h-10 -mb-px border-b-2 font-display uppercase tracking-wider text-sm', tab === t ? 'border-primary text-text' : 'border-transparent text-muted hover:text-text']" @click="tab = t">{{ t }}</button>
      </div>

      <PageState v-if="tab === 'scoreboard'" :empty="!st" :empty-text="match.trackingState === 'LIVE_UNAVAILABLE' ? 'Live statistics are unavailable for this match.' : !modView ? 'Waiting for delayed public data…' : 'Waiting for live data…'">
        <div class="grid xl:grid-cols-2 gap-4">
          <section v-for="t in [2, 3]" :key="t" :class="['card-ornate overflow-hidden border-t-2', t === 2 ? '!border-t-amber-team' : '!border-t-sapphire-team']">
            <h2 :class="['px-4 pt-3 pb-2 text-lg', t === 2 ? 'text-amber-team' : 'text-sapphire-team']">{{ teamName(t) }}</h2>
            <div class="overflow-x-auto">
              <div :class="['grid items-center gap-x-2 px-3 h-8 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted border-b border-line', boardCols]">
                <span>Player</span><span class="text-right">K</span><span class="text-right">D</span><span class="text-right">A</span>
                <span class="text-right" title="Soul total. The live feed reports this as net worth.">Souls</span>
                <span class="text-right" title="Damage dealt to heroes">Hero dmg</span>
                <template v-if="showVitals"><span class="text-right">HP</span><span class="text-right">Lv</span></template>
              </div>
              <div v-for="p in players(t)" :key="p.entityIndex" :class="['grid items-center gap-x-2 px-3 py-1.5 border-b border-line/50 hover:bg-raised/50', boardCols]">
                <div class="flex items-center gap-2 min-w-0">
                  <HeroCard size="xs" class="shrink-0" :name="heroName(p.heroId)" :src="heroSrc(p.heroId)" />
                  <div class="min-w-0">
                    <div class="font-semibold truncate">{{ p.name ?? 'Unknown' }}</div>
                    <div class="font-mono text-[10px] uppercase tracking-wider text-muted truncate">{{ heroName(p.heroId) }}</div>
                  </div>
                </div>
                <span class="text-right font-mono text-sm tabular-nums"><Metric :value="p.kills" /></span>
                <span class="text-right font-mono text-sm tabular-nums"><Metric :value="p.deaths" /></span>
                <span class="text-right font-mono text-sm tabular-nums"><Metric :value="p.assists" /></span>
                <span class="text-right font-mono text-sm tabular-nums"><Metric :value="p.souls" :reason="modView ? undefined : 'Hidden on the public scoreboard'" /></span>
                <span class="text-right font-mono text-sm tabular-nums"><Metric :value="p.heroDamage" /></span>
                <template v-if="showVitals">
                  <span class="text-right font-mono text-sm tabular-nums"><Metric :value="p.health" /></span>
                  <span class="text-right font-mono text-sm tabular-nums"><Metric :value="p.level" /></span>
                </template>
              </div>
              <div :class="['grid items-center gap-x-2 px-3 py-2 bg-raised/40', boardCols]">
                <span class="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Team souls</span>
                <span /><span /><span />
                <span :class="['text-right font-mono text-sm font-bold tabular-nums', t === 2 ? 'text-amber-team' : 'text-sapphire-team']"><Metric :value="teamSouls(t)" :reason="modView ? undefined : 'Hidden on the public scoreboard'" /></span>
              </div>
            </div>
          </section>
        </div>
      </PageState>

      <section v-else-if="tab === 'timeline'" class="card-ornate p-4">
        <PageState :empty="!st?.timeline?.length" empty-text="No timeline events yet.">
          <ol class="space-y-1 max-h-[60vh] overflow-y-auto">
            <li v-for="e in [...st.timeline].reverse()" :key="e.key" class="flex items-center gap-2.5 text-sm py-1.5 border-b border-line/40 animate-fade-up min-w-0">
              <span class="w-12 shrink-0 font-mono text-xs text-muted tabular-nums">{{ duration(e.gameTime) }}</span>
              <template v-if="e.kind === 'kill'">
                <HeroCard size="xs" :class="['shrink-0 ring-2', ringOf(who(e.detail.attacker)?.team)]" :name="heroName(who(e.detail.attacker)?.heroId)" :src="heroSrc(who(e.detail.attacker)?.heroId)" />
                <span :class="['font-semibold truncate', textOf(who(e.detail.attacker)?.team)]">{{ who(e.detail.attacker)?.name ?? 'Someone' }}</span>
                <span class="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-danger">killed</span>
                <HeroCard size="xs" class="shrink-0 grayscale opacity-50" :name="heroName(who(e.detail.victim)?.heroId)" :src="heroSrc(who(e.detail.victim)?.heroId)" />
                <span class="truncate text-muted">{{ who(e.detail.victim)?.name ?? 'Someone' }}</span>
              </template>
              <template v-else>
                <component :is="icon(e.kind)" :class="['w-4 h-4 shrink-0', e.kind === 'objective' ? 'text-primary' : 'text-muted']" />
                <span v-if="e.kind === 'objective'">Objective destroyed <span class="text-muted">({{ String(e.detail.type).replace(/_/g, ' ') }})</span></span>
                <span v-else>{{ e.kind === 'end' ? 'Match completed' : `Game ${e.kind}d` }}</span>
              </template>
            </li>
          </ol>
        </PageState>
      </section>

      <section v-else class="card-ornate p-4">
        <PageState :empty="!match.draft" empty-text="No native draft linked to this match.">
          <div class="grid sm:grid-cols-2 gap-5">
            <div v-for="team in (['amber', 'sapphire'] as const)" :key="team">
              <h3 :class="['text-lg mb-2', team === 'amber' ? 'text-amber-team' : 'text-sapphire-team']">{{ match.draft.teamNames[team] }}</h3>
              <div class="grid grid-cols-6 gap-1.5 mb-2"><HeroCard v-for="h in match.draft.state.picks[team]" :key="h" :name="heroes.byId(h)?.name" :src="heroes.byId(h)?.imageUrl" /></div>
              <div class="font-mono text-[11px] uppercase tracking-wider text-muted">Bans: {{ match.draft.state.bans[team].map((h: number) => heroes.byId(h)?.name).join(', ') || 'none' }}</div>
            </div>
          </div>
          <p class="text-xs text-muted mt-4">Native draft · {{ duration(match.draft.state.completedAt && match.draft.state.startedAt ? (match.draft.state.completedAt - match.draft.state.startedAt) / 1000 : null) }} · started {{ match.draft.state.startedAt ? dateShort(new Date(match.draft.state.startedAt).toISOString()) : '—' }}
            · <RouterLink :to="`/draft/${match.draft.id}`" class="text-primary hover:underline">Full pick order</RouterLink></p>
        </PageState>
      </section>
    </div>
  </PageState>
</template>
