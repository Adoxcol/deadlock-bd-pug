<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Plus } from 'lucide-vue-next';
import { api } from '../lib/api';
import StatusBadge from '../components/StatusBadge.vue';
import PageState from '../components/PageState.vue';
import SimBadge from '../components/SimBadge.vue';
import { useSession } from '../stores/session';
const session = useSession();
const list = ref<any[] | null>(null);
const error = ref<string | null>(null);
onMounted(async () => { try { list.value = await api('/drafts'); } catch (e) { error.value = (e as Error).message; } });
</script>
<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between"><h1 class="text-2xl font-semibold tracking-tight">Drafts</h1>
      <RouterLink v-if="session.can('CAPTAIN')" to="/drafts/new" class="btn-draft"><Plus class="w-4 h-4" />New draft</RouterLink></div>
    <div class="card divide-y divide-line">
      <PageState :loading="!list && !error" :error="error" :empty="list?.length === 0" empty-text="No drafts yet.">
        <RouterLink v-for="d in list" :key="d.id" :to="`/draft/${d.id}`" class="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-raised/50">
          <span class="font-medium">{{ d.name }}</span><SimBadge v-if="d.simulated" />
          <span class="text-sm text-muted"><span class="text-amber-team">{{ d.teamNames.amber }}</span> vs <span class="text-sapphire-team">{{ d.teamNames.sapphire }}</span></span>
          <StatusBadge class="ml-auto" :status="d.status" />
        </RouterLink>
      </PageState>
    </div>
  </div>
</template>
