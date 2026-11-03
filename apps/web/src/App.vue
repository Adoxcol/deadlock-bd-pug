<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { LayoutDashboard, Swords, Crosshair, Trophy, Shield, LogOut, Wifi, WifiOff, Radio, Plus, MessageCircle, X } from 'lucide-vue-next';
import { useSession } from './stores/session';
import { realtime } from './lib/ws';
import { takeReturn } from './lib/returnTo';
import Logo from './components/Logo.vue';
import PlayerAvatar from './components/PlayerAvatar.vue';

const session = useSession();
const route = useRoute();
const router = useRouter();
// Discord login lands back on the home page, so this runs on the first load after it.
watch(() => session.loaded, (loaded) => {
  if (!loaded || !session.user) return;
  const path = takeReturn();
  if (path) void router.replace(path);
}, { immediate: true });
const navEl = ref<HTMLElement | null>(null);
// Keep the current page's ticket in view on the swipeable phone row.
watch(() => route.path, () => nextTick(() => navEl.value?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })));
const bare = computed(() => route.query.broadcast === '1');
const landing = computed(() => route.path === '/' && !session.user);
const wide = computed(() => route.path.startsWith('/draft/'));
const nav = computed(() => [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/drafts', label: 'Drafts', icon: Swords },
  { to: '/matches', label: 'Matches', icon: Radio },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/tracker', label: 'Tracker', icon: Crosshair, min: 'MODERATOR' as const },
  { to: '/admin', label: 'Admin', icon: Shield, min: 'MODERATOR' as const },
].filter((n) => !n.min || session.can(n.min)));
const isActive = (to: string) => (to === '/' ? route.path === '/' : route.path.startsWith(to) || (to === '/drafts' && route.path.startsWith('/draft')));
const STEAM_HINT_KEY = 'steam-hint-dismissed';
const readHint = () => { try { return localStorage.getItem(STEAM_HINT_KEY) === '1'; } catch { return false; } };
const hintDismissed = ref(readHint());
function dismissHint() { hintDismissed.value = true; try { localStorage.setItem(STEAM_HINT_KEY, '1'); } catch { /* the banner just returns next visit */ } }
const steamHint = computed(() => !!session.user && !session.user.isSimulated && !session.me?.steam && !hintDismissed.value);
</script>

<template>
  <RouterView v-if="bare" />
  <div v-else class="min-h-screen flex flex-col">
    <header class="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
      <div class="min-h-16 px-4 lg:px-6 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <RouterLink to="/" aria-label="Home" class="shrink-0"><Logo /></RouterLink>
        <!-- Full second row until the tickets fit beside the logo; then they join the main bar. On phones the row swipes sideways so the sticky header stays short. -->
        <nav ref="navEl" class="order-last -mx-4 flex w-[calc(100%+2rem)] items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:w-full md:flex-wrap md:overflow-visible md:px-0 min-[1680px]:order-none min-[1680px]:w-auto" aria-label="Main">
          <RouterLink v-for="n in nav" :key="n.to" :to="n.to" :aria-current="isActive(n.to) ? 'page' : undefined" :class="['nav-tab', isActive(n.to) && 'nav-tab-active']">
            <component :is="n.icon" class="w-3.5 h-3.5 shrink-0" :stroke-width="2.25" />{{ n.label }}
          </RouterLink>
          <a v-if="session.me?.discordInvite" :href="session.me.discordInvite" target="_blank" rel="noopener" class="nav-tab"><MessageCircle class="w-3.5 h-3.5 shrink-0" :stroke-width="2.25" />Discord</a>
        </nav>
        <div class="ml-auto flex items-center gap-2">
          <span v-if="session.me?.simulationMode" class="hidden xl:inline text-[10px] font-bold uppercase tracking-wide text-warn border border-warn/40 rounded px-1.5 py-0.5">Simulation mode</span>
          <span class="hidden sm:flex items-center gap-1.5 text-xs" :class="realtime.connected.value ? 'text-accent' : 'text-muted'" :title="realtime.connected.value ? 'Realtime connected' : 'Realtime disconnected'">
            <component :is="realtime.connected.value ? Wifi : WifiOff" class="w-3.5 h-3.5" />{{ realtime.connected.value ? 'Connected' : 'Offline' }}
          </span>
          <template v-if="session.user">
            <RouterLink v-if="session.can('PLAYER')" to="/drafts/new" class="btn-primary !h-9 hidden sm:inline-flex"><Plus class="w-4 h-4" />Create lobby</RouterLink>
            <RouterLink :to="`/players/${session.user.id}`" class="flex items-center gap-2 h-10 pl-1 pr-3 rounded-lg hover:bg-raised">
              <PlayerAvatar :name="session.user.displayName" :src="session.user.avatarUrl" class="w-8 h-8 text-sm" />
              <span class="hidden md:block leading-tight text-left"><span class="block text-sm font-semibold max-w-[140px] truncate">{{ session.user.displayName }}</span><span class="block text-[11px] text-muted capitalize">{{ session.user.role.toLowerCase() }}</span></span>
            </RouterLink>
            <button class="btn-ghost !h-9 !px-2" title="Log out" aria-label="Log out" @click="session.logout()"><LogOut class="w-4 h-4" /></button>
          </template>
          <RouterLink v-else to="/login" class="btn-primary"><MessageCircle class="w-4 h-4" />Login with Discord</RouterLink>
        </div>
      </div>
    </header>
    <div v-if="steamHint" class="border-b border-line bg-surface px-4 lg:px-6 py-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span class="min-w-0 flex-1 basis-64">Link your Steam account to claim your past PUG matches and points.</span>
      <a href="/api/auth/steam" class="btn-ghost !h-8">Link Steam</a>
      <button class="btn-ghost !h-8 !px-2" title="Dismiss" aria-label="Dismiss Steam reminder" @click="dismissHint"><X class="w-4 h-4" /></button>
    </div>

    <main :class="['flex-1 min-w-0', landing ? '' : wide ? 'px-3 lg:px-4 py-4' : 'px-4 lg:px-6 py-6']"><RouterView /></main>
    <footer class="border-t border-line text-xs text-muted py-4 px-4 text-center">Community project · Not affiliated with Valve. Hero data via deadlock-api.com.</footer>
  </div>
</template>
