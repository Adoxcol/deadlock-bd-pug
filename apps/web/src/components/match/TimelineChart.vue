<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{ title: string; team: 'amber' | 'sapphire'; points: { t: number; v: number }[] }>();
const W = 320, H = 120, L = 34, R = 8, T = 8, B = 20;
const hover = ref<number | null>(null);
const maxT = computed(() => Math.max(1, ...props.points.map((p) => p.t)));
const maxV = computed(() => Math.max(1, ...props.points.map((p) => p.v)));
const x = (t: number) => L + (t / maxT.value) * (W - L - R);
const y = (v: number) => H - B - (v / maxV.value) * (H - T - B);
const line = computed(() => props.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' '));
const short = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n)));
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const active = computed(() => (hover.value === null ? null : props.points[hover.value] ?? null));
const stroke = computed(() => (props.team === 'amber' ? 'var(--chart-amber, #e8a33a)' : 'var(--chart-sapphire, #5a8fe0)'));

function move(e: PointerEvent) {
  const box = (e.currentTarget as SVGElement).getBoundingClientRect();
  const t = (((e.clientX - box.left) / box.width) * W - L) / (W - L - R) * maxT.value;
  let best = 0;
  props.points.forEach((p, i) => { if (Math.abs(p.t - t) < Math.abs(props.points[best]!.t - t)) best = i; });
  hover.value = best;
}
</script>

<template>
  <figure class="min-w-0">
    <figcaption class="flex items-baseline justify-between gap-2 mb-1">
      <span class="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{{ title }}</span>
      <span class="font-display tabular-nums">{{ short((active ?? points[points.length - 1])?.v ?? 0) }}<span v-if="active" class="ml-2 font-mono text-[10px] text-muted">at {{ clock(active.t) }}</span></span>
    </figcaption>
    <svg :viewBox="`0 0 ${W} ${H}`" class="w-full block touch-none" role="img" :aria-label="`${title} over the match, ending at ${short(points[points.length - 1]?.v ?? 0)}`" @pointermove="move" @pointerdown="move" @pointerleave="hover = null">
      <g v-for="f in [0.5, 1]" :key="f">
        <line :x1="L" :x2="W - R" :y1="y(maxV * f)" :y2="y(maxV * f)" stroke="currentColor" class="text-line" stroke-opacity=".45" />
        <text :x="L - 5" :y="y(maxV * f) + 3" text-anchor="end" class="fill-muted text-[9px] font-mono">{{ short(maxV * f) }}</text>
      </g>
      <line :x1="L" :x2="W - R" :y1="H - B" :y2="H - B" stroke="currentColor" class="text-line" />
      <text :x="L" :y="H - 6" class="fill-muted text-[9px] font-mono">0:00</text>
      <text :x="W - R" :y="H - 6" text-anchor="end" class="fill-muted text-[9px] font-mono">{{ clock(maxT) }}</text>
      <path :d="line" fill="none" :stroke="stroke" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <template v-if="active">
        <line :x1="x(active.t)" :x2="x(active.t)" :y1="T" :y2="H - B" stroke="currentColor" class="text-muted" stroke-dasharray="2 3" />
        <circle :cx="x(active.t)" :cy="y(active.v)" r="4" :fill="stroke" stroke="#0e0c0a" stroke-width="2" />
      </template>
    </svg>
  </figure>
</template>
