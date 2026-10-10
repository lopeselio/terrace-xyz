// Terrace icon set (24px grid, 1.75 stroke, currentColor), ported from the Solana app's Icon.tsx.
export const ICON_PATHS = {
  home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  pitch: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M3 9h3v6H3M21 9h-3v6h3"/><circle cx="12" cy="12" r="2.6"/>',
  cards: '<rect x="3.4" y="6" width="12" height="14" rx="2.4" transform="rotate(-8 9.4 13)"/><rect x="9" y="4.6" width="12" height="14" rx="2.4" transform="rotate(8 15 11.6)"/>',
  list: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 20c0-3.1 2.7-5.2 6-5.2s6 2.1 6 5.2"/><path d="M16.5 6.2a3 3 0 0 1 0 5.6M18 20c0-2.3-.9-3.9-2.3-4.9"/>',
  trophy: '<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 5.5H4.5a3.5 3.5 0 0 0 3.5 3.5M17 5.5h2.5A3.5 3.5 0 0 1 16 9"/><path d="M12 13v3M8.5 20h7M10 16h4l.7 4h-5.4z"/>',
  search: '<circle cx="11" cy="11" r="6.2"/><path d="m15.6 15.6 4 4"/>',
  bell: '<path d="M18 15V10a6 6 0 1 0-12 0v5l-1.6 2.4h15.2z"/><path d="M9.8 20.2a2.4 2.4 0 0 0 4.4 0"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.6V12l3 2"/>',
  bolt: '<path d="M13.4 3 6 13.4h4.6L10 21l7.4-10.4h-4.6z"/>',
  flame: '<path d="M12 21c3.5 0 6-2.3 6-5.6 0-4.3-4-5.9-4-9.4-2.2 1-3.3 3-3.3 5 0 1.4-.9 2.1-1.7 2.1-1 0-1.6-.8-1.7-2C6 12.4 6 13.8 6 15.4 6 18.7 8.5 21 12 21z"/>',
  chevronRight: '<path d="m9.5 6 6 6-6 6"/>',
  chevronLeft: '<path d="m14.5 6-6 6 6 6"/>',
  chevronDown: '<path d="m6 9.5 6 6 6-6"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  check: '<path d="m5 12.8 4.5 4.4L19 6.6"/>',
  arrowDown: '<path d="M12 5v14M6.5 13.5 12 19l5.5-5.5"/>',
  arrowUpRight: '<path d="M7 17 17 7M9 7h8v8"/>',
  info: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5.2M12 8.2v.2"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.4"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  wallet: '<rect x="3.5" y="6" width="17" height="12.5" rx="2.6"/><path d="M3.5 10h17M16.5 14.2h.2"/>',
  share: '<path d="M12 15V4M8 7.6 12 3.6l4 4"/><path d="M5 13v6.4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V13"/>',
  shield: '<path d="M12 3.5 19 6v6c0 4.2-3 7-7 8.5-4-1.5-7-4.3-7-8.5V6z"/>',
  chart: '<path d="M4 20h16"/><path d="M7 20v-6M12 20V6M17 20v-9"/>',
  ball: '<circle cx="12" cy="12" r="8.2"/><path d="m12 8.2 3.1 2.3-1.2 3.7h-3.8L8.9 10.5z"/><path d="M12 3.8v4.4M19.8 10.4l-4.7.1M17.2 19l-3.3-3.1M6.8 19l3.3-3.1M4.2 10.4l4.7.1"/>',
  whistle: '<circle cx="9" cy="14" r="5.4"/><path d="M13.4 11.2 20 8.4V5.2l-8.4 3.4"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4.5V10h-5.4"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2.2"/><path d="M15 6.5A2.5 2.5 0 0 0 12.5 4H6.5A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15"/>',
  eye: '<path d="M2.8 12S6.4 6.4 12 6.4 21.2 12 21.2 12 17.6 17.6 12 17.6 2.8 12 2.8 12"/><circle cx="12" cy="12" r="2.8"/>',
  swords: '<path d="M4 4h3.2l9 9-2.6 2.6-9-9z"/><path d="M20 4h-3.2l-9 9 2.6 2.6"/><path d="M3.2 18.4 6 21.2M20.8 18.4 18 21.2"/>',
  hourglass: '<path d="M7 3.5h10M7 20.5h10"/><path d="M8 3.5v3.2c0 2 4 3.8 4 5.3s-4 3.3-4 5.3v3.2M16 3.5v3.2c0 2-4 3.8-4 5.3s4 3.3 4 5.3v3.2"/>',
  dollar: '<path d="M12 3.8v16.4"/><path d="M16 7.5c0-1.7-1.8-2.6-4-2.6s-4 .9-4 2.9 2 2.6 4 3 4 1 4 3-1.8 2.9-4 2.9-4-.9-4-2.6"/>',
  minus: '<path d="M6 12h12"/>',
  crown: '<path d="M4 17.5 5.2 7l4 4L12 5l2.8 6 4-4 1.2 10.5z"/><path d="M4 20h16"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="15" rx="2.4"/><path d="M4 10h16M9 3.5v4M15 3.5v4"/>',
  sliders: '<path d="M5 7h14M5 12h14M5 17h14"/><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="11" cy="17" r="2" fill="currentColor" stroke="none"/>',
  logout: '<path d="M15 5.5h3.5a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="M11 8 7 12l4 4M7 12h9"/>',
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function Icon({ name, size = 20, strokeWidth }: { name: IconName; size?: number; strokeWidth?: number }) {
  const sw = strokeWidth ?? (size <= 14 ? 2 : 1.75);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}
