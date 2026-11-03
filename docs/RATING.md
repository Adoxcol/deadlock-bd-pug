# PUG points
Each match a player earns, rounded to the nearest whole number and never below 0:

`(win ? 30 : 10) + 2·kills + assists − deaths + souls / 2000`

- The leaderboard is the sum of these per season, ranked by points, then wins. It is computed from `PlayerStatistic` when read, so stats that arrive after a result count automatically.
- Only rated results count: source `API`, or `MANUAL` with a verifying moderator. `SIMULATED` results are rated only inside simulation seasons.
- Missing stats count as 0, so a result without stats is worth just the win or loss points.
- Unlinked players (guests) earn nothing. Imported players get a placeholder account holding their Steam ID; when its owner links that Steam account, its matches move to them.
- Team Elo is still recorded on `PlayerRating` and `RatingTransaction` but is no longer shown.

## Rating
- Rating = average base points per match x 20. Bonuses are excluded, so they can't feed back into rating.
- The first 5 rated matches calibrate it: any not yet played count at the starting rating of 1200, so from match 5 on it is purely the player's own average.
- A rating is shown as "Unrated" during calibration. It still counts towards team totals and the underdog bonus.
- Team building shows each player's rating and the team total.
- There are no rank tiers. Rating is separate from in-game rank.

## Underdog bonus
- The average rating of each team is stored on `MatchResult` when the result is recorded. Results with no stored ratings, such as imported matches, pay no bonus.
- The lower-rated team earns +1 point per 10 rating of average gap, up to +20, or half that if it loses. The favourite loses nothing.

Moderators add finished matches from Admin → Import match. Later matches' team ratings are recalculated, because a late import changes what those teams had going in.

Site-created lobbies record their own result: the server checks for official data and stores it with no moderator step. Any player can add a finished match with `/match import` in Discord when all its players are already known. Players who can't be identified get a placeholder they can claim by linking Steam.
