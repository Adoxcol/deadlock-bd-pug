<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, LogIn } from 'lucide-vue-next';
import { api } from '../lib/api';
import StatusBadge from '../components/StatusBadge.vue';
import PageState from '../components/PageState.vue';
import SimBadge from '../components/SimBadge.vue';
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
  <div class="space-y-4">
    <div class="flex items-center justify-between"><h1 class="text-2xl font-semibold tracking-tight">Drafts</h1>
      <RouterLink v-if="session.can('PLAYER')" to="/drafts/new" class="btn-draft"><Plus class="w-4 h-4" />Create lobby</RouterLink></div>
    <form class="card p-4 flex flex-wrap items-end gap-3" @submit.prevent="join">
      <div class="flex-1 min-w-[200px]">
        <label class="label" for="code">Join lobby</label>
        <input id="code" :value="clean" class="input font-mono text-lg tracking-[0.4em] uppercase !h-11" placeholder="ABC123" maxlength="6" autocomplete="off" @input="code = ($event.target as HTMLInputElement).value" />
        <p class="text-xs text-muted mt-1">The six-character code from the draft link.</p>
      </div>
      <button class="btn-primary !h-11" :disabled="clean.length !== 6"><LogIn class="w-4 h-4" />Join</button>
    </form>
    <div class="card divide-y divide-line">
      <PageState :loading="!list && !error" :error="error" :empty="list?.length === 0" empty-text="No drafts yet.">
        <RouterLink v-for="d in list" :key="d.id" :to="`/draft/${d.id}`" class="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-raised/50">
          <span class="font-medium">{{ d.name }}</span><SimBadge v-if="d.simulated" />
          <span v-if="d.code" class="font-mono text-xs text-muted tracking-widest">{{ d.code }}</span>
          <span class="text-sm text-muted"><span class="text-amber-team">{{ d.teamNames.amber }}</span> vs <span class="text-sapphire-team">{{ d.teamNames.sapphire }}</span></span>
          <StatusBadge class="ml-auto" :status="d.status" />
        </RouterLink>
      </PageState>
    </div>
  </div>
</template>
