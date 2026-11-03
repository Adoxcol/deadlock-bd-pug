<script setup lang="ts">
/** Overhead map drawn from live-events x/y. Not a game mesh: our own marks, no Valve art. */
const props = defineProps<{ dots: { heroId: number | null; team: number | null; x: number; y: number; label: string }[]; delayed: boolean; unavailable: boolean }>();

const FLOOR = 8000;
const half = () => Math.max(FLOOR, ...props.dots.map((d) => Math.max(Math.abs(d.x), Math.abs(d.y)))) * 1.15;
const left = (x: number) => ((x + half()) / (2 * half())) * 100;
const top = (y: number) => ((half() - y) / (2 * half())) * 100;
const tone = (team: number | null) => (team === 2 ? 'bg-amber-team' : team === 3 ? 'bg-sapphire-team' : 'bg-muted');
</script>

<template>
  <section class="card-ornate p-4" aria-label="Overhead map">
    <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
      <h2 class="h-section">Overhead map</h2>
      <p class="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted">{{ delayed ? 'Same delay as the scoreboard' : 'Live positions' }}</p>
    </div>
    <div class="relative mx-auto w-full max-w-xl aspect-square bg-bg border border-line overflow-hidden">
      <div class="absolute inset-y-0 left-1/2 w-px bg-line/80" aria-hidden="true" />
      <div class="absolute inset-x-0 top-1/2 h-px bg-line/80" aria-hidden="true" />
      <div v-if="!dots.length" class="absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted">
        {{ unavailable ? 'Live positions are unavailable until the live-events service is connected.' : 'No positions yet. They show up when the broadcast includes player locations.' }}
      </div>
      <div v-for="(d, i) in dots" :key="i" class="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 border border-bg"
        :class="tone(d.team)" :style="{ left: `${left(d.x)}%`, top: `${top(d.y)}%` }" :title="d.label" :aria-label="d.label" />
    </div>
    <div class="mt-3 flex items-center justify-center gap-5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
      <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 bg-amber-team" />Amber</span>
      <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 bg-sapphire-team" />Sapphire</span>
    </div>
  </section>
</template>
