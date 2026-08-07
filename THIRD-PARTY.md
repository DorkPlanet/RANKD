# Third-party code

## Nth — MIT

Rankd's Bayesian ranking model is ported from **Nth**, a pairwise film-ranking app by
James Cameron. It is MIT licensed, and the notice below is reproduced as that licence
requires.

**What was taken**

| Rankd file | From | How much |
|---|---|---|
| `rankd-app/src/lib/bayes.ts` | `lib/ranking/bayes.ts` | The maths near-verbatim: `updateDecisive`, `updateDraw`, `fitBeliefs`, `confidenceFromSpread` and the tunables. Commentary rewritten for rankd. |
| `rankd-app/src/lib/matchmaker.ts` | `lib/ranking/matchmaker.ts` | The Auto selection strategy — least-settled anchor against its nearest-scored opponent, the repetition guard, the long-range exploration term, and the fallback-past-guard that stops it deadlocking. Rewritten as a pure function over the local library rather than a database query, with rankd's scope options added and Nth's likes/favourites biasing dropped. |

The maths was deliberately kept as close to the original as possible. It is a proven
implementation with a real test suite behind it, and silently "improving" a Gaussian
posterior update is how you end up with a ranking that looks fine and is wrong.

Rankd's own placement mechanics — the King of the Hill climb, the Spotlight binary search,
confirm-to-commit, tier bands, promotion — are not from Nth and work quite differently.
Nth's model is advisory here; it never moves a placement the user made.

---

MIT License

Copyright (c) 2026 James Cameron

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR OTHER DEALINGS IN THE SOFTWARE,
OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
