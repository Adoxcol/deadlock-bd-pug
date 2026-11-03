<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{ rank: string; size?: number }>(), { size: 22 });
// Our rank names are Deadlock's, so each uses that rank's official badge.
const TIER: Record<string, number> = { Initiate: 1, Seeker: 2, Alchemist: 3, Arcanist: 4, Archon: 7, Eternus: 11 };
const src = computed(() => `https://assets-bucket.deadlock-api.com/assets-api-res/images/ranks/rank${TIER[props.rank] ?? 1}/badge_lg.png`);
</script>

<template>
  <img :src="src" :alt="rank" :title="`${rank} (PUG rank, not your in-game rank)`" :width="size" :height="size" loading="lazy" class="inline-block shrink-0 object-contain align-middle" />
</template>
