<script setup lang="ts">
/** Draft-start intro: the two faction panels slam together at a slanted seam, hold on "VS", then slide back out. */
import FactionMark from './FactionMark.vue';
defineProps<{ teamNames: { amber: string; sapphire: string }; subtitle?: string }>();
</script>
<template>
  <div class="fixed inset-0 z-[80] overflow-hidden pointer-events-none" aria-live="polite" :aria-label="`${teamNames.amber} versus ${teamNames.sapphire}`">
    <div class="intro-panel intro-amber absolute inset-y-0 left-0 w-[56%] bg-amber-team [clip-path:polygon(0_0,100%_0,calc(100%-6vw)_100%,0_100%)] flex flex-col justify-center pl-[6vw]">
      <FactionMark team="amber" :size="44" class="!text-black/85" />
      <div class="mt-3 font-display text-[clamp(2.5rem,7vw,6.5rem)] uppercase leading-none text-black max-w-[38vw] break-words">{{ teamNames.amber }}</div>
    </div>
    <div class="intro-panel intro-sapphire absolute inset-y-0 right-0 w-[56%] bg-sapphire-team [clip-path:polygon(6vw_0,100%_0,100%_100%,0_100%)] flex flex-col justify-center items-end text-right pr-[6vw]">
      <FactionMark team="sapphire" :size="44" class="!text-black/85" />
      <div class="mt-3 font-display text-[clamp(2.5rem,7vw,6.5rem)] uppercase leading-none text-black max-w-[38vw] break-words">{{ teamNames.sapphire }}</div>
      <div v-if="subtitle" class="mt-4 font-mono text-xs font-bold text-black/70">{{ subtitle }}</div>
    </div>
    <div class="intro-vs absolute left-1/2 top-1/2 w-[clamp(5rem,9vw,8rem)] aspect-square grid place-items-center bg-[#0a0908] shadow-2xl">
      <span class="font-display text-[clamp(2rem,4vw,3.5rem)] text-text">VS</span>
    </div>
  </div>
</template>
<style scoped>
.intro-panel { filter: drop-shadow(0 0 30px rgba(0, 0, 0, .5)); }
.intro-amber { animation: intro-left 2.5s cubic-bezier(.7, 0, .2, 1) both; }
.intro-sapphire { animation: intro-right 2.5s cubic-bezier(.7, 0, .2, 1) both; }
.intro-vs { animation: intro-vs 2.5s ease both; }
@keyframes intro-left { 0% { transform: translateX(-105%); } 18%, 76% { transform: translateX(0); } 100% { transform: translateX(-105%); } }
@keyframes intro-right { 0% { transform: translateX(105%); } 18%, 76% { transform: translateX(0); } 100% { transform: translateX(105%); } }
@keyframes intro-vs {
  0%, 16% { transform: translate(-50%, -50%) rotate(-30deg) scale(0); }
  24% { transform: translate(-50%, -50%) rotate(-6deg) scale(1.25); }
  30%, 72% { transform: translate(-50%, -50%) rotate(-6deg) scale(1); }
  80%, 100% { transform: translate(-50%, -50%) rotate(-6deg) scale(0); }
}
@media (prefers-reduced-motion: reduce) { .intro-amber, .intro-sapphire, .intro-vs { animation-duration: 0s; } }
</style>
