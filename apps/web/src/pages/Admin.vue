<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { RefreshCw } from 'lucide-vue-next';
import { api } from '../lib/api';
import { dateShort } from '../lib/format';
import { useSession } from '../stores/session';
import PageState from '../components/PageState.vue';
const session = useSession();
const tab = ref<'pug' | 'users' | 'seasons' | 'discord' | 'health' | 'audit'>('pug');
const msg = ref<string | null>(null);
const users = ref<any[]>([]); const seasons = ref<any[]>([]); const audit = ref<any[]>([]); const health = ref<any>(null); const notes = ref<any[]>([]);
const pug = reactive({ format: '6v6', amberName: 'Team Amber', sapphireName: 'Team Sapphire' });
const season = reactive({ name: '', initialRating: 1500, kFactor: 24 });
const discord = reactive({ discordGuildId: '', announceChannelId: '' });
async function run(fn: () => Promise<unknown>, ok: string) { try { await fn(); msg.value = ok; await load(); } catch (e) { msg.value = (e as Error).message; } }
async function load() {
  users.value = await api('/users').catch(() => []) as any[];
  seasons.value = await api('/seasons').catch(() => []) as any[];
  if (session.can('ADMIN')) { audit.value = await api('/admin/audit').catch(() => []) as any[]; health.value = await api('/admin/health').catch(() => null); notes.value = await api('/admin/notifications').catch(() => []) as any[]; }
}
onMounted(load);
const tabs = [{ k: 'pug', l: 'PUG sessions', min: 'MODERATOR' }, { k: 'users', l: 'Users & roles', min: 'ADMIN' }, { k: 'seasons', l: 'Seasons', min: 'ADMIN' }, { k: 'discord', l: 'Discord', min: 'ADMIN' }, { k: 'health', l: 'System health', min: 'ADMIN' }, { k: 'audit', l: 'Audit log', min: 'ADMIN' }] as const;
</script>
<template>
  <div v-if="!session.can('MODERATOR')" class="card p-6 text-sm text-muted">Moderator access required.</div>
  <div v-else class="space-y-4">
    <h1 class="text-2xl font-semibold tracking-tight">Admin</h1>
    <div class="flex flex-wrap gap-1 border-b border-line">
      <button v-for="t in tabs.filter((t) => session.can(t.min))" :key="t.k" :class="['px-3 h-9 text-sm -mb-px border-b-2', tab === t.k ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text']" @click="tab = t.k; msg = null">{{ t.l }}</button>
    </div>
    <p v-if="msg" class="text-sm" role="status">{{ msg }}</p>

    <form v-if="tab === 'pug'" class="card p-4 grid sm:grid-cols-4 gap-3 items-end" @submit.prevent="run(() => api('/pugs', { method: 'POST', body: pug }), 'PUG created.')">
      <div><label class="label">Format</label><select v-model="pug.format" class="input"><option>6v6</option><option>4v4</option><option>2v2</option></select></div>
      <div><label class="label">Amber name</label><input v-model="pug.amberName" class="input" /></div>
      <div><label class="label">Sapphire name</label><input v-model="pug.sapphireName" class="input" /></div>
      <button class="btn-primary">Create PUG</button>
    </form>

    <div v-else-if="tab === 'users'" class="card overflow-x-auto"><table class="w-full table-compact"><thead><tr><th>User</th><th>Role</th></tr></thead>
      <tbody><tr v-for="u in users" :key="u.id"><td>{{ u.displayName }}</td><td>
        <select :value="u.role" class="input !h-8 !w-auto" @change="run(() => api(`/admin/users/${u.id}/role`, { method: 'PATCH', body: { role: ($event.target as HTMLSelectElement).value } }), 'Role updated.')"><option v-for="r in ['SPECTATOR','PLAYER','CAPTAIN','MODERATOR','ADMIN','OWNER']" :key="r">{{ r }}</option></select>
      </td></tr></tbody></table></div>

    <div v-else-if="tab === 'seasons'" class="space-y-3">
      <form class="card p-4 grid sm:grid-cols-4 gap-3 items-end" @submit.prevent="run(() => api('/admin/seasons', { method: 'POST', body: season }), 'Season created and activated (previous season ended).')">
        <div><label class="label">Name</label><input v-model="season.name" class="input" required /></div>
        <div><label class="label">Initial rating (reset)</label><input v-model.number="season.initialRating" type="number" class="input" /></div>
        <div><label class="label">K-factor</label><input v-model.number="season.kFactor" type="number" class="input" /></div>
        <button class="btn-primary">Start new season</button>
      </form>
      <div class="card divide-y divide-line"><div v-for="s in seasons" :key="s.id" class="flex items-center gap-3 px-4 py-2.5 text-sm"><span class="font-medium">{{ s.name }}</span><span class="text-muted">{{ s.isActive ? 'Active' : s.isArchived ? 'Archived' : 'Inactive' }} · K={{ s.kFactor }} · start {{ s.initialRating }}</span>
        <button v-if="s.isActive" class="btn-danger !h-8 ml-auto" @click="run(() => api(`/admin/seasons/${s.id}/end`, { method: 'POST', body: {} }), 'Season ended and archived.')">End & archive</button></div></div>
    </div>

    <form v-else-if="tab === 'discord'" class="card p-4 grid sm:grid-cols-3 gap-3 items-end" @submit.prevent="run(() => api('/admin/discord', { method: 'PUT', body: { ...discord, announceChannelId: discord.announceChannelId || null } }), 'Discord settings saved.')">
      <div><label class="label">Guild (server) ID</label><input v-model="discord.discordGuildId" class="input font-mono" required /></div>
      <div><label class="label">Notification channel ID</label><input v-model="discord.announceChannelId" class="input font-mono" /></div>
      <button class="btn-primary">Save</button>
      <div class="sm:col-span-3"><h3 class="h-section mt-2 mb-2">Recent notifications</h3>
        <PageState :empty="!notes.length"><ul class="text-xs space-y-1"><li v-for="n in notes" :key="n.id" class="flex gap-2"><span class="w-16 uppercase" :class="n.status === 'sent' ? 'text-accent' : n.status === 'failed' ? 'text-danger' : 'text-muted'">{{ n.status }}</span><span>{{ n.kind }}</span><span class="text-muted truncate">{{ n.error }}</span></li></ul></PageState></div>
    </form>

    <div v-else-if="tab === 'health'" class="card p-4 space-y-2 text-sm">
      <PageState :loading="!health"><dl class="grid grid-cols-[200px_1fr] gap-y-1.5">
        <dt class="text-muted">Hero roster</dt><dd>{{ health.heroes.count }} heroes · source: {{ health.heroes.source }}</dd>
        <dt class="text-muted">Discord bot</dt><dd>{{ health.discordBot ? 'Configured' : 'Not configured' }}</dd>
        <dt class="text-muted">Deadlock API</dt><dd>{{ health.deadlockApi }} · API key {{ health.apiKeyConfigured ? 'set' : 'not set' }}</dd>
        <dt class="text-muted">Live events</dt><dd>{{ health.liveEvents ?? 'Not configured — live stats unavailable' }}</dd>
        <dt class="text-muted">Failed notifications</dt><dd>{{ health.failedNotifications }}</dd>
        <dt class="text-muted">Simulation mode</dt><dd>{{ health.simulationMode ? 'ON' : 'off' }}</dd>
      </dl></PageState>
      <button class="btn-ghost" @click="run(() => api('/admin/heroes/refresh', { method: 'POST', body: {} }), 'Hero roster refreshed.')"><RefreshCw class="w-4 h-4" />Refresh hero roster</button>
    </div>

    <div v-else class="card overflow-x-auto"><PageState :empty="!audit.length"><table class="w-full table-compact"><thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Actor</th></tr></thead>
      <tbody><tr v-for="a in audit" :key="a.id"><td class="text-muted">{{ dateShort(a.createdAt) }}</td><td class="font-mono text-xs">{{ a.action }}</td><td class="text-xs">{{ a.entityType }} {{ a.entityId.slice(-8) }}</td><td class="text-xs text-muted">{{ users.find((u) => u.id === a.actorId)?.displayName ?? a.actorId ?? 'system' }}</td></tr></tbody></table></PageState></div>
  </div>
</template>
