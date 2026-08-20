# Rankd — how the app talks

The standard for every word a user reads. Written 20 Aug 2026, from the user's own copy
and his own corrections, not from a style opinion.

`COPY.md` is the inventory of what exists. This is the rule it gets measured against.

---

## The one idea

**Explain less. Recognise more.**

Flickchart's front page has beaten Rankd's entire app with one sentence for years:

> If they're all 5-star movies… Which one's the best?

It teaches nothing. It hands the reader a question they already ask themselves. Rankd's
old line was *"Your films, in the order you actually like them"* — well written, and the
company describing the product.

Before writing anything, ask which mode it is in. Most screens need less teaching than
they currently do.

---

## The rules

**1. Contractions, by default.**
Couldn't, isn't, don't, there's, it's, you'll. Use the full form only when the emphasis
*is* the point: the tour title "UN-RNKD **is not** unrated" keeps it, because "isn't"
flattens the whole step.

**2. No em dashes.** A full stop or a comma. This one is not negotiable and
`test/tour.test.ts` guards the tour steps.

**3. Never invent a number.**
"A tier of 100 films is 4,950 duels" stays, because it is arithmetic anyone can check.
"Rough Cut is 100 taps, about two minutes" was cut, because Split again means more than
one pass and 100 decisions is not two minutes. **If you name a figure, be able to show
where it comes from.**

**4. A claim about the screen must be checked against the screen.**
The list tour said the rank number was on the **left** for as long as it existed. It
renders last in the row, so it is on the right. Nobody had looked.

**5. Cut the sentence that justifies the sentence before it.**
> This counts down as you go. ~~A big tier takes a few minutes at one a second.~~
> Tap the pile this film belongs in. ~~Once it's in smaller piles you finally get to
> decide where your taste lies.~~

**6. Let the lengths differ, and don't overcorrect into clipped fragments.**
"One tier at a time. Winner moves on." is a complete mode description. The Fast Shuffle
blurb beside it is four sentences and needs to be. That contrast is the point.

Every block landing at 25 to 45 words reads as generated. **So does every block landing
at three.** Length should follow what the line is doing: a label is short, an idea that
genuinely needs explaining gets the room to explain itself. Conversational does not mean
terse. Aim for how you would actually say it out loud, which is sometimes a fragment and
sometimes a proper sentence with a clause in it.

**7. Ask rather than assert**, where the reader already holds the question.
> Everyone has a favourite. What's yours?

**8. Name the feeling when there is one.**
> Large libraries can be daunting. Start dividing them into smaller groups.

**9. Second person, present tense, plain verbs.** No Title Case. No marketing adjectives.

**10. A preference, never a verdict.**
"Which you'd rather watch", never "which is better". This is tested, and it is the one
place Rankd's copy already beats every competitor. It survives everything else on this
page.

**11. Don't say what the screen is already showing.**
The Rough Cut coach mark pointing at the RNK cell does not need to end "It's under RNK".
The spotlight is doing it.

---

## The seven tells

The problem was never bad sentences. It was **uniformity**. Watch for:

| | Tell | Example that was cut |
|---|---|---|
| 1 | **Antithesis, repeated** — deny one thing to affirm another, over and over | four of them in one tour |
| 2 | Every block the same length | every tour body, 25 to 45 words |
| 3 | Instructions justifying themselves | "which is the point of doing it this way" |
| 4 | Fragment-for-emphasis as a beat | "No duels." "Tap it." "It lives under RNK." |
| 5 | Balanced numeric mirrors | "4,950 duels, which is hours. 100 taps, which is two minutes." |
| 6 | Nothing plain, funny or throwaway | the relentless quality is itself the tell |
| 7 | **Explaining, never recognising** | the root of the other six |

**Tell 1 is about repetition, not the construction.** The user's call, and he is right:
*"Not which is better, but which you prefer"* is good copy and it stays on the duel
screen. What was wrong was four of them in one tour, each running long. A person writing
on four different days would not reach for the same shape four times. **Use it once, keep
it short, then find another way to say the next thing.**

---

## Three tests for a line

1. **Would you say it out loud to someone?** If not, it is written, not spoken.
2. **Does it teach something the screen isn't already showing?** If not, cut it.
3. **Is every number and direction in it true?** Two shipped lines failed this.

---

## Worked examples

| Before | After |
|---|---|
| Your films, in the order you actually like them. | Everyone has a favourite. What's yours? |
| Deal a whole tier into three piles — upper, middle, lower. No duels. Makes ranking it afterwards a fraction of the work. | Large libraries can be daunting. Start dividing them into smaller groups, then compare from there. |
| Rank a whole tier. Each winner keeps climbing until something beats it. | One tier at a time. Winner moves on. |
| A director, an actor or a genre — just for the list and the picture. Changes nothing in your rankings. | A director, an actor or genre. Everyone has their favourite. Your rankings don't move. |
| Not which film is better, but which you'd rather watch. Tap it. | Not which is better, but which you'd rather watch. Tap it. |
| That could not be uploaded. | Couldn't be uploaded. |
| Once it's in smaller piles you finally get to decide where your taste lies. Tap the pile this film belongs in, and the count above it goes up. | Tap the pile this film belongs in. The count above it goes up. |

---

## Before changing a string

**Copy is asserted in tests.** `test/tour.test.ts` alone checks for em dashes, for the
flick step naming top and bottom, and for it saying no duel is recorded. Run the suite.

**When a test breaks on wording, read its name before you revert.** The flick test is
called *"says where a flicked card lands, and that it records nothing"*, so the intent is
the meaning. The assertion was loosened, not the copy restored.

**An apostrophe in raw JSX text needs `&rsquo;`.** Inside a string literal it is fine.
Getting this wrong adds a lint error, and the baseline is 2 (both `AppShell`
set-state-in-effect) and must stay there.

**Developer-facing errors are exempt from all of this.** `TMDB_API_KEY is not set` and
`DATABASE_URL is not set` are read by whoever is deploying, not by a user.
