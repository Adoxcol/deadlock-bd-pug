<script setup lang="ts">
import { Loader2, AlertTriangle, Inbox } from 'lucide-vue-next';
defineProps<{ loading?: boolean; error?: string | null; empty?: boolean; emptyText?: string }>();
</script>
<template>
  <div v-if="loading" class="flex items-center gap-2 text-muted text-sm py-10 justify-center"><Loader2 class="w-4 h-4 animate-spin" /> Loading…</div>
  <div v-else-if="error" class="flex items-center gap-2 text-danger text-sm py-6 justify-center" role="alert"><AlertTriangle class="w-4 h-4" /> {{ error }}</div>
  <div v-else-if="empty" class="flex flex-col items-center gap-2 text-muted text-sm py-8"><Inbox class="w-5 h-5" />{{ emptyText ?? 'Nothing here yet.' }}</div>
  <slot v-else />
</template>
