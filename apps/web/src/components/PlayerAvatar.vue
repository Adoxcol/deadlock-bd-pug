<script setup lang="ts">
import { computed, ref, watch } from 'vue';
const props = defineProps<{ name: string; src?: string | null }>();
// Steam and Discord URLs go stale when a player changes picture, so a broken image falls back to the initial.
const failed = ref(false);
watch(() => props.src, () => { failed.value = false; });
const initial = computed(() => props.name.replace('[SIM] ', '').charAt(0).toUpperCase() || '?');
</script>

<template>
  <img v-if="src && !failed" :src="src" alt="" referrerpolicy="no-referrer" loading="lazy" class="rounded-full object-cover shrink-0 border border-line" @error="failed = true" />
  <span v-else aria-hidden="true" class="rounded-full shrink-0 bg-primary/20 border border-primary/40 grid place-items-center font-bold">{{ initial }}</span>
</template>
