<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useSession } from '../stores/session';
import { api } from '../lib/api';
import { useHeroes } from '../stores/heroes';
import MatchCard from '../components/match/MatchCard.vue';
import PageState from '../components/PageState.vue';
import PageHeader from '../components/PageHeader.vue';
const heroes = useHeroes();
const list = ref<any[] | null>(null);
const error = ref<string | null>(null);
const session = useSession();
const showSimulated = ref(false);
async function load() { list.value = null; error.value = null; try { list.value = await api(showSimulated.value ? '/matches?simulated=1' : '/matches'); } catch (e) { error.value = (e as Error).message; } }
onMounted(() => { heroes.load().catch(() => {}); load(); });
watch(showSimulated, load);
</script>
<template>
  <div class="max-w-6xl mx-auto space-y-5">
    <PageHeader eyebrow="Tracked games" title="Matches">
      <label v-if="session.me?.simulationMode" class="flex items-center gap-2 text-sm text-muted"><input v-model="showSimulated" type="checkbox" class="accent-primary" />Show simulated</label>
    </PageHeader>
    <PageState :loading="!list && !error" :error="error" :empty="list?.length === 0" empty-text="No matches yet.">
      <div class="space-y-4">
        <MatchCard v-for="m in list" :key="m.id" :match="m" />
      </div>
    </PageState>
  </div>
</template>
