import React from "react";
import { View, Text, Pressable, StyleSheet, type ViewStyle, type StyleProp } from "react-native";
import { color as C, font, radius } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";

// ---------------------------------------------------------------------------
// Redesign primitives — odds button, badge, chip, CTA, avatar, crest, card,
// section head. Mirror styles.css. Built on tokens + Barlow + the icon set.
// ---------------------------------------------------------------------------

// --- Odds button (the core control) ----------------------------------------

type OddsTone = "neutral" | "yes" | "no";
export function OddsButton({
  label,
  value,
  tone = "neutral",
  selected,
  disabled,
  onPress,
  style,
}: {
  label: string;
  value: string; // fractional odds, e.g. "7/2"
  tone?: OddsTone;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const toneStyle =
    tone === "yes" ? o.yes : tone === "no" ? o.no : null;
  const onStyle = selected ? (tone === "no" ? o.onNo : o.on) : null;
  const valColor = disabled
    ? C.ink4
    : selected
      ? (tone === "no" ? C.red : C.green)
      : tone === "yes"
        ? C.greenInk
        : tone === "no"
          ? C.redInk
          : C.ink;
  const lblColor = selected ? (tone === "no" ? C.red : C.green) : tone === "yes" ? C.greenInk : tone === "no" ? C.redInk : C.ink3;
  return (
    <Pressable style={[o.odd, toneStyle, onStyle, disabled && o.disabled, style]} onPress={disabled ? undefined : onPress}>
      <Text style={[o.lbl, { color: lblColor }]}>{label.toUpperCase()}</Text>
      <Text style={[o.val, { color: valColor }]}>{value}</Text>
    </Pressable>
  );
}

const o = StyleSheet.create({
  odd: { flex: 1, backgroundColor: C.deep, borderWidth: 1, borderColor: C.lineSoft, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 6, minHeight: 52, alignItems: "center", justifyContent: "center", gap: 2 },
  yes: { backgroundColor: "#0c1f14", borderColor: "#17422a" },
  no: { backgroundColor: "#1d0d0d", borderColor: "#452020" },
  on: { backgroundColor: C.greenDeep, borderColor: C.green },
  onNo: { backgroundColor: C.redDeep, borderColor: C.red },
  disabled: { opacity: 0.35 },
  lbl: { fontFamily: font.sansSemi, fontSize: 10, fontWeight: "600", letterSpacing: 0.5 },
  val: { fontFamily: font.condBold, fontSize: 19, fontWeight: "700", letterSpacing: 0.3, lineHeight: 20 },
});

// --- Badge -----------------------------------------------------------------

export type BadgeTone = "live" | "min" | "open" | "flash" | "private" | "settled" | "terrace" | "poly" | "won" | "lost" | "amber";
const BADGE: Record<BadgeTone, { bg: string; fg: string; border?: string }> = {
  live: { bg: C.red, fg: "#fff" },
  min: { bg: C.redMid, fg: C.redInk },
  open: { bg: C.greenDeep, fg: C.greenInk },
  flash: { bg: C.amberDeep, fg: C.amberInk },
  private: { bg: C.violetDeep, fg: C.violetInk },
  settled: { bg: C.raised, fg: C.ink3, border: C.line },
  terrace: { bg: C.greenDeep, fg: C.greenInk },
  poly: { bg: C.blueDeep, fg: C.blue },
  won: { bg: C.greenDeep, fg: C.greenInk },
  lost: { bg: C.redMid, fg: C.redInk },
  amber: { bg: C.amberDeep, fg: C.amberInk },
};
export function Badge({ tone, label, icon }: { tone: BadgeTone; label: string; icon?: IconName }) {
  const b = BADGE[tone];
  return (
    <View style={[bd.badge, { backgroundColor: b.bg, borderWidth: b.border ? 1 : 0, borderColor: b.border }]}>
      {tone === "live" && <View style={bd.livedot} />}
      {icon && <Icon name={icon} size={11} color={b.fg} />}
      <Text style={[bd.txt, { color: b.fg }]}>{label}</Text>
    </View>
  );
}
const bd = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.xs, alignSelf: "flex-start" },
  txt: { fontFamily: font.sansBold, fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  livedot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
});

// --- Chip ------------------------------------------------------------------

export function Chip({ label, active, count, onPress, icon }: { label: string; active?: boolean; count?: number; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable style={[ch.chip, active && ch.on]} onPress={onPress}>
      {icon && <Icon name={icon} size={14} color={active ? C.green : C.ink2} />}
      <Text style={[ch.txt, active && ch.txtOn]}>{label}</Text>
      {count != null && <Text style={ch.ct}>{count}</Text>}
    </Pressable>
  );
}
const ch = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 5, height: 32, paddingHorizontal: 13, borderRadius: radius.pill, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line },
  on: { backgroundColor: C.greenDeep, borderColor: C.green },
  txt: { fontFamily: font.sansSemi, fontSize: 12.5, fontWeight: "600", color: C.ink2 },
  txtOn: { color: C.green },
  ct: { fontFamily: font.sansSemi, fontSize: 11, color: C.ink4, fontWeight: "600" },
});

// --- CTA -------------------------------------------------------------------

export function CTA({ label, onPress, ghost, small, disabled, icon }: { label: string; onPress?: () => void; ghost?: boolean; small?: boolean; disabled?: boolean; icon?: IconName }) {
  return (
    <Pressable style={[ct.cta, small && ct.sm, ghost && ct.ghost, disabled && ct.disabled]} onPress={disabled ? undefined : onPress}>
      {icon && <Icon name={icon} size={16} color={ghost ? C.ink : C.onGreen} />}
      <Text style={[ct.txt, ghost && ct.txtGhost, disabled && ct.txtDisabled]}>{label}</Text>
    </Pressable>
  );
}
const ct = StyleSheet.create({
  cta: { height: 52, borderRadius: radius.md, backgroundColor: C.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  sm: { height: 44, borderRadius: 12 },
  ghost: { backgroundColor: C.raised, borderWidth: 1, borderColor: C.line },
  disabled: { backgroundColor: "#1c2a20" },
  txt: { fontFamily: font.sansBold, fontSize: 15, fontWeight: "700", color: C.onGreen, letterSpacing: 0.2 },
  txtGhost: { color: C.ink },
  txtDisabled: { color: "#4b6354" },
});

// --- Avatar (monogram, deterministic colour — never a base58 address) -------

const AV_COLORS = ["#16a34a", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#0891b2", "#ca8a04", "#dc2626"];
export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}
export function monogram(name: string): string {
  const clean = name.replace(/^@/, "").trim();
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}
export function Avatar({ name, seed, size = 38 }: { name: string; seed?: string; size?: number }) {
  const bg = avatarColor(seed ?? name);
  return (
    <View style={[av.wrap, { width: size, height: size, borderRadius: radius.pill, backgroundColor: bg }]}>
      <Text style={[av.txt, { fontSize: size * 0.42 }]}>{monogram(name)}</Text>
    </View>
  );
}
const av = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  txt: { fontFamily: font.condBold, fontWeight: "700", color: "#fff" },
});

// --- Card + section head ---------------------------------------------------

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const Comp: any = onPress ? Pressable : View;
  return <Comp style={[cd.card, style]} onPress={onPress}>{children}</Comp>;
}
const cd = StyleSheet.create({
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.lineSoft, borderRadius: radius.lg, padding: 14 },
});

export function SectionHead({ title, moreLabel, onMore }: { title: string; moreLabel?: string; onMore?: () => void }) {
  return (
    <View style={sh.row}>
      <Text style={sh.title}>{title.toUpperCase()}</Text>
      {moreLabel && (
        <Pressable style={sh.more} onPress={onMore}>
          <Text style={sh.moreTxt}>{moreLabel}</Text>
          <Icon name="chevronRight" size={14} color={C.ink3} />
        </Pressable>
      )}
    </View>
  );
}
const sh = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  title: { fontFamily: font.condBold, fontSize: 17, fontWeight: "700", letterSpacing: 0.6, color: C.ink },
  more: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 2 },
  moreTxt: { fontFamily: font.sansSemi, fontSize: 12, fontWeight: "600", color: C.ink3 },
});
