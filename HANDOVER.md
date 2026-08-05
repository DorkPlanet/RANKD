# Rankd — Handover

> **Read this first.** This describes the **original single-file prototype**,
> not the app in `rankd-app/`. The file it refers to (`rankd.html`) has been
> deleted, and none of the function names below exist in the current codebase.
>
> It's kept because the placement mechanic described under "The ranking
> mechanic" is the **direct ancestor of the live engine** — the floor `lo` and
> cap `hi` that collapse until they meet is exactly what `spotLo`/`spotHi` do in
> `rankd-app/src/lib/ladder.ts` today. Read this for the reasoning; read the code
> for the implementation.

Self-contained context for a fresh chat. Read this + `CLAUDE.md` before working.

## What Rankd is
A single-file film-ranking web app: `rankd.html` (HTML/CSS/JS, **no build step, no
framework**, `localStorage` persistence, TMDb API for metadata). You import a
Letterboxd-style ratings CSV, then refine the order by pairwise comparison.
Repo is **local-only, never pushed**.

## The core vision (the thing that matters most)
Ranking should feel like **deliberately slotting a film into its true position**,
with numbers that move sequentially and legibly — not jumping around. Tiers hold
films at a star rating (0.5–5); within a tier you place films by comparing them.

### The ranking mechanic (just reworked — this is the heart of the app)
Picking a tier starts a placement run (`startTournament(tier)` — legacy name; it's
no longer a bracket tournament). The contender is the lowest unranked film; it's
inserted among the films above it:
- It has a **floor `lo`** (films it's surely beaten) and **cap `hi`** (films it
  could still beat). These collapse to its exact slot; it **locks** at `lo===hi`.
- **Normal play** tests the next film up one at a time (feels sequential).
- **Skip** (`ladderSkip(n)`) tests N films up at once — the repetition-killer for
  big tiers. A win keeps climbing; an **overshoot** (loss after a skip) caps `hi`
  and the window **bisects, settling back DOWN** — never gets stuck.
- Scores only move at lock (`ladderSettleAndNext`), spread evenly per-rating across
  each tier's score band, so every placement is an **exact, tie-proof reorder**
  even when dozens of films start tied at one score.
- **Locked films** can still be beaten but need a confirm ("bump it?"). When the
  whole tier is placed, you're **asked** to promote the top film up a tier.
- **Undo** rewinds the placement window (`tournamentState` is in `undoSnap`).

Verified end-to-end (worst-case fully-tied 12-film tier sorts correctly, 0 errors;
skip cut 61→47 comparisons; overshoots recover; undo + promotion intact).

Key state/functions (all in `rankd.html`): `tournamentState =
{tier,maxDiff,filmId,lo,hi,capped,streak,skipN}`; `ladderAbove()`,
`ladderProbeIndex()`, `ladderApplyWin/Loss(j)`, `ladderSettleAndNext()`,
`ladderSkip(n)`, `ladderOverrideConfirm/Decline()`, `promptTierPromotion()`.
In a run, `currentPair[0]` is always the contender (left), `currentPair[1]` the
opponent (right).

## IMMEDIATE NEXT TASK — port the bottom-band visual (task #26)
The **logic works but the compare screen still wears the OLD look** (top status
text + poster rank badges). The agreed new look was fully mocked live (via injected
CSS/JS, since discarded) and signed off. Port it into source, screenshot-iterating
like the mock. The agreed design:

- **Anchor the contender: always the LEFT card**, badged **YOUR PICK**. The right
  card is the opponent — plain **CHALLENGER · #n**, or **🔒 HOLDING #n** with a
  gold-ringed poster when it's a locked film.
- **One "placing" band** sits **below the posters, above the recents bar**
  (NOT at the top). It contains: `▲ NOW PLACING · <title> · 🔥<streak>`, then the
  rank as **`#cur ▸ #tgt`** (you're at cur, beat the right card to take tgt), then
  **skip controls**. The number ticks **up green (▲)** on a win, **down amber (▼)**
  on a settle — watching one number move is the whole legibility fix ("I get lost"
  was the complaint).
- **Skip controls, two variants** — build both, user picks by feel: an always-on
  `Skip ahead +5 / +10 / +50` row, and a **streak-gated banner** that appears after
  ~5 wins ("🔥 5 in a row — skip ahead?"). Both call `ladderSkip(n)`.
- **Hide the old** top status row and the poster `#cp-rank-a/b` / `#cp-new-a/b`
  badges during a ladder run.
- Display math: current rank ≈ `poolSize - (ci + lo)`; target ≈ opponent's current
  rank. `ci` = contender index in `ladderStableOrder(ladderPool())`.

**Layout landmine (why it's a careful pass):** the bottom already has the
undo/save/stop/skip **action row** in normal flow, plus a **fixed session panel**
(progress bar + recents timeline, `#cp-session-panel`, hidden below 700px height).
The band must not collide with those, and must work across the three device-height
tiers (`@media max-height:849px / 700px`). In the mock the band collided with the
action row — reconcile by folding the band and action buttons together or a slim
combined row. Reuse the live-measured `--cp-session-panel-h` / `--cp-status-row-h`
pattern already in the code for reserving space. Wire a `cpRenderLadder()` from
`renderPair()`.

## Other open threads (deferred, lower priority)
- **"Not this film" re-match** in the compare mini-card (task #25): correct a wrong
  TMDb match (wrong film/year) via re-search + metadata overwrite. Not a quick fix.
- **Tier-vs-tier combat** — user's "later" idea: top N of a tier vs lowest N of the
  tier above; a boundary-refinement layer that plugs into `promptTierPromotion`.
- **Full ground-up code-review / efficiency pass** — user asked for it; not started.
- Color-palette redesign; onboarding polish; random list-top pull-gesture.
- A "verification sweep" (bubble to no-upset) was discussed as an accuracy finisher;
  currently superseded by the skip+settle mechanic — revisit only if endings still
  feel off.

## Constraints that must hold (from CLAUDE.md + memory)
- **Never let the user's real email into git.** Identity is the placeholder
  `Rankd Dev <dev@rankd.local>`; verify with `git log --format='%an <%ae>'` before
  any push. Repo has never been pushed.
- **TMDb API key is hardcoded** in `rankd.html` — flag before any public hosting.
- **Working agreement:** confirm before building anything nontrivial; **mock in the
  live preview before writing real code**; ask when ambiguous; always give a
  recommendation; be a detective (theory → evidence → fix), don't guess-and-patch.
- Commit only when asked; branch off `main`/`master` isn't needed (local-only).
  End commit messages with the `Co-Authored-By` trailer.

## Dev setup notes
- Preview via the `Claude_Preview` MCP tools (`preview_start` name `rankd`,
  `preview_eval`, `preview_screenshot`, `preview_resize`). Server is
  `.claude/server.ps1` (a PowerShell static server; occasionally hangs — restart).
- The **test browser has no real library** (localStorage empty) — seed synthetic
  films for testing, or the user loads their real CSV on their device. Test writes
  don't touch the user's real data.
- Recent commits: `d519f07` skip+binary-settle rework · `4d993a6` tied-cluster fix ·
  `14a8494` insertion ladder · `5c8fef7` mode-switch/swipe/Stop/tag-ranking.
- Working tree is clean as of this handover (except this untracked `HANDOVER.md`).
