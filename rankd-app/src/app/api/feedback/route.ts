// Getting hold of a human, from inside the app.
//
// An endpoint rather than a `mailto:` link, which would throw the user out to a
// mail client with an empty draft to address, write and remember to send. The
// report worth having is the one written in the ten seconds after something went
// wrong, and every context switch in that window loses some of them.
//
// The cost is a public endpoint, handled below rather than ignored.

import { getSession } from "@/lib/auth";

/** Longer than any real report, short enough that nobody can post a payload. */
const MAX_MESSAGE = 4000;
/** Enough to identify a build and a device; never anything about the films. */
const MAX_DIAGNOSTICS = 1200;

/**
 * Best-effort throttle, and deliberately described as no more than that.
 *
 * This map lives in one serverless instance's memory. Vercel may run several and
 * will discard them between cold starts, so it is not a rate limiter in any
 * meaningful sense — it stops one person's stuck retry loop from sending forty
 * emails, and it stops nothing else. Real abuse protection would be a shared
 * store or a captcha, and neither is worth adding for a handful of testers.
 *
 * Written down so the next person does not mistake this for security.
 */
const seen = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 3;

function throttled(key: string): boolean {
  const now = Date.now();
  const hits = (seen.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  seen.set(key, hits);
  // Unbounded growth is the one thing an in-memory map must not do.
  if (seen.size > 500) for (const [k, v] of seen) if (v.every((t) => now - t > WINDOW_MS)) seen.delete(k);
  return hits.length > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  const to = process.env.SUPPORT_EMAIL;
  const key = process.env.RESEND_API_KEY;
  // Answered as a real failure rather than a silent success. A form that says
  // "sent" into a void is worse than one that admits it is not configured — the
  // user would stop reporting things and never learn nothing arrived.
  if (!to || !key) {
    return Response.json(
      { error: "Feedback is not configured on this deployment." },
      { status: 503 },
    );
  }

  let body: { message?: unknown; diagnostics?: unknown; replyTo?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return Response.json({ error: "Nothing to send." }, { status: 400 });
  if (message.length > MAX_MESSAGE) {
    return Response.json({ error: "That message is too long to send." }, { status: 413 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  if (throttled(ip)) {
    return Response.json({ error: "Give it a moment before sending again." }, { status: 429 });
  }

  // Who to write back to. The SESSION is trusted for this and the client is not:
  // a `replyTo` posted from the browser is whatever the sender typed, so using it
  // as the reply address would let this endpoint be used to put someone else's
  // address on mail that came from here. Signed in, we know the address for
  // certain; signed out, there simply is no reply address and the body says so.
  const session = await getSession().catch(() => null);
  const account = session?.user?.email ?? null;

  const diagnostics =
    typeof body.diagnostics === "string" ? body.diagnostics.slice(0, MAX_DIAGNOSTICS) : "";

  const text = [
    message,
    "",
    "—",
    account ? `Account: ${account}` : "Account: signed out",
    diagnostics && `\n${diagnostics}`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      // Resend will only accept a `from` on a domain you have verified. Until
      // there is one, its shared sender works and needs no DNS at all.
      from: process.env.SUPPORT_FROM || "Rankd <onboarding@resend.dev>",
      to: [to],
      subject: `Rankd feedback${account ? ` from ${account}` : ""}`,
      text,
      ...(account ? { reply_to: account } : {}),
    }),
  });

  if (!res.ok) {
    // The provider's own message is not shown to the user — it can name the
    // account and the sending domain — but it is worth having in the log.
    console.error("feedback: resend rejected", res.status, await res.text().catch(() => ""));
    return Response.json({ error: "That could not be sent. Try again shortly." }, { status: 502 });
  }

  return Response.json({ ok: true });
}
