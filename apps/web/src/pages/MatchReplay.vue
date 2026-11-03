<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ArrowLeft, Pause, Play, Skull, Swords } from 'lucide-vue-next';
import { api } from '../lib/api';
import { useHeroes } from '../stores/heroes';
import PageHeader from '../components/PageHeader.vue';
import PageState from '../components/PageState.vue';
import HeroCard from '../components/HeroCard.vue';

type Team = 'amber' | 'sapphire';
type Player = { slot: number; heroId: number | null; team: Team; x: number[]; y: number[]; health: number[]; souls: { t: number; v: number }[] };
type Replay = { durationSec: number; players: Player[]; deaths: { t: number; victim: number; killer: number | null; x: number; y: number; respawn: number }[]; objectives: { t: number; team: Team; id: number }[]; midBoss: { t: number; team: Team | null }[]; pauses: { t: number; seconds: number }[] };

const props = defineProps<{ matchId: string }>();
const heroes = useHeroes();
const replay = ref<Replay | null>(null);
const match = ref<any>(null);
const error = ref<string | null>(null);
const t = ref(0);
const playing = ref(false);
const speed = ref(8);
const SPEEDS = [1, 2, 4, 8, 16];
// World units covered by the minimap image, from /v1/assets/map.
const RADIUS = 10752;
const MAP = 'https://assets-bucket.deadlock-api.com/assets-api-res/images/maps/minimap_midtown_mid.png';

let frame = 0, last = 0;
function tick(now: number) {
  if (playing.value && replay.value) {
    t.value = Math.min(replay.value.durationSec, t.value + ((now - last) / 1000) * speed.value);
    if (t.value >= replay.value.durationSec) playing.value = false;
  }
  last = now;
  frame = requestAnimationFrame(tick);
}
onMounted(async () => {
  heroes.load().catch(() => {});
  frame = requestAnimationFrame((n) => { last = n; tick(n); });
  try { [replay.value, match.value] = await Promise.all([api<Replay>(`/matches/${props.matchId}/replay`), api<any>(`/matches/${props.matchId}`)]); }
  catch (e) { error.value = (e as Error).message; }
});
onBeforeUnmount(() => cancelAnimationFrame(frame));

function toggle() {
  if (!replay.value) return;
  if (t.value >= replay.value.durationSec) t.value = 0;
  playing.value = !playing.value;
}
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const short = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
const at = (a: number[], s: number) => { const i = Math.floor(s), f = s - i; const v = a[i] ?? a[a.length - 1] ?? 0; return v + ((a[i + 1] ?? v) - v) * f; };
const statFor = (p: Player) => (match.value?.result?.stats ?? []).find((s: any) => s.heroId === p.heroId && s.team === p.team.toUpperCase());
const nameOf = (p: Player | undefined) => (p ? (statFor(p)?.displayNameSnapshot ?? heroName(p)) : 'Unknown');
const heroName = (p: Player) => heroes.byId(p.heroId)?.name ?? 'Unknown hero';
const bySlot = computed(() => new Map((replay.value?.players ?? []).map((p) => [p.slot, p])));
const teamLabel = (team: Team | null) => (team === 'amber' ? 'Hidden King' : team === 'sapphire' ? 'Archmother' : 'Nobody');

const dots = computed(() => (replay.value?.players ?? []).map((p) => {
  const health = at(p.health, t.value);
  return { p, health, left: ((at(p.x, t.value) + RADIUS) / (2 * RADIUS)) * 100, top: ((RADIUS - at(p.y, t.value)) / (2 * RADIUS)) * 100 };
}));
function souls(p: Player, s: number) {
  let prev = { t: 0, v: 0 };
  for (const q of p.souls) { if (q.t >= s) return prev.v + (q.v - prev.v) * ((s - prev.t) / (q.t - prev.t || 1)); prev = q; }
  return prev.v;
}
const board = computed(() => {
  const r = replay.value; if (!r) return [];
  return (['amber', 'sapphire'] as const).map((team) => ({ team, rows: r.players.filter((p) => p.team === team).map((p) => ({
    p, kills: r.deaths.filter((d) => d.killer === p.slot && d.t <= t.value).length, deaths: r.deaths.filter((d) => d.victim === p.slot && d.t <= t.value).length, souls: souls(p, t.value),
  })).sort((a, b) => b.souls - a.souls) }));
});

// team_objective_id names; the game's ids, labels are ours.
const objectiveName = (id: number) => (id === 0 || id === 9 ? 'Patron' : id >= 1 && id <= 4 ? 'Guardian' : id >= 5 && id <= 8 ? 'Walker' : id === 10 || id === 11 ? 'Shrine' : 'Base Guardian');
const events = computed(() => {
  const r = replay.value; if (!r) return [];
  return [
    ...r.objectives.map((o) => ({ t: o.t, kind: 'objective', team: o.team, text: `${teamLabel(o.team)} lost a ${objectiveName(o.id)}` })),
    ...r.midBoss.map((b) => ({ t: b.t, kind: 'boss', team: b.team, text: `${teamLabel(b.team)} claimed Mid Boss` })),
    ...r.pauses.map((p) => ({ t: p.t, kind: 'pause', team: null, text: `Paused for ${clock(p.seconds)}` })),
  ];
});
type FeedEvent = { t: number; kind: string; team: Team | null; text: string; killer?: Player; victim?: Player };
const feed = computed<FeedEvent[]>(() => {
  const r = replay.value; if (!r) return [];
  const kills: FeedEvent[] = r.deaths.map((d) => {
    const victim = bySlot.value.get(d.victim), killer = d.killer === null ? undefined : bySlot.value.get(d.killer);
    return { t: d.t, kind: 'kill', team: killer?.team ?? null, killer, victim, text: killer ? `${nameOf(killer)} killed ${nameOf(victim)}` : `${nameOf(victim)} died` };
  });
  return [...kills, ...events.value].filter((e) => e.t <= t.value).sort((a, b) => b.t - a.t).slice(0, 12);
});
const recentDeaths = computed(() => (replay.value?.deaths ?? []).filter((d) => d.t <= t.value && t.value - d.t < 20));
const portrait = (p: Player) => ['block w-9 h-11 shrink-0 overflow-hidden border-b-2', p.team === 'amber' ? 'border-amber-team bg-amber-team/30' : 'border-sapphire-team bg-sapphire-team/30'];
const clean = (n: string) => n.replace('[SIM] ', '');
const tickTone = (kind: string) => (kind === 'boss' ? 'bg-primary h-4' : kind === 'pause' ? 'bg-muted h-2' : 'bg-text h-3');
</script>

<template>
  <PageState :loading="!replay && !error" :error="!replay ? error : null">
    <div v-if="replay" class="max-w-6xl mx-auto space-y-4">
      <PageHeader eyebrow="Match replay" :title="`Match ${match?.deadlockMatchId ?? ''}`">
        <RouterLink :to="`/matches/${matchId}`" class="btn-ghost !h-9"><ArrowLeft class="w-4 h-4" />Scoreboard</RouterLink>
      </PageHeader>

      <div class="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
        <div class="space-y-3 min-w-0">
          <section class="relative mx-auto w-full max-w-[640px] aspect-square bg-bg border border-line overflow-hidden" aria-label="Overhead map">
            <img :src="MAP" alt="" class="absolute inset-0 w-full h-full object-contain brightness-[2.5]" />
            <span v-for="(d, i) in recentDeaths" :key="i" class="absolute -translate-x-1/2 -translate-y-1/2 text-warn" :style="{ left: `${((d.x + RADIUS) / (2 * RADIUS)) * 100}%`, top: `${((RADIUS - d.y) / (2 * RADIUS)) * 100}%`, opacity: 1 - (t - d.t) / 20 }"><Skull class="w-3.5 h-3.5" aria-hidden="true" /></span>
            <div v-for="d in dots" v-show="d.health > 0" :key="d.p.slot" class="absolute -translate-x-1/2 -translate-y-1/2 w-6 sm:w-8" :style="{ left: `${d.left}%`, top: `${d.top}%` }" :title="`${clean(nameOf(d.p))}, ${heroName(d.p)}`">
              <div :class="['aspect-square rounded-full overflow-hidden border-2 bg-bg', d.p.team === 'amber' ? 'border-amber-team' : 'border-sapphire-team']">
                <img v-if="heroes.byId(d.p.heroId)?.imageUrl" :src="heroes.byId(d.p.heroId)!.imageUrl!" :alt="heroName(d.p)" class="w-full h-full object-cover object-top" />
              </div>
              <div class="h-1 bg-bg mt-0.5"><div class="h-full bg-accent" :style="{ width: `${Math.max(0, Math.min(100, d.health))}%` }" /></div>
            </div>
          </section>

          <section class="card px-3 py-3 space-y-2" aria-label="Replay controls">
            <div class="relative h-4" aria-hidden="true">
              <span v-for="(e, i) in events" :key="i" :class="['absolute bottom-0 w-0.5', tickTone(e.kind)]" :style="{ left: `${(e.t / replay.durationSec) * 100}%` }" :title="`${clock(e.t)} ${e.text}`" />
            </div>
            <input v-model.number="t" type="range" min="0" :max="replay.durationSec" step="1" class="w-full accent-[var(--color-primary,#e8a33a)]" aria-label="Match time" :aria-valuetext="clock(t)" />
            <div class="flex flex-wrap items-center gap-3">
              <button type="button" class="btn-primary !h-10" :aria-label="playing ? 'Pause' : 'Play'" @click="toggle"><Pause v-if="playing" class="w-4 h-4" /><Play v-else class="w-4 h-4" /></button>
              <span class="font-display text-xl tabular-nums">{{ clock(t) }}<span class="text-muted"> / {{ clock(replay.durationSec) }}</span></span>
              <div class="flex ml-auto border border-line" role="group" aria-label="Playback speed">
                <button v-for="s in SPEEDS" :key="s" type="button" :aria-pressed="speed === s" :class="['h-10 w-10 font-display text-sm', speed === s ? 'bg-primary text-bg' : 'text-muted hover:text-text']" @click="speed = s">{{ s }}x</button>
              </div>
            </div>
          </section>
        </div>

        <aside class="space-y-3 min-w-0">
          <section v-for="b in board" :key="b.team" class="border border-line/70" :aria-label="`${teamLabel(b.team)} at this time`">
            <h2 :class="['font-display uppercase px-3 py-1.5 border-b border-line/70', b.team === 'amber' ? 'text-amber-team' : 'text-sapphire-team']">{{ teamLabel(b.team) }}</h2>
            <ul>
              <li v-for="r in b.rows" :key="r.p.slot" class="flex items-center gap-2 px-3 py-1 text-sm">
                <HeroCard size="xs" class="shrink-0" :name="heroName(r.p)" :src="heroes.byId(r.p.heroId)?.imageUrl" />
                <span class="min-w-0 flex-1 truncate">{{ clean(nameOf(r.p)) }}</span>
                <span class="font-display tabular-nums w-12 text-right">{{ r.kills }}<span class="text-muted">/{{ r.deaths }}</span></span>
                <span class="font-display tabular-nums w-12 text-right text-accent">{{ short(r.souls) }}</span>
              </li>
            </ul>
          </section>
          <section class="card px-3 py-2" aria-label="Match events">
            <h2 class="h-section mb-1">Events</h2>
            <p v-if="!feed.length" class="text-sm text-muted">Nothing yet.</p>
            <ol class="space-y-1.5">
              <li v-for="(e, i) in feed" :key="i">
                <button type="button" class="w-full min-h-7 flex items-center gap-2 text-left text-xs hover:text-primary" :aria-label="`${clock(e.t)} ${clean(e.text)}`" @click="t = e.t">
                  <span class="font-mono text-muted tabular-nums shrink-0">{{ clock(e.t) }}</span>
                  <span v-if="e.victim" class="flex items-center gap-2">
                    <span v-if="e.killer" :class="portrait(e.killer)" :title="`${clean(nameOf(e.killer))}, ${heroName(e.killer)}`"><img v-if="heroes.byId(e.killer.heroId)?.imageUrl" :src="heroes.byId(e.killer.heroId)!.imageUrl!" alt="" class="w-full h-full object-cover object-top" /></span>
                    <span v-else class="w-9 h-11 grid place-items-center border-b-2 border-line bg-raised text-muted"><Skull class="w-4 h-4" aria-hidden="true" /></span>
                    <Swords class="w-4 h-4 text-primary" aria-hidden="true" />
                    <span :class="[portrait(e.victim), 'relative']" :title="`${clean(nameOf(e.victim))}, ${heroName(e.victim)}`"><img v-if="heroes.byId(e.victim.heroId)?.imageUrl" :src="heroes.byId(e.victim.heroId)!.imageUrl!" alt="" class="w-full h-full object-cover object-top grayscale opacity-70" /></span>
                  </span>
                  <span v-else class="min-w-0">{{ clean(e.text) }}</span>
                </button>
              </li>
            </ol>
          </section>
        </aside>
      </div>
    </div>
  </PageState>
</template>
