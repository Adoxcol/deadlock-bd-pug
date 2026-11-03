<script setup lang="ts">
import { Crown, UserRound } from 'lucide-vue-next';
import TeamNameInput from './TeamNameInput.vue';

defineProps<{
  format: string;
  seats: { key: 'a' | 'b'; label: string; name: string | null; isMe: boolean; canTake: boolean; team: string | null; customTeam: string; defaultTeam: string }[];
  pool: { id: string; name: string; isMe: boolean; rating: string }[];
  slots: number;
  pending: boolean;
}>();
const emit = defineEmits<{ take: ['a' | 'b']; teamName: [string] }>();
const initial = (name: string) => name.replace('[SIM] ', '').charAt(0).toUpperCase();
</script>

<template>
  <!-- Two seats facing off over the format tile, like the draft's team banner. -->
  <section class="relative grid md:grid-cols-[1fr_auto_1fr] items-stretch gap-3 md:gap-6 border border-line/70 p-4 sm:p-6 bg-[linear-gradient(90deg,rgba(232,163,58,.14),rgba(14,12,10,.6)_45%,rgba(14,12,10,.6)_55%,rgba(90,143,224,.14))]" aria-label="Captain seats">
    <template v-for="(s, i) in seats" :key="s.key">
      <div v-if="i === 1" class="hidden md:grid self-center w-16 h-16 place-items-center bg-bg border border-line rotate-[8deg] shadow-[0_8px_24px_rgba(0,0,0,.6)]">
        <span class="-rotate-[8deg] font-display text-xl uppercase text-text">{{ format }}</span>
      </div>
      <div :class="['flex items-center gap-4 min-h-24 min-w-0', i === 1 && 'md:flex-row-reverse md:text-right']">
        <div v-if="s.name" class="w-16 h-16 shrink-0 grid place-items-center bg-bg border-2 border-primary/70 rotate-45 animate-slot-in">
          <span class="-rotate-45 font-display text-2xl text-primary">{{ initial(s.name) }}</span>
        </div>
        <div v-else class="w-16 h-16 shrink-0 grid place-items-center border-2 border-dashed border-line rotate-45">
          <Crown class="-rotate-45 w-5 h-5 text-muted" />
        </div>
        <div class="min-w-0 pl-1">
          <div class="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted">{{ s.label }}</div>
          <div v-if="s.name" class="font-display text-2xl uppercase truncate">{{ s.name }}<span v-if="s.isMe" class="ml-2 align-middle font-mono text-[10px] tracking-wider text-primary">You</span></div>
          <div v-else class="font-display text-2xl uppercase text-muted/70">Open seat</div>
          <TeamNameInput v-if="s.isMe" class="mt-1.5 max-w-56" :value="s.customTeam" :placeholder="s.defaultTeam" label="Team name" @save="emit('teamName', $event)" />
          <div v-else-if="s.team" class="text-sm text-muted truncate">{{ s.team }}</div>
          <button v-if="s.canTake" type="button" class="btn-ghost !h-8 mt-1.5" :disabled="pending" @click="emit('take', s.key)">Take this seat</button>
        </div>
      </div>
    </template>
  </section>

  <section class="card-ornate p-4 sm:p-5 space-y-4" aria-label="Player pool">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="h-section">Player pool</h2>
      <div class="flex items-center gap-3">
        <slot />
        <span class="font-display text-2xl tabular-nums leading-none"><span class="text-primary">{{ pool.length }}</span><span class="text-muted">/{{ slots }}</span></span>
      </div>
    </div>
    <div class="h-1 bg-bg overflow-hidden" aria-hidden="true"><div class="h-full bg-primary transition-[width] duration-300" :style="{ width: `${(pool.length / slots) * 100}%` }" /></div>
    <ol class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      <li v-for="n in slots" :key="n" :class="['relative flex items-center gap-2.5 h-14 pl-3 pr-4 border [clip-path:polygon(0_0,100%_0,calc(100%-10px)_100%,0_100%)]', pool[n - 1] ? 'bg-raised border-primary/40' : 'bg-bg/60 border-line/60 border-dashed']">
        <span class="font-mono text-[10px] font-bold tabular-nums text-muted">{{ String(n).padStart(2, '0') }}</span>
        <template v-if="pool[n - 1]">
          <span :key="pool[n - 1]!.id" class="min-w-0 animate-fade-up">
            <span class="block text-sm font-semibold truncate">{{ pool[n - 1]!.name }}</span>
            <span class="block truncate font-mono text-[10px] uppercase tracking-wider text-muted"><span v-if="pool[n - 1]!.isMe" class="text-primary">You · </span>{{ pool[n - 1]!.rating }}</span>
          </span>
        </template>
        <UserRound v-else class="w-4 h-4 text-line" aria-label="Open slot" />
      </li>
    </ol>
  </section>
</template>
