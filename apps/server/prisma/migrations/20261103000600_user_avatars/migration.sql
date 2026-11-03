ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "SteamAccount" ADD COLUMN "avatarUrl" TEXT;

-- Steam pictures arrive with the next name refresh; Discord ones are already known.
UPDATE "User" u SET "avatarUrl" = 'https://cdn.discordapp.com/avatars/' || d."discordId" || '/' || d."avatar" || '.png?size=128'
FROM "DiscordAccount" d WHERE d."userId" = u."id" AND d."avatar" IS NOT NULL;
