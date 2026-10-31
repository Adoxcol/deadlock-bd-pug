<script setup lang="ts">
/** Lock-in / ban reveal: a slanted team-coloured banner slides in from the left, the hero art from the right, then both slide out. Never blocks clicks. */
defineProps<{ name: string; src?: string | null; nameUrl?: string | null; bgUrl?: string | null; type: 'pick' | 'ban'; team: 'amber' | 'sapphire'; teamName: string }>();
</script>

<template>
  <div class="fixed inset-0 z-50 pointer-events-none overflow-hidden" aria-hidden="true">
    <div class="absolute inset-0 bg-black/55 rv-wash" />
    <!-- Hero art -->
    <div class="rv-art absolute inset-y-0 right-0 w-[62%] overflow-hidden [clip-path:polygon(14%_0,100%_0,100%_100%,0_100%)] bg-[#0b0a09]">
      <img v-if="bgUrl" :src="bgUrl" alt="" class="absolute inset-0 w-full h-full object-cover object-right opacity-90" />
      <img v-if="src" :src="src" alt="" :class="['absolute right-[10%] bottom-0 h-[78%] max-h-[570px] w-auto object-contain object-bottom drop-shadow-[0_10px_40px_rgba(0,0,0,.7)]', type === 'ban' && 'grayscale']" />
      <div v-if="type === 'ban'" class="absolute left-[-10%] w-[120%] top-1/2 h-2 bg-danger shadow-[0_0_18px_#cf4a3c] rotate-[-14deg] rv-slash" />
    </div>
    <!-- Team banner -->
    <div :class="['rv-banner absolute left-0 top-1/2 w-[58%] h-[46%] -translate-y-1/2 -rotate-[4deg] origin-left flex flex-col justify-center pl-[5vw] pr-[8vw] [clip-path:polygon(0_0,96%_4%,100%_100%,0_100%)] shadow-2xl',
      type === 'ban' ? 'bg-danger' : team === 'amber' ? 'bg-amber-team' : 'bg-sapphire-team']">
      <span class="self-start px-3 py-1 bg-text text-bg font-display text-sm sm:text-lg uppercase rotate-[2deg]">{{ teamName }}{{ type === 'ban' ? ' bans' : '' }}</span>
      <img v-if="nameUrl" :src="nameUrl" :alt="name" class="mt-3 h-[clamp(3rem,9vw,8rem)] w-auto max-w-full object-contain object-left [filter:brightness(0)]" />
      <div v-else class="mt-3 font-display text-[clamp(2.5rem,7vw,6rem)] uppercase leading-none text-black">{{ name }}</div>
    </div>
  </div>
</template>

<style scoped>
.rv-wash { animation: rv-wash 2.2s ease both; }
.rv-art { animation: rv-art 2.2s cubic-bezier(.7, 0, .2, 1) both; }
.rv-banner { animation: rv-banner 2.2s cubic-bezier(.7, 0, .2, 1) both; }
.rv-slash { animation: rv-slash 2.2s ease both; transform-origin: left; }
@keyframes rv-wash { 0% { opacity: 0; } 15%, 80% { opacity: 1; } 100% { opacity: 0; } }
@keyframes rv-art { 0% { transform: translateX(100%); } 18%, 80% { transform: translateX(0); } 100% { transform: translateX(100%); } }
@keyframes rv-banner { 0% { transform: translate(-105%, -50%) rotate(-4deg); } 22%, 78% { transform: translate(0, -50%) rotate(-4deg); } 100% { transform: translate(-105%, -50%) rotate(-4deg); } }
@keyframes rv-slash { 0%, 28% { transform: rotate(-14deg) scaleX(0); } 38%, 100% { transform: rotate(-14deg) scaleX(1); } }
@media (prefers-reduced-motion: reduce) { .rv-wash, .rv-art, .rv-banner, .rv-slash { animation-duration: 0s; } }
</style>
