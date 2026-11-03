# Roadmap

In suggested order.

1. **Run one real PUG from start to finish.** Discord login, Steam link, draft, lobby, match, automatic result. Recent features have only been tested with fake data: `/match import`, automatic results and Steam names.
2. **Deploy properly.** Real domain, production database, backups, Discord slash commands registered.
3. **Discord match announcements.** Post each result in a channel with the winner, top performer and a match link.
4. **Moderation tools.** Void a bad result and recalculate ratings. Override an offensive Steam name. Do this before opening the site to a wider group.
5. **Queue and balanced teams.** Players join a queue, and the site suggests fair teams from their ratings.
6. **Season tools and player extras.** Season resets with an archived final leaderboard, head-to-head records, best teammates.

## Ideas

- **Automatic PUG streams to Facebook.** A spare Steam account spectates each PUG on a dedicated PC, and OBS streams it. Needs a test of whether custom lobbies allow spectators. Start with a person running it by hand, then automate.
- **2D broadcast stream.** A lighter alternative with no game client: a headless browser opens a page with the minimap, scoreboard and kill feed, and FFmpeg streams it to Facebook Live. Needs a test of whether live events are available for private custom lobbies.
