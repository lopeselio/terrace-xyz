import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking, ActivityIndicator } from "react-native";
import * as Clipboard from "expo-clipboard";
import { color as C, font, radius } from "../theme/tokens";
import { Icon } from "../components/Icon";
import { identityOf, avatarColorOf } from "../utils/identity";
import { useWalletBalances } from "../hooks/useWalletBalances";
import { money } from "../utils/format";

// ---------------------------------------------------------------------------
// First run (TODO Sprint 12 #2).
//
// A fan who just connected a wallet is one step from their first bet and three
// steps from giving up: they don't know what they're called here, they have no
// devnet SOL, and nothing tells them either of those things until a transaction
// fails. This screen answers all three before they hit them.
//
// It runs once per wallet. Skipping is always available — an onboarding you
// can't leave is a wall, and someone who already knows the drill shouldn't have
// to read it twice.
// ---------------------------------------------------------------------------

const SOL_FAUCET = "https://faucet.solana.com/";
const USDC_FAUCET = "https://spl-token-faucet.com/?token-name=USDC-Dev";

/** Enough SOL to sign a handful of transactions. */
const SOL_READY = 0.05;

function Step({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <View style={s.step}>
      <View style={s.stepHead}>
        <View style={s.stepNum}><Text style={s.stepNumTxt}>{index}</Text></View>
        <Text style={s.stepTitle}>{title}</Text>
      </View>
      <View style={s.stepBody}>{children}</View>
    </View>
  );
}

interface Props {
  walletPubkey: string;
  onDone: () => void;
}

export function OnboardingScreen({ walletPubkey, onDone }: Props) {
  const id = identityOf(walletPubkey);
  const balances = useWalletBalances(walletPubkey);
  const [copied, setCopied] = useState(false);

  const copyAddress = useCallback(async () => {
    await Clipboard.setStringAsync(walletPubkey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [walletPubkey]);

  const sol = balances.devnetSol;
  const usdc = balances.devnetUsdc;
  const loadingBalances = sol === null || usdc === null;
  // SOL pays for signatures, USDC is the stake. Without SOL nothing can be
  // signed at all, so that's the one that gates "ready".
  const canSign = sol !== null && sol >= SOL_READY;
  const canStake = usdc !== null && usdc > 0;

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.kicker}>WELCOME TO THE TERRACE</Text>
        <Text style={s.title}>You're in.{"\n"}Three things and you're set.</Text>

        <Step index={1} title="This is you">
          <View style={s.identityRow}>
            <View style={[s.avatar, { backgroundColor: avatarColorOf(walletPubkey) }]}>
              <Text style={s.avatarTxt}>{id.monogram}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={s.handleRow}>
                <Text style={s.handle}>{id.handle}</Text>
                {!!id.tag && <Text style={s.handleTag}>·{id.tag}</Text>}
              </View>
              <Text style={s.stepSub}>
                Your name on every market, feed post and leaderboard. Derived from your
                wallet, so it's yours on any device — no signup, nothing to remember.
              </Text>
            </View>
          </View>
        </Step>

        <Step index={2} title="Fund the wallet">
          <Text style={s.stepSub}>
            Devnet only — this is play money on a test network, not real funds.
            SOL pays the network fee on each bet; USDC is what you actually stake.
          </Text>

          <View style={s.balanceRow}>
            <View style={s.balance}>
              <Text style={s.balanceLabel}>SOL</Text>
              {loadingBalances ? (
                <ActivityIndicator size="small" color={C.ink3} />
              ) : (
                <Text style={[s.balanceVal, canSign && s.balanceOk]}>{(sol ?? 0).toFixed(3)}</Text>
              )}
            </View>
            <View style={s.balance}>
              <Text style={s.balanceLabel}>USDC</Text>
              {loadingBalances ? (
                <ActivityIndicator size="small" color={C.ink3} />
              ) : (
                <Text style={[s.balanceVal, canStake && s.balanceOk]}>{money(usdc ?? 0, 2)}</Text>
              )}
            </View>
          </View>

          <TouchableOpacity style={s.addressBtn} onPress={copyAddress}>
            <Icon name={copied ? "check" : "copy"} size={15} color={copied ? C.green : C.ink2} />
            <Text style={[s.addressTxt, copied && { color: C.green }]} numberOfLines={1}>
              {copied ? "Address copied — paste it into a faucet" : walletPubkey}
            </Text>
          </TouchableOpacity>

          <View style={s.faucetRow}>
            <TouchableOpacity style={s.faucet} onPress={() => Linking.openURL(SOL_FAUCET)}>
              <Text style={s.faucetTxt}>Get devnet SOL</Text>
              <Icon name="arrowUpRight" size={14} color={C.green} />
            </TouchableOpacity>
            <TouchableOpacity style={s.faucet} onPress={() => Linking.openURL(USDC_FAUCET)}>
              <Text style={s.faucetTxt}>Get devnet USDC</Text>
              <Icon name="arrowUpRight" size={14} color={C.green} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.refresh} onPress={balances.refresh}>
            <Icon name="refresh" size={13} color={C.ink3} />
            <Text style={s.refreshTxt}>Check again</Text>
          </TouchableOpacity>
        </Step>

        <Step index={3} title="Make your first call">
          <Text style={s.stepSub}>
            Back a market you believe, fade one you don't. Every settled bet moves your
            win rate — and that record is on-chain, so it follows you rather than
            resetting when the group chat scrolls.
          </Text>
        </Step>

        <View style={{ height: 12 }} />
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.cta, !canSign && s.ctaMuted]}
          onPress={onDone}
          activeOpacity={0.9}
        >
          <Text style={[s.ctaTxt, !canSign && s.ctaTxtMuted]}>
            {canSign ? "I'm ready to predict" : "Skip for now"}
          </Text>
        </TouchableOpacity>
        {!canSign && !loadingBalances && (
          <Text style={s.footNote}>
            You can look around without funding — you'll need devnet SOL before your
            first bet will go through.
          </Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.canvas },
  scroll: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 12 },

  kicker: { fontFamily: font.sansBold, fontSize: 10.5, fontWeight: "700", letterSpacing: 1.4, color: C.green },
  title: {
    fontFamily: font.condBold, fontSize: 30, fontWeight: "700", color: C.ink,
    textTransform: "uppercase", letterSpacing: 0.3, lineHeight: 33, marginTop: 8, marginBottom: 26,
  },

  step: { marginBottom: 24 },
  stepHead: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 10 },
  stepNum: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: C.greenDeep,
    borderWidth: 1, borderColor: C.green, alignItems: "center", justifyContent: "center",
  },
  stepNumTxt: { fontFamily: font.condBold, fontSize: 11.5, fontWeight: "700", color: C.green },
  stepTitle: { fontFamily: font.condBold, fontSize: 17, fontWeight: "700", color: C.ink, textTransform: "uppercase", letterSpacing: 0.4 },
  stepBody: { paddingLeft: 31, gap: 11 },
  stepSub: { fontFamily: font.sans, fontSize: 13, color: C.ink2, lineHeight: 19 },

  identityRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  avatarTxt: { fontFamily: font.condBold, fontSize: 18, fontWeight: "700", color: "#fff" },
  handleRow: { flexDirection: "row", alignItems: "baseline", gap: 4, marginBottom: 3 },
  handle: { fontFamily: font.condBold, fontSize: 20, fontWeight: "700", color: C.ink, letterSpacing: 0.2 },
  handleTag: { fontFamily: font.sans, fontSize: 12, color: C.ink4 },

  balanceRow: { flexDirection: "row", gap: 8 },
  balance: {
    flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.lineSoft,
    borderRadius: radius.md, paddingVertical: 11, alignItems: "center", gap: 3,
  },
  balanceLabel: { fontFamily: font.sansBold, fontSize: 9.5, fontWeight: "700", letterSpacing: 0.8, color: C.ink4 },
  balanceVal: { fontFamily: font.condBold, fontSize: 20, fontWeight: "700", color: C.ink3, fontVariant: ["tabular-nums"] },
  balanceOk: { color: C.green },

  addressBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.deep, borderWidth: 1, borderColor: C.line,
    borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 11,
  },
  addressTxt: { flex: 1, fontFamily: font.sans, fontSize: 11.5, color: C.ink2 },

  faucetRow: { flexDirection: "row", gap: 8 },
  faucet: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: C.greenDeep, borderWidth: 1, borderColor: "#17422a",
    borderRadius: radius.sm, paddingVertical: 11,
  },
  faucetTxt: { fontFamily: font.sansSemi, fontSize: 12.5, fontWeight: "600", color: C.green },

  refresh: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 2 },
  refreshTxt: { fontFamily: font.sans, fontSize: 12, color: C.ink3 },

  footer: { paddingHorizontal: 20, paddingBottom: 28, paddingTop: 10, gap: 8, borderTopWidth: 1, borderTopColor: C.lineHair },
  cta: { height: 52, borderRadius: radius.md, backgroundColor: C.green, alignItems: "center", justifyContent: "center" },
  ctaMuted: { backgroundColor: C.raised, borderWidth: 1, borderColor: C.line },
  ctaTxt: { fontFamily: font.sansBold, fontSize: 15, fontWeight: "700", color: C.onGreen, letterSpacing: 0.2 },
  ctaTxtMuted: { color: C.ink2 },
  footNote: { fontFamily: font.sans, fontSize: 11.5, color: C.ink3, textAlign: "center", lineHeight: 16 },
});
