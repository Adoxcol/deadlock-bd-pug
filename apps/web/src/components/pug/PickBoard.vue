<script setup lang="ts">
import { Crown, UserRound } from 'lucide-vue-next';
import TeamNameInput from './TeamNameInput.vue';
import FactionMark from '../draft/FactionMark.vue';

export type BoardTeam = { seat: 'a' | 'b'; side: 'amber' | 'sapphire'; name: string; customName: string; defaultName: string; players: { id: string; name: string; isCaptain: boolean; isMe: boolean }[]; picking: boolean; mine: boolean };
defineProps<{ teams: BoardTeam[]; size: number; pool: { id: string; name: string }[]; canPick: boolean; pending: boolean; pickNumber: number; totalPicks: number; turnName: string }>();
const emit = defineEmits<{ pick: [string]; teamName: [string] }>();
const empties = (t: BoardTeam, size: number) => Math.max(0, size - t.players.length);
</script>

<template>
  <section :class="['flex flex-wrap items-center justify-between gap-3 border p-4 transition-colors', canPick ? 'border-primary bg-primary/10' : 'border-line/70']" role="status">
    <div class="min-w-0">
      <div class="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Pick {{ pickNumber }} of {{ totalPicks }}</div>
      <div class="font-display text-2xl uppercase break-words">{{ canPick ? 'Your pick' : `${turnName} is picking` }}</div>
    </div>
    <div class="flex gap-1" aria-hidden="true">
      <span v-for="n in totalPicks" :key="n" :class="['w-2 h-2 rotate-45', n < pickNumber ? 'bg-primary' : n === pickNumber ? 'bg-primary animate-pulse' : 'bg-line']" />
    </div>
  </section>

  <div class="grid grid-cols-2 lg:grid-cols-[1fr_1.25fr_1fr] gap-3 items-start">
    <section v-for="(t, i) in teams" :key="t.seat" :aria-label="t.name"
      :class="['min-w-0 border p-3 space-y-2 transition-all', i === 0 ? 'order-1 bg-[linear-gradient(180deg,rgba(232,163,58,.12),transparent_60%)]' : 'order-2 lg:order-3 bg-[linear-gradient(180deg,rgba(90,143,224,.12),transparent_60%)]',
        t.picking ? (t.side === 'amber' ? 'border-amber-team shadow-[0_0_24px_rgba(232,163,58,.2)]' : 'border-sapphire-team shadow-[0_0_24px_rgba(90,143,224,.2)]') : 'border-line/70']">
      <div class="min-w-0">
        <FactionMark :team="t.side" :size="16" />
        <TeamNameInput v-if="t.mine" :value="t.customName" :placeholder="t.defaultName" label="Team name" @save="emit('teamName', $event)" />
        <h2 v-else class="font-display text-lg uppercase truncate">{{ t.name }}</h2>
      </div>
      <ol class="space-y-1">
        <li v-for="p in t.players" :key="p.id" class="flex items-center gap-2 h-10 px-2.5 bg-raised border border-line/70 animate-slot-in min-w-0">
          <Crown v-if="p.isCaptain" class="w-3.5 h-3.5 shrink-0 text-primary" aria-label="Captain" />
          <span class="text-sm font-semibold truncate">{{ p.name }}</span>
          <span v-if="p.isMe" class="ml-auto font-mono text-[10px] uppercase tracking-wider text-primary">You</span>
        </li>
        <li v-for="n in empties(t, size)" :key="`e${n}`" class="flex items-center gap-2 h-10 px-2.5 border border-dashed border-line/60">
          <UserRound class="w-3.5 h-3.5 text-line" aria-hidden="true" />
        </li>
      </ol>
    </section>

    <section class="order-3 col-span-2 lg:col-span-1 lg:order-2 card-ornate p-3 space-y-2" aria-label="Available players">
      <div class="flex items-baseline justify-between gap-2">
        <h2 class="h-section">Available</h2>
        <span class="font-display text-xl tabular-nums text-primary">{{ pool.length }}</span>
      </div>
      <ul class="grid grid-cols-2 gap-1.5">
        <li v-for="p in pool" :key="p.id" class="min-w-0">
          <button type="button" :disabled="!canPick || pending" :aria-label="`Pick ${p.name}`"
            :class="['w-full h-11 px-3 text-left text-sm font-semibold truncate border transition-colors', canPick ? 'border-primary/50 bg-primary/5 hover:bg-primary hover:text-bg cursor-pointer' : 'border-line/70 bg-bg/60 cursor-default']"
            @click="emit('pick', p.id)">{{ p.name }}</button>
        </li>
      </ul>
    </section>
  </div>
</template>
