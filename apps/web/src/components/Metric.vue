<script setup lang="ts">
// Renders a stat, or an explicit "unavailable" marker — never a fake zero.
defineProps<{ value: number | null | undefined; reason?: string }>();
</script>
<template>
  <span v-if="value != null" class="tabular-nums">{{ value.toLocaleString() }}</span>
  <span v-else class="text-muted/70" :title="reason ?? 'Not available from the data source'" aria-label="unavailable">n/a</span>
</template>
