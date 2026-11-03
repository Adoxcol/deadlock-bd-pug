<script setup lang="ts">
import { computed } from 'vue';
import type { CaptainSeat } from '../../../../server/src/draft/formation';

const props = defineProps<{ phase: 'choice' | 'side'; winner: CaptainSeat; youChoose: boolean; pending: boolean; winnerTeam: string; chooserTeam: string; firstTeam: string; initials: Record<CaptainSeat, string> }>();
const emit = defineEmits<{ first: []; side: ['amber' | 'sapphire'] }>();
const landing = computed(() => `${props.winner === 'a' ? 1800 : 1980}deg`);
const title = computed(() => props.phase === 'choice' ? `${props.winnerTeam} won the toss` : `${props.chooserTeam} chooses a side`);
const detail = computed(() => props.phase === 'choice' ? 'The winner takes first pick or a side. The other captain gets what is left.' : `${props.firstTeam} took first pick.`);
</script>

<template>
  <section class="card-ornate p-5 sm:p-8 flex flex-col items-center text-center gap-5" aria-label="Coin toss">
    <div class="coin" :style="{ '--landing': landing }" aria-hidden="true">
      <span class="coin-face">{{ initials.a }}</span>
      <span class="coin-face coin-back">{{ initials.b }}</span>
    </div>
    <div class="space-y-1" role="status">
      <div class="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Coin toss</div>
      <h2 class="font-display text-3xl uppercase break-words">{{ title }}</h2>
      <p class="text-sm text-muted">{{ detail }}</p>
    </div>
    <div v-if="youChoose" class="flex flex-wrap justify-center gap-2">
      <button v-if="phase === 'choice'" class="btn-primary" :disabled="pending" @click="emit('first')">First pick</button>
      <button v-for="side in (['amber', 'sapphire'] as const)" :key="side" :disabled="pending"
        :class="['btn rounded-none px-5 text-bg [clip-path:polygon(8px_0,100%_0,calc(100%-8px)_100%,0_100%)] hover:brightness-110', side === 'amber' ? 'bg-amber-team' : 'bg-sapphire-team']"
        @click="emit('side', side)">{{ side === 'amber' ? 'Hidden King' : 'Archmother' }}</button>
    </div>
    <p v-else class="font-mono text-xs uppercase tracking-[0.14em] text-muted">Waiting for the captain to choose</p>
  </section>
</template>

<style scoped>
.coin { position: relative; width: 6rem; height: 6rem; transform-style: preserve-3d; transform: rotateY(var(--landing)); animation: coin-flip 1.4s cubic-bezier(.2, .7, .2, 1); }
.coin-face { position: absolute; inset: 0; display: grid; place-items: center; border-radius: 9999px; backface-visibility: hidden; border: 3px solid #d4a24c; background: radial-gradient(circle at 35% 30%, #3a2c14, #14100a); box-shadow: inset 0 0 0 4px rgba(212, 162, 76, .25); color: #d4a24c; font-family: var(--font-display, inherit); font-size: 2.25rem; }
.coin-back { transform: rotateY(180deg); }
@keyframes coin-flip { from { transform: rotateY(0) translateY(0); } 50% { transform: rotateY(calc(var(--landing) / 2)) translateY(-1.5rem); } to { transform: rotateY(var(--landing)); } }
@media (prefers-reduced-motion: reduce) { .coin { animation: none; } }
</style>
