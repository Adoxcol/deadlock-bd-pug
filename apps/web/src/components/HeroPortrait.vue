<script setup lang="ts">
import { computed, ref } from 'vue';
const props = withDefaults(defineProps<{ name?: string | null; src?: string | null; size?: 'sm' | 'md' | 'lg'; state?: 'normal' | 'banned' | 'picked' }>(), { size: 'md', state: 'normal' });
const failed = ref(false);
const initials = computed(() => (props.name ?? '?').split(/[\s&]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase());
const sz = computed(() => ({ sm: 'w-8 h-8 text-[11px]', md: 'w-12 h-12 text-sm', lg: 'w-16 h-16 text-base' })[props.size]);
// Deterministic muted hue per hero so initials tiles are distinguishable.
const hue = computed(() => [...(props.name ?? '')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360);
</script>
<template>
  <div :class="['relative shrink-0 rounded-lg overflow-hidden border border-line', sz, state === 'banned' && 'ban-grey']">
    <span v-if="state === 'banned'" class="ban-slash" />
    <img v-if="src && !failed" :src="src" :alt="name ?? ''" class="w-full h-full object-cover" loading="lazy" @error="failed = true" />
    <div v-else class="w-full h-full grid place-items-center font-semibold text-text/90" :style="{ background: `hsl(${hue} 30% 22%)` }">{{ initials }}</div>
    
  </div>
</template>
