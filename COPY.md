# Rankd — copy inventory

**Every user-facing string in the app, in one place.** 506 of them, grouped by screen.
This is the working document for the voice pass (register item G1).

**How to use it:** read down the tables and put anything at all in the **Your note** column
for lines that sound wrong. A tick, a cross, a swear word, a rewrite. You do not have to fix
anything here. Marking what grates is the job; deciding what replaces it is the next step.

**Line numbers were accurate on 20 Aug 2026 and drift as soon as anything is edited.**
Treat them as a hint, and find the string by searching for its text. The strings themselves
are kept current — see "Changed since the snapshot" below.

**Some copy is asserted in tests** — check what breaks before changing a string.

### Changed since the snapshot

| When | Where | What |
|---|---|---|
| 21 Aug | List header | **New:** the locked/believed legend. "**55** you settled · 105 Rankd placed, and can still move". The distinction had never been stated anywhere on a phone — it lived in a `title` attribute. Register N2 |
| 21 Aug | Profile stats band | "Settled" → **"Ranked"** (line 285 below). The number counts hard AND soft locks, and "settled" is the app's word for the hard half alone, so the label was naming the wrong state |
| 21 Aug | Profile tier chart | "The gold is how many you've settled" → "**The gold is how many have a position**", for the same reason |
| 21 Aug | List tour, "row" step | Now carries "a rating is not a position" itself. It was stated only on the UN-RNKD step, which `resolveSteps` drops for anyone who has finished ranking a tier — so the reader furthest into the app never met the idea the tour exists for. Register N3 |

---

## The diagnosis: why it reads as AI

The obvious tells are almost absent. There is no "not just X but Y", no "seamlessly", no
"delve", no "powerful", no marketing adjectives at all. **The copy is genuinely good line by
line.** That is why the problem is hard to point at.

What makes it read as machine-written is **uniformity**. Six habits, repeated everywhere:

**1. The antithesis move — the single strongest tell.** The same rhetorical shape, over and
over: deny one thing to affirm another.

> "Not which film is better, but which you'd rather watch."
> "Nothing here says a film is better than another, only that you'd reach for it sooner."
> "No duel is recorded, because you're skipping the argument rather than winning it."
> "UN-RNKD is not unrated."

Each is good. Four in one tour is a tic. A person writing these on four different days would
not have reached for the same construction four times.

**2. Every block is the same length.** Nearly every tour body runs two to three sentences and
25–45 words. Never one word. Never six sentences. Real writing is lumpy.

**3. Instructions justify themselves.** Almost nothing is allowed to simply be said.

> "…which is the point of doing it this way."
> "…because you're skipping the argument rather than winning it."

**4. Fragment-for-emphasis after a full sentence.** A clipped sentence used as a beat.

> "No duels." · "Tap it." · "It lives under RNK." · "Changes nothing in your rankings."

**5. Balanced numeric mirrors.**

> "A tier of 100 films is 4,950 duels this way, which is hours. Rough Cut is 100 taps, which
> is about two minutes."

The parallel is too neat. It reads as composed rather than said.

**6. Nothing is ever plain, funny or throwaway.** Every string is doing rhetorical work.
Every one lands. Real product copy has flat bits, jokes, and lines that are just labels.
The relentless quality is itself the tell.

**7. Everything is in EXPLAINING mode. Nothing is in RECOGNISING mode.** This is the root of
the other six, and the most important line in this document.

Compare the front door with Flickchart's:

> **Flickchart:** "If they're all 5-star movies… Which one's the best?"
> **Rankd:** "Your films, in the order you actually like them."

Rankd's is well written and it is the company describing the product. Flickchart's is the
reader's own thought handed back as a question, and it explains nothing at all. You read it
and think *yes, exactly*.

**506 strings of good explanation lose to one sentence of recognition.** The remedy is a
change of register, not a change of quality. Before rewriting any line, ask which mode it is
in — and whether the screen needs teaching at that moment or needs the reader to see
themselves.

**Where Rankd can win rather than match:** the front door has no library and must be generic,
like theirs. But immediately after import the app knows everything, so the same question can
be computed — *"You've given 185 films three stars. Which one's your favourite?"* No
competitor can write that line, because none of them import.

**And the one actual rule violation: 8 em dashes**, against a rule that already exists. They
are listed in the tables below, flagged `EM-DASH`. This is the only part of the pass that is
already decided rather than open.

---

## The two rules that already exist, and are not up for debate

- **The app records a PREFERENCE, never a verdict.** "Which you'd rather watch", never
  "which is better". This is tested, and it is the one place Rankd's copy already beats
  every competitor.
- **No em dashes in user-facing text.**

---

## What the tables flag

| Flag | Meaning |
|---|---|
| `EM-DASH` | Breaks the existing rule. Decided, not open. |
| `ANTITHESIS` | The deny-one-thing-to-affirm-another shape from tell 1. |
| `SELF-JUSTIFYING` | An instruction explaining why it is the instruction. |
| `MIRROR` | The balanced numeric parallel from tell 5. |

Blank means the automatic scan found nothing. **It does not mean the line is fine** — tells 2
and 6 are about the whole body of copy and no regex can see them. Trust your ear over the
flags.

---

## 01 · The duel screen (RNK)

**`components/DuelScreen.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 951 | No films yet |  |  |
| 951 | Everyone has a favourite. What's yours? |  |  |
| 984 | Import your films |  |  |
| 1046 | KING OF THE HILL · 0 placed · 50 to go |  |  |
| 1061 | GOING UP A TIER |  |  |
| 1061 | KING OF THE HILL |  |  |
| 1407 | Activity is coming soon |  |  |
| 1411 | Your list |  |  |
| 1418 | Log a film |  |  |
| 1419 | Rank |  |  |
| 1420 | Activity, coming soon |  |  |
| 1424 | You |  |  |
| 1520 | Play |  |  |
| 1532 | Rough Cut |  |  |
| 1533 | Large libraries can be daunting. Start dividing them into smaller groups, then compare from there. |  |  |
| 1537 | King of the Hill |  |  |
| 1538 | One tier at a time. Winner moves on. |  |  |
| 1544 | Fast Shuffle |  |  |
| 1545 | Your provisional rating. Compare films to establish an initial ranking. It's much easier than ranking every film against every other. 50 films alone would mean 1,225 comparisons. Use the other modes for your hard locks. |  |  |
| 1553 | Curator |  |  |
| 1554 | A director, an actor or genre. Everyone has their favourite. Your rankings don't move. |  |  |
| 1590 | Rough Cut |  |  |
| 1615 | Range |  |  |
| 1685 | Upper |  |  |
| 1685 | Middle |  |  |
| 1685 | Lower |  |  |
| 1700 | King of the Hill |  |  |
| 1720 | Range |  |  |
| 1752 | Start · ${count} films |  |  |
| 1808 | Fast Shuffle |  |  |
| 1810 | All films |  |  |
| 1811 | This tier |  |  |
| 1812 | Range |  |  |
| 1828 | Range |  |  |
| 1848 | Include films I&apos;ve already placed |  |  |
| 1851 | Placed films can move within their star rating. |  |  |
| 1852 | Placed films stay exactly where you put them. |  |  |
| 1863 | Start · ${count} films |  |  |
| 1929 | Choose a tier |  |  |
| 1948 | , needs 2 |  |  |
| 2016 | Settings |  |  |
| 2025 | Achievements |  |  |
| 2216 | Only ${pile.length} left in this run |  |  |
| 2278 | CLIMBING |  |  |
| 2279 | UN-RNKD |  |  |
| 2387 | Whichever film wins keeps climbing |  |  |
| 2388 | Can't separate two? Say so, it counts |  |  |
| 2389 | Flick a film up to send it straight to the top |  |  |
| 2390 | Flick a film down to send it to the bottom |  |  |
| 2391 | Hold a film to see who's in it and what it's about |  |  |
| 2392 | Swipe the row below to choose who you face next |  |  |
| 2393 | Pull the handle down to hide the row |  |  |
| 2394 | Nothing's saved until you lock a film into place |  |  |
| 2530 | 🏆 TOPS THE PILE |  |  |
| 2655 | Pile ranked |  |  |
| 2655 | Session done |  |  |
| 2659 | That pile is in order. The rest of the tier is untouched. |  |  |
| 2660 | Every film in this tier has found its spot. |  |  |
| 2661 | Every answer is kept. Pick this tier back up whenever you like. |  |  |
| 2671 | Rank another tier |  |  |
| 2671 | Keep ranking |  |  |
| 2687 | Upper |  |  |
| 2687 | Middle |  |  |
| 2687 | Lower |  |  |

**`components/PosterCard.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 36 | <img src="${poster}" style="width:100%;height:100%;object-fit:cover;display:block"/> |  |  |
| 412 | Which do you prefer? |  |  |
| 430 | · too close |  |  |

**`components/Rolodex.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 136 | Hide the film strip |  |  |
| 136 | Show the film strip |  |  |

**`components/RunStatus.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 142 | of 134 |  |  |

**`components/ShuffleDuel.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 302 | Session done |  |  |
| 302 | Nothing settled |  |  |
| 305 | Every answer is kept. The list has moved to match. |  |  |
| 306 | No duels this time, so nothing changed. |  |  |
| 315 | Keep shuffling |  |  |
| 321 | Reading the evidence… |  |  |
| 328 | Not enough films in range to compare. Widen the scope and try again. |  |  |
| 329 | Nothing left to ask here. |  |  |
| 371 | FAST SHUFFLE |  |  |
| 377 | Pick the one you rate higher |  |  |


## 02 · Rough Cut

**`components/RoughCut.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 399 | Rank a pile |  |  |
| 399 | Split again |  |  |
| 411 | Upper |  |  |
| 411 | Middle |  |  |
| 411 | Lower |  |  |
| 467 | 1 of 12 |  |  |
| 476 | FILMS LEFT |  |  |
| 619 | FILMS LEFT |  |  |
| 711 | Lower |  |  |
| 712 | Middle |  |  |
| 713 | Upper |  |  |


## 03 · The list

**`components/ListScreen.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 171 | Search your films |  |  |
| 221 | Nothing matches. |  |  |
| 351 | You placed this |  |  |
| 351 | Placed by the evidence |  |  |


## 04 · Sheets and film detail

**`components/CuratedPicker.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 61 | Curator |  |  |
| 63 | Directors |  |  |
| 64 | Actors |  |  |
| 65 | Genres |  |  |
| 73 | Search genres |  |  |
| 73 | Search names |  |  |
| 96 | All |  |  |
| 122 | Nothing by that name. |  |  |
| 125 | Nothing here yet. This fills in as your library learns who made each film. |  |  |
| 129 | "role" in row |  |  |

**`components/FilmInfo.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 89 | Director |  |  |
| 90 | Written by |  |  |
| 91 | Cinematography |  |  |
| 92 | Music |  |  |
| 117 | · ${meta.runtime}m |  |  |
| 122 | Never duelled |  |  |
| 169 | Director |  |  |
| 184 | Loading details… |  |  |
| 195 | Remove from library |  |  |

**`components/FixMatch.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 79 | Which film is this? |  |  |
| 91 | Looking… |  |  |

**`components/LogFilm.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 105 | How was it? |  |  |
| 105 | Log a film |  |  |
| 133 | Search for a film |  |  |
| 169 | Searching… |  |  |
| 169 | Couldn't reach the film database. |  |  |
| 169 | Nothing found. |  |  |

**`components/PersonSheet.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 151 | Director |  |  |
| 151 | Actor |  |  |
| 152 | · ${missing.length} not logged |  |  |
| 197 | Include films I haven&rsquo;t seen |  |  |
| 201 | Pulls in the rest of their work, just for this session. |  |  |
| 219 | Finding their films… |  |  |
| 225 | Looking them up… |  |  |

**`components/ResumeOverlay.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 74 | Continue your run |  |  |
| 96 | Another tier |  |  |
| 97 | Something else |  |  |
| 103 | Abandon this run? |  |  |
| 137 | &rsaquo; |  |  |

**`components/RunSummary.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 140 | Saved to your lists ✓ |  |  |
| 142 | Couldn't save it |  |  |
| 143 | Save as a list |  |  |


## 05 · Profile, cards and pickers

**`components/AvatarCropper.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 97 | Couldn't read that image. |  |  |
| 173 | Couldn't be uploaded. |  |  |
| 188 | Your picture |  |  |
| 189 | Drag to move it. Pinch or use the slider to zoom. |  |  |
| 244 | Zoom |  |  |
| 259 | Uploading… |  |  |
| 259 | Use this picture |  |  |

**`components/CardPicker.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 157 | Couldn't draw this one |  |  |
| 157 | Drawing… |  |  |
| 189 | Saved the ${designName[active]} card ✓ |  |  |
| 189 | Download the ${designName[active]} card |  |  |

**`components/FilmPicker.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 39 | Pick a film |  |  |
| 42 | Search by title, or by who made it. |  |  |
| 171 | Search all films |  |  |
| 171 | Search directors |  |  |
| 171 | Search actors |  |  |
| 210 | All tiers |  |  |
| 220 | Facing films in a random order |  |  |
| 220 | Face films in a random order |  |  |
| 226 | Jump to top |  |  |
| 227 | Jump to bottom |  |  |
| 236 | All tiers |  |  |
| 311 | Nothing matches. |  |  |

**`components/ProfileScreen.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 212 | Change scene |  |  |
| 212 | Pick a scene |  |  |
| 260 | Edit your name and bio |  |  |
| 267 | Add a line about your taste |  |  |
| 284 | Films |  |  |
| 285 | Ranked |  |  |
| 286 | Duels |  |  |
| 287 | Badges |  |  |
| 292 | Last time |  |  |
| 308 | What you like |  |  |
| 311 | Your taste |  |  |
| 314 | You live at |  |  |
| 316 | You keep returning to |  |  |
| 318 | More precisely |  |  |
| 320 | Your decade |  |  |
| 323 | As a rater you're |  |  |
| 337 | Odds and ends |  |  |
| 353 | Your highest rated |  |  |
| 357 | Director |  |  |
| 362 | Every film of theirs in your library, your favourite first. |  |  |
| 375 | Actor |  |  |
| 380 | Every film of theirs in your library, your favourite first. |  |  |
| 399 | What you've made |  |  |
| 418 | RANKED |  |  |
| 419 | Top ten |  |  |
| 423 | Your top ten |  |  |
| 424 | The highest films in your ranking, in order. |  |  |
| 436 | YOURS |  |  |
| 498 | PINNED |  |  |
| 498 | RANKING |  |  |
| 543 | BADGES |  |  |
| 580 | Where it stands |  |  |
| 581 | Your tiers |  |  |
| 615 | AppShell |  |  |
| 655 | CollectionSheet |  |  |
| 713 | Pick a film |  |  |
| 716 | Then choose a frame from it for the top of your profile. |  |  |
| 717 | Then choose a frame from it for your picture. |  |  |
| 815 | Change your picture |  |  |
| 857 | Your picture |  |  |
| 860 | A frame from one of your films, or a photo of your own. |  |  |
| 861 | A frame from one of your films. Sign in if you would rather upload a photo. |  |  |
| 868 | Use a frame from a film |  |  |
| 876 | ImportButton |  |  |
| 880 | Upload a photo |  |  |
| 881 | You choose the crop. |  |  |
| 942 | Choose a frame for your picture. |  |  |
| 943 | Choose a frame for the top of your profile. |  |  |
| 945 | Finding frames… |  |  |
| 1036 | center 20% |  |  |
| 1123 | Nothing in here yet. |  |  |
| 1212 | You |  |  |
| 1217 | Your name |  |  |
| 1225 | A line about your taste |  |  |
| 1233 | You |  |  |

**`components/SavedListSheet.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 83 | · ${list.entries.length} films |  |  |
| 100 | Unpin |  |  |
| 100 | Pin to profile |  |  |
| 100 | Profile full |  |  |
| 133 | Delete this ranking? |  |  |

**`components/Trophies.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 18 | Badges |  |  |


## 06 · Tours and coach marks

**`components/Coach.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 210 | Got it |  |  |
| 210 | Next |  |  |

**`lib/tour.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 66 | Tap the one you prefer |  |  |
| 67 | These two have the same star rating from you. That group is a tier, and Rankd puts it in order. Which would you rather watch? Tap it. |  |  |
| 72 | Flick when you already know |  |  |
| 73 | Decide if a film belongs at the top or bottom of your tier. Flick up and it parks at the top. Flick down sends it to the bottom. No duel gets recorded, you're skipping the argument. |  |  |
| 78 | Hold for the details |  |  |
| 79 | Press and hold a poster for the year, director, cast, and where it sits in your order. |  |  |
| 84 | The rest of the tier |  |  |
| 85 | Pull this up to see everything you're working through. Tap any of them to jump straight there. |  |  |
| 90 | Big library? Start with a Rough Cut |  |  |
| 91 | A tier of 100 films is 4,950 duels this way. That's hours. Rough Cut is one decision per film instead, and it leaves the piles small enough to duel properly. It's under RNK. |  |  |
| 107 | Your ranking, in order |  |  |
| 108 | One tier at a time, your favourite first. The stars decide which tier a film is in. The number on the right is a different thing: the position it holds across everything you've ranked. Tap any row to open it. |  |  |
| 113 | UN-RNKD is not unrated |  |  |
| 114 | Each tier holds films you rated the same. The ones marked UN-RNKD came in from your import and have never been ranked, so they've got no position yet. That's what the duels are for. |  |  |
| 119 | Jump to a tier |  |  |
| 120 | Straight to any star rating, with a count of how many you've settled there. Quickest way to find where there's work left. |  |  |
| 146 | One at a time |  |  |
| 147 | One tier, broken into three piles: upper, middle, lower. This is the film you're placing. There's nothing to compare it against, so go with your gut. |  |  |
| 152 | Upper, middle or lower |  |  |
| 153 | Tap the pile this film belongs in. The count above it goes up. |  |  |
| 158 | Or flick it |  |  |
| 159 | Flick up for upper, down for lower. Drag a little first and the target you're aimed at lifts, so you can see where it'll land. Middle has no flick, tap it. |  |  |
| 164 | Hold for the details |  |  |
| 165 | Press and hold the poster for the year, director, cast, and where it sits in your order. |  |  |
| 170 | How many are left |  |  |
| 171 | This counts down as you go. |  |  |
| 176 | Skip, undo, stop |  |  |
| 177 | Not sure? Skip sends it to the back and brings it round later. Undo takes back the last one. Done saves everything and picks up where you left off. |  |  |
| 198 | Just watched something? |  |  |
| 199 | Search for it, give it a rating, and it joins that tier as UN-RNKD. It's in the queue with everything else now. |  |  |


## 07 · Badges

**`lib/achievements.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 101 | Collector |  |  |
| 101 | Have 100 films in your library |  |  |
| 102 | Archivist |  |  |
| 102 | Have 500 films in your library |  |  |
| 103 | Curator emeritus |  |  |
| 103 | Have 1,000 films in your library |  |  |
| 106 | First blood |  |  |
| 106 | Settle your first film |  |  |
| 107 | Getting somewhere |  |  |
| 107 | Settle 10 films |  |  |
| 108 | In deep |  |  |
| 108 | Settle 50 films |  |  |
| 109 | Committed |  |  |
| 109 | Settle 100 films |  |  |
| 110 | Unwavering |  |  |
| 110 | Settle 250 films |  |  |
| 111 | Iron opinion |  |  |
| 111 | Settle 500 films |  |  |
| 114 | Nothing left to argue |  |  |
| 115 | Settle every film in your library |  |  |
| 121 | Opening rounds |  |  |
| 121 | Fight 10 duels |  |  |
| 122 | Hundred rounds |  |  |
| 122 | Fight 100 duels |  |  |
| 123 | Thousand rounds |  |  |
| 123 | Fight 1,000 duels |  |  |
| 124 | No notes |  |  |
| 124 | Fight 5,000 duels |  |  |
| 129 | Clean sweep |  |  |
| 130 | Settle every film in one tier |  |  |
| 136 | Completionist |  |  |
| 137 | Settle every tier you own films in |  |  |
| 141 | Perfectionist |  |  |
| 142 | No mercy |  |  |
| 145 | Full spectrum |  |  |
| 145 | Use all ten star ratings |  |  |
| 148 | Time traveller |  |  |
| 148 | Own films from 5 different decades |  |  |
| 149 | Archivist of ages |  |  |
| 149 | Own films from 8 different decades |  |  |
| 152 | Before your time |  |  |
| 153 | Own a film made before 1960 |  |  |
| 157 | Omnivore |  |  |
| 157 | Own films across 12 genres |  |  |
| 158 | House style |  |  |
| 158 | Own 50 films in one genre |  |  |
| 159 | Devotee |  |  |
| 159 | Own 5 films by one director |  |  |
| 160 | Completist |  |  |
| 160 | Own 10 films by one director |  |  |
| 161 | Familiar face |  |  |
| 161 | Own 10 films with the same actor |  |  |
| 166 | The long haul |  |  |
| 167 | Own a film over three hours |  |  |
| 169 | longest is ${Math.floor(longest / 60)}h ${longest % 60}m |  |  |
| 171 | A month of cinema |  |  |
| 171 | Own 1,000 hours of film |  |  |
| 174 | Well briefed |  |  |
| 174 | Know the credits of 200 films |  |  |
| 175 | Fully briefed |  |  |
| 175 | Know the credits of 500 films |  |  |
| 181 | Soft touch |  |  |
| 182 | Rate more generously than the midpoint, across 100+ films |  |  |
| 188 | Hard marker |  |  |
| 189 | Rate more harshly than the midpoint, across 100+ films |  |  |
| 195 | Niche interest |  |  |
| 196 | Own enough of one narrow subgenre for it to say something |  |  |


## 08 · Settings, account, onboarding

**`components/Account.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 99 | Can't reach your account right now. |  |  |
| 123 | Kept this device's library. |  |  |
| 154 | This device |  |  |
| 158 | Your account |  |  |
| 200 | · unsent changes |  |  |
| 209 | Couldn't reach your account. It'll retry. |  |  |
| 209 | Backed up. |  |  |

**`components/Feedback.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 67 | POST |  |  |
| 68 | Content-Type |  |  |
| 73 | Couldn't be sent. |  |  |
| 82 | No connection. Your message hasn't been sent. |  |  |
| 90 | Broken? Confusing? Missing something? Tell us. |  |  |
| 96 | Sent. Thank you. |  |  |
| 111 | What happened? |  |  |
| 119 | Sending… |  |  |
| 119 | Send |  |  |

**`components/ImportGuide.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 27 | Open letterboxd.com in a browser |  |  |
| 28 | The export lives on the website. The phone apps don't have it. |  |  |
| 30 | Your name, then Settings, then Import & Export |  |  |
| 31 | Tap Export Your Data |  |  |
| 31 | It downloads a .zip. |  |  |
| 33 | Come back here and pick that .zip |  |  |
| 34 | No need to open it. If you already have, the file you want is ratings.csv. |  |  |

**`components/InstallPrompt.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 25 | Promise |  |  |
| 87 | Put Rankd on your home screen |  |  |
| 91 | Share |  |  |
| 92 | Add to Home Screen |  |  |
| 96 | Opens without the address bar, with its own icon. Nothing to download. |  |  |
| 116 | Not now |  |  |
| 116 | Got it |  |  |

**`components/Settings.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 137 | Settings |  |  |
| 139 | Brightness |  |  |
| 165 | Let the list drift |  |  |
| 179 | Your films |  |  |
| 184 | Add a Letterboxd export. |  |  |
| 189 | Merge |  |  |
| 190 | Replace |  |  |
| 200 | Saved. |  |  |
| 210 | Restored ${r.films} films. Reloading… |  |  |
| 213 | That file couldn't be read. |  |  |
| 225 | Account |  |  |
| 236 | How to play |  |  |
| 240 | Show me around |  |  |
| 252 | Tell us something |  |  |
| 256 | Start again |  |  |
| 279 | Add to home screen |  |  |
| 285 | Installed. That&rsquo;s why there&rsquo;s no address bar. |  |  |
| 290 | Share |  |  |
| 291 | Add to Home Screen |  |  |
| 295 | Install |  |  |
| 334 | Your films and stars are kept. Only the ranking goes. |  |  |
| 358 | are you sure? |  |  |
| 456 | Deleting |  |  |
| 456 | Delete it all |  |  |

**`components/SignInGate.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 66 | Sign in to continue |  |  |
| 81 | Taking you to Google… |  |  |
| 81 | Continue with Google |  |  |


## 09 · Errors and server messages the user can see

**`app/api/avatar/route.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 48 | Uploads aren't configured on this deployment. |  |  |
| 52 | Sign in to upload a picture. |  |  |
| 56 | That file type isn't supported. |  |  |
| 60 | Empty upload. |  |  |
| 62 | That picture is too large. |  |  |
| 107 | Couldn't be uploaded. Try again shortly. |  |  |

**`app/api/feedback/route.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 34 | now - t |  |  |
| 50 | Feedback isn't configured on this deployment. |  |  |
| 59 | Malformed request. |  |  |
| 63 | Nothing to send. |  |  |
| 65 | That message is too long to send. |  |  |
| 71 | Give it a moment before sending again. |  |  |
| 89 | Account: signed out |  |  |
| 96 | POST |  |  |
| 97 | Content-Type |  |  |
| 101 | Rankd <onboarding@resend.dev> |  |  |
| 103 | Rankd feedback${account ? |  |  |
| 113 | Couldn't be sent. Try again shortly. |  |  |

**`app/api/film/route.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 64 | Director |  |  |
| 65 | Screenplay |  |  |
| 65 | Writer |  |  |
| 65 | Story |  |  |
| 66 | Director of Photography |  |  |
| 67 | Original Music Composer |  |  |
| 67 | Music |  |  |
| 102 | TMDb detail failed |  |  |
| 121 | TMDb search failed |  |  |
| 128 | TMDb detail failed |  |  |
| 130 | TMDb request failed |  |  |

**`app/api/guard.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 44 | Not available from here |  |  |

**`app/api/library/route.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 21 | Not signed in |  |  |
| 37 | Not signed in |  |  |
| 43 | That request isn't valid JSON. |  |  |
| 94 | Not signed in |  |  |

**`app/api/lists/route.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 46 | Not signed in |  |  |
| 86 | Not signed in |  |  |
| 92 | That request isn't valid JSON. |  |  |
| 97 | That doesn't look like a set of saved lists. |  |  |
| 148 | Not signed in |  |  |
| 165 | No id given. |  |  |

**`app/api/person/route.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 63 | TMDb person search failed |  |  |
| 82 | TMDb credits failed |  |  |
| 90 | Director |  |  |
| 119 | TMDb request failed |  |  |

**`app/api/search/route.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 56 | TMDb search failed |  |  |
| 62 | Untitled |  |  |
| 74 | TMDb request failed |  |  |

**`app/api/stills/route.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 52 | TMDb search failed |  |  |
| 64 | TMDb images failed |  |  |
| 79 | TMDb request failed |  |  |

**`lib/account.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 41 | POST |  |  |

**`lib/backupFormat.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 166 | That doesn't look like a Rankd backup. |  |  |
| 177 | That backup has no library in it. |  |  |
| 183 | The library inside that backup is corrupt. |  |  |
| 186 | The library inside that backup is empty. |  |  |
| 196 | Some films in that backup are missing an id, rating or score. |  |  |
| 210 | The comparison log inside that backup is corrupt. |  |  |
| 216 | The comparison log inside that backup isn't in a format this version reads. |  |  |
| 237 | That file isn't valid JSON. |  |  |

**`lib/db/env.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 14 | connection string in production. |  |  |

**`lib/reset.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 100 | DELETE |  |  |
| 101 | DELETE |  |  |
| 106 | The account copy couldn't be deleted. |  |  |

**`lib/sync.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 167 | PUT |  |  |
| 212 | PUT |  |  |


## 10 · Share cards and insights

**`lib/card/canvas.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 63 | Impact, sans-serif |  |  |
| 64 | Georgia, serif |  |  |
| 285 | Couldn't encode the card |  |  |

**`lib/card/classic.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 230 | FILMS |  |  |
| 231 | AVG |  |  |
| 232 | GENRE |  |  |
| 233 | DECADE |  |  |
| 325 | Ranked head-to-head on Rankd |  |  |

**`lib/card/marquee.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 127 | FILMS RANKED |  |  |
| 170 | THE TOP THREE |  |  |
| 213 | AVERAGE |  |  |
| 216 | GENRE |  |  |
| 217 | DECADE |  |  |

**`lib/card/paulAllen.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 177 | FILMS |  |  |
| 178 | AVG |  |  |
| 179 | GENRE |  |  |
| 180 | DECADE |  |  |

**`lib/card/render.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 28 | Classic |  |  |
| 29 | Marquee |  |  |
| 30 | Paul Allen |  |  |
| 34 | Nothing to draw |  |  |
| 64 | Canvas is unavailable |  |  |

**`lib/insight.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 126 | You clearly favour the ${high.toLowerCase()} over the ${low.toLowerCase()}. |  |  |
| 136 | Your whole top three is ${top[0].toLowerCase()}. |  |  |
| 151 | You've seen ${watched} of ${possessiveName(subject)} ${n} films. |  |  |
| 168 | Mostly a ${print.decade.label} list. ${print.decade.count} of them. |  |  |
| 173 | You average ${print.generosity.mean.toFixed(1)}★ across ${possessive(subject)}. |  |  |
| 182 | Every one of these is ${starsFor(mine[0].rating!)}. The order was all you. |  |  |
| 193 | Your #1 here is only ${starsFor(first.rating)} in your library. |  |  |
| 199 | The film you rated highest only finished ${topRatedIndex + 1}th. |  |  |
| 216 | You put a film you haven't seen above ones you have. |  |  |
| 217 | You put ${above} films you haven't seen above ones you have. |  |  |
| 222 | Your #1 is a film you haven't even seen yet. |  |  |


## 11 · Everything else

**`app/layout.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 26 | A ranking game for serious film people. |  |  |

**`app/manifest.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 29 | A ranking game for serious film people. |  |  |

**`components/AppShell.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 865 | BottomNav |  |  |

**`components/ui.tsx`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 181 | Shuffle the order |  |  |
| 278 | Lowest rating to include |  |  |
| 291 | Highest rating to include |  |  |

**`lib/avatar.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 51 | Couldn't read that image. |  |  |
| 67 | Couldn't process that image. |  |  |
| 74 | POST |  |  |
| 75 | Content-Type |  |  |
| 79 | Couldn't be uploaded. |  |  |

**`lib/importCsv.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 124 | That zip has no ratings.csv in it. Open it and pick that file instead. |  |  |
| 132 | No rated films in that file. |  |  |

**`lib/ladder.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 147 | Need at least 2 films in range to start ranking |  |  |

**`lib/lists.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 128 | Untitled list |  |  |

**`lib/profile.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 45 | You |  |  |
| 234 | Oldest |  |  |
| 239 | Biggest year |  |  |
| 244 | Longest |  |  |
| 250 | Most argued over |  |  |
| 279 | The ${print.genre.name} films you rate highest. |  |  |
| 286 | Everything you own tagged ${top.subgenre.name}. |  |  |
| 293 | Their whole filmography in your library. |  |  |
| 301 | Your best of the decade you own most of. |  |  |

**`lib/subject.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 56 | Top 10 |  |  |
| 64 | Director |  |  |
| 66 | Actor |  |  |
| 68 | Genre |  |  |
| 70 | Tier |  |  |
| 74 | Your list |  |  |

**`lib/tmdbMatch.ts`**

| Line | Current text | Flag | Your note |
|---|---|---|---|
| 31 | NFD |  |  |

