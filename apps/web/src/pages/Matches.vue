<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../lib/api';
import { dateShort, duration } from '../lib/format';
import StatusBadge from '../components/StatusBadge.vue';
import PageState from '../components/PageState.vue';
import SimBadge from '../components/SimBadge.vue';
import PageHeader from '../components/PageHeader.vue';
const list = ref<any[] | null>(null);
const error = ref<string | null>(null);
onMounted(async () => { try { list.value = await api('/matches'); } catch (e) { error.value = (e as Error).message; } });
const live = (m: any) => ['LIVE_AVAILABLE', 'LIVE_UNAVAILABLE', 'MATCH_DETECTED'].includes(m.trackingState);
</script>
<template>
  <div class="max-w-6xl mx-auto space-y-5">
    <PageHeader eyebrow="Tracked games" title="Matches" />
    <div class="card-ornate overflow-x-auto">
      <PageState :loading="!list && !error" :error="error" :empty="list?.length === 0" empty-text="No matches yet.">
        <table class="w-full table-compact">
          <thead><tr><th>Match</th><th>PUG</th><th>Status</th><th>Winner</th><th class="hidden sm:table-cell">Duration</th><th class="hidden md:table-cell">Date</th><th></th></tr></thead>
          <tbody>
            <tr v-for="m in list" :key="m.id" class="hover:bg-raised/50">
              <td class="font-mono text-xs"><div class="flex items-center gap-2">{{ m.deadlockMatchId ?? '—' }}<SimBadge v-if="m.isSimulated" /></div></td>
              <td class="font-display">{{ m.pug ? `#${m.pug.number}` : '—' }}</td>
              <td><StatusBadge :status="m.trackingState" /></td>
              <td :class="['font-display uppercase', m.result?.winner === 'AMBER' ? 'text-amber-team' : m.result ? 'text-sapphire-team' : 'text-muted']">{{ m.result ? (m.result.winner === 'AMBER' ? 'Amber' : 'Sapphire') : '—' }}</td>
              <td class="hidden sm:table-cell tabular-nums font-mono">{{ duration(m.durationSec) }}</td>
              <td class="hidden md:table-cell text-muted">{{ dateShort(m.createdAt) }}</td>
              <td class="text-right"><RouterLink :to="live(m) ? `/matches/${m.id}/live` : `/matches/${m.id}`" :class="live(m) ? 'btn-primary !h-8' : 'btn-ghost !h-8'">{{ live(m) ? 'Watch live' : 'Details' }}</RouterLink></td>
            </tr>
          </tbody>
        </table>
      </PageState>
    </div>
  </div>
</template>
