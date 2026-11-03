<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, LogIn } from 'lucide-vue-next';
import { api } from '../lib/api';
import StatusBadge from '../components/StatusBadge.vue';
import PageState from '../components/PageState.vue';
import SimBadge from '../components/SimBadge.vue';
import PageHeader from '../components/PageHeader.vue';
import { useSession } from '../stores/session';
const session = useSession();
const router = useRouter();
const list = ref<any[] | null>(null);
const error = ref<string | null>(null);
const code = ref('');
const clean = computed(() => code.value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6));
onMounted(async () => { try { list.value = await api('/drafts'); } catch (e) { error.value = (e as Error).message; } });
function join() { if (clean.value.length === 6) router.push(`/d/${clean.value}`); }
</script>
<template>
  <div class="max-w-5xl mx-auto space-y-5">
    <PageHeader eyebrow="Draft rooms" title="Drafts">
      <RouterLink v-if="session.can('MODERATOR')" to="/drafts/external" class="btn-ghost">Link external draft</RouterLink>
      <RouterLink v-if="session.can('PLAYER')" to="/drafts/new" class="btn-primary"><Plus class="w-4 h-4" />Create lobby</RouterLink>
    </PageHeader>

    <form class="card-ornate p-5 grid sm:grid-cols-[1fr_auto] gap-4 items-end" @submit.prevent="join">
      <div>
        <label class="label" for="code">Join lobby</label>
        <input id="code" :value="clean" class="input !h-14 font-display text-3xl tracking-[0.5em] uppercase text-center sm:text-left placeholder:text-muted/40" placeholder="ABC123" maxlength="6" autocomplete="off" @input="code = ($event.target as HTMLInputElement).value" />
        <p class="text-xs text-muted mt-1.5">The six-character room code. This joins as a viewer; players and captains use their invite links.</p>
      </div>
      <button class="btn-primary !h-14" :disabled="clean.length !== 6"><LogIn class="w-4 h-4" />Join</button>
    </form>

    <section class="card-ornate overflow-hidden">
      <h2 class="h-section px-4 pt-4 pb-2">Recent drafts</h2>
      <PageState :loading="!list && !error" :error="error" :empty="list?.length === 0" empty-text="No drafts yet.">
        <ul class="divide-y divide-line/60">
          <li v-for="d in list" :key="d.id">
            <RouterLink :to="`/draft/${d.id}`" class="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-raised/50">
              <span class="font-display uppercase">{{ d.name }}</span><SimBadge v-if="d.simulated" />
              <span v-if="d.code" class="font-mono text-xs text-muted tracking-[0.3em]">{{ d.code }}</span>
              <span class="text-sm"><span class="text-amber-team">{{ d.teamNames.amber }}</span> <span class="text-muted">vs</span> <span class="text-sapphire-team">{{ d.teamNames.sapphire }}</span></span>
              <StatusBadge class="ml-auto" :status="d.status" />
            </RouterLink>
          </li>
        </ul>
      </PageState>
    </section>
  </div>
</template>
