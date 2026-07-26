import React, { useState } from "react";
import { View, Text, Modal, Pressable, TouchableOpacity, StyleSheet, Switch } from "react-native";
import * as Clipboard from "expo-clipboard";
import { color as C, font, radius } from "../theme/tokens";
import { money } from "../utils/format";
import { Icon } from "./Icon";
import { Badge, CTA } from "./ui";

// ---------------------------------------------------------------------------
// Wallet & payouts sheet — the single drawer where all crypto lives (design
// change #4). Network details (SOL / Devnet / Mainnet / address) sit behind a
// toggle that is OFF by default.
// ---------------------------------------------------------------------------

interface Props {
  visible: boolean;
  onClose: () => void;
  address: string | null;
  availableUsdc: number | null;
  inOpenBetsUsdc?: number | null;
  creatorFeesUsdc?: number | null;
  mainnetSol?: number | null;
  devnetSol?: number | null;
  devnetUsdc?: number | null;
}

export function WalletSheet({ visible, onClose, address, availableUsdc, inOpenBetsUsdc, creatorFeesUsdc, mainnetSol, devnetSol, devnetUsdc }: Props) {
  const [showNetwork, setShowNetwork] = useState(false);
  const [copied, setCopied] = useState(false);
  const short = address ? `${address.slice(0, 6)}…${address.slice(-6)}` : "—";

  const copy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.grabber} />
          <View style={s.head}>
            <Text style={s.title}>Wallet & payouts</Text>
            <TouchableOpacity style={s.closeBtn} onPress={onClose}><Icon name="close" size={18} color={C.ink2} /></TouchableOpacity>
          </View>

          <View style={s.card}>
            <Kv k="Available" v={availableUsdc != null ? money(availableUsdc) : "—"} big />
            <Kv k="In open bets" v={inOpenBetsUsdc != null ? money(inOpenBetsUsdc) : money(0)} border />
            <Kv k="Creator fees earned" v={creatorFeesUsdc != null ? money(creatorFeesUsdc) : money(0)} vColor={C.amberInk} border />
          </View>

          <View style={s.ctaRow}>
            <View style={{ flex: 1 }}><CTA label="Add funds" small /></View>
            <View style={{ flex: 1 }}><CTA label="Withdraw" ghost small /></View>
          </View>

          <Text style={s.flabel}>Advanced</Text>
          <View style={s.card}>
            <View style={[s.kv, s.kvBorder]}>
              <Text style={s.k}>Wallet address</Text>
              <TouchableOpacity style={s.addrBtn} onPress={copy}>
                <Text style={s.addr}>{copied ? "Copied" : short}</Text>
                <Icon name="copy" size={14} color={C.ink2} />
              </TouchableOpacity>
            </View>
            <View style={s.kv}>
              <View style={{ flex: 1 }}>
                <Text style={s.vTitle}>Show network details</Text>
                <Text style={s.vSub}>Solana mainnet · USDC balances</Text>
              </View>
              <Switch value={showNetwork} onValueChange={setShowNetwork} trackColor={{ true: C.green, false: "#242424" }} thumbColor="#fff" />
            </View>
            {showNetwork && (
              <View style={s.netBox}>
                <Kv k="Mainnet" v={`${(mainnetSol ?? 0).toFixed(3)} SOL · ${availableUsdc != null ? money(availableUsdc) : "—"}`} small />
                <Kv k="Devnet" v={`${(devnetSol ?? 0).toFixed(3)} SOL · ${devnetUsdc != null ? money(devnetUsdc) : "—"}`} small border />
              </View>
            )}
          </View>

          <View style={s.trust}>
            <Badge tone="terrace" label="Non-custodial" />
            <Badge tone="private" label="Arcium private bets" icon="lock" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Kv({ k, v, big, small, border, vColor }: { k: string; v: string; big?: boolean; small?: boolean; border?: boolean; vColor?: string }) {
  return (
    <View style={[s.kv, border && s.kvBorder]}>
      <Text style={[s.k, small && { fontSize: 12.5 }]}>{k}</Text>
      <Text style={[big ? s.vBig : small ? s.vSmall : s.v, vColor ? { color: vColor } : null]}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  modalRoot: { flex: 1, backgroundColor: "rgba(0,0,0,0.62)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#131313", borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderWidth: 1, borderColor: C.line, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 26 },
  grabber: { width: 38, height: 4, borderRadius: 2, backgroundColor: "#333", alignSelf: "center", marginBottom: 14 },
  head: { flexDirection: "row", alignItems: "center" },
  title: { flex: 1, fontFamily: font.condBold, fontSize: 24, fontWeight: "700", color: C.ink, textTransform: "uppercase", letterSpacing: 0.3 },
  closeBtn: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" },

  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.lineSoft, borderRadius: radius.lg, paddingHorizontal: 14, marginTop: 14 },
  kv: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  kvBorder: { borderBottomWidth: 1, borderBottomColor: C.lineHair },
  k: { fontFamily: font.sans, fontSize: 13.5, color: C.ink2 },
  v: { fontFamily: font.sansSemi, fontSize: 14, fontWeight: "600", color: C.ink },
  vBig: { fontFamily: font.condBold, fontSize: 22, fontWeight: "700", color: C.ink },
  vSmall: { fontFamily: font.sansSemi, fontSize: 12.5, fontWeight: "600", color: C.ink2 },
  vTitle: { fontFamily: font.sansSemi, fontSize: 14, fontWeight: "600", color: C.ink },
  vSub: { fontFamily: font.sans, fontSize: 11.5, color: C.ink3, marginTop: 1 },

  ctaRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  flabel: { fontFamily: font.sansBold, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: C.ink3, marginTop: 20, marginBottom: 7 },
  addrBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  addr: { fontFamily: font.sansMed, fontSize: 12.5, color: C.ink2 },
  netBox: { borderTopWidth: 1, borderTopColor: C.lineHair, paddingVertical: 2 },
  trust: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 14 },
});
