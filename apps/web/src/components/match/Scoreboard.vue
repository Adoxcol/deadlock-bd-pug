<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronDown, Trophy } from 'lucide-vue-next';
import { useHeroes } from '../../stores/heroes';
import HeroCard from '../HeroCard.vue';
import FactionMark from '../draft/FactionMark.vue';
import PlayerBreakdown, { type PlayerDetails } from './PlayerBreakdown.vue';

type Stat = { id: string; userId: string | null; displayNameSnapshot: string; heroId: number | null; kills: number | null; deaths: number | null; assists: number | null; netWorth: number | null; heroDamage: number | null; points?: number | null; details?: PlayerDetails | null };
const props = defineProps<{ team: 'amber' | 'sapphire'; name: string; won: boolean; stats: Stat[] }>();
const heroes = useHeroes();
const open = ref<string | null>(null);

const sum = (key: 'kills' | 'deaths' | 'assists' | 'netWorth') => props.stats.reduce((n, s) => n + (s[key] ?? 0), 0);
const best = (key: 'kills') => Math.max(0, ...props.stats.map((s) => s[key] ?? 0));
const rows = computed(() => [...props.stats].sort((a, b) => (b.netWorth ?? 0) - (a.netWorth ?? 0)));
const short = (n: number | null | undefined) => n === null || n === undefined ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
const clean = (n: string) => n.replace('[SIM] ', '');
const color = computed(() => props.team === 'amber' ? 'text-amber-team' : 'text-sapphire-team');
</script>

<template>
  <section :class="['border border-line/70 overflow-hidden', team === 'amber' ? 'bg-[linear-gradient(180deg,rgba(232,163,58,.1),transparent_90px)]' : 'bg-[linear-gradient(180deg,rgba(90,143,224,.1),transparent_90px)]']" :aria-label="`${name} scoreboard`">
    <header class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 sm:px-4 py-3">
      <div class="min-w-0">
        <FactionMark :team="team" :size="15" />
        <h2 :class="['font-display text-2xl uppercase flex items-center gap-2 min-w-0', color]"><span class="truncate">{{ name }}</span><Trophy v-if="won" class="w-5 h-5 shrink-0 text-primary" aria-label="Winner" /></h2>
      </div>
      <p class="font-display text-xl tabular-nums">{{ sum('kills') }}<span class="text-muted"> / {{ sum('deaths') }} / {{ sum('assists') }}</span><span class="ml-3 text-accent">{{ short(sum('netWorth')) }}</span></p>
    </header>
    <table class="w-full table-fixed border-collapse">
      <thead>
        <tr class="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted border-y border-line/70">
          <th scope="col" class="text-left font-bold px-3 sm:px-4 py-2">Player</th>
          <th scope="col" class="hidden lg:table-cell w-12 font-bold" title="Level">Lvl</th>
          <th scope="col" class="w-8 sm:w-11 font-bold" title="Kills">K</th>
          <th scope="col" class="w-8 sm:w-11 font-bold" title="Deaths">D</th>
          <th scope="col" class="w-8 sm:w-11 font-bold" title="Assists">A</th>
          <th scope="col" class="w-14 sm:w-20 text-right font-bold pr-2" title="Total souls">Souls</th>
          <th scope="col" class="hidden sm:table-cell w-12 text-right font-bold" title="PUG points earned">Pts</th>
          <th scope="col" class="hidden lg:table-cell w-14 text-right font-bold" title="Last hits">LH</th>
          <th scope="col" class="hidden lg:table-cell w-14 text-right font-bold" title="Denies">Dn</th>
          <th scope="col" class="hidden sm:table-cell w-20 text-right font-bold" title="Damage to heroes">Damage</th>
          <th scope="col" class="hidden lg:table-cell w-20 text-right font-bold" title="Objective damage">Obj</th>
          <th scope="col" class="hidden lg:table-cell w-20 text-right font-bold" title="Healing">Heal</th>
          <th scope="col" class="w-8 sm:w-10"><span class="sr-only">Details</span></th>
        </tr>
      </thead>
      <tbody v-for="s in rows" :key="s.id" class="border-b border-line/40 last:border-0">
        <tr :class="['cursor-pointer hover:bg-raised/50 transition-colors', open === s.id && 'bg-raised/50']" @click="open = open === s.id ? null : s.id">
          <td class="px-3 sm:px-4 py-1.5">
            <div class="flex items-center gap-3 min-w-0">
              <HeroCard size="xs" class="shrink-0" :name="heroes.byId(s.heroId)?.name ?? '?'" :src="heroes.byId(s.heroId)?.imageUrl" />
              <span class="min-w-0">
                <span class="block truncate font-display uppercase">{{ clean(s.displayNameSnapshot) }}</span>
                <span class="block truncate font-mono text-[10px] uppercase tracking-wider text-muted"><span v-if="s.points != null" class="sm:hidden text-primary">+{{ s.points }} · </span>{{ heroes.byId(s.heroId)?.name ?? 'Unknown hero' }}</span>
              </span>
            </div>
          </td>
          <td class="hidden lg:table-cell text-center font-display tabular-nums text-muted">{{ s.details?.level ?? '—' }}</td>
          <td :class="['text-center font-display text-lg tabular-nums', s.kills !== null && s.kills === best('kills') ? 'text-primary' : '']">{{ s.kills ?? '—' }}</td>
          <td class="text-center font-display text-lg tabular-nums text-muted">{{ s.deaths ?? '—' }}</td>
          <td class="text-center font-display text-lg tabular-nums">{{ s.assists ?? '—' }}</td>
          <td class="pr-2 text-right font-display text-lg tabular-nums">{{ short(s.netWorth) }}</td>
          <td class="hidden sm:table-cell text-right font-display text-lg tabular-nums text-primary">{{ s.points != null ? `+${s.points}` : '—' }}</td>
          <td class="hidden lg:table-cell text-right font-display tabular-nums">{{ s.details?.lastHits ?? '—' }}</td>
          <td class="hidden lg:table-cell text-right font-display tabular-nums">{{ s.details?.denies ?? '—' }}</td>
          <td class="hidden sm:table-cell text-right font-display tabular-nums">{{ short(s.heroDamage) }}</td>
          <td class="hidden lg:table-cell text-right font-display tabular-nums">{{ short(s.details?.objectiveDamage) }}</td>
          <td class="hidden lg:table-cell text-right font-display tabular-nums">{{ short(s.details?.healing) }}</td>
          <td class="text-center">
            <button type="button" class="inline-grid place-items-center w-8 h-10 text-muted hover:text-primary" :aria-expanded="open === s.id" :aria-label="`${open === s.id ? 'Hide' : 'Show'} stats for ${clean(s.displayNameSnapshot)}`" @click.stop="open = open === s.id ? null : s.id">
              <ChevronDown :class="['w-4 h-4 transition-transform', open === s.id && 'rotate-180']" />
            </button>
          </td>
        </tr>
        <tr v-if="open === s.id">
          <td colspan="13" class="p-0 border-t border-line/40"><PlayerBreakdown :team="team" :user-id="s.userId" :details="s.details ?? null" /></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
