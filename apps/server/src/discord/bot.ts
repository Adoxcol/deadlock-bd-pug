import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, type ButtonInteraction, type ChatInputCommandInteraction, type TextChannel } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import { canRunCommand } from './commands.js';
import type { Sender, Embed } from './notifier.js';
import { atLeast, type Role } from '../auth/rbac.js';
import { signupEmbed, type SignupService, type SignupWithPlayers } from './signups.js';

export interface BotDeps {
  db: PrismaClient; publicUrl: string; signups: SignupService;
  createPug(createdById: string): Promise<{ id: string; number: number }>;
  leaderboard(limit: number): Promise<Array<{ displayName: string; points: number; wins: number; losses: number }>>;
  importMatch(matchId: string, userId: string): Promise<{ status: 'imported'; id: string } | { status: 'unknown_players'; unknown: number }>;
}

const definitions = [
  new SlashCommandBuilder().setName('pug').setDescription('PUG sessions')
    .addSubcommand((s) => s.setName('create').setDescription('Create a new PUG session'))
    .addSubcommand((s) => s.setName('start').setDescription('Post a sign-up. The room is created when it fills')
      .addStringOption((o) => o.setName('format').setDescription('Team size, 6v6 by default').addChoices({ name: '6v6', value: '6v6' }, { name: '4v4', value: '4v4' }, { name: '2v2', value: '2v2' }))
      .addIntegerOption((o) => o.setName('in_minutes').setDescription('Schedule the start this many minutes from now').setMinValue(1).setMaxValue(10080))
      .addStringOption((o) => o.setName('captains').setDescription('How captains are chosen, highest rated by default').addChoices({ name: 'Two highest rated', value: 'rated' }, { name: 'Random', value: 'random' })))
    .addSubcommand((s) => s.setName('status').setDescription('Show active PUGs')),
  new SlashCommandBuilder().setName('draft').setDescription('Draft rooms')
    .addSubcommand((s) => s.setName('create').setDescription('Create a native draft room (opens website)'))
    .addSubcommand((s) => s.setName('view').setDescription('Get a draft link').addStringOption((o) => o.setName('id').setDescription('Draft ID').setRequired(true))),
  new SlashCommandBuilder().setName('match').setDescription('Matches')
    .addSubcommand((s) => s.setName('track').setDescription('Track a match (opens tracker)'))
    .addSubcommand((s) => s.setName('import').setDescription('Add a finished match to the site').addStringOption((o) => o.setName('id').setDescription('Match ID').setRequired(true)))
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
    if (i.isButton()) { if (i.customId.startsWith('signup:')) await onSignupButton(i).catch((e) => console.error('signup button failed', e)); return; }
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

  const signupView = (s: SignupWithPlayers) => ({ embeds: [signupEmbed(s, deps.publicUrl)], components: s.status === 'OPEN' ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`signup:join:${s.id}`).setStyle(ButtonStyle.Success).setLabel('Join'),
    new ButtonBuilder().setCustomId(`signup:leave:${s.id}`).setStyle(ButtonStyle.Secondary).setLabel('Leave'),
    new ButtonBuilder().setCustomId(`signup:cancel:${s.id}`).setStyle(ButtonStyle.Danger).setLabel('Close'),
  )] : s.pugId ? [link(`/pugs/${s.pugId}`, 'Open PUG room')] : [] });

  async function onSignupButton(i: ButtonInteraction) {
    const [, action, id = ''] = i.customId.split(':');
    const acct = await deps.db.discordAccount.findUnique({ where: { discordId: i.user.id }, include: { user: true } });
    if (!acct) { await i.reply({ content: `Link your account first: ${deps.publicUrl}/login`, ephemeral: true }); return; }
    await i.deferUpdate(); // filling the last slot creates the room, which can outlast Discord's 3 second limit
    try {
      const s = action === 'join' ? await deps.signups.join(id, acct.userId, i.user.id)
        : action === 'leave' ? await deps.signups.leave(id, acct.userId)
        : await deps.signups.cancel(id, { id: acct.userId, isMod: atLeast(acct.user.role as Role, 'MODERATOR') });
      await i.editReply(signupView(s));
    } catch (e) {
      const known = (e as { statusCode?: number }).statusCode;
      if (!known) console.error('signup failed', e);
      await i.followUp({ content: known ? (e as Error).message : 'Something went wrong.', ephemeral: true });
    }
  }

  async function handle(i: ChatInputCommandInteraction, cmd: string, userId: string | null) {
    switch (cmd) {
      case 'pug create': { const p = await deps.createPug(userId!); await i.reply({ content: `PUG #${p.number} created.`, components: [link(`/pugs/${p.id}`, 'Manage PUG')] }); return; }
      case 'pug start': {
        const minutes = i.options.getInteger('in_minutes');
        const s = await deps.signups.start({ channelId: i.channelId, hostId: userId!, hostDiscordId: i.user.id, format: i.options.getString('format') ?? '6v6', scheduledAt: minutes ? new Date(Date.now() + minutes * 60_000) : null, captainMode: i.options.getString('captains') === 'random' ? 'random' : 'rated' });
        await i.reply(signupView(s));
        await deps.signups.attachMessage(s.id, (await i.fetchReply()).id);
        return;
      }
      case 'pug status': {
        const pugs = await deps.db.pugSession.findMany({ where: { status: { in: ['WAITING', 'DRAFTING', 'LIVE'] } }, orderBy: { number: 'desc' }, take: 10 });
        await i.reply({ embeds: [new EmbedBuilder().setTitle('Active PUGs').setDescription(pugs.map((p) => `**#${p.number}** — ${p.status}`).join('\n') || 'No active PUGs.')] }); return;
      }
      case 'draft create': await i.reply({ content: 'Create a draft room on the website:', components: [link('/drafts/new', 'New draft')], ephemeral: true }); return;
      case 'draft view': await i.reply({ components: [link(`/draft/${encodeURIComponent(i.options.getString('id', true))}/spectate`, 'Watch draft')] }); return;
      case 'match track': await i.reply({ components: [link('/tracker', 'Open tracker')], ephemeral: true }); return;
      case 'match import': {
        const id = i.options.getString('id', true).trim();
        if (!/^\d{1,20}$/.test(id)) { await i.reply({ content: 'Enter a numeric Match ID.', ephemeral: true }); return; }
        await i.deferReply(); // the Deadlock API can take longer than Discord's 3 second limit
        try {
          const out = await deps.importMatch(id, userId!);
          if (out.status === 'imported') await i.editReply({ content: `Match ${id} added to the leaderboard.`, components: [link(`/matches/${out.id}`, 'View match')] });
          else await i.editReply({ content: `Match ${id} was not added: ${out.unknown} of its players aren't known to the site yet. They need to link Steam, or a moderator can name them on the site.`, components: [link('/admin', 'Open Admin')] });
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          await i.editReply({ content: status ? (e as Error).message : 'Something went wrong.' });
        }
        return;
      }
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
        await i.reply({ embeds: [new EmbedBuilder().setTitle('Leaderboard').setDescription(top.map((p, n) => `**${n + 1}.** ${p.displayName} — ${p.points} pts (${p.wins}W/${p.losses}L)`).join('\n') || 'No rated players yet.')], components: [link('/leaderboard', 'Full leaderboard')] }); return;
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
      const { content, ...rest } = embed;
      const msg = await ch.send({ content, embeds: [rest] });
      return msg.id;
    },
    async dm(discordId: string, embed: Embed) {
      const { content, ...rest } = embed;
      return (await (await client.users.fetch(discordId)).send({ content, embeds: [rest] })).id;
    },
    async edit(channelId: string, messageId: string, embed: Embed) {
      const ch = (await client.channels.fetch(channelId)) as TextChannel | null;
      if (!ch?.isTextBased()) throw new Error('Channel not found or not text-based');
      const { content: _content, ...rest } = embed;
      await (await ch.messages.fetch(messageId)).edit({ embeds: [rest], components: [] });
    },
  };
}
