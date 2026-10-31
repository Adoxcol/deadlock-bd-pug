import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, type ChatInputCommandInteraction, type TextChannel } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import { canRunCommand } from './commands.js';
import type { Sender, Embed } from './notifier.js';
import type { Role } from '../auth/rbac.js';

export interface BotDeps {
  db: PrismaClient; publicUrl: string;
  createPug(createdById: string): Promise<{ id: string; number: number }>;
  leaderboard(limit: number): Promise<Array<{ displayName: string; rating: number; wins: number; losses: number }>>;
}

const definitions = [
  new SlashCommandBuilder().setName('pug').setDescription('PUG sessions')
    .addSubcommand((s) => s.setName('create').setDescription('Create a new PUG session'))
    .addSubcommand((s) => s.setName('status').setDescription('Show active PUGs')),
  new SlashCommandBuilder().setName('draft').setDescription('Draft rooms')
    .addSubcommand((s) => s.setName('create').setDescription('Create a native draft room (opens website)'))
    .addSubcommand((s) => s.setName('view').setDescription('Get a draft link').addStringOption((o) => o.setName('id').setDescription('Draft ID').setRequired(true))),
  new SlashCommandBuilder().setName('match').setDescription('Matches')
    .addSubcommand((s) => s.setName('track').setDescription('Track a match (opens tracker)'))
    .addSubcommand((s) => s.setName('live').setDescription('Current live matches'))
    .addSubcommand((s) => s.setName('history').setDescription('Recent results')),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Community rankings'),
  new SlashCommandBuilder().setName('stats').setDescription('Player stats').addUserOption((o) => o.setName('player').setDescription('Player')),
].map((c) => c.toJSON());

export async function startBot(token: string, appId: string, guildId: string | undefined, deps: BotDeps): Promise<Sender> {
  const rest = new REST().setToken(token);
  await rest.put(guildId ? Routes.applicationGuildCommands(appId, guildId) : Routes.applicationCommands(appId), { body: definitions });
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const link = (path: string, label: string) => new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(`${deps.publicUrl}${path}`).setLabel(label));

  client.on('interactionCreate', async (i) => {
    if (!i.isChatInputCommand()) return;
    const cmd = [i.commandName, i.options.getSubcommand(false)].filter(Boolean).join(' ');
    const acct = await deps.db.discordAccount.findUnique({ where: { discordId: i.user.id }, include: { user: true } });
    if (!canRunCommand(cmd, acct?.user.role as Role | undefined)) {
      await i.reply({ content: acct ? 'You do not have permission for this command.' : `Link your account first: ${deps.publicUrl}/login`, ephemeral: true });
      return;
    }
    try { await handle(i, cmd, acct?.user.id ?? null); } catch (e) {
      console.error('discord command failed', e);
      if (!i.replied) await i.reply({ content: 'Something went wrong.', ephemeral: true });
    }
  });

  async function handle(i: ChatInputCommandInteraction, cmd: string, userId: string | null) {
    switch (cmd) {
      case 'pug create': { const p = await deps.createPug(userId!); await i.reply({ content: `PUG #${p.number} created.`, components: [link(`/pugs/${p.id}`, 'Manage PUG')] }); return; }
      case 'pug status': {
        const pugs = await deps.db.pugSession.findMany({ where: { status: { in: ['WAITING', 'DRAFTING', 'LIVE'] } }, orderBy: { number: 'desc' }, take: 10 });
        await i.reply({ embeds: [new EmbedBuilder().setTitle('Active PUGs').setDescription(pugs.map((p) => `**#${p.number}** — ${p.status}`).join('\n') || 'No active PUGs.')] }); return;
      }
      case 'draft create': await i.reply({ content: 'Create a draft room on the website:', components: [link('/drafts/new', 'New draft')], ephemeral: true }); return;
      case 'draft view': await i.reply({ components: [link(`/draft/${encodeURIComponent(i.options.getString('id', true))}/spectate`, 'Watch draft')] }); return;
      case 'match track': await i.reply({ components: [link('/tracker', 'Open tracker')], ephemeral: true }); return;
      case 'match live': {
        const ms = await deps.db.match.findMany({ where: { trackingState: { in: ['MATCH_DETECTED', 'LIVE_AVAILABLE'] } }, take: 5 });
        await i.reply({ content: ms.length ? ms.map((m) => `${deps.publicUrl}/matches/${m.id}/live`).join('\n') : 'No matches in progress.' }); return;
      }
      case 'match history': {
        const rs = await deps.db.matchResult.findMany({ orderBy: { createdAt: 'desc' }, take: 5, include: { match: true } });
        await i.reply({ embeds: [new EmbedBuilder().setTitle('Recent results').setDescription(rs.map((r) => `${r.winner} won · ${r.source}${r.verified ? '' : ' (unverified)'} · ${deps.publicUrl}/matches/${r.matchId}`).join('\n') || 'No results yet.')] }); return;
      }
      case 'leaderboard': {
        const top = await deps.leaderboard(10);
        await i.reply({ embeds: [new EmbedBuilder().setTitle('Leaderboard').setDescription(top.map((p, n) => `**${n + 1}.** ${p.displayName} — ${p.rating} (${p.wins}W/${p.losses}L)`).join('\n') || 'No rated players yet.')], components: [link('/leaderboard', 'Full leaderboard')] }); return;
      }
      case 'stats': {
        const target = i.options.getUser('player') ?? i.user;
        const a = await deps.db.discordAccount.findUnique({ where: { discordId: target.id } });
        await i.reply(a ? { components: [link(`/players/${a.userId}`, 'View profile')] } : { content: 'That player has not linked their account.', ephemeral: true }); return;
      }
    }
  }

  await client.login(token);
  return {
    async send(channelId: string, embed: Embed) {
      const ch = (await client.channels.fetch(channelId)) as TextChannel | null;
      if (!ch?.isTextBased()) throw new Error('Channel not found or not text-based');
      const msg = await ch.send({ embeds: [embed] });
      return msg.id;
    },
  };
}
