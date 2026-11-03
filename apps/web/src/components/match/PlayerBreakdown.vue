<script setup lang="ts">
import { computed } from 'vue';
import { UserRound } from 'lucide-vue-next';
import { useItems } from '../../stores/items';
import TimelineChart from './TimelineChart.vue';

export type PlayerDetails = {
  level: number | null; lastHits: number | null; denies: number | null;
  playerDamage: number | null; objectiveDamage: number | null; damageTaken: number | null; damageMitigated: number | null;
  healing: number | null; selfHealing: number | null; teammateHealing: number | null;
  shotsHit: number | null; shotsMissed: number | null; headshotKills: number | null;
  bulletKills: number | null; meleeKills: number | null; abilityKills: number | null;
  soulSources: { heroes: number | null; laneCreeps: number | null; neutrals: number | null; bosses: number | null; treasure: number | null };
  items: { t: number; id: number; soldAt: number | null }[];
  timeline: { t: number; souls: number; damage: number }[];
};
const props = defineProps<{ team: 'amber' | 'sapphire'; userId: string | null; details: PlayerDetails | null }>();
const items = useItems();

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('en-US'));
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const bar = computed(() => (props.team === 'amber' ? 'bg-amber-team' : 'bg-sapphire-team'));

const combat = computed(() => {
  const d = props.details!;
  const shots = d.shotsHit !== null && d.shotsMissed !== null ? d.shotsHit + d.shotsMissed : null;
  return [
    ['Hero damage', fmt(d.playerDamage)], ['Objective damage', fmt(d.objectiveDamage)], ['Damage taken', fmt(d.damageTaken)], ['Damage mitigated', fmt(d.damageMitigated)],
    ['Healing', fmt(d.healing)], ['Self healing', fmt(d.selfHealing)], ['Healing allies', fmt(d.teammateHealing)], ['Accuracy', shots ? `${Math.round((d.shotsHit! / shots) * 100)}%` : '—'],
    ['Bullet kills', fmt(d.bulletKills)], ['Headshot kills', fmt(d.headshotKills)], ['Ability kills', fmt(d.abilityKills)], ['Melee kills', fmt(d.meleeKills)],
  ] as const;
});
const sources = computed(() => {
  const s = props.details!.soulSources;
  const rows = ([['Heroes', s.heroes], ['Lane creeps', s.laneCreeps], ['Neutrals', s.neutrals], ['Bosses', s.bosses], ['Treasure', s.treasure]] as const).filter((r) => r[1] !== null) as (readonly [string, number])[];
  const top = Math.max(1, ...rows.map((r) => r[1]));
  const sum = rows.reduce((n, r) => n + r[1], 0) || 1;
  return [...rows].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value, width: (value / top) * 100, share: Math.round((value / sum) * 100) }));
});
// Metadata also lists ability upgrades; only shop items are in the catalog.
const build = computed(() => [...props.details!.items].sort((a, b) => a.t - b.t).flatMap((i) => { const item = items.byId(i.id); return item ? [{ ...i, item }] : []; }));
const slotColor = (slot: string | null) => (slot === 'weapon' ? 'border-[#c97b2e]' : slot === 'vitality' ? 'border-[#5c9a4f]' : slot === 'spirit' ? 'border-[#9a6bd0]' : 'border-line');
</script>

<template>
  <div class="px-3 sm:px-4 py-4 bg-bg/60 space-y-5">
    <p v-if="!details" class="text-sm text-muted">Detailed stats not published for this match.</p>
    <template v-else>
      <section v-if="details.timeline.length > 1" class="grid sm:grid-cols-2 gap-5" aria-label="Match progress">
        <TimelineChart title="Souls" :team="team" :points="details.timeline.map((p) => ({ t: p.t, v: p.souls }))" />
        <TimelineChart title="Hero damage" :team="team" :points="details.timeline.map((p) => ({ t: p.t, v: p.damage }))" />
      </section>

      <div class="grid lg:grid-cols-[1.4fr_1fr] gap-5">
        <section>
          <h3 class="h-section mb-2">Combat</h3>
          <dl class="grid grid-cols-2 sm:grid-cols-4 gap-px bg-line/50 border border-line/50">
            <div v-for="[label, value] in combat" :key="label" class="bg-bg px-3 py-2 min-w-0">
              <dt class="font-mono text-[10px] font-bold uppercase tracking-wider text-muted truncate">{{ label }}</dt>
              <dd class="font-display text-lg tabular-nums">{{ value }}</dd>
            </div>
          </dl>
        </section>
        <section>
          <h3 class="h-section mb-2">Soul sources</h3>
          <ul class="space-y-2">
            <li v-for="s in sources" :key="s.name" :title="`${s.name}: ${fmt(s.value)} souls (${s.share}%)`">
              <div class="flex justify-between gap-2 text-sm"><span>{{ s.name }}</span><span class="font-display tabular-nums">{{ fmt(s.value) }}<span class="ml-2 font-mono text-[10px] text-muted">{{ s.share }}%</span></span></div>
              <div class="h-1.5 bg-line/40 mt-0.5"><div :class="['h-full', bar]" :style="{ width: `${s.width}%` }" /></div>
            </li>
          </ul>
        </section>
      </div>

      <section>
        <h3 class="h-section mb-2">Item timeline</h3>
        <p v-if="!build.length" class="text-sm text-muted">No item data for this match.</p>
        <ol v-else class="grid grid-cols-[repeat(auto-fill,minmax(68px,1fr))] gap-2">
          <li v-for="(b, i) in build" :key="`${b.id}-${i}`" class="text-center min-w-0" :title="b.soldAt ? `${b.item.name}, sold at ${clock(b.soldAt)}` : b.item.name">
            <div :class="['aspect-square border-2 bg-raised grid place-items-center overflow-hidden', slotColor(b.item.slot), b.soldAt && 'opacity-40']">
              <img v-if="b.item.imageUrl" :src="b.item.imageUrl" :alt="b.item.name" loading="lazy" class="w-full h-full object-contain" />
            </div>
            <div class="font-mono text-[10px] tabular-nums text-muted mt-1">{{ clock(b.t) }}</div>
            <div class="text-[10px] leading-tight truncate">{{ b.item.name }}</div>
            <div v-if="b.soldAt" class="font-mono text-[9px] uppercase text-muted">Sold {{ clock(b.soldAt) }}</div>
          </li>
        </ol>
      </section>
    </template>
    <RouterLink v-if="userId" :to="`/players/${userId}`" class="btn-ghost !h-9 inline-flex"><UserRound class="w-4 h-4" />Player profile</RouterLink>
  </div>
</template>
