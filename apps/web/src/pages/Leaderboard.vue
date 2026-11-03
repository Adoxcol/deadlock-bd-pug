<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Search, Crown } from 'lucide-vue-next';
import UiSelect from '../components/UiSelect.vue';
import { api } from '../lib/api';
import { pct } from '../lib/format';
import PageState from '../components/PageState.vue';
import PageHeader from '../components/PageHeader.vue';
import SimBadge from '../components/SimBadge.vue';
import HeroCard from '../components/HeroCard.vue';
import RankIcon from '../components/RankIcon.vue';
import { useHeroes } from '../stores/heroes';
import { RANKS } from '../../../server/src/rating/points';

const heroes = useHeroes();
const data = ref<any>(null);
const seasons = ref<any[]>([]);
const error = ref<string | null>(null);
const seasonId = ref('');
const minMatches = ref(0);
const hero = ref('');
async function load() {
  try { data.value = await api(`/leaderboard?minMatches=${minMatches.value}${seasonId.value ? `&seasonId=${seasonId.value}` : ''}`); error.value = null; }
  catch (e) { error.value = (e as Error).message; }
}
onMounted(async () => { heroes.load().catch(() => {}); seasons.value = await api('/seasons').catch(() => []) as any[]; load(); });
watch([seasonId, minMatches], load);
const pointRules = [['+30', 'Win'], ['+10', 'Loss'], ['+2', 'Per kill'], ['+1', 'Per assist'], ['−1', 'Per death'], ['+1', 'Per 2,000 souls'], ['+20', 'Max underdog bonus']];
const rankTiers = [...RANKS].reverse();
const avg = (x: number | null | undefined) => (x == null ? '—' : x.toFixed(1));
const heroByName = (n: string | null) => (n ? heroes.list.find((h) => h.name === n) : undefined);
const rows = computed(() => (data.value?.rows ?? []).filter((r: any) => !hero.value || (r.mostPlayedHero ?? '').toLowerCase().includes(hero.value.toLowerCase())));
// Podium order: 2nd, 1st, 3rd.
const podium = computed(() => (hero.value ? [] : [rows.value[1], rows.value[0], rows.value[2]].filter(Boolean)));
const seasonOptions = computed(() => [{ value: '', label: 'Current season' }, ...seasons.value.map((s: any) => ({ value: s.id as string, label: `${s.name}${s.isArchived ? ' (archived)' : ''}` }))]);
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-5">
    <PageHeader eyebrow="Community rankings" title="Leaderboard" :subtitle="data?.season?.name ?? 'No active season'">
      <SimBadge v-if="data?.season?.isSimulated" />
    </PageHeader>

    <div class="flex flex-wrap gap-2">
      <UiSelect v-model="seasonId" class="!w-56" aria-label="Season" :options="seasonOptions" />
      <UiSelect v-model="minMatches" class="!w-44" aria-label="Minimum matches" :options="[{ value: 0, label: 'Any matches' }, { value: 5, label: '5+ matches' }, { value: 10, label: '10+ matches' }]" />
      <label class="relative flex-1 min-w-[180px] max-w-xs"><span class="sr-only">Filter by most-played hero</span>
        <Search class="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" /><input v-model="hero" class="input !pl-9" placeholder="Most-played hero" />
      </label>
    </div>

    <PageState :loading="!data && !error" :error="error" :empty="data && !rows.length" empty-text="No players match these filters.">
      <!-- Podium -->
      <div v-if="podium.length" class="grid grid-cols-3 gap-3 items-end">
        <RouterLink v-for="r in podium" :key="r.userId" :to="`/players/${r.userId}`"
          :class="['card-ornate flex flex-col items-center text-center px-3 transition-colors hover:border-primary/50', r.rank === 1 ? 'py-6 border-primary/50 bg-[linear-gradient(180deg,rgba(212,162,76,.14),transparent)]' : 'py-4']">
          <Crown v-if="r.rank === 1" class="w-6 h-6 text-primary mb-1" />
          <div :class="['font-display leading-none', r.rank === 1 ? 'text-5xl text-primary' : 'text-3xl text-muted']">{{ r.rank }}</div>
          <div class="w-12 sm:w-14 my-3"><HeroCard :name="r.mostPlayedHero ?? r.displayName" :src="heroByName(r.mostPlayedHero)?.imageUrl" /></div>
          <div class="font-display uppercase truncate max-w-full text-sm sm:text-base">{{ r.displayName }}</div>
          <div class="font-display text-2xl tabular-nums text-text mt-1">{{ r.points.toLocaleString() }}</div>
          <div class="flex items-center justify-center gap-1.5 font-mono text-xs tabular-nums text-muted"><RankIcon :rank="r.tier" :size="20" />{{ r.rating }}</div>
          <div class="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{{ r.wins }}W · {{ r.losses }}L · {{ pct(r.winRate) }}</div>
        </RouterLink>
      </div>

      <div class="card-ornate overflow-x-auto">
        <table class="w-full table-compact">
          <thead><tr><th class="w-12">#</th><th>Player</th><th class="text-right">Points</th><th class="text-right">Rating</th><th class="text-right">W</th><th class="text-right">L</th><th class="text-right">Win rate</th><th class="text-right hidden sm:table-cell">Matches</th><th class="text-right hidden md:table-cell">Avg K/D/A</th><th class="hidden md:table-cell">Most played</th></tr></thead>
          <tbody>
            <tr v-for="r in rows" :key="r.userId" class="hover:bg-raised/50">
              <td><span :class="['font-display text-lg tabular-nums', r.rank === 1 ? 'text-primary' : r.rank <= 3 ? 'text-text' : 'text-muted']">{{ r.rank }}</span></td>
              <td><RouterLink :to="`/players/${r.userId}`" class="font-semibold hover:text-primary">{{ r.displayName }}</RouterLink></td>
              <td class="text-right font-display text-base tabular-nums">{{ r.points.toLocaleString() }}</td>
              <td class="text-right tabular-nums"><span class="inline-flex items-center gap-1.5"><RankIcon :rank="r.tier" /><span class="font-display">{{ r.rating }}</span></span></td>
              <td class="text-right tabular-nums text-accent">{{ r.wins }}</td><td class="text-right tabular-nums text-danger">{{ r.losses }}</td>
              <td class="text-right tabular-nums">{{ pct(r.winRate) }}</td><td class="text-right tabular-nums hidden sm:table-cell">{{ r.matches }}</td>
              <td class="text-right tabular-nums hidden md:table-cell font-mono text-xs">{{ avg(r.avg?.kills) }} / {{ avg(r.avg?.deaths) }} / {{ avg(r.avg?.assists) }}</td>
              <td class="hidden md:table-cell"><div v-if="r.mostPlayedHero" class="flex items-center gap-2"><HeroCard size="xs" :name="r.mostPlayedHero" :src="heroByName(r.mostPlayedHero)?.imageUrl" />{{ r.mostPlayedHero }}</div><span v-else class="text-muted">—</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </PageState>
    <section class="card-ornate p-4 sm:p-5 space-y-4" aria-label="How points and ranks work">
      <h2 class="h-section">How points work</h2>
      <dl class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <div v-for="[value, label] in pointRules" :key="label" class="border border-line/70 bg-bg/60 p-3">
          <dd class="font-display text-3xl tabular-nums text-primary leading-none">{{ value }}</dd>
          <dt class="mt-2 text-xs text-muted">{{ label }}</dt>
        </div>
      </dl>
      <p class="text-xs text-muted">A match never costs you points, and only verified results count. The lower-rated team earns +1 per 10 rating of average gap, or half that if it loses.</p>
      <h2 class="h-section pt-1">Ranks</h2>
      <ol class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <li v-for="[min, label] in rankTiers" :key="label" class="border border-line/70 bg-bg/60 p-3">
          <RankIcon :rank="label" :size="40" class="mb-2" />
          <div class="font-display uppercase">{{ label }}</div>
          <div class="font-mono text-xs tabular-nums text-muted">{{ min ? `${min}+` : 'Under 900' }}</div>
        </li>
      </ol>
      <p class="text-xs text-muted">These are PUG ranks, separate from your in-game Deadlock rank. Rating is your average points per match ×20, without bonuses. New players start at 1200 and it settles over about five games.</p>
    </section>
  </div>
</template>
