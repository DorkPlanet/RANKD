"use client";

// Who can see you.
//
// ── Why this is a settings row and the handle was a wall ───────────────────
//
// `HandleGate` asks both questions once, because a name has to exist before
// anything social can and because being asked once is the whole bargain. But
// the ANSWER to "can people see this" is not a one-time decision the way a name
// is. People change their mind, and somebody who tapped "keep it private" on a
// screen they were trying to get past deserves a way back that is not "make
// another account".
//
// So the handle is permanent and this is not. Two separate switches, because
// they are two separate offers:
//
//   · The PROFILE is "here is what I made". A name, a picture, some counts.
//   · The TASTE half is "here is what Rankd worked out about me". Your top
//     films, who you rate highest, the shape of what you like.
//
// Somebody can reasonably want the first without the second, and folding them
// into one switch would force the more revealing answer on anybody who wanted
// the plainer one.

import { useState } from "react";

import { saveMe, type Me } from "@/lib/account";
import { SettingRow } from "./ui";
import { lex } from "@/lib/lexicon";

const ROW = "py-3";

/**
 * Where this profile actually is.
 *
 * Read off the document rather than written down. A literal was here first and
 * said `rankd.app`, which is a domain nobody owns: the deployment is a
 * vercel.app host today and could be anything tomorrow, and a settings panel
 * that confidently states the wrong address is worse than one that states none.
 *
 * Safe to read at render despite being a client component. This only ever mounts
 * inside an open Settings sheet, which is never true on the first paint, so
 * there is no server-rendered HTML for it to disagree with.
 */
function profileAddress(handle: string): string {
  if (typeof window === "undefined") return `/@${handle}`;
  return `${window.location.host}/@${handle}`;
}

export function Visibility({
  me,
  onMe,
}: {
  me: Me;
  /** Optimistic in `AppShell`. This only reports the intent. */
  onMe: (patch: Partial<Me>) => void;
}) {
  const [busy, setBusy] = useState<null | "profile" | "taste">(null);
  const [error, setError] = useState<string | null>(null);

  // Nothing to show yet. Reachable in the window before `/api/me` answers, and
  // on the offline path where it never does.
  if (!me.handle) return null;

  const isPublic = me.profileVisibility === "public";
  const tasteIsPublic = me.tasteVisibility === "public";

  const set = async (which: "profile" | "taste", next: boolean) => {
    setBusy(which);
    setError(null);
    const patch: Partial<Me> =
      which === "profile"
        ? {
            profileVisibility: next ? "public" : "private",
            // ── Turning the profile off turns the taste off with it ────────
            //
            // Not tidiness. Leaving `taste_visibility: public` on a hidden
            // profile stores a "yes" that nothing is currently honouring, and
            // the next time the profile is made public that stale yes takes
            // effect silently. Somebody hiding their profile is not agreeing to
            // anything about later.
            ...(next ? {} : { tasteVisibility: "private" as const }),
          }
        : { tasteVisibility: next ? "public" : "private" };

    onMe(patch);
    const result = await saveMe(patch);
    setBusy(null);
    if (!result.ok) setError(result.error);
  };

  return (
    <div>
      <SettingRow
        className={ROW}
        title="Anyone can find you"
        blurb={
          isPublic
            ? `Your profile is at ${profileAddress(me.handle)}.`
            : "Your profile is hidden. Nobody can open it, not even with the link."
        }
        on={isPublic}
        busy={busy !== null}
        onToggle={() => void set("profile", !isPublic)}
      />

      {/* Only once there is a profile for it to be part of. A switch for the
          contents of a page nobody can open is a question with no meaning. */}
      {isPublic && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <SettingRow
            className={ROW}
            title="Show what you like"
            blurb={
              tasteIsPublic
                ? `Your top ${lex().many}, who you rate highest, and the shape of your taste.`
                : "Just your name and your counts. The rest stays yours."
            }
            on={tasteIsPublic}
            busy={busy !== null}
            onToggle={() => void set("taste", !tasteIsPublic)}
          />
        </div>
      )}

      {error && <p className="mt-2 text-sub leading-snug text-danger">{error}</p>}
    </div>
  );
}
