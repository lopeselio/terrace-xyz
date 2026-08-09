import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Is this question settleable? (TODO Sprint 12 #6)
//
// A market whose wording can't be checked against the final score is a dispute
// waiting to happen, and the creator finds out at settlement time — after other
// people have money on it. Asking a model at creation time is far cheaper than
// arbitrating afterwards.
//
// Advisory, never blocking. A creator who wants to publish "Arteta to regret
// his team talk" still can: it's their market, and a validator that vetoes is a
// validator people route around. The badge tells them what they're signing up
// for, and the rewrites make the better version one tap away.
//
// The call goes through the notifications worker, which holds the Gemini key
// — an EXPO_PUBLIC_ key is a key every install carries. With no worker
// configured the hook stays idle and Create behaves exactly as it did before.
// ---------------------------------------------------------------------------

const WORKER_URL = process.env.EXPO_PUBLIC_WORKER_URL ?? "https://terrace-notifications.terrace-xyz.workers.dev";

/** Wait for a pause in typing — mid-word drafts aren't worth judging. */
const DEBOUNCE_MS = 900;

/** Below this a question is still being typed, not written. */
const MIN_LENGTH = 8;

export type Verdict = "verifiable" | "ambiguous" | "unverifiable";

export interface Validation {
  verdict: Verdict;
  reason: string;
  /** Complete replacement questions, ready to tap. Empty when verifiable. */
  suggestions: string[];
}

export interface ValidatorState {
  validation: Validation | null;
  loading: boolean;
  /** Set when the validator couldn't be reached. Rendered as nothing, not as an error. */
  unavailable: boolean;
}

export function useStatementValidator(question: string): ValidatorState {
  const [state, setState] = useState<ValidatorState>({
    validation: null,
    loading: false,
    unavailable: false,
  });

  // Keyed by the exact text so a user flipping between two drafts doesn't
  // re-ask, and so a late response for an old draft can be discarded.
  const cache = useRef(new Map<string, Validation>());
  const latest = useRef("");

  useEffect(() => {
    const trimmed = question.trim();
    latest.current = trimmed;

    if (trimmed.length < MIN_LENGTH) {
      setState({ validation: null, loading: false, unavailable: false });
      return;
    }

    const cached = cache.current.get(trimmed);
    if (cached) {
      setState({ validation: cached, loading: false, unavailable: false });
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${WORKER_URL}/validate-market`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed }),
        });
        // 503 (no key) and 429 (budget) are both "no opinion available" —
        // the creator shouldn't see an error for a feature that's advisory.
        if (!res.ok) {
          if (latest.current === trimmed) {
            setState({ validation: null, loading: false, unavailable: true });
          }
          return;
        }
        const validation = (await res.json()) as Validation;
        cache.current.set(trimmed, validation);
        // Drop the answer if the draft moved on while we were waiting.
        if (latest.current === trimmed) {
          setState({ validation, loading: false, unavailable: false });
        }
      } catch {
        if (latest.current === trimmed) {
          setState({ validation: null, loading: false, unavailable: true });
        }
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [question]);

  return state;
}
