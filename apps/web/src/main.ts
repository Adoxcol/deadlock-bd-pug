import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import './style.css';
import { useSession } from './stores/session';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./pages/Dashboard.vue') },
    { path: '/login', component: () => import('./pages/Login.vue') },
    { path: '/drafts', component: () => import('./pages/Drafts.vue') },
    { path: '/drafts/new', component: () => import('./pages/NewDraft.vue') },
    { path: '/draft/:draftId', component: () => import('./pages/DraftRoom.vue'), props: (r) => ({ draftId: r.params.draftId, spectate: false }) },
    { path: '/draft/:draftId/spectate', component: () => import('./pages/DraftRoom.vue'), props: (r) => ({ draftId: r.params.draftId, spectate: true }) },
    { path: '/tracker', component: () => import('./pages/Tracker.vue') },
    { path: '/matches/:matchId', component: () => import('./pages/Match.vue'), props: true },
    { path: '/matches/:matchId/live', component: () => import('./pages/LiveMatch.vue'), props: true },
    { path: '/leaderboard', component: () => import('./pages/Leaderboard.vue') },
    { path: '/players/:playerId', component: () => import('./pages/Player.vue'), props: true },
    { path: '/profile', redirect: () => { const s = useSession(); return s.user ? `/players/${s.user.id}` : '/login'; } },
    { path: '/admin', component: () => import('./pages/Admin.vue') },
    { path: '/:pathMatch(.*)*', component: () => import('./pages/NotFound.vue') },
  ],
});

const app = createApp(App).use(createPinia()).use(router);
await useSession().load().catch(() => {});
app.mount('#app');
