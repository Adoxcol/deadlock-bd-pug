<script setup lang="ts">
import { computed } from 'vue';
import { Ban, Lock } from 'lucide-vue-next';
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
  <ol class="flex flex-wrap items-stretch gap-y-2" aria-label="Draft order">
    <li v-for="(r, i) in runs" :key="i" class="flex items-center">
      <div :class="['relative flex items-center gap-2 h-11 pl-3 pr-4 border-l-[3px] bg-bg/60 [clip-path:polygon(0_0,calc(100%-8px)_0,100%_50%,calc(100%-8px)_100%,0_100%)] transition-opacity',
        r.team === 'amber' ? 'border-l-amber-team' : 'border-l-sapphire-team',
        r.type === 'ban' ? 'bg-gradient-to-r from-danger/15 to-bg/60' : r.team === 'amber' ? 'bg-gradient-to-r from-amber-team/15 to-bg/60' : 'bg-gradient-to-r from-sapphire-team/15 to-bg/60',
        state(r) === 'now' && '!from-primary/30 animate-glow', state(r) === 'done' && 'opacity-40']">
        <component :is="r.type === 'ban' ? Ban : Lock" :class="['w-4 h-4 shrink-0', r.type === 'ban' ? 'text-danger' : 'text-draft']" />
        <div class="leading-tight">
          <div :class="['font-display text-[13px] uppercase truncate max-w-[9rem]', r.team === 'amber' ? 'text-amber-team' : 'text-sapphire-team']">{{ teamNames[r.team] }}</div>
          <div :class="['font-mono text-[10px] font-bold uppercase tracking-wider', r.type === 'ban' ? 'text-danger' : 'text-draft']">{{ r.count }} {{ r.type }}{{ r.count > 1 ? 's' : '' }}</div>
        </div>
      </div>
      <span v-if="i < runs.length - 1" class="w-2" />
    </li>
  </ol>
</template>
