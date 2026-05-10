import React, { useState, useEffect, useRef } from "react";
import { VersionedTransaction } from "@solana/web3.js";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Pressable,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";

// Required for Privy OAuth to close the browser and complete the auth session
// when the deep link redirects back to the app.
WebBrowser.maybeCompleteAuthSession();
import { useWallet } from "./hooks/useWallet";
import { useMarkets } from "./hooks/useMarkets";
import { useReputation } from "./hooks/useReputation";
import { HomeScreen } from "./screens/HomeScreen";
import { MarketListScreen } from "./screens/MarketListScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { SocialScreen } from "./screens/SocialScreen";
import { ParlayBuilderScreen } from "./screens/ParlayBuilderScreen";
import { MarketDetailSheet } from "./components/MarketDetailSheet";
import type { UnifiedMarket } from "@terrace/sdk";
import {
  usePrivy,
  useLoginWithOAuth,
  useLoginWithEmail,
  useEmbeddedSolanaWallet,
  type OtpFlowState,
} from "@privy-io/expo";

// ---------------------------------------------------------------------------
// Bottom navigation
// ---------------------------------------------------------------------------
type Tab = "Home" | "Markets" | "Create" | "Social" | "Profile";

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "Home",    icon: "🏠", label: "Home"    },
  { id: "Markets", icon: "📋", label: "Markets" },
  { id: "Create",  icon: "＋", label: "Create"  },
  { id: "Social",  icon: "✈️", label: "Social"  },
  { id: "Profile", icon: "👤", label: "Profile" },
];

// ---------------------------------------------------------------------------
// Markets tab
// ---------------------------------------------------------------------------
function MarketsTab({
  markets,
  loading,
  onSelectMarket,
}: {
  markets: UnifiedMarket[];
  loading: boolean;
  onSelectMarket: (id: string) => void;
}) {
  return <MarketListScreen markets={markets} loading={loading} onSelectMarket={onSelectMarket} />;
}

// ---------------------------------------------------------------------------
// Connect sheet — MWA + Privy email/Google
// ---------------------------------------------------------------------------
type SheetStep = "options" | "email-input" | "otp-input";

interface ConnectSheetProps {
  onConnectMWA: () => void;
  onSendEmailCode: (email: string) => Promise<void>;
  onLoginWithCode: (code: string) => Promise<void>;
  onConnectGoogle: () => Promise<void>;
  connecting: boolean;
  privyReady: boolean;
  mwaError?: string | null;
  oauthError?: string | null;
  otpState: OtpFlowState;
}

function ConnectSheet({
  onConnectMWA,
  onSendEmailCode,
  onLoginWithCode,
  onConnectGoogle,
  connecting,
  privyReady,
  mwaError,
  oauthError,
  otpState,
}: ConnectSheetProps) {
  const [step, setStep] = useState<SheetStep>("options");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drive step transitions from Privy's OTP state machine instead of
  // assuming the promise resolved = email was sent. sendCode() never throws —
  // it catches internally and sets otpState.status = "error". Without this
  // effect the UI always advances to "otp-input" even when the send failed.
  useEffect(() => {
    if (otpState.status === "awaiting-code-input" && step === "email-input") {
      setError(null);
      setBusy(false);
      setStep("otp-input");
    } else if (otpState.status === "done") {
      // parent handles navigation on login
    } else if (otpState.status === "error") {
      const msg = (otpState as any).error?.message ?? "Auth error";
      setError(msg);
      setBusy(false);
    }
  }, [otpState.status]);

  const handleSendCode = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSendEmailCode(trimmed);
      // Do NOT setStep here — the useEffect above advances the step only
      // when otpState.status transitions to "awaiting-code-input".
    } catch (e: any) {
      setError(e?.message ?? "Failed to send code");
      setBusy(false);
    }
  };

  const handleVerifyCode = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    if (!/^\d{6}$/.test(trimmed)) {
      setError("Enter the 6-digit code from your email");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onLoginWithCode(trimmed);
    } catch (e: any) {
      setError(e?.message ?? "Invalid code");
      setBusy(false);
    }
  };

  if (step === "email-input") {
    return (
      <View style={sheet.root}>
        <View style={sheet.handle} />
        <TouchableOpacity onPress={() => setStep("options")}>
          <Text style={sheet.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={sheet.title}>Enter your email</Text>
        <TextInput
          style={sheet.input}
          placeholder="you@example.com"
          placeholderTextColor="#555"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        {error && <Text style={sheet.error}>{error}</Text>}
        <TouchableOpacity style={sheet.btn} onPress={handleSendCode} disabled={busy}>
          {busy ? <ActivityIndicator color="#000" /> : <Text style={sheet.btnText}>Send code</Text>}
        </TouchableOpacity>
      </View>
    );
  }

  if (step === "otp-input") {
    return (
      <View style={sheet.root}>
        <View style={sheet.handle} />
        <TouchableOpacity onPress={() => setStep("email-input")}>
          <Text style={sheet.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={sheet.title}>Check your email</Text>
        <Text style={sheet.sub}>Enter the 6-digit code sent to {email}</Text>
        <TextInput
          style={sheet.input}
          placeholder="123456"
          placeholderTextColor="#555"
          keyboardType="number-pad"
          value={code}
          onChangeText={setCode}
        />
        {error && <Text style={sheet.error}>{error}</Text>}
        <TouchableOpacity style={sheet.btn} onPress={handleVerifyCode} disabled={busy}>
          {busy ? <ActivityIndicator color="#000" /> : <Text style={sheet.btnText}>Verify</Text>}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={sheet.root}>
      <View style={sheet.handle} />
      <Text style={sheet.title}>Back your team.</Text>
      <Text style={sheet.sub}>Bet your take. Build your rep.</Text>

      <TouchableOpacity style={sheet.btn} onPress={onConnectMWA} disabled={connecting}>
        <Text style={sheet.btnText}>{connecting ? "Connecting…" : "Connect Solana wallet"}</Text>
      </TouchableOpacity>
      {mwaError && <Text style={sheet.error}>{mwaError}</Text>}

      <View style={sheet.dividerRow}>
        <View style={sheet.dividerLine} />
        <Text style={sheet.dividerText}>or continue with</Text>
        <View style={sheet.dividerLine} />
      </View>

      <View style={sheet.socialRow}>
        <TouchableOpacity
          style={sheet.socialBtn}
          onPress={() => setStep("email-input")}
          disabled={connecting || !privyReady}
        >
          <Text style={sheet.socialBtnText}>✉  Email</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={sheet.socialBtn}
          onPress={onConnectGoogle}
          disabled={connecting || !privyReady}
        >
          <Text style={sheet.socialBtnText}>G  Google</Text>
        </TouchableOpacity>
      </View>

      {oauthError && <Text style={sheet.error}>{oauthError}</Text>}
      {!privyReady && <Text style={sheet.error}>Initialising auth…</Text>}
      <Text style={sheet.note}>Powered by Solana · USDC settlement</Text>
    </View>
  );
}

const sheet = StyleSheet.create({
  root:    { backgroundColor: "#111", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 40, gap: 10 },
  handle:  { width: 36, height: 4, backgroundColor: "#333", borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  title:   { fontSize: 24, fontWeight: "700", color: "#fff", letterSpacing: -0.5 },
  sub:     { fontSize: 15, color: "#9ca3af", marginBottom: 8 },
  back:    { fontSize: 13, color: "#6b7280", marginBottom: 12 },
  btn:     { backgroundColor: "#22c55e", borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  btnText: { fontSize: 16, fontWeight: "700", color: "#000" },
  input:   { backgroundColor: "#1a1a1a", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: "#fff", fontSize: 15, borderWidth: 0.5, borderColor: "#333" },
  error:   { fontSize: 12, color: "#ef4444" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 4 },
  dividerLine: { flex: 1, height: 0.5, backgroundColor: "#2a2a2a" },
  dividerText: { fontSize: 11, color: "#555" },
  socialRow: { flexDirection: "row", gap: 10 },
  socialBtn: { flex: 1, backgroundColor: "#1a1a1a", borderRadius: 12, paddingVertical: 13, alignItems: "center", borderWidth: 0.5, borderColor: "#333" },
  socialBtnText: { fontSize: 13, fontWeight: "600", color: "#d1d5db" },
  note:    { fontSize: 11, color: "#4b5563", textAlign: "center", marginTop: 4 },
});

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------
export default function App() {
  const { publicKey, connected, connecting, connectMWA, disconnect: disconnectMWA, setPrivySigner } = useWallet();

  // Privy hooks
  const { logout: privyLogout, user: privyUser, isReady: privyReady } = usePrivy();
  const { login: loginWithOAuth } = useLoginWithOAuth({
    onError: (err: any) => {
      const msg: string = err?.message ?? "Google sign-in failed";
      setOauthError(msg);
      console.error("[privy] OAuth error:", err);
    },
  });
  const { sendCode, loginWithCode, state: otpState } = useLoginWithEmail();
  const solanaWallet = useEmbeddedSolanaWallet();

  const { markets, loading: marketsLoading } = useMarkets();
  const [activeTab, setActiveTab] = useState<Tab>("Home");
  const [pendingTab, setPendingTab] = useState<Tab>("Home");
  const [showConnect, setShowConnect] = useState(false);
  const [mwaError, setMwaError] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<UnifiedMarket | null>(null);

  // publicKey from embedded Solana wallet.
  // "connected" → use SDK publicKey directly.
  // Any other status (connecting, reconnecting, not-created, error, etc.) →
  // fall back to linked_accounts so returning users see their address while
  // the SDK is still initialising or recovering the wallet.
  const linkedSolanaAddress = (privyUser?.linked_accounts as any[])?.find(
    (a: any) =>
      a.type === "wallet" &&
      a.chain_type === "solana" &&
      a.wallet_client_type === "privy"
  )?.address ?? null;

  const privySolanaAddress =
    solanaWallet.status === "connected"
      ? solanaWallet.publicKey
      : linkedSolanaAddress;

  // Effective wallet — MWA takes priority, Privy embedded wallet as fallback
  const effectivePublicKey = publicKey ?? privySolanaAddress;
  const effectiveConnected = connected || !!privyUser;

  const { reputation } = useReputation(effectivePublicKey ?? null);

  // Navigate to pending tab once Privy user logs in (don't wait for wallet creation)
  useEffect(() => {
    if (privyUser && showConnect) {
      setShowConnect(false);
      setActiveTab(pendingTab);
    }
  }, [privyUser]);

  // Keep refs so timeout callbacks read current state at fire-time, not captured closure values.
  const solanaWalletRef = useRef(solanaWallet);
  solanaWalletRef.current = solanaWallet;
  const linkedSolanaRef = useRef(linkedSolanaAddress);
  linkedSolanaRef.current = linkedSolanaAddress;

  // Register the Privy signer once the embedded wallet is connected.
  // solanaWallet.getProvider() returns PrivyEmbeddedSolanaWalletProvider which
  // supports request({ method: 'signTransaction', params: { transaction } }).
  useEffect(() => {
    if (solanaWallet.status === "connected") {
      setPrivySigner(async (txBytes: Uint8Array) => {
        const wallet = solanaWalletRef.current;
        // getProvider() is available on connected/reconnecting states
        const provider = await (wallet as any).getProvider();
        const tx = VersionedTransaction.deserialize(txBytes);
        const result = await (provider as any).request({
          method: "signTransaction",
          params: { transaction: tx },
        });
        return Buffer.from((result.signedTransaction as VersionedTransaction).serialize());
      });
    } else {
      setPrivySigner(null);
    }
  }, [solanaWallet.status]);

  // Fallback wallet creation for edge cases where createOnLogin didn't fire
  // (e.g. network interruption during login, or needsRecovery state).
  // createOnLogin: 'users-without-wallets' handles the normal path automatically.
  useEffect(() => {
    if (!privyUser || solanaWallet.status !== "not-created") return;

    const timer = setTimeout(() => {
      const current = solanaWalletRef.current;
      if (current.status !== "not-created") return;
      if (linkedSolanaRef.current) return;
      current.create?.().catch((createErr: any) => {
        const msg: string = createErr?.message ?? "Unknown wallet error";
        if (msg.includes("cannot have more than one")) {
          console.warn("[wallet] wallet already exists on another device");
          setWalletError("Wallet recovery unavailable. Connect a Solana wallet app or sign out.");
          return;
        }
        console.error("[wallet] create failed:", msg);
        setWalletError(msg);
      });
    }, 1500);

    return () => clearTimeout(timer);
  }, [privyUser, solanaWallet.status]);

  const handleSelectMarket = (id: string) => {
    const market = markets.find((m) => m.id === id) ?? null;
    setSelectedMarket(market);
  };

  const handleTabPress = (tab: Tab) => {
    if (!effectiveConnected && tab === "Profile") {
      setPendingTab(tab);
      setShowConnect(true);
      return;
    }
    setShowConnect(false);
    setActiveTab(tab);
  };

  const handleConnectMWA = async () => {
    setMwaError(null);
    try {
      const pubkey = await connectMWA();
      if (pubkey) {
        setShowConnect(false);
        setActiveTab(pendingTab);
      }
    } catch (e: any) {
      setMwaError(e?.message ?? "Wallet connection failed");
    }
  };

  const handleConnectGoogle = async () => {
    setOauthError(null);
    try {
      await loginWithOAuth({ provider: "google" });
    } catch (e: any) {
      const msg = e?.message ?? "Google sign-in failed";
      setOauthError(msg);
      console.error("Google login error:", e);
    }
  };

  const handleSendEmailCode = async (email: string) => {
    if (!privyReady) throw new Error("Privy not ready yet — try again");
    await sendCode({ email });
  };

  const handleLoginWithCode = async (code: string) => {
    if (!privyReady) throw new Error("Privy not ready yet — try again");
    await loginWithCode({ code });
  };

  const handleDisconnect = async () => {
    disconnectMWA();
    if (privyUser) await privyLogout();
    setActiveTab("Home");
  };

  const handleConnectWallet = () => {
    // No Privy session, or logged in but wallet is broken/missing → open connect sheet.
    // This lets users pick MWA (Phantom/Solflare) even when already auth'd via Privy.
    if (!privyUser || !effectivePublicKey) {
      setPendingTab(activeTab);
      setShowConnect(true);
      return;
    }
    setWalletError(null);
    const wallet = solanaWalletRef.current;
    if (linkedSolanaRef.current) return;
    wallet.create?.().catch((createErr: any) => {
      const msg: string = createErr?.message ?? "Unknown wallet error";
      if (msg.includes("cannot have more than one")) {
        setWalletError("Wallet already exists. Connect a Solana wallet app or sign out.");
        return;
      }
      console.error("[wallet] create failed:", msg);
      setWalletError(msg);
    });
  };

  // ------ Render active tab content ------
  const renderContent = () => {
    // Only blank the content for unauthenticated users opening the connect sheet.
    // Authenticated users should never see an empty screen even if showConnect
    // is stale-true (e.g. after tapping "Connect wallet" from inside a screen).
    if (showConnect && (!effectiveConnected || !effectivePublicKey)) return null;

    switch (activeTab) {
      case "Home":
        return (
          <HomeScreen
            walletPubkey={effectivePublicKey}
            winRate={reputation ? reputation.winRateBps / 10000 : null}
            markets={markets}
            marketsLoading={marketsLoading}
            onSelectMarket={handleSelectMarket}
            onNavigateProfile={() => setActiveTab("Profile")}
          />
        );
      case "Markets":
        return <MarketsTab markets={markets} loading={marketsLoading} onSelectMarket={handleSelectMarket} />;
      case "Create":
        return (
          <ParlayBuilderScreen
            markets={markets}
            walletPubkey={effectivePublicKey}
            onConnectWallet={handleConnectWallet}
          />
        );
      case "Social":
        return <SocialScreen walletPubkey={effectivePublicKey} />;
      case "Profile":
        return (
          <ProfileScreen
            walletPubkey={effectivePublicKey}
            isLoggedIn={!!privyUser}
            walletError={walletError}
            privyUser={privyUser}
            onConnectWallet={handleConnectWallet}
            onDisconnect={handleDisconnect}
          />
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <ExpoStatusBar style="light" />

      <View style={styles.content}>
        {renderContent()}
      </View>

      {showConnect && (!effectiveConnected || !effectivePublicKey) && (
        <ConnectSheet
          onConnectMWA={handleConnectMWA}
          onConnectGoogle={handleConnectGoogle}
          onSendEmailCode={handleSendEmailCode}
          onLoginWithCode={handleLoginWithCode}
          connecting={connecting}
          privyReady={privyReady}
          mwaError={mwaError}
          oauthError={oauthError}
          otpState={otpState}
        />
      )}

      <MarketDetailSheet
        market={selectedMarket}
        visible={selectedMarket !== null}
        onClose={() => setSelectedMarket(null)}
      />

      <View style={styles.bottomNav}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id && !showConnect;
          const isCreate = tab.id === "Create";
          return (
            <Pressable key={tab.id} style={styles.navBtn} onPress={() => handleTabPress(tab.id)}>
              <View style={[styles.navIconCircle, isCreate && styles.navIconCreate, isActive && !isCreate && styles.navIconActive]}>
                <Text style={isCreate ? styles.navIconTextCreate : styles.navIconText}>
                  {tab.icon}
                </Text>
              </View>
              <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: "#0a0a0a", paddingTop: StatusBar.currentHeight ?? 0 },
  content: { flex: 1 },
  bottomNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "#111",
    borderTopWidth: 0.5,
    borderTopColor: "#1e1e1e",
    paddingTop: 10,
    paddingBottom: 20,
  },
  navBtn:            { alignItems: "center", gap: 3 },
  navIconCircle:     { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  navIconActive:     { backgroundColor: "#22c55e" },
  navIconCreate:     { backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: "#333" },
  navIconText:       { fontSize: 16 },
  navIconTextCreate: { fontSize: 18, color: "#fff", fontWeight: "300" },
  navLabel:          { fontSize: 9, color: "#555" },
  navLabelActive:    { color: "#22c55e" },
});
