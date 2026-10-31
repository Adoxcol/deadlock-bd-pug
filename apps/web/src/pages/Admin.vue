<script setup lang="ts">
import { useRouter } from 'vue-router';
import UiSelect from '../components/UiSelect.vue';
import { onMounted, reactive, ref } from 'vue';
import { RefreshCw } from 'lucide-vue-next';
import { api } from '../lib/api';
import { dateShort } from '../lib/format';
import { useSession } from '../stores/session';
import PageState from '../components/PageState.vue';
import PageHeader from '../components/PageHeader.vue';
const session = useSession();
const router = useRouter();
async function createPug() { const p = await api<{ id: string }>('/pugs', { method: 'POST', body: pug }); await router.push(`/pugs/${p.id}`); }
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
  <div v-if="!session.can('MODERATOR')" class="card-ornate p-6 text-sm text-muted max-w-xl mx-auto">Moderator access required.</div>
  <div v-else class="max-w-6xl mx-auto space-y-5">
    <PageHeader eyebrow="Control room" title="Admin" />
    <div class="flex gap-1 border-b border-line overflow-x-auto">
      <button v-for="t in tabs.filter((t) => session.can(t.min))" :key="t.k" :aria-pressed="tab === t.k"
        :class="['px-4 h-10 -mb-px border-b-2 font-display uppercase tracking-wider text-sm shrink-0', tab === t.k ? 'border-primary text-text' : 'border-transparent text-muted hover:text-text']"
        @click="tab = t.k; msg = null">{{ t.l }}</button>
    </div>
    <p v-if="msg" class="card px-4 py-2 text-sm" role="status">{{ msg }}</p>

    <form v-if="tab === 'pug'" class="card-ornate p-5 grid sm:grid-cols-4 gap-4 items-end" @submit.prevent="run(createPug, 'PUG created.')">
      <div><span class="label">Format</span><UiSelect v-model="pug.format" :options="[{ value: '6v6', label: '6v6' }, { value: '4v4', label: '4v4' }, { value: '2v2', label: '2v2' }]" /></div>
      <div><label class="label" for="pa">Amber name</label><input id="pa" v-model="pug.amberName" class="input" /></div>
      <div><label class="label" for="ps">Sapphire name</label><input id="ps" v-model="pug.sapphireName" class="input" /></div>
      <button class="btn-primary">Create PUG</button>
    </form>

    <div v-else-if="tab === 'users'" class="card-ornate overflow-x-auto"><table class="w-full table-compact"><thead><tr><th>User</th><th>Role</th></tr></thead>
      <tbody><tr v-for="u in users" :key="u.id" class="hover:bg-raised/50"><td><RouterLink :to="`/players/${u.id}`" class="font-semibold hover:text-primary">{{ u.displayName }}</RouterLink></td><td class="w-56">
        <UiSelect :model-value="u.role" size="sm" :aria-label="`Role for ${u.displayName}`" :options="['SPECTATOR','PLAYER','CAPTAIN','MODERATOR','ADMIN','OWNER'].map((r) => ({ value: r, label: r }))"
          @update:model-value="(r) => run(() => api(`/admin/users/${u.id}/role`, { method: 'PATCH', body: { role: r } }), 'Role updated.')" />
      </td></tr></tbody></table></div>

    <div v-else-if="tab === 'seasons'" class="space-y-4">
      <form class="card-ornate p-5 grid sm:grid-cols-4 gap-4 items-end" @submit.prevent="run(() => api('/admin/seasons', { method: 'POST', body: season }), 'Season created and activated (previous season ended).')">
        <div><label class="label" for="sn">Name</label><input id="sn" v-model="season.name" class="input" required /></div>
        <div><label class="label" for="si">Starting rating</label><input id="si" v-model.number="season.initialRating" type="number" class="input" /></div>
        <div><label class="label" for="sk">K-factor</label><input id="sk" v-model.number="season.kFactor" type="number" class="input" /></div>
        <button class="btn-primary">Start new season</button>
      </form>
      <div class="card-ornate divide-y divide-line/60">
        <PageState :empty="!seasons.length" empty-text="No seasons yet.">
          <div v-for="s in seasons" :key="s.id" class="flex flex-wrap items-center gap-3 px-4 py-3">
            <span class="font-display uppercase">{{ s.name }}</span>
            <span :class="['font-mono text-[10px] font-bold uppercase tracking-[0.2em] px-1.5 py-0.5 border', s.isActive ? 'text-accent border-accent/40' : 'text-muted border-line']">{{ s.isActive ? 'Active' : s.isArchived ? 'Archived' : 'Inactive' }}</span>
            <span class="font-mono text-xs text-muted">K={{ s.kFactor }} · start {{ s.initialRating }}</span>
            <button v-if="s.isActive" class="btn-danger !h-8 ml-auto" @click="run(() => api(`/admin/seasons/${s.id}/end`, { method: 'POST', body: {} }), 'Season ended and archived.')">End &amp; archive</button>
          </div>
        </PageState>
      </div>
    </div>

    <div v-else-if="tab === 'discord'" class="space-y-4">
      <form class="card-ornate p-5 grid sm:grid-cols-3 gap-4 items-end" @submit.prevent="run(() => api('/admin/discord', { method: 'PUT', body: { ...discord, announceChannelId: discord.announceChannelId || null } }), 'Discord settings saved.')">
        <div><label class="label" for="dg">Server (guild) ID</label><input id="dg" v-model="discord.discordGuildId" class="input font-mono" required /></div>
        <div><label class="label" for="dc">Notification channel ID</label><input id="dc" v-model="discord.announceChannelId" class="input font-mono" /></div>
        <button class="btn-primary">Save</button>
      </form>
      <section class="card-ornate p-4">
        <h2 class="h-section mb-3">Recent notifications</h2>
        <PageState :empty="!notes.length" empty-text="Nothing sent yet.">
          <ul class="space-y-1.5 text-sm">
            <li v-for="n in notes" :key="n.id" class="flex items-center gap-3">
              <span :class="['w-16 font-mono text-[10px] font-bold uppercase tracking-wider', n.status === 'sent' ? 'text-accent' : n.status === 'failed' ? 'text-danger' : 'text-muted']">{{ n.status }}</span>
              <span class="font-mono text-xs">{{ n.kind }}</span><span class="text-xs text-muted truncate">{{ n.error }}</span>
            </li>
          </ul>
        </PageState>
      </section>
    </div>

    <section v-else-if="tab === 'health'" class="card-ornate p-5 space-y-4">
      <PageState :loading="!health">
        <dl v-if="health" class="grid sm:grid-cols-2 gap-3">
          <div v-for="row in [
            { k: 'Hero roster', v: `${health.heroes.count} heroes · ${health.heroes.source}`, ok: health.heroes.source === 'deadlock-api' },
            { k: 'Discord bot', v: health.discordBot ? 'Configured' : 'Not configured', ok: health.discordBot },
            { k: 'Deadlock API', v: `${health.deadlockApi} · key ${health.apiKeyConfigured ? 'set' : 'not set'}`, ok: true },
            { k: 'Live events', v: health.liveEvents ?? 'Not configured — live stats unavailable', ok: !!health.liveEvents },
            { k: 'Failed notifications', v: String(health.failedNotifications), ok: health.failedNotifications === 0 },
            { k: 'Simulation mode', v: health.simulationMode ? 'ON' : 'off', ok: !health.simulationMode },
          ]" :key="row.k" class="card px-4 py-3 flex items-center gap-3">
            <span :class="['w-2.5 h-2.5 rotate-45 shrink-0', row.ok ? 'bg-accent' : 'bg-warn']" :title="row.ok ? 'OK' : 'Needs attention'" />
            <div class="min-w-0"><dt class="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted">{{ row.k }}</dt><dd class="text-sm truncate">{{ row.v }}</dd></div>
          </div>
        </dl>
      </PageState>
      <button class="btn-ghost" @click="run(() => api('/admin/heroes/refresh', { method: 'POST', body: {} }), 'Hero roster refreshed.')"><RefreshCw class="w-4 h-4" />Refresh hero roster</button>
    </section>

    <div v-else class="card-ornate overflow-x-auto"><PageState :empty="!audit.length" empty-text="No audit entries yet."><table class="w-full table-compact"><thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Actor</th></tr></thead>
      <tbody><tr v-for="a in audit" :key="a.id" class="hover:bg-raised/50"><td class="text-muted">{{ dateShort(a.createdAt) }}</td><td class="font-mono text-xs">{{ a.action }}</td><td class="font-mono text-xs">{{ a.entityType }} {{ a.entityId.slice(-8) }}</td><td class="text-xs text-muted">{{ users.find((u) => u.id === a.actorId)?.displayName ?? a.actorId ?? 'system' }}</td></tr></tbody></table></PageState></div>
  </div>
</template>
