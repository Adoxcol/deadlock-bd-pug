<script setup lang="ts">
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });
</script>
<template>
  <span class="flex items-center gap-2.5 select-none">
    <!-- Original mark: a stylised "D" crest. Not a Valve/Deadlock asset. -->
    <svg viewBox="0 0 32 32" class="w-8 h-8 shrink-0" aria-hidden="true">
      <path d="M16 2 4 8v9c0 6.5 5 11.5 12 13 7-1.5 12-6.5 12-13V8L16 2Z" fill="none" stroke="currentColor" stroke-width="2" class="text-text" />
      <path d="M11 10h5.5a6 6 0 0 1 0 12H11V10Zm4 3.5v5h1.4a2.5 2.5 0 0 0 0-5H15Z" fill="currentColor" class="text-accent" />
    </svg>
    <span v-if="!compact" class="leading-none">
      <span class="block text-[15px] font-extrabold tracking-wide uppercase">Deadlock PUG</span>
      <span class="block text-[9px] font-semibold tracking-[0.45em] uppercase text-accent mt-0.5">Bangladesh</span>
    </span>
  </span>
</template>
