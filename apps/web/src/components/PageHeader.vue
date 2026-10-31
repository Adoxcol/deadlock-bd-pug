<script setup lang="ts">
/** Standard page heading: mono eyebrow, display-caps title, brass rule, optional actions on the right. See docs/UI.md. */
withDefaults(defineProps<{ eyebrow?: string; title: string; subtitle?: string; center?: boolean }>(), { center: false });
</script>
<template>
  <header :class="['flex flex-wrap items-end gap-4', center ? 'flex-col items-center text-center' : 'justify-between']">
    <div :class="['min-w-0 space-y-1', center && 'flex flex-col items-center']">
      <div v-if="eyebrow" class="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-muted">{{ eyebrow }}</div>
      <h1 class="text-3xl sm:text-4xl text-text leading-none">{{ title }}</h1>
      <p v-if="subtitle" class="text-sm text-muted pt-1">{{ subtitle }}</p>
      <div :class="['rule-brass mt-3', center ? 'w-64' : 'w-48']" />
    </div>
    <div v-if="$slots.default" class="flex flex-wrap items-center gap-2"><slot /></div>
  </header>
</template>
