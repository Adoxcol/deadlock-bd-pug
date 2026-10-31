<script setup lang="ts">
/** Faction wordmark: a scratchy hand script for the Hidden King, condensed gothic for the Archmother. */
import { FACTION } from './TeamCrest.vue';
defineProps<{ team: 'amber' | 'sapphire'; size?: number }>();
</script>
<template>
  <span :class="['inline-block leading-none whitespace-nowrap select-none', team === 'amber' ? '-rotate-2 text-amber-team' : 'font-semibold tracking-tight text-sapphire-team']"
    :style="{ fontFamily: team === 'amber' ? `'Rock Salt', cursive` : `'Grenze Gotisch', serif`, fontSize: `${(size ?? 16) * (team === 'amber' ? 0.8 : 1.35)}px` }">{{ team === 'amber' ? 'Hidden King' : FACTION.sapphire.replace(/^The /, '') }}</span>
</template>
