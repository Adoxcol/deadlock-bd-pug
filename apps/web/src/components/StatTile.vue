<script setup lang="ts">
/** Big number with a mono caption. `tone` colours the number (team colours, win/loss). */
defineProps<{ label: string; value: string | number | null | undefined; tone?: 'amber' | 'sapphire' | 'win' | 'loss' | 'brass' }>();
</script>
<template>
  <div class="card px-4 py-3">
    <div :class="['font-display text-3xl leading-none tabular-nums', { amber: 'text-amber-team', sapphire: 'text-sapphire-team', win: 'text-accent', loss: 'text-danger', brass: 'text-primary' }[tone ?? 'brass'] ?? 'text-text']">{{ value ?? '—' }}</div>
    <div class="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted mt-1.5">{{ label }}</div>
  </div>
</template>
