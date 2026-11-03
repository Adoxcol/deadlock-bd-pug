<script setup lang="ts">
import { computed, ref } from 'vue';
/**
 * Tall hero card. Uses the portrait from the Deadlock assets API when present; otherwise a generated
 * placeholder (so the UI still reads well offline). Never bundles game art.
 */
const props = withDefaults(defineProps<{
  name?: string | null; src?: string | null; size?: 'xs' | 'sm' | 'md' | 'lg';
  state?: 'normal' | 'selected-pick' | 'selected-ban' | 'banned' | 'taken' | 'empty' | 'active-pick' | 'active-ban';
  label?: string | null; animate?: boolean;
}>(), { size: 'md', state: 'normal', animate: false });
const failed = ref(false);
const initials = computed(() => (props.name ?? '').split(/[\s&]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase());
const hue = computed(() => [...(props.name ?? '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7));
const sz = computed(() => ({ xs: 'w-9 h-11', sm: 'w-12 h-16', md: 'w-full aspect-[3/4]', lg: 'w-full aspect-[3/4]' })[props.size]);
const text = computed(() => ({ xs: 'text-[10px]', sm: 'text-xs', md: 'text-2xl', lg: 'text-3xl' })[props.size]);
const ring = computed(() => ({
  normal: 'border-line', 'selected-pick': 'border-primary ring-2 ring-primary/60', 'selected-ban': 'border-danger ring-2 ring-danger/60',
  banned: 'border-danger/40', taken: 'border-line', empty: 'border-dashed border-line bg-bg/40',
  'active-pick': 'border-primary animate-glow', 'active-ban': 'border-danger animate-glow-danger',
})[props.state]);
</script>
<template>
  <div :class="['relative overflow-hidden rounded-lg border bg-raised', sz, ring, animate && 'animate-slot-in', state === 'banned' && 'ban-grey']">
    <template v-if="state !== 'empty' && state !== 'active-pick' && state !== 'active-ban'">
      <img v-if="src && !failed" :src="src" :alt="name ?? ''" class="absolute inset-0 w-full h-full object-cover object-top" loading="lazy" @error="failed = true" />
      <div v-else class="absolute inset-0" :style="{ background: `linear-gradient(160deg, hsl(${hue} 45% 26%), hsl(${(hue + 40) % 360} 35% 12%) 70%)` }">
        <div class="absolute inset-0 opacity-[0.12]" style="background-image: repeating-linear-gradient(135deg, #fff 0 1px, transparent 1px 9px)" />
        <span :class="['absolute inset-0 grid place-items-center font-black tracking-tight text-white/85', text]">{{ initials }}</span>
      </div>
      <div v-if="size === 'md' || size === 'lg'" class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-6 pb-1.5 px-1.5">
        <span class="block font-display text-xs sm:text-sm font-bold uppercase tracking-wider text-text truncate text-center">{{ name }}</span>
      </div>
      <span v-if="state === 'banned'" class="ban-slash" />
      <div v-if="state === 'taken'" class="absolute inset-0 bg-black/65" />
      <span v-if="label" class="absolute top-1 left-1 right-1 text-center text-[9px] font-semibold uppercase tracking-wide rounded bg-black/70 text-white/90 px-1 py-0.5 truncate">{{ label }}</span>
    </template>
    <span v-else-if="label" class="absolute inset-0 grid place-items-center font-display text-lg text-muted/60">{{ label }}</span>
  </div>
</template>
