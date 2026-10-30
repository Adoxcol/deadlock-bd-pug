<script setup lang="ts">
import { computed } from 'vue';
// Groups the step sequence into runs (e.g. "Sapphire · 2 picks") so consecutive turns read clearly.
const props = defineProps<{ sequence: Array<{ team: 'amber' | 'sapphire'; type: 'pick' | 'ban' }>; step?: number; teamNames: { amber: string; sapphire: string } }>();
const runs = computed(() => {
  const out: Array<{ team: 'amber' | 'sapphire'; type: 'pick' | 'ban'; from: number; count: number }> = [];
  props.sequence.forEach((s, i) => {
    const last = out[out.length - 1];
    if (last && last.team === s.team && last.type === s.type) last.count++;
    else out.push({ ...s, from: i, count: 1 });
  });
  return out;
});
const state = (r: { from: number; count: number }) => (props.step === undefined ? 'todo' : props.step >= r.from + r.count ? 'done' : props.step >= r.from ? 'now' : 'todo');
</script>
<template>
  <ol class="flex flex-wrap gap-1.5" aria-label="Draft order">
    <li v-for="(r, i) in runs" :key="i"
      :class="['flex items-center gap-1.5 h-7 px-2 rounded-md border text-[11px] font-medium',
        r.team === 'amber' ? 'border-amber-team/40' : 'border-sapphire-team/40',
        state(r) === 'now' && 'ring-2 ring-draft bg-draft/10', state(r) === 'done' && 'opacity-45']">
      <span :class="r.team === 'amber' ? 'text-amber-team' : 'text-sapphire-team'">{{ teamNames[r.team] }}</span>
      <span :class="r.type === 'ban' ? 'text-danger' : 'text-draft'">{{ r.count }} {{ r.type }}{{ r.count > 1 ? 's' : '' }}</span>
    </li>
  </ol>
</template>
