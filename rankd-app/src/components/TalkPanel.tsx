"use client";

// Your conversations, and one of them open.
//
// The private half of TAKES. The public half is placements and agreement, which
// is cheap and happens in volume; this is where anything actually gets said.
// Two people, one film, mutual follows only — see `social/threads.ts` for why
// that shape rather than a public wall or a review.

import { useEffect, useRef, useState } from "react";

import { MESSAGE_MAX, shortAgo } from "@/lib/social/feed";
import type { ThreadMessageItem, ThreadSummary } from "@/lib/social/threads";
import { FIELD } from "./ui";
import { lex } from "@/lib/lexicon";

function Conversation({
  thread,
  onBack,
}: {
  thread: ThreadSummary;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<ThreadMessageItem[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = thread.meta as { title?: string; year?: string; poster?: string };

  useEffect(() => {
    let dead = false;
    void (async () => {
      try {
        const res = await fetch(`/api/threads/${thread.id}`, { cache: "no-store" });
        if (dead) return;
        setMessages(res.ok ? ((await res.json()) as { messages: ThreadMessageItem[] }).messages : []);
      } catch {
        if (!dead) setMessages([]);
      }
    })();
    return () => {
      dead = true;
    };
  }, [thread.id]);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/threads/${thread.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const json = (await res.json()) as { message?: ThreadMessageItem; error?: string };
      if (!res.ok || !json.message) {
        setError(json.error ?? "That didn't send.");
        return;
      }
      setMessages((m) => [...(m ?? []), json.message!]);
      setDraft("");
    } catch {
      setError("You look offline.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-5">
      <button
        onClick={onBack}
        className="mt-3 text-label font-bold tracking-[0.14em] text-dim active:opacity-70"
      >
        ‹ ALL
      </button>

      {/* The film is the subject, so it stays on screen while you argue about
          it. A conversation with no visible subject reads as a chat window. */}
      <div className="mt-3 flex items-center gap-3">
        {meta.poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={meta.poster} alt="" aria-hidden className="h-14 w-10 rounded object-cover" />
        )}
        <div className="min-w-0">
          <div className="truncate text-body font-semibold text-text-hi">{meta.title ?? `A ${lex().one}`}</div>
          <div className="text-sub text-dim">
            with{" "}
            <a href={`/@${thread.withHandle}`} className="active:opacity-70">
              {thread.withHandle}
            </a>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        {messages === null ? (
          <p className="text-sub text-dim">Looking&hellip;</p>
        ) : messages.length === 0 ? (
          <p className="text-sub leading-snug text-dim">Nothing said yet. Go on.</p>
        ) : (
          messages.map((m) => (
            // Yours sit right, theirs left — the one convention in messaging
            // worth keeping, because it lets you read a thread without checking
            // a name on every line.
            <div key={m.id} className={m.mine ? "flex justify-end" : "flex justify-start"}>
              <div
                className="max-w-[80%] rounded-2xl px-3 py-2"
                style={{
                  background: m.mine ? "var(--gold)" : "var(--surface)",
                  color: m.mine ? "var(--bg)" : "var(--text)",
                }}
              >
                <p className="text-sub leading-snug">{m.body}</p>
                <p
                  className="mt-1 text-label"
                  style={{ opacity: 0.6, color: m.mine ? "var(--bg)" : "var(--dim)" }}
                >
                  {shortAgo(m.createdAt)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex items-end gap-2 pb-4">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MESSAGE_MAX))}
          rows={1}
          placeholder="Say something"
          className={`${FIELD} min-h-[38px] flex-1 resize-none`}
        />
        <button
          onClick={() => void send()}
          disabled={busy || draft.trim().length === 0}
          className="mb-[3px] flex-shrink-0 rounded-full px-3 py-1.5 text-label font-bold tracking-[0.14em] text-gold disabled:opacity-40"
          style={{ background: "var(--wash)" }}
        >
          SEND
        </button>
      </div>
      {error && <p className="pb-4 text-sub leading-snug text-danger">{error}</p>}
    </div>
  );
}

export function TalkPanel({ openId, onOpen }: { openId: string | null; onOpen: (id: string | null) => void }) {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  // Bumped when a conversation is left, so the list re-reads and the preview
  // under it is the line that was just sent rather than the one before it.
  const seen = useRef(0);

  useEffect(() => {
    let dead = false;
    void (async () => {
      try {
        const res = await fetch("/api/threads", { cache: "no-store" });
        if (dead) return;
        setThreads(res.ok ? ((await res.json()) as { threads: ThreadSummary[] }).threads : []);
      } catch {
        if (!dead) setThreads([]);
      }
    })();
    return () => {
      dead = true;
    };
  }, [openId]);

  const open = threads?.find((t) => t.id === openId);
  if (openId && open) {
    return (
      <Conversation
        thread={open}
        onBack={() => {
          seen.current++;
          onOpen(null);
        }}
      />
    );
  }

  return (
    <div className="px-5">
      {threads === null ? (
        <p className="mt-16 text-center text-sub text-dim">Looking&hellip;</p>
      ) : threads.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-sub leading-relaxed text-dim">No conversations yet.</p>
          {/* Says exactly where one starts, because it is not obvious and the
              answer is a good one: the disagreement is already on the card. */}
          <p className="mt-2 text-sub leading-relaxed text-dim">
            Find somebody who has a film somewhere you don&rsquo;t, and tell them.
          </p>
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {threads.map((t) => {
            const meta = t.meta as { title?: string; poster?: string };
            return (
              <button
                key={t.id}
                onClick={() => onOpen(t.id)}
                className="flex w-full items-center gap-3.5 py-3.5 text-left active:opacity-70"
              >
                {meta.poster ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={meta.poster}
                    alt=""
                    aria-hidden
                    className="h-[56px] w-[38px] flex-shrink-0 rounded object-cover"
                  />
                ) : (
                  <div
                    aria-hidden
                    className="h-[56px] w-[38px] flex-shrink-0 rounded"
                    style={{ background: "var(--surface)" }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body font-semibold text-text-hi">
                    {meta.title ?? `A ${lex().one}`}
                  </div>
                  <div className="text-sub text-dim">
                    {t.withHandle} · {shortAgo(t.lastAt)}
                  </div>
                  {t.latest && (
                    <div className="mt-0.5 truncate text-sub text-dim">
                      {t.latest.mine ? "You: " : ""}
                      {t.latest.body}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
