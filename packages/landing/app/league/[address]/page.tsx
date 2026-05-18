"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function LeagueInvitePage() {
  const params = useParams();
  const address = typeof params.address === "string" ? params.address : "";
  const deepLink = `terrace://league/${address}`;

  const [copied, setCopied] = useState(false);
  const [launched, setLaunched] = useState(false);

  useEffect(() => {
    if (!address) return;
    // Attempt to open the Terrace app via deep link
    window.location.href = deepLink;
    const timer = setTimeout(() => setLaunched(true), 1500);
    return () => clearTimeout(timer);
  }, [address, deepLink]);

  const handleCopy = () => {
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleOpen = () => {
    window.location.href = deepLink;
  };

  return (
    <main className="min-h-screen bg-[#080808] text-white flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <p className="text-[#22c55e] text-sm font-semibold tracking-widest uppercase mb-2 text-center">
          Terrace
        </p>
        <h1 className="text-2xl font-bold text-center mb-2">League Invite</h1>
        <p className="text-[#6b7280] text-sm text-center mb-8">
          You've been invited to join a league on Terrace — on‑chain football predictions.
        </p>

        {/* League address card */}
        <div className="bg-[#111] border border-[#1f1f1f] rounded-xl p-4 mb-6">
          <p className="text-[10px] font-semibold text-[#4b5563] uppercase tracking-widest mb-1">
            League address
          </p>
          <p className="text-xs text-[#9ca3af] font-mono break-all leading-5">{address}</p>
        </div>

        {/* Primary CTA */}
        <button
          onClick={handleOpen}
          className="w-full bg-[#22c55e] hover:bg-[#16a34a] text-white font-bold text-base py-4 rounded-xl mb-3 transition-colors"
        >
          Open in Terrace app
        </button>

        {/* Copy address fallback */}
        <button
          onClick={handleCopy}
          className="w-full bg-[#111] border border-[#2a2a2a] hover:border-[#374151] text-[#9ca3af] font-semibold text-sm py-3 rounded-xl transition-colors"
        >
          {copied ? "Copied!" : "Copy league address"}
        </button>

        {launched && (
          <p className="text-[#4b5563] text-xs text-center mt-6">
            App not opening?{" "}
            <a
              href="https://x.com/terracedotsol"
              className="text-[#22c55e] underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Download Terrace
            </a>
          </p>
        )}
      </div>
    </main>
  );
}
