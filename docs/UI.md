# UI Guide — Deadlock PUG Bangladesh

The design system for `apps/web`. Read this before adding or changing a page, so new screens match the rest.

**Look:** a Deadlock-inspired one. Smoky charcoal, worn brass, aged-paper text, heavy all-caps display type and small mono labels. Team colours carry meaning. Everything else stays quiet.

Everything is original: the crests, logo and sound effects are drawn or generated in code. Hero portraits, name logos and voicelines load at runtime from deadlock-api.com. **Never** add Valve/Deadlock artwork, audio, or another site's branding (e.g. deadlocklabs) to the repo.

---

## 1. Tokens

Defined in `apps/web/tailwind.config.js`. Use the token names (`text-primary`, `border-line`, …), never raw hex in templates.

| Token | Hex | Use for |
|---|---|---|
| `bg` | `#0c0a08` | Page background, recessed fields |
| `surface` | `#15120e` | Cards and panels |
| `raised` | `#1e1a15` | Hover rows, raised chips |
| `line` | `#2f2920` | Borders and dividers |
| `text` | `#ece2cc` | Body text (aged paper) |
| `muted` | `#9c907c` | Secondary text and labels. Still readable: don't go dimmer |
| `primary` | `#d4a24c` | **Brass.** Main actions, active nav, focus, rank #1, highlights |
| `accent` | `#74b49b` | Positive or live states: wins, "connected", live matches |
| `warn` | `#e3a33b` | Warnings, simulated-data badges, paused |
| `danger` | `#cf4a3c` | Bans, losses, errors, destructive actions |
| `amber-team` | `#e8a33a` | **Team Amber** (the Hidden King) |
| `sapphire-team` | `#5a8fe0` | **Team Sapphire** (the Archmother) |

Rules:
- **Amber is always on the left and Sapphire on the right**, in banners, scoreboards and drafts.
- Team colours are for team things only. Don't use `amber-team` as a generic orange.
- Wins use `accent` and losses use `danger`. Bans are always `danger`.
- Radius is small (4–6px). The theme is angular: no pill shapes, no large rounded corners.

## 2. Typography

| Family | Tailwind | Use |
|---|---|---|
| Archivo Black | `font-display` | All `h1–h3` (automatic, uppercase), big numbers, team names, buttons, tab labels |
| Geist | `font-sans` (default) | Body text, table cells, descriptions |
| Geist Mono | `font-mono` | Micro-labels ("eyebrows"), codes, IDs, K/D/A, timestamps |
| Rock Salt / Grenze Gotisch | via `FactionMark` only | Faction wordmarks. Don't use them anywhere else |

Patterns:
- **Eyebrow:** `font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-muted`
- **Stat caption:** `font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted`
- **Big number:** `font-display text-3xl tabular-nums leading-none`
- Use `tabular-nums` for anything that ticks or lines up in columns (ratings, timers, scores).

## 3. CSS components (`src/style.css`)

| Class | What it is |
|---|---|
| `card` | Plain dark panel with a hairline border. For small tiles and secondary boxes |
| `card-ornate` | `card` with brass corner brackets. **The default for a page's main sections** |
| `btn-primary` | Slanted brass slab. One main action per area |
| `btn-ghost` | Bordered secondary button |
| `btn-danger` / `btn-danger-solid` | Destructive (cancel, ban). The solid one is the slanted red slab |
| `btn-accent` | Teal. Rare; for "watch live"-type positive actions |
| `input` | Recessed field with a brass underline focus. Use it for text, number and URL inputs |
| `label` | Mono label with a brass diamond bullet |
| `h-section` | Section title inside a card |
| `rule-brass` | Fading brass divider under page titles |
| `table-compact` | Data tables: display-font headers, compact rows |

Button sizes: the default is `h-9`; use `!h-8` in dense rows and `!h-11` for hero CTAs. Don't invent other heights.

## 4. Vue components

| Component | Use |
|---|---|
| `PageHeader` | **Every page starts with this**: eyebrow, title, optional subtitle, actions in the slot. `center` for form pages |
| `StatTile` | A number with a caption. `tone`: `brass` (default), `win`, `loss`, `amber`, `sapphire` |
| `HeroCard` | Every hero image. Sizes: `xs` (table rows), `sm` (slots), `md`/`lg` (grids, 3:4). States: `normal`, `selected-pick`, `selected-ban`, `banned` (red slash), `taken`, `empty`, `active-pick`/`active-ban` (glowing). Falls back to a generated tile when the portrait is missing |
| `UiSelect` | **Use instead of `<select>`.** Themed, keyboard-accessible, and teleported so cards don't clip it. Takes `options: {value,label}[]` and `v-model`; `aria-label` goes on the button |
| `StatusBadge` | waiting / drafting / live / paused / completed / unavailable / cancelled. Always icon + text, never colour alone |
| `SimBadge` | Shown on **anything** simulated. Required, not optional |
| `Metric` | Renders a stat, or "n/a" when unknown. **Never show a missing stat as 0** |
| `PageState` | Loading, error and empty states. Wrap every data-driven block in it |
| `TeamCrest` / `FactionMark` | Team emblem and faction wordmark (`team="amber" | "sapphire"`) |
| `Logo` | Site logo |
| `draft/*` | Draft-only pieces (intro, reveal splash, order timeline, lobby panel) |

## 5. Page anatomy

```
<div class="max-w-6xl mx-auto space-y-5">         ← width: 5xl forms, 6xl most pages, full-width only for the draft room
  <PageHeader eyebrow="…" title="…">actions</PageHeader>
  [team banner]                                     ← optional: Amber ↔ VS ↔ Sapphire gradient strip
  [filters row]                                      ← UiSelect / search inputs
  <section class="card-ornate p-4|p-5">             ← main content sections
    <h2 class="h-section">…</h2>
    <PageState …> content </PageState>
  </section>
</div>
```

- **Team banner:** `border border-line/70 bg-[linear-gradient(90deg,rgba(232,163,58,.14),rgba(14,12,10,.6)_45%,rgba(14,12,10,.6)_55%,rgba(90,143,224,.14))]`, with a rotated `VS` (or format) tile in the middle. See `Match.vue` and `LiveMatch.vue`.
- **Tabs:** underlined `font-display uppercase` buttons with `border-b-2 border-primary` when active, plus `aria-pressed`. See `Player.vue`.
- **Lists of links:** `divide-y divide-line/60`, rows `px-4 py-2.5 hover:bg-raised/50`, chevron on the right.

## 6. Motion and sound

- Keyframes live in `tailwind.config.js`: `slot-in`, `ban-slash`, `glow`, `glow-danger`, `fade-up`, `tick`, the `splash-*` reveal, `draft-shake` and `confetti`.
- Animate **events**, not idle screens: a pick locks in, a ban lands, the turn changes, the draft completes. Don't animate on a loop except the active-turn glow.
- `prefers-reduced-motion` is honoured globally in `style.css`. Effects that change timing (e.g. holding the board for the final reveal) must check it too (see `reducedMotion` in `DraftRoom.vue`).
- Sound effects (`src/lib/sfx.ts`) are synthesized in code; voicelines come from deadlock-api. Both respect the volume control, and audio only starts after the user has interacted with the page.

## 7. Responsive and accessibility

- Must work from **390px wide up to 1920px**, with no horizontal page scrolling. Wide tables go inside `overflow-x-auto`, and less important columns get `hidden sm:table-cell` / `hidden md:table-cell`.
- The draft room puts the hero grid first on mobile (`order-first lg:order-2`).
- Every input needs a `<label for>` or an `aria-label`. Icon-only buttons need `title` and `aria-label`.
- Status is never conveyed by colour alone; pair it with an icon or text.
- Keep contrast: body text uses `text`, secondary text uses `muted`. Don't put `muted` text on `raised` backgrounds at small sizes.

## 8. Data honesty in the UI

- Unknown stats → `Metric` ("n/a"), never `0`.
- Simulated data → `SimBadge` everywhere it appears.
- Manual results → labelled "Manually verified by a moderator"; API results → "Official data".
- Never show a feature as working if it depends on something unverified (e.g. live stats for private matches). Say "unavailable" and explain why.
- Party codes are only for participants. Never render one in a view spectators can see.

## 9. Checklist for a new page

- [ ] Starts with `PageHeader`; main sections use `card-ornate`
- [ ] Uses tokens, `UiSelect`, `HeroCard`, `Metric`, `PageState` and `StatusBadge` instead of hand-rolled versions
- [ ] Loading, empty and error states exist
- [ ] Amber on the left, Sapphire on the right; team colours only for teams
- [ ] Works at 390px with no horizontal scroll
- [ ] Labels and aria attributes on every control
- [ ] Simulated or unverified data is marked
