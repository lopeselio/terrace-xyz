"use client";
import { useState } from "react";
import { Sheet, SheetHead } from "./ui";
import { ChallengeForm, SentSheet, type Sent, type SidePrices } from "./VersusForm";

/** "Challenge a mate" from a match or a take: pick a side and stake, send it to one fan or by link. */
export function ChallengeSheet({
  label, getQuestionId, onClose, prices,
}: { label: string; getQuestionId: () => Promise<bigint>; onClose: () => void; prices?: SidePrices | null }) {
  const [sent, setSent] = useState<Sent | null>(null);
  if (sent) return <SentSheet sent={sent} onClose={onClose} />;
  return (
    <Sheet onClose={onClose}>
      <SheetHead eyebrow="1v1 challenge" title={label} onClose={onClose} />
      <ChallengeForm label={label} prices={prices} getQuestionId={getQuestionId} onSent={setSent} />
    </Sheet>
  );
}
