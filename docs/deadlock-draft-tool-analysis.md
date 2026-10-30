# Deadlock Labs Draft Tool — How It Works

Analyzed on **31 October 2026 (Asia/Dhaka)**.

Source: [Deadlock Labs Draft Tool](https://deadlocklabs.gg/draft-pick/).

## 1. What this tool does

The draft tool is a shared, browser-based hero drafting room for Deadlock tournaments and scrims. Two captains choose their teams' heroes through an ordered sequence of bans and picks. Other visitors can watch. The room tracks whose turn it is, which heroes remain available, and the final team compositions.

The core workflow is:

**Configure a draft → create a room → share its link/code → claim captain seats → both ready up → ban and pick → copy the result or request a rematch.**

Creating a room and completing a draft worked while the website displayed **Sign In**; signing into an account was not required in this test. No game launch or automatic application of the draft inside Deadlock was observed.

## 2. Scope and evidence

This is a hands-on functional analysis of the linked draft tool, not a source-code or backend audit. I inspected the live interface in Chrome, created a separate test room, and completed a 2v2 draft with one ban per team and no timer. A second independent browser session acted as the opposing captain. The user's original Chrome tab was left intact.

The report distinguishes between behavior actually tested, controls and explanations visible in the interface, and inferred implementation concepts. Options, hero counts, and statistics may change after this inspection.

## 3. Entry page and configuration

The entry page has two tabs: **Create Lobby** and **Join Lobby**.

### Create Lobby

| Control | Available choices | What it means |
|---|---|---|
| Team names | Two text fields | Labels used throughout the lobby, turn messages, and result. Placeholders are Team 1 and Team 2; the fields are associated with Hidden King and Archmother imagery. |
| Format | 6v6, 4v4, 2v2 | Number of hero picks each team needs. |
| Bans | Off, 1, 2, 3, 4, 5, 6 | Ban allowance per team. Selecting 1 was explicitly summarized in the room as “1 ban per team.” |
| Timer | Off, 30s, 45s, 60s, 90s | Timing option for the draft. Off became “No timer” in the room. Actual countdown expiry was not tested. |
| Draft order | Visual timeline | Preview of the configured sequence, with team-labeled ban and pick groups. |
| Create draft | Action button | Creates a room and navigates to its room URL. |

The draft-order preview is animated and marked **Demo**. It shows example heroes and changing turn messages before an actual room exists. These are preview activity, not picks committed by users.

In the inspected 6v6 preview, the timeline included **Bans 1 → Picks 1 → Bans 2 → Picks 2**. In the tested 2v2, one-ban configuration, it simplified to **Bans → Picks**. Do not assume every configuration has the same phase structure.

### Join Lobby

The join form asks for a **six-character room code**, displayed as six visual slots. Its help text calls this the six-letter code from the draft link. The Join Lobby submission button was disabled while the field was empty.

Visitors can also open the direct room link. The observed URL structure was:

```text
https://deadlocklabs.gg/draft-pick/<ROOM_CODE>/
```

Direct-link joining was tested. Invalid-code handling and code-field submission were not tested.

## 4. Lobby: seats, spectators, readiness, and settings

Creating the room initially made the creator a viewer, not automatically a captain. Both teams displayed **Seat's free** and a **Take the seat** button.

After claiming one seat:

- That side displayed **You're captain**, **I'm ready**, and **Leave seat**.
- The empty opposing side offered **Switch here**.
- A **Swap sides** control appeared.
- An independent visitor saw the occupied side as **Captain is here**, with readiness status.
- The lobby showed a watcher count. Claiming a seat changed the count from one watcher to nobody watching in the initial test.

The lobby also exposes **Copy link**, **Copy code**, the room code, selected format, bans per team, timer mode, and the draft-order timeline.

Both captains must ready up. With both seats occupied, the instruction became: “Both captains are in. Ready up and the draft starts.” When the second captain readied, the active draft began automatically.

### Session identity

Opening the same room in another tab of the same Chrome profile recognized that tab as the existing captain. It did not create an independent second captain. A separate browser session did appear as a different visitor and could claim the other seat.

This establishes shared identity across the tested same-profile tabs. The underlying storage mechanism and identity lifetime were not inspected.

### Room settings

The room-settings popover explains what happens when a **ban timer runs out**:

| Option | Interface explanation |
|---|---|
| No ban | The ban is lost. This was the initially selected option. |
| Random hero | The hero being looked at gets banned; otherwise, a random hero is banned. |

As a spectator, these radio controls were disabled, and the popover said only captains could change the setting. The actual timeout behavior and captain-side setting mutation were not exercised.

The room also provides **Mute**, a **Volume** slider (showing 80 during inspection), and **Fullscreen**. Their presence was verified; audio playback and fullscreen transitions were not tested.

## 5. Active draft interface

The active draft changes to a dedicated drafting layout with:

- Navigation back toward the draft tool and room.
- Your captain identity and watcher count.
- Team names, emblems, and captain-online indicators.
- Current phase, timer mode, and turn number.
- Team composition panels with filled and empty slots and counts such as 1/2.
- A status message identifying your turn or the other team's turn.
- A timeline recording bans and picks.
- A central hero preview and confirmation action.
- Search, class filters, and the hero pool.

### Hero discovery

The test began with **44 free** heroes. That is a snapshot of this website's pool, not a guarantee about the game's official playable roster.

The available filters were **All, Assassin, Brawler, Marksman, and Mystic**. Selecting Mystic reduced the visible pool to matching heroes. Typing Haze into **Search hero** reduced the visible results to Haze.

The “free” count represented remaining available heroes across the draft, not the number matching the current search or filter. For example, searching Haze still showed 43 free after one ban.

Hero previews displayed a portrait, class, descriptive tags, and **win rate / pick rate for the last seven days**. These values are contextual statistics, not predictions of a particular team's chance of winning. This inspection did not establish their rank filters, sample size, or calculation method.

### Selecting versus confirming

Clicking a hero highlights it and exposes a separate confirmation button:

- During a ban: **Ban [hero]**.
- During a pick: **Lock in [hero]**.

Selecting the hero alone did not advance the turn. Confirming did. The buttons displayed an **Enter** shortcut hint, and the search area displayed a **/** hint. Mouse confirmation and direct text entry were tested; keyboard shortcuts were not.

### Availability rules

Committed bans and picks remove heroes from availability for both teams. The hero buttons stay visible but become disabled and annotated, such as **Abrams (banned)** or **Haze (Analysis Amber)**.

The available count fell from 44 to 43 after banning Abrams, and to 40 after three hero picks. Skipping a ban did not consume a hero.

## 6. Verified drafting order

The completed test used **2v2, one ban per team, timer off**. Its six turns were:

| Turn | Team | Action | Test result |
|---|---|---|---|
| 1 | Analysis Amber | Ban | Abrams |
| 2 | Analysis Sapphire | Ban | Skipped |
| 3 | Analysis Amber | Pick | Haze |
| 4 | Analysis Sapphire | Pick | Bebop |
| 5 | Analysis Sapphire | Pick | Dynamo |
| 6 | Analysis Amber | Pick | Seven |

The pick order is therefore **A → B → B → A** for this configuration. The opposing captain's interface explicitly identified “Turn 1 of 2 in a row” and then “Turn 2 of 2 in a row.”

This is why a timeline can show three pick groups while the draft still requires four individual picks: the middle group contains two picks.

### Skipping bans

**Skip this ban** was available during the ban phase. Using it immediately advanced the draft, and the team's ban area displayed **None / No ban**. The test did not reveal a comparable skip-pick control.

## 7. Completion, copying, and rematches

After the final confirmation, the page showed **Draft complete**, both teams' heroes, and their bans.

Available actions were:

| Action | Observed behavior |
|---|---|
| Copy result | Copies plain text containing both team compositions, bans, and a room link. Tested. |
| Copy link | Exposed on the result screen. Clipboard output for this specific button was not separately tested. |
| Rematch | Starts a rematch vote. Tested through acceptance. |
| New draft | Link to `/draft-pick`. |

The actual copied result was:

```text
Analysis Amber: Haze, Seven
Analysis Sapphire: Bebop, Dynamo

Bans: Abrams, ?

https://deadlocklabs.gg/draft-pick/AVWSXY
```

**Export quirk:** the skipped ban was clearly rendered as None on screen but exported as `?`. A reader of the copied result could mistake that for an unknown hero rather than a deliberately skipped ban.

### Rematch agreement

The first captain clicked Rematch. Their button became **Rematch voted**, and the page said that team wanted a rematch. The other captain received **Accept rematch**.

Accepting returned both sessions to the lobby at the **same room code**, preserving the test team names, seats, 2v2 format, one-ban allowance, and no-timer setting. The draft history was cleared for the next draft, and readiness was reset; both captains needed to ready up again.

The screenshot below records the completed test before the rematch reset:

![Completed test draft](draft-complete.jpg)

## 8. How the system appears to work internally

The following is a conceptual model inferred from visible behavior, **not a claim about the actual source code, database, framework, or network protocol**.

The application needs a shared room state containing:

- Room identifier and draft configuration.
- Team names and captain-seat ownership.
- Captain presence and readiness.
- Spectator presence.
- Ordered ban/pick steps and the current step.
- Confirmed hero bans and team picks.
- Optional timer state and ban-timeout policy.
- Completion state and rematch votes.

A useful behavioral state model is:

```text
Configuration
    -> Waiting room
    -> Both captains ready
    -> Current ban/pick turn
       -> Select hero
       -> Confirm action OR skip ban
       -> Advance to next turn
    -> Draft complete
       -> Copy/share result
       -> Rematch requested
       -> Opponent accepts
       -> Waiting room with readiness reset
```

Independent sessions received seat, readiness, turn, and rematch updates without a manual page reload. This supports a shared synchronized room model. It does **not** identify whether synchronization uses WebSockets, polling, server-sent events, or another mechanism.

The footer says the site is powered by **deadlock-api.com** and is not affiliated with Valve Corporation. That attribution alone does not prove which API supplies the draft room, hero statistics, or images.

## 9. Visual design and surrounding website

The inspected desktop page used a dark theme labeled **Amber Midnight**, strong orange accents, large uppercase headings, hero artwork, and contrasting team imagery. The entry view placed the drafting form centrally, with a vertical navigation rail on the left and an advertisement/support area on the right.

The broader navigation exposes Heroes, Items, Builds, Patch Notes, Matches, Players, Leaderboard, Crosshairs, Compete, Arcade, Tools, and Partners. The shell also includes sign-in, language and theme controls, an app announcement, Discord and social links, and legal/privacy links.

These surrounding sections were inventoried, not individually audited. Their availability should not be mistaken for tested tournament integration, team management, match tracking, or automatic game integration in this draft tool.

## 10. Strengths and practical limitations

### Strengths observed

- Low-friction room creation and joining without signing in during the test.
- A shareable short code and direct link.
- Explicit captain seats and a two-person readiness gate.
- Clear turn sequencing, including consecutive picks.
- Separate selection and confirmation to reduce accidental commits.
- Search and role filters for navigating the hero pool.
- Disabled already-used heroes and visible composition progress.
- Exportable results and a rematch flow requiring both captains' agreement.

### Quirks and cautions grounded in testing

- The animated setup demo can look like a draft is already running; the Demo label matters.
- Two tabs in one browser profile do not provide independent captains in the tested flow.
- A skipped ban exports as `?`, despite being shown as None on screen.
- UI updates and animations can briefly lag the underlying turn transition. Wait for the interface to settle before interpreting an intermediate slot count as a bug.
- Rematching reuses and resets the room, so copy a completed result before accepting a rematch if you need a record.

### Not established by this inspection

- Exact 4v4 and 6v6 turn sequences for every ban configuration.
- Pick-timeout behavior, countdown accuracy, or actual execution of either ban-timeout mode.
- Room expiration, long-term persistence, server recovery, and reconnect guarantees.
- Invalid-code errors and concurrent attempts to take the same seat.
- Detailed effects of Switch here, Swap sides, and Leave seat.
- Whether picks can be undone or a draft paused through another surface.
- Mobile layouts, full accessibility compliance, or performance under many spectators.
- Backend security, authoritative server validation, database structure, or transport protocol.
- Automatic creation of an in-game lobby or enforcement inside Deadlock.

## 11. Quick usage guide

1. Open the [draft tool](https://deadlocklabs.gg/draft-pick/).
2. Enter both team names and choose format, bans, and timer.
3. Review the draft-order preview, then create the draft.
4. Share the room link or code with the opposing captain.
5. Each captain takes the correct seat in their own browser session.
6. Review room settings and both click I'm ready.
7. On your turn, search or filter heroes, select one, and explicitly confirm the ban or pick. Use Skip this ban if appropriate.
8. Follow the turn indicator, including any consecutive picks.
9. At completion, copy the result for your match record.
10. For another draft with the same setup, request and accept a rematch, then ready up again.

## Sources and method

Primary evidence came from direct interaction with the [live draft tool](https://deadlocklabs.gg/draft-pick/) and a disposable test room created through its UI. Findings were checked against visible page content and a completed two-captain draft. No private source repository, hidden application state, or backend implementation was inspected.
