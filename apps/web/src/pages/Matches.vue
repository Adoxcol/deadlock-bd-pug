<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../lib/api';
import { useHeroes } from '../stores/heroes';
import MatchCard from '../components/match/MatchCard.vue';
import PageState from '../components/PageState.vue';
import PageHeader from '../components/PageHeader.vue';
const heroes = useHeroes();
const list = ref<any[] | null>(null);
const error = ref<string | null>(null);
onMounted(async () => { heroes.load().catch(() => {}); try { list.value = await api('/matches'); } catch (e) { error.value = (e as Error).message; } });
</script>
<template>
  <div class="max-w-6xl mx-auto space-y-5">
    <PageHeader eyebrow="Tracked games" title="Matches" />
    <PageState :loading="!list && !error" :error="error" :empty="list?.length === 0" empty-text="No matches yet.">
      <div class="space-y-4">
        <MatchCard v-for="m in list" :key="m.id" :match="m" />
      </div>
    </PageState>
  </div>
</template>
