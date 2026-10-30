import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { startBot } from './discord/bot.js';
import type { Sender } from './discord/notifier.js';

const cfg = loadConfig();
let sender: Sender | null = null;
const built = await buildApp(cfg, { discordSender: { send: (c, e) => (sender ? sender.send(c, e) : Promise.reject(new Error('Discord bot not ready'))) } });
if (cfg.DISCORD_BOT_TOKEN && cfg.DISCORD_CLIENT_ID) {
  startBot(cfg.DISCORD_BOT_TOKEN, cfg.DISCORD_CLIENT_ID, cfg.DISCORD_GUILD_ID, {
    db: built.db, publicUrl: cfg.PUBLIC_URL,
    createPug: (uid) => built.createPug(uid, { format: '6v6', draftProvider: 'NATIVE', amberName: 'Team Amber', sapphireName: 'Team Sapphire' }),
    leaderboard: built.leaderboardTop,
  }).then((s) => { sender = s; built.app.log.info('Discord bot connected'); }).catch((e) => built.app.log.error(e, 'Discord bot failed to start'));
} else built.app.log.warn('Discord bot not configured; notifications will be marked skipped');
await built.app.listen({ port: cfg.PORT, host: '0.0.0.0' });
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => void built.app.close().then(() => process.exit(0)));
