<script setup lang="ts">
import { computed } from 'vue';
import { Clock, Swords, Radio, Pause, CheckCircle2, CircleSlash, XCircle } from 'lucide-vue-next';

const props = defineProps<{ status: string }>();
// Icon + label + colour: status is never conveyed by colour alone.
const MAP: Record<string, { label: string; icon: any; cls: string }> = {
  waiting: { label: 'Waiting', icon: Clock, cls: 'text-muted border-line' },
  drafting: { label: 'Drafting', icon: Swords, cls: 'text-draft border-draft/40 bg-draft/10' },
  live: { label: 'Live', icon: Radio, cls: 'text-accent border-accent/40 bg-accent/10' },
  paused: { label: 'Paused', icon: Pause, cls: 'text-warn border-warn/40 bg-warn/10' },
  completed: { label: 'Completed', icon: CheckCircle2, cls: 'text-text border-line bg-raised' },
  unavailable: { label: 'Unavailable', icon: CircleSlash, cls: 'text-muted border-line border-dashed' },
  cancelled: { label: 'Cancelled', icon: XCircle, cls: 'text-danger border-danger/40' },
};
const ALIAS: Record<string, string> = {
  live_available: 'live', match_detected: 'live', match_completed: 'completed', live_unavailable: 'unavailable', api_unavailable: 'unavailable',
  match_not_found: 'unavailable', match_data_pending: 'waiting', waiting_for_match: 'waiting', waiting_for_lobby: 'waiting', manual_required: 'unavailable',
};
const v = computed(() => { const k = props.status.toLowerCase(); return MAP[ALIAS[k] ?? k] ?? MAP.waiting!; });
</script>
<template>
  <span :class="['inline-flex items-center gap-1.5 h-6 px-2 rounded-md border text-xs font-medium', v.cls]">
    <component :is="v.icon" class="w-3.5 h-3.5" :stroke-width="2" aria-hidden="true" />{{ v.label }}
  </span>
</template>
