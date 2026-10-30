<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../lib/api';
import { dateShort, duration } from '../lib/format';
import StatusBadge from '../components/StatusBadge.vue';
import PageState from '../components/PageState.vue';
import SimBadge from '../components/SimBadge.vue';
const list = ref<any[] | null>(null);
const error = ref<string | null>(null);
onMounted(async () => { try { list.value = await api('/matches'); } catch (e) { error.value = (e as Error).message; } });
const live = (m: any) => ['LIVE_AVAILABLE', 'LIVE_UNAVAILABLE', 'MATCH_DETECTED'].includes(m.trackingState);
</script>
<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-bold tracking-tight">Matches</h1>
    <div class="card overflow-x-auto">
      <PageState :loading="!list && !error" :error="error" :empty="list?.length === 0" empty-text="No matches yet.">
        <table class="w-full table-compact">
          <thead><tr><th>Match</th><th>PUG</th><th>Status</th><th>Winner</th><th class="hidden sm:table-cell">Duration</th><th class="hidden md:table-cell">Date</th><th></th></tr></thead>
          <tbody>
            <tr v-for="m in list" :key="m.id" class="hover:bg-raised/40">
              <td class="font-mono text-xs"><div class="flex items-center gap-2">{{ m.deadlockMatchId ?? '—' }}<SimBadge v-if="m.isSimulated" /></div></td>
              <td>{{ m.pug ? `#${m.pug.number}` : '—' }}</td>
              <td><StatusBadge :status="m.trackingState" /></td>
              <td :class="m.result?.winner === 'AMBER' ? 'text-amber-team' : m.result ? 'text-sapphire-team' : 'text-muted'">{{ m.result ? (m.result.winner === 'AMBER' ? 'Amber' : 'Sapphire') : '—' }}</td>
              <td class="hidden sm:table-cell tabular-nums">{{ duration(m.durationSec) }}</td>
              <td class="hidden md:table-cell text-muted">{{ dateShort(m.createdAt) }}</td>
              <td class="text-right"><RouterLink :to="live(m) ? `/matches/${m.id}/live` : `/matches/${m.id}`" :class="live(m) ? 'btn-accent !h-8' : 'text-xs text-primary hover:underline'">{{ live(m) ? 'View Live' : 'Details' }}</RouterLink></td>
            </tr>
          </tbody>
        </table>
      </PageState>
    </div>
  </div>
</template>
