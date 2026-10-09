"use client";

import { useState } from "react";

function Digit({ value, onChange, label, disabled }: { value: number; onChange: (n: number) => void; label: string; disabled?: boolean }) {
  const [bump, setBump] = useState(0);
  const set = (n: number) => {
    onChange(n);
    setBump((b) => b + 1);
  };
  return (
    <div className="digit">
      <button type="button" aria-label={`More goals for ${label}`} onClick={() => set(Math.min(value + 1, 9))} disabled={disabled || value >= 9}>
        +
      </button>
      <output key={bump} className={bump ? "bump" : undefined} aria-live="polite" aria-label={`${label} goals`}>
        {value}
      </output>
      <button type="button" aria-label={`Fewer goals for ${label}`} onClick={() => set(Math.max(value - 1, 0))} disabled={disabled || value <= 0}>
        −
      </button>
    </div>
  );
}

export function ScorePicker({
  home, away, homeTeam, awayTeam, onChange, disabled,
}: {
  home: number; away: number; homeTeam: string; awayTeam: string;
  onChange: (home: number, away: number) => void; disabled?: boolean;
}) {
  return (
    <div className="scoreboard">
      <Digit value={home} label={homeTeam} disabled={disabled} onChange={(h) => onChange(h, away)} />
      <span className="dash" aria-hidden>–</span>
      <Digit value={away} label={awayTeam} disabled={disabled} onChange={(a) => onChange(home, a)} />
    </div>
  );
}
