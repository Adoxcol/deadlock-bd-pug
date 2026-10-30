import { z } from 'zod';

const bool = z.enum(['true', 'false']).default('false').transform((v) => v === 'true');
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  PUBLIC_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 chars'),
  TRUST_PROXY: bool,
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_GUILD_ID: z.string().optional(),
  OWNER_DISCORD_IDS: z.string().default(''),
  /** Public invite link shown on the landing page ("Join Discord"). */
  DISCORD_INVITE_URL: z.string().url().optional(),
  DEADLOCK_API_URL: z.string().url().default('https://api.deadlock-api.com'),
  DEADLOCK_API_KEY: z.string().optional(),
  LIVE_EVENTS_URL: z.string().url().optional(),
  /** deadlock-api ServerRegion (snake_case), e.g. singapore, hong_kong, japan, eu_london. */
  DEADLOCK_LOBBY_REGION: z.string().regex(/^[a-z_]+$/).default('singapore'),
  PUBLIC_LIVE_DELAY_SEC: z.coerce.number().default(120),
  SIMULATION_MODE: bool,
});

export type Config = z.infer<typeof schema>;
export function loadConfig(env = process.env): Config {
  const c = schema.parse(env);
  if (c.NODE_ENV === 'production' && c.SIMULATION_MODE) console.warn('[config] SIMULATION_MODE is on in production — simulated data is flagged and never rated.');
  return c;
}
