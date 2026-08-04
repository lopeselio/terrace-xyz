import { useEffect, useState } from "react";
import { serverNow } from "./useServerTime";
import { marketStateOf, tickPeriodFor, type MarketStateInfo, type MarketStateInput } from "../utils/marketState";

// ---------------------------------------------------------------------------
// The live view of utils/marketState — recomputes as the deadline approaches
// and passes, so a card flips COUNTER → RESOLVING → EXPIRED while the fan is
// looking at it, without the list re-rendering around it.
//
// The timer paces itself off the label it just produced: one second while a
// countdown is showing seconds, thirty while it's showing hours, none at all
// once the market is settled and nothing can change.
// ---------------------------------------------------------------------------

/**
 * One-shot read of the same rule, for filtering and counting lists where a
 * ticking subscription would be pointless. Not a hook — safe inside `filter`.
 */
export function isTakeable(market: MarketStateInput): boolean {
  return marketStateOf(market, serverNow()).takeable;
}

export function useMarketState(market: MarketStateInput): MarketStateInfo {
  const [info, setInfo] = useState(() => marketStateOf(market, serverNow()));

  const expiryMs = market.expiry ? market.expiry.getTime() : null;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const step = () => {
      if (cancelled) return;
      const next = marketStateOf(market, serverNow());
      // Hold the previous object when nothing a fan can see has changed, so a
      // card in a long list doesn't re-render once a second for no reason.
      setInfo((prev) =>
        prev.state === next.state &&
        prev.label === next.label &&
        prev.detail === next.detail &&
        prev.urgent === next.urgent &&
        prev.winner === next.winner
          ? prev
          : next,
      );
      const period = tickPeriodFor(next);
      if (period > 0) timer = setTimeout(step, period);
    };

    step();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market.status, expiryMs, market.outcome]);

  return info;
}
