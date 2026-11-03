# PUG points
Each match a player earns, rounded to the nearest whole number and never below 0:

`(win ? 30 : 10) + 2·kills + assists − deaths + souls / 2000`

- The leaderboard is the sum of these per season, ranked by points, then wins. It is computed from `PlayerStatistic` when read, so stats that arrive after a result count automatically.
- Only rated results count: source `API`, or `MANUAL` with a verifying moderator. `SIMULATED` results are rated only inside simulation seasons.
- Missing stats count as 0, so a result without stats is worth just the win or loss points.
- Unlinked players (guests) earn nothing. Imported players get a placeholder account holding their Steam ID; when its owner links that Steam account, its matches move to them.
- Team Elo is still recorded on `PlayerRating` and `RatingTransaction` but is no longer shown.

## Rating and ranks
- Rating = average base points per match x 20, blended with 5 games at the starting rating of 1200. Bonuses are excluded, so they can't feed back into rating.
- Ranks: Initiate under 900, Seeker 900, Alchemist 1100, Arcanist 1300, Archon 1500, Eternus 1700.
- Team building shows each player's rating and the team total.

## Underdog bonus
- The average rating of each team is stored on `MatchResult` when the result is recorded. Results with no stored ratings, such as imported matches, pay no bonus.
- The lower-rated team earns +1 point per 10 rating of average gap, up to +20, or half that if it loses. The favourite loses nothing.

PUG ranks use Deadlock rank names and badges but are separate from in-game rank, and the site says so.
