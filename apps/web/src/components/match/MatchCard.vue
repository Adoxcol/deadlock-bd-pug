<script setup lang="ts">
import { computed } from 'vue';
import { ChevronRight } from 'lucide-vue-next';
import { dateShort, duration } from '../../lib/format';
import { useHeroes } from '../../stores/heroes';
import HeroCard from '../HeroCard.vue';
import SimBadge from '../SimBadge.vue';
import StatusBadge from '../StatusBadge.vue';

const props = defineProps<{ match: any }>();
const heroes = useHeroes();
const live = computed(() => ['LIVE_AVAILABLE', 'LIVE_UNAVAILABLE', 'MATCH_DETECTED'].includes(props.match.trackingState));
const result = computed(() => props.match.result);
const byPoints = (a: any, b: any) => (b.points ?? 0) - (a.points ?? 0);
const teams = computed(() => (['AMBER', 'SAPPHIRE'] as const).map((side) => ({
  side,
  name: props.match.pug?.teams?.find((t: any) => t.side === side)?.name ?? (side === 'AMBER' ? 'Amber' : 'Sapphire'),
  won: result.value?.winner === side,
  rating: side === 'AMBER' ? result.value?.amberRating : result.value?.sapphireRating,
  players: (result.value?.stats ?? []).filter((s: any) => s.team === side).sort(byPoints),
})));
const hasPlayers = computed(() => (result.value?.stats?.length ?? 0) > 0);
const souls = (n: number | null) => (n == null ? '—' : `${(n / 1000).toFixed(1)}k`);
const stat = (n: number | null) => n ?? '—';
const clean = (n: string) => n.replace('[SIM] ', '');
</script>

<template>
  <article class="card-ornate">
    <RouterLink :to="live ? `/matches/${match.id}/live` : `/matches/${match.id}`" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-raised/50">
      <span class="font-display uppercase">{{ match.pug ? `PUG #${match.pug.number}` : 'Match' }}</span>
      <span class="font-mono text-[11px] text-muted">{{ match.deadlockMatchId ?? '—' }}</span>
      <SimBadge v-if="match.isSimulated" />
      <StatusBadge v-if="!result" :status="match.trackingState" />
      <span class="ml-auto flex items-center gap-3 font-mono text-[11px] uppercase tracking-wider text-muted">
        <span class="tabular-nums">{{ duration(match.durationSec) }}</span>
        <span>{{ dateShort(match.startedAt ?? match.createdAt) }}</span>
        <ChevronRight class="w-4 h-4" aria-hidden="true" />
      </span>
    </RouterLink>

    <div v-if="hasPlayers" class="grid md:grid-cols-2 border-t border-line/70 md:divide-x divide-line/70">
      <section v-for="t in teams" :key="t.side" :aria-label="`Team ${t.name}`" class="min-w-0">
        <header :class="['flex items-center gap-2 px-3 py-1.5 border-b border-line/40', t.side === 'AMBER' ? 'bg-amber-team/10' : 'bg-sapphire-team/10']">
          <span :class="['font-display uppercase truncate', t.side === 'AMBER' ? 'text-amber-team' : 'text-sapphire-team']">{{ t.name }}</span>
          <span v-if="t.rating != null" class="font-mono text-[10px] tabular-nums text-muted" title="Team average rating before this match">{{ t.rating }}</span>
          <span :class="['ml-auto font-mono text-[10px] font-bold uppercase tracking-[0.2em]', t.won ? 'text-accent' : 'text-danger']">{{ t.won ? 'Win' : 'Loss' }}</span>
        </header>
        <div class="grid grid-cols-[minmax(0,1fr)_4.75rem_2.75rem_2.75rem] items-center gap-x-1 px-3 pt-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
          <span>Player</span><span class="text-right">K/D/A</span><span class="text-right">Souls</span><span class="text-right">Pts</span>
        </div>
        <ul class="px-3 pb-2">
          <li v-for="s in t.players" :key="s.id" class="grid grid-cols-[minmax(0,1fr)_4.75rem_2.75rem_2.75rem] items-center gap-x-1 py-1">
            <span class="flex items-center gap-2 min-w-0">
              <HeroCard size="xs" class="shrink-0" :name="heroes.byId(s.heroId)?.name ?? '?'" :src="heroes.byId(s.heroId)?.imageUrl" />
              <RouterLink v-if="s.userId" :to="`/players/${s.userId}`" class="truncate text-sm hover:text-primary">{{ clean(s.displayNameSnapshot) }}</RouterLink>
              <span v-else class="truncate text-sm">{{ clean(s.displayNameSnapshot) }}</span>
            </span>
            <span class="text-right font-mono text-xs tabular-nums">{{ stat(s.kills) }}/{{ stat(s.deaths) }}/{{ stat(s.assists) }}</span>
            <span class="text-right font-mono text-xs tabular-nums text-muted">{{ souls(s.netWorth) }}</span>
            <span class="text-right font-display tabular-nums text-primary">{{ s.points != null ? `+${s.points}` : '—' }}</span>
          </li>
        </ul>
      </section>
    </div>
    <p v-else-if="result" class="border-t border-line/70 px-4 py-2.5 text-sm">
      <span :class="['font-display uppercase', result.winner === 'AMBER' ? 'text-amber-team' : 'text-sapphire-team']">{{ result.winner === 'AMBER' ? 'Amber' : 'Sapphire' }}</span> won. <span class="text-muted">Player stats aren't available for this match.</span>
    </p>
  </article>
</template>
