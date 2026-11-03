<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '../../lib/api';
import { pct } from '../../lib/format';
import { useHeroes } from '../../stores/heroes';
import HeroCard from '../HeroCard.vue';

type Side = 'amber' | 'sapphire';
const props = defineProps<{ draftId: string; teams: Record<Side, string[]>; teamNames: Record<Side, string>; nameOf: (id: string) => string | null }>();
const heroes = useHeroes();
const scouting = ref<Record<string, any>>({});
const roster = computed(() => [...props.teams.amber, ...props.teams.sapphire].sort().join());
async function load() { try { scouting.value = await api(`/drafts/${props.draftId}/scouting`); } catch { /* optional: the draft works without it */ } }
onMounted(load);
watch(roster, load);
</script>

<template>
  <section v-if="roster" class="card p-4">
    <h2 class="h-section mb-3">Player scouting</h2>
    <div class="grid md:grid-cols-2 gap-4">
      <div v-for="t in (['amber', 'sapphire'] as const)" :key="t" class="min-w-0">
        <div :class="['font-display uppercase tracking-wider mb-1', t === 'amber' ? 'text-amber-team' : 'text-sapphire-team']">{{ teamNames[t] }}</div>
        <p v-if="!teams[t].length" class="text-sm text-muted py-2">No players yet.</p>
        <ul class="divide-y divide-line/60">
          <li v-for="id in teams[t]" :key="id" class="flex items-center gap-3 py-2 min-w-0">
            <div class="min-w-0 flex-1">
              <a :href="`/players/${id}`" target="_blank" rel="noopener" class="block truncate text-sm font-medium hover:text-primary">{{ nameOf(id) }}</a>
              <div class="font-mono text-[10px] uppercase tracking-wider text-muted">
                <template v-if="scouting[id]?.hidden">Private profile</template>
                <template v-else-if="scouting[id]?.rating != null">Rating {{ scouting[id].rating }} · {{ scouting[id].matches }} played</template>
                <template v-else-if="scouting[id]">Unrated · {{ Math.min(scouting[id].matches, scouting[id].calibration) }}/{{ scouting[id].calibration }}</template>
              </div>
            </div>
            <div class="flex gap-2 shrink-0">
              <div v-for="h in scouting[id]?.top ?? []" :key="h.heroId" class="w-12" :title="`${heroes.byId(h.heroId)?.name ?? `#${h.heroId}`}: ${h.matches} played, ${pct(h.wins / h.matches)} win rate`">
                <HeroCard size="sm" :name="heroes.byId(h.heroId)?.name ?? '?'" :src="heroes.byId(h.heroId)?.imageUrl" />
                <div class="mt-0.5 text-center font-mono text-[10px] tabular-nums text-muted">{{ pct(h.wins / h.matches) }}</div>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
