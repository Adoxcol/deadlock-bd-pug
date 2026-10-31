<script setup lang="ts">
/** Full-screen flash shown for each lock-in or ban. Purely decorative: never blocks clicks. */
defineProps<{ name: string; src?: string | null; type: 'pick' | 'ban'; team: 'amber' | 'sapphire'; teamName: string }>();
</script>

<template>
  <div class="fixed inset-0 z-50 pointer-events-none grid place-items-center overflow-hidden" aria-hidden="true">
    <div class="absolute inset-0 bg-bg/70 backdrop-blur-[2px] animate-splash-wash" />
    <div :class="['absolute inset-0 animate-splash-wash', type === 'ban' ? 'bg-[radial-gradient(ellipse_at_center,rgba(239,68,68,.35),transparent_65%)]' : team === 'amber' ? 'bg-[radial-gradient(ellipse_at_center,rgba(245,165,36,.35),transparent_65%)]' : 'bg-[radial-gradient(ellipse_at_center,rgba(79,143,247,.35),transparent_65%)]']" />
    <div :class="['absolute inset-x-0 h-40 sm:h-56 top-1/2 -translate-y-1/2 animate-splash-band', type === 'ban' ? 'bg-danger/20' : team === 'amber' ? 'bg-amber-team/15' : 'bg-sapphire-team/15']" />
    <div class="relative flex items-center gap-5 sm:gap-8 animate-splash-out">
      <div :class="type === 'ban' && 'animate-draft-shake'">
        <div :class="['relative w-28 h-36 sm:w-40 sm:h-52 rounded-xl overflow-hidden border-2 bg-raised animate-splash-card', type === 'ban' ? 'border-danger' : team === 'amber' ? 'border-amber-team' : 'border-sapphire-team']">
          <img v-if="src" :src="src" alt="" :class="['absolute inset-0 w-full h-full object-cover object-top', type === 'ban' && 'grayscale']" />
          <div class="absolute inset-0 bg-[linear-gradient(110deg,transparent_35%,rgba(255,255,255,.45)_50%,transparent_65%)] bg-[length:250%_100%] animate-splash-sheen" />
          <div v-if="type === 'ban'" class="absolute left-[-25%] w-[150%] top-1/2 h-1.5 -mt-0.5 bg-danger shadow-[0_0_12px_#ef4444] animate-ban-slash" />
        </div>
      </div>
      <div class="min-w-0">
        <div :class="['font-mono text-sm sm:text-base font-bold uppercase tracking-[0.2em] animate-splash-label', type === 'ban' ? 'text-danger' : team === 'amber' ? 'text-amber-team' : 'text-sapphire-team']">{{ teamName }} {{ type === 'ban' ? 'bans' : 'picks' }}</div>
        <div class="font-display text-5xl sm:text-7xl font-extrabold uppercase tracking-wide text-text drop-shadow-[0_4px_24px_rgba(0,0,0,.7)] animate-splash-name">{{ name }}</div>
      </div>
    </div>
  </div>
</template>
