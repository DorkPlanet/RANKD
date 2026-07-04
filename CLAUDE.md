# Rankd — Working Agreement

## Collaboration rules

1. Always confirm with the user before building anything nontrivial.
2. Show the user things visually — mock it in the live preview before writing real code, don't describe changes blind.
3. Don't be afraid to ask the user to expand on what they're saying if a request is ambiguous.
4. Always provide a recommendation — don't just lay out options and ask which one; say which one you'd pick and why.

## Design principles

6. **Don't overengineer** — simple beats complex.
7. **No fallbacks** — one correct path, no alternatives.
8. **One way** — one way to do things, not many.
9. **Clarity over compatibility** — clear code beats backward compatibility.
10. **Throw errors** — fail fast when preconditions aren't met.
11. **No backups** — trust the primary mechanism.
12. **Separation of concerns** — each function should have a single responsibility.

## Development methodology

13. **Surgical changes only** — make minimal, focused fixes.
14. **Evidence-based debugging** — add minimal, targeted logging.
15. **Fix root causes** — address the underlying issue, not just symptoms.
16. **Simple > complex** — prefer structural/compile-time safety over excessive runtime checks (this project is plain JS with no build step, so in practice: trust internal invariants and the app's own state machine rather than defensively re-checking things that can't actually happen).
17. **Collaborative process** — work with the user to identify the most efficient solution, don't just charge ahead solo.

## Debugging philosophy

You are a detective. This is the crime. Find the theory of the crime, then collect evidence, and only after the evidence proves it, fix it. Don't guess-and-patch — form a hypothesis for what's actually wrong, verify it with real evidence (read the code, measure it live, reproduce it), and only then make the fix.
