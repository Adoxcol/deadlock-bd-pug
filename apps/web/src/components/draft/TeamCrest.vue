<script lang="ts">
/** Faction emblem: Amber fights for the Hidden King (sun crown), Sapphire for the Archmother (crescent and eye). */
export const FACTION = { amber: 'The Hidden King', sapphire: 'The Archmother' } as const;
</script>
<script setup lang="ts">
defineProps<{ team: 'amber' | 'sapphire'; size?: number }>();
</script>

<template>
  <svg :width="size ?? 56" :height="size ?? 56" viewBox="0 0 64 64" fill="none" aria-hidden="true"
    :class="team === 'amber' ? 'text-amber-team' : 'text-sapphire-team'">
    <path d="M32 3 58 17v30L32 61 6 47V17Z" fill="currentColor" fill-opacity=".12" stroke="currentColor" stroke-width="2" />
    <path d="M32 9 52 20v24L32 55 12 44V20Z" stroke="currentColor" stroke-opacity=".35" stroke-width="1" />
    <template v-if="team === 'amber'">
      <g stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M32 18v-4M41 21l3-3M23 21l-3-3M45 30h4M15 30h4" />
      </g>
      <path d="M20 41 18 28l7 6 7-10 7 10 7-6-2 13Z" fill="currentColor" />
      <rect x="20" y="43" width="24" height="3" rx="1" fill="currentColor" />
    </template>
    <template v-else>
      <path d="M38 17a15 15 0 1 0 0 30 12 12 0 1 1 0-30Z" fill="currentColor" />
      <path d="M33 32c3-4 9-4 12 0-3 4-9 4-12 0Z" stroke="currentColor" stroke-width="1.8" />
      <circle cx="39" cy="32" r="1.8" fill="currentColor" />
    </template>
  </svg>
</template>
