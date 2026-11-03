<script setup lang="ts">
import PlayerAvatar from '../components/PlayerAvatar.vue';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Award, Link2, Eye, ChevronRight } from 'lucide-vue-next';
import UiSelect from '../components/UiSelect.vue';
import { api } from '../lib/api';
import { pct, timeAgo } from '../lib/format';
import { useSession } from '../stores/session';
import { useHeroes } from '../stores/heroes';
import PageState from '../components/PageState.vue';
import Metric from '../components/Metric.vue';
import SimBadge from '../components/SimBadge.vue';
import StatTile from '../components/StatTile.vue';
import HeroCard from '../components/HeroCard.vue';

const props = defineProps<{ playerId: string }>();
const session = useSession();
const heroes = useHeroes();
const p = ref<any>(null);
const error = ref<string | null>(null);
const tab = ref<'overview' | 'matches' | 'heroes' | 'rating'>('overview');
async function load() { p.value = null; error.value = null; try { p.value = await api(`/players/${props.playerId}`); } catch (e) { error.value = (e as Error).message; } }
onMounted(() => { heroes.load().catch(() => {}); load(); });
watch(() => props.playerId, load);

const self = computed(() => session.user?.id === props.playerId);
const current = computed(() => p.value?.seasons?.find((r: any) => r.season.isActive));
const name = computed(() => p.value?.user.displayName ?? '');
const initial = computed(() => name.value.replace('[SIM] ', '').charAt(0).toUpperCase());
const kda = (h: any) => ((h.kills + h.assists) / Math.max(1, h.deaths)).toFixed(1);
const recentForm = computed(() => (p.value?.history ?? []).slice(0, 10).map((h: any) => h.won as boolean));
const spark = computed(() => {
  const xs = (p.value?.pointsHistory ?? []) as number[]; if (xs.length < 2) return null;
  const min = Math.min(...xs), max = Math.max(...xs), span = max - min || 1;
  return { min, max, points: xs.map((v: number, i: number) => `${(i / (xs.length - 1)) * 300},${70 - ((v - min) / span) * 62 - 4}`).join(' ') };
});
const chart = computed(() => {
  const xs = (p.value?.ratingHistory ?? []) as { date: string; rating: number }[]; if (xs.length < 2) return null;
  const vals = xs.map((x) => x.rating), min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const X = (i: number) => (i / (xs.length - 1)) * 300, Y = (v: number) => 66 - ((v - min) / span) * 62;
  return { min, max, latest: vals[vals.length - 1], points: xs.map((x, i) => `${X(i)},${Y(x.rating)}`).join(' '), hits: xs.map((x, i) => ({ x: X(i) - 150 / xs.length, w: 300 / xs.length, label: `${x.rating} on ${new Date(x.date).toLocaleDateString()}` })), rows: xs };
});
const medal = (rank: number) => ['Champion', 'Runner-up', 'Third place'][rank - 1] ?? `#${rank}`;
async function setVis(v: string) { await api('/me/visibility', { method: 'PATCH', body: { visibility: v } }); await load(); }
const heroOf = (id: number | null) => (id == null ? undefined : heroes.byId(id));
const route = useRoute();
/** Result of returning from Steam; the redirect keeps it in the query. */
const steamNotice = computed(() => {
  const s = route.query.steam, claimed = Number(route.query.claimed ?? 0);
  if (s === 'linked') return { ok: true, text: claimed ? `Steam linked. ${claimed} past ${claimed === 1 ? 'match was' : 'matches were'} added to your profile.` : 'Steam linked. No past matches were waiting for this account.' };
  if (s === 'taken') return { ok: false, text: 'That Steam account could not be linked: it belongs to another player, or both accounts played the same match. Ask a moderator for help.' };
  if (s === 'failed') return { ok: false, text: 'Steam could not confirm your sign-in, so nothing was linked. Please try again.' };
  return null;
});
</script>

<template>
  <PageState :loading="!p && !error" :error="error">
    <div v-if="p" class="max-w-6xl mx-auto space-y-5">
      <!-- Profile header -->
      <header class="card-ornate p-5 flex flex-wrap items-center gap-5 bg-[linear-gradient(110deg,rgba(212,162,76,.10),transparent_45%)]">
        <div class="w-20 h-20 shrink-0 grid place-items-center border-2 border-primary/60 bg-bg rotate-45">
          <span class="-rotate-45 font-display text-3xl text-primary">{{ initial }}</span>
        </div>
        <div class="min-w-0">
          <div class="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-muted">{{ p.user.role }}</div>
          <h1 class="text-3xl sm:text-4xl leading-none flex items-center gap-3 flex-wrap mt-1"><PlayerAvatar :name="name" :src="p.user.avatarUrl" class="w-12 h-12 text-xl" />{{ name }}<SimBadge v-if="p.user.isSimulated" /></h1>
          <div class="flex flex-wrap gap-x-4 gap-y-1 mt-2 font-mono text-[11px] uppercase tracking-wider text-muted">
            <span>Discord: <span class="text-text normal-case">{{ p.discord ? `@${p.discord.username}` : 'not linked' }}</span></span>
            <span>Steam: <span class="text-text normal-case">{{ p.steam ? p.steam.personaName ?? 'linked' : 'not linked' }}</span></span>
          </div>
          <div v-if="recentForm.length" class="flex gap-1 mt-3" :aria-label="`Recent form: ${recentForm.map((w: boolean) => (w ? 'W' : 'L')).join(' ')}`">
            <span v-for="(w, i) in recentForm" :key="i" :class="['w-5 h-5 grid place-items-center font-mono text-[10px] font-bold', w ? 'bg-accent/20 text-accent' : 'bg-danger/20 text-danger']">{{ w ? 'W' : 'L' }}</span>
          </div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-6 gap-2 sm:ml-auto w-full sm:w-auto">
          <StatTile :label="p.skill.rating == null ? `Unrated · ${Math.min(p.skill.matches, p.skill.calibration)}/${p.skill.calibration}` : 'Rating'" :value="p.skill.rating ?? '—'" />
          <StatTile :label="p.rank ? `Rank of ${p.rank.of}` : 'Rank'" :value="p.rank ? `#${p.rank.position}` : '—'" />
          <StatTile label="Points" :value="current?.points?.toLocaleString()" />
          <StatTile label="Wins" :value="current?.wins" tone="win" />
          <StatTile label="Losses" :value="current?.losses" tone="loss" />
          <StatTile label="Win rate" :value="current?.matches ? pct(current.wins / current.matches) : null" />
        </div>
      </header>

      <section v-if="p.awards?.length" class="card p-3 flex flex-wrap gap-2" aria-label="Season awards">
        <span v-for="a in p.awards" :key="a.id" :class="['inline-flex items-center gap-2 px-2.5 py-1.5 border text-sm', a.rank === 1 ? 'border-primary text-primary' : 'border-line']">
          <Award class="w-4 h-4 shrink-0" /><span class="font-semibold">{{ medal(a.rank) }}</span><span class="text-muted">{{ a.seasonName }}</span><SimBadge v-if="a.simulated" />
        </span>
      </section>
      <p v-if="self && steamNotice" role="status" :class="['card p-3 text-sm border-l-2', steamNotice.ok ? 'border-l-accent' : 'border-l-danger']">{{ steamNotice.text }}</p>
      <div v-if="self" class="card p-3 flex flex-wrap items-center gap-3 text-sm">
        <a v-if="!p.steam" href="/api/auth/steam" class="btn-ghost !h-9"><Link2 class="w-4 h-4" />Link Steam account</a>
        <span class="flex items-center gap-2 text-muted ml-auto"><Eye class="w-4 h-4" />Profile visibility</span>
        <UiSelect :model-value="p.visibility" class="!w-44" aria-label="Profile visibility" :options="[{ value: 'PUBLIC', label: 'Public' }, { value: 'MEMBERS', label: 'Members only' }, { value: 'PRIVATE', label: 'Private' }]" @update:model-value="setVis" />
      </div>

      <div class="flex gap-1 border-b border-line overflow-x-auto">
        <button v-for="t in (['overview', 'matches', 'heroes', 'rating'] as const)" :key="t" :aria-pressed="tab === t"
          :class="['px-4 h-10 -mb-px border-b-2 font-display uppercase tracking-wider text-sm shrink-0', tab === t ? 'border-primary text-text' : 'border-transparent text-muted hover:text-text']" @click="tab = t">{{ t === 'rating' ? 'Points history' : t }}</button>
      </div>

      <!-- Matches (overview shows the latest five) -->
      <section v-if="tab === 'overview' || tab === 'matches'" class="card-ornate overflow-hidden">
        <h2 class="h-section px-4 pt-4 pb-2">{{ tab === 'overview' ? 'Recent matches' : 'Match history' }}</h2>
        <PageState :empty="!p.history.length" empty-text="No matches yet.">
          <ul class="divide-y divide-line/60">
            <li v-for="h in (tab === 'overview' ? p.history.slice(0, 5) : p.history)" :key="h.id">
              <RouterLink :to="`/matches/${h.result.matchId}`" class="flex items-center gap-3 px-4 py-2.5 hover:bg-raised/50">
                <HeroCard size="xs" :name="h.heroName ?? '?'" :src="heroOf(h.heroId)?.imageUrl" />
                <span :class="['w-12 font-display uppercase', h.won ? 'text-accent' : 'text-danger']">{{ h.won ? 'Win' : 'Loss' }}</span>
                <span class="min-w-0 flex-1"><span class="block truncate">{{ h.heroName ?? 'Unknown hero' }}</span>
                  <span v-if="h.result.source !== 'API'" class="font-mono text-[10px] uppercase tracking-wider text-warn">{{ h.result.source.toLowerCase() }}</span></span>
                <span class="font-mono text-sm tabular-nums"><Metric :value="h.kills" /> / <Metric :value="h.deaths" /> / <Metric :value="h.assists" /></span>
                <span v-if="h.points !== null" class="w-10 text-right font-display tabular-nums text-primary">+{{ h.points }}</span>
                <span class="hidden sm:block w-28 text-right text-xs text-muted">{{ timeAgo(h.result.createdAt) }}</span>
                <ChevronRight class="w-4 h-4 text-muted" />
              </RouterLink>
            </li>
          </ul>
        </PageState>
      </section>

      <!-- Heroes -->
      <section v-if="tab === 'overview' || tab === 'heroes'" class="card-ornate p-4">
        <h2 class="h-section mb-3">Most played heroes</h2>
        <PageState :empty="!p.heroes.length" empty-text="No hero data yet.">
          <div v-if="tab === 'overview'" class="grid grid-cols-4 sm:grid-cols-8 gap-2">
            <div v-for="h in p.heroes.slice(0, 8)" :key="h.heroId" class="space-y-1">
              <HeroCard :name="heroOf(h.heroId)?.name ?? `#${h.heroId}`" :src="heroOf(h.heroId)?.imageUrl" />
              <div class="text-center font-mono text-[10px] uppercase tracking-wider text-muted">{{ h.matches }} played · {{ pct(h.wins / h.matches) }}</div>
            </div>
          </div>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="font-mono text-[10px] uppercase tracking-wider text-muted text-right"><th class="text-left font-bold py-2">Hero</th><th class="font-bold px-2">Played</th><th class="font-bold px-2">Win rate</th><th class="font-bold px-2">Avg K / D / A</th><th class="font-bold pl-2">KDA</th></tr></thead>
              <tbody class="divide-y divide-line/60">
                <tr v-for="h in p.heroes" :key="h.heroId" class="text-right tabular-nums">
                  <td class="py-2 text-left"><span class="flex items-center gap-3"><HeroCard size="xs" :name="heroOf(h.heroId)?.name ?? '?'" :src="heroOf(h.heroId)?.imageUrl" /><span class="truncate">{{ heroOf(h.heroId)?.name ?? `#${h.heroId}` }}</span></span></td>
                  <td class="px-2">{{ h.matches }}</td>
                  <td class="px-2">{{ pct(h.wins / h.matches) }}</td>
                  <td class="px-2 font-mono whitespace-nowrap">{{ (h.kills / h.matches).toFixed(1) }} / {{ (h.deaths / h.matches).toFixed(1) }} / {{ (h.assists / h.matches).toFixed(1) }}</td>
                  <td class="pl-2 font-mono">{{ kda(h) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </PageState>
      </section>

      <section v-if="tab === 'overview' && (p.teammates?.length || p.rivals?.length)" class="grid sm:grid-cols-2 gap-4">
        <div v-for="block in [{ title: 'Best teammates', rows: p.teammates, verb: 'together' }, { title: 'Top rivals', rows: p.rivals, verb: 'against' }]" :key="block.title" class="card-ornate p-4">
          <h2 class="h-section mb-3">{{ block.title }}</h2>
          <p v-if="!block.rows.length" class="text-sm text-muted">Not enough shared matches yet.</p>
          <ul v-else class="space-y-1">
            <li v-for="r in block.rows" :key="r.userId"><RouterLink :to="`/players/${r.userId}`" class="flex items-center gap-3 p-1.5 rounded-lg hover:bg-raised min-w-0">
              <PlayerAvatar :name="r.displayName" :src="r.avatarUrl" class="w-8 h-8 text-xs" /><span class="truncate min-w-0 font-medium">{{ r.displayName }}</span>
              <span class="ml-auto shrink-0 font-mono text-xs tabular-nums text-muted">{{ r.wins }}W {{ r.games - r.wins }}L {{ block.verb }}</span>
            </RouterLink></li>
          </ul>
        </div>
      </section>

      <!-- Rating -->
      <section v-if="tab === 'overview' || tab === 'rating'" class="card-ornate p-4">
        <h2 class="h-section mb-3">Rating history<span v-if="chart" class="ml-2 font-mono text-sm tabular-nums text-muted normal-case">now {{ chart.latest }}</span></h2>
        <PageState :empty="!chart" :empty-text="`Rating starts after ${p.skill.calibration} rated matches.`">
          <div v-if="chart" class="flex gap-3 mb-5">
            <div class="flex flex-col justify-between font-mono text-[10px] text-muted tabular-nums py-1"><span>{{ chart.max }}</span><span>{{ chart.min }}</span></div>
            <svg viewBox="0 0 300 70" class="w-full h-32" preserveAspectRatio="none" role="img" :aria-label="`Rating over ${chart.rows.length} matches, from ${chart.rows[0]!.rating} to ${chart.latest}`">
              <polyline :points="chart.points" fill="none" stroke="#d4a24c" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
              <rect v-for="(h, i) in chart.hits" :key="i" :x="h.x" y="0" :width="h.w" height="70" fill="transparent" class="hover:fill-primary/15"><title>{{ h.label }}</title></rect>
            </svg>
          </div>
        </PageState>
        <h2 class="h-section mb-3">Points history</h2>
        <PageState :empty="!spark" empty-text="Not enough rated matches yet.">
          <div v-if="spark" class="flex gap-3">
            <div class="flex flex-col justify-between font-mono text-[10px] text-muted tabular-nums py-1"><span>{{ spark.max }}</span><span>{{ spark.min }}</span></div>
            <svg viewBox="0 0 300 70" class="w-full h-28" preserveAspectRatio="none" role="img" aria-label="Points over time">
              <polyline :points="spark.points" fill="none" stroke="#d4a24c" stroke-width="2" vector-effect="non-scaling-stroke" />
            </svg>
          </div>
        </PageState>
        <div v-if="tab === 'rating' && p.seasons.length" class="mt-4 grid sm:grid-cols-3 gap-2">
          <div v-for="r in p.seasons" :key="r.id" class="card px-3 py-2">
            <div class="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{{ r.season.name }}</div>
            <div class="font-display text-xl tabular-nums">{{ r.points.toLocaleString() }}</div>
            <div class="text-xs text-muted">{{ r.wins }}W {{ r.losses }}L</div>
          </div>
        </div>
      </section>
    </div>
  </PageState>
</template>
