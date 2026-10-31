<script setup lang="ts">
import UiSelect from '../components/UiSelect.vue';
import { onMounted, ref, watch } from 'vue';
import { api } from '../lib/api';
import { pct } from '../lib/format';
import PageState from '../components/PageState.vue';
import SimBadge from '../components/SimBadge.vue';
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
onMounted(async () => { seasons.value = await api('/seasons').catch(() => []) as any[]; load(); });
watch([seasonId, minMatches], load);
const avg = (x: number | null | undefined) => (x == null ? '—' : x.toFixed(1));
</script>
<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end gap-3">
      <div><h1 class="text-2xl font-semibold tracking-tight">Leaderboard</h1><p class="text-sm text-muted mt-1 flex items-center gap-2">{{ data?.season?.name ?? 'No active season' }}<SimBadge v-if="data?.season?.isSimulated" /></p></div>
      <div class="flex flex-wrap gap-2 sm:ml-auto">
        <UiSelect v-model="seasonId" class="!w-48" aria-label="Season" :options="[{ value: '', label: 'Current season' }, ...seasons.map((s) => ({ value: s.id, label: s.name + (s.isArchived ? ' (archived)' : '') }))]" />
        <UiSelect v-model="minMatches" class="!w-40" aria-label="Minimum matches" :options="[{ value: 0, label: 'Any matches' }, { value: 5, label: '5+ matches' }, { value: 10, label: '10+ matches' }]" />
        <input v-model="hero" class="input !w-36" placeholder="Most-played hero" aria-label="Hero filter" />
      </div>
    </div>
    <div class="card overflow-x-auto">
      <PageState :loading="!data && !error" :error="error" :empty="data && !data.rows.filter((r: any) => !hero || (r.mostPlayedHero ?? '').toLowerCase().includes(hero.toLowerCase())).length" empty-text="No players match these filters.">
        <table class="w-full table-compact">
          <thead><tr><th>#</th><th>Player</th><th class="text-right">Rating</th><th class="text-right">W</th><th class="text-right">L</th><th class="text-right">Win rate</th><th class="text-right hidden sm:table-cell">Matches</th><th class="text-right hidden md:table-cell">Avg K/D/A</th><th class="hidden md:table-cell">Most played</th></tr></thead>
          <tbody>
            <tr v-for="r in data.rows.filter((r: any) => !hero || (r.mostPlayedHero ?? '').toLowerCase().includes(hero.toLowerCase()))" :key="r.userId" class="hover:bg-raised/50">
              <td class="tabular-nums font-semibold" :class="r.rank <= 3 ? 'text-warn' : 'text-muted'">{{ r.rank }}</td>
              <td><RouterLink :to="`/players/${r.userId}`" class="font-medium hover:text-accent">{{ r.displayName }}</RouterLink></td>
              <td class="text-right font-semibold tabular-nums">{{ r.rating }}</td>
              <td class="text-right tabular-nums text-accent">{{ r.wins }}</td><td class="text-right tabular-nums text-danger">{{ r.losses }}</td>
              <td class="text-right tabular-nums">{{ pct(r.winRate) }}</td><td class="text-right tabular-nums hidden sm:table-cell">{{ r.matches }}</td>
              <td class="text-right tabular-nums hidden md:table-cell">{{ avg(r.avg?.kills) }} / {{ avg(r.avg?.deaths) }} / {{ avg(r.avg?.assists) }}</td>
              <td class="hidden md:table-cell">{{ r.mostPlayedHero ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </PageState>
    </div>
    <p class="text-xs text-muted">Team Elo: every player on a team gains or loses the same amount based on the average rating gap. K/D/A never changes rating. Only verified results are rated.</p>
  </div>
</template>
