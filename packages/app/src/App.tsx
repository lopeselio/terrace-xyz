// Must run before anything imports Privy. Filters the recurring 15s ping
// heartbeat timeout noise that otherwise floods logcat / Expo LogBox.
import "./utils/silencePrivyPing";
import React, { useState, useEffect, useRef } from "react";
import { VersionedTransaction } from "@solana/web3.js";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Pressable,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { NotificationProvider } from "./components/NotificationProvider";
import { AppSplash } from "./components/AppSplash";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

// Required for Privy OAuth to close the browser and complete the auth session
// when the deep link redirects back to the app.
WebBrowser.maybeCompleteAuthSession();
import * as Notifications from "expo-notifications";
import { useWallet } from "./hooks/useWallet";
import { useMarkets } from "./hooks/useMarkets";
import { useReputation } from "./hooks/useReputation";
import { useFollowing } from "./hooks/useFollowing";
import { usePushNotifications } from "./hooks/usePushNotifications";
import { HomeScreen } from "./screens/HomeScreen";
import { MarketListScreen } from "./screens/MarketListScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { SocialScreen } from "./screens/SocialScreen";
import { ParlayBuilderScreen } from "./screens/ParlayBuilderScreen";
import { CreateMarketScreen } from "./screens/CreateMarketScreen";
import { MatchupScreen } from "./screens/MatchupScreen";
import { LeagueScreen } from "./screens/LeagueScreen";
import { MarketDetailSheet } from "./components/MarketDetailSheet";
import type { UnifiedMarket } from "@terrace/sdk";
import {
  usePrivy,
  useLoginWithOAuth,
  useLoginWithEmail,
  useEmbeddedSolanaWallet,
  type OtpFlowState,
} from "@privy-io/expo";

const WORKER_BASE_URL = "https://terrace-notifications.terrace-xyz.workers.dev";

// ---------------------------------------------------------------------------
// LinkWalletModal — confirm wallet→Telegram linking after tapping /link URL
// ---------------------------------------------------------------------------
function LinkWalletModal({
  token,
  pubkey,
  onSuccess,
  onDismiss,
}: {
  token: string;
  pubkey: string | null;
  onSuccess: () => void;
  onDismiss: () => void;
}) {
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone]   = useState(false);

  const handleLink = async () => {
    if (!pubkey) { setError("Connect your wallet first."); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${WORKER_BASE_URL}/link/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pubkey }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || data.error) { setError(data.error ?? "Link failed. Try again."); setBusy(false); return; }
      setDone(true);
    } catch { setError("Network error. Try again."); setBusy(false); }
  };

  return (
    <View style={lm.overlay}>
      <View style={lm.card}>
        <View style={lm.handle} />
        <Text style={lm.emoji}>🔗</Text>
        {done ? (
          <>
            <Text style={lm.title}>Wallet linked!</Text>
            <Text style={lm.sub}>Go back to Telegram and run /me to see your rep.</Text>
            <TouchableOpacity style={lm.btn} onPress={onSuccess}>
              <Text style={lm.btnText}>Done</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={lm.title}>Link to Telegram?</Text>
            <Text style={lm.sub}>This connects your Solana wallet to your Telegram account so your rep and challenges follow you.</Text>
            {pubkey ? (
              <Text style={lm.wallet}>{`${pubkey.slice(0, 8)}…${pubkey.slice(-4)}`}</Text>
            ) : (
              <Text style={lm.warn}>No wallet connected — sign in first.</Text>
            )}
            {error && <Text style={lm.error}>{error}</Text>}
            <TouchableOpacity style={lm.btn} onPress={handleLink} disabled={busy || !pubkey}>
              {busy ? <ActivityIndicator color="#000" /> : <Text style={lm.btnText}>Link wallet</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={onDismiss}>
              <Text style={lm.cancel}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const lm = StyleSheet.create({
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", zIndex: 100, alignItems: "center", justifyContent: "flex-end" },
  card:    { backgroundColor: "#111", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 44, width: "100%", gap: 12 },
  handle:  { width: 36, height: 4, backgroundColor: "#333", borderRadius: 2, alignSelf: "center", marginBottom: 8 },
  emoji:   { fontSize: 44, textAlign: "center" },
  title:   { fontSize: 22, fontWeight: "700", color: "#fff", textAlign: "center" },
  sub:     { fontSize: 14, color: "#9ca3af", textAlign: "center", lineHeight: 20 },
  wallet:  { fontFamily: "monospace", fontSize: 13, color: "#22c55e", textAlign: "center", backgroundColor: "#0d1f12", padding: 10, borderRadius: 8 },
  warn:    { fontSize: 13, color: "#f59e0b", textAlign: "center" },
  error:   { fontSize: 12, color: "#ef4444", textAlign: "center" },
  btn:     { backgroundColor: "#22c55e", borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  btnText: { fontSize: 16, fontWeight: "700", color: "#000" },
  cancel:  { fontSize: 14, color: "#6b7280", textAlign: "center", paddingVertical: 4 },
});

// ---------------------------------------------------------------------------
// Bottom navigation
// ---------------------------------------------------------------------------
type Tab = "Home" | "Markets" | "Create" | "Social" | "Profile";

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "Home",    icon: "🏠", label: "Home"    },
  { id: "Markets", icon: "📋", label: "Markets" },
  { id: "Create",  icon: "＋", label: "Create"  },
  { id: "Social",  icon: "👥", label: "Social"  },
  { id: "Profile", icon: "🏆", label: "Profile" },
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

  const { markets, loading: marketsLoading, prependMarket, refresh: refreshMarkets } = useMarkets();
  const [activeTab, setActiveTab] = useState<Tab>("Home");
  const [pendingTab, setPendingTab] = useState<Tab>("Home");
  const [showConnect, setShowConnect] = useState(false);
  const [showParlay, setShowParlay] = useState(false);
  const [showMatchups, setShowMatchups] = useState(false);
  const [showLeagues, setShowLeagues] = useState(false);
  const [deepLinkMatchupAddress, setDeepLinkMatchupAddress] = useState<string | null>(null);
  const [deepLinkToken, setDeepLinkToken] = useState<string | null>(null);
  const [mwaError, setMwaError] = useState<string | null>(null);

  // JS-rendered splash. Stays up for ~1.2s after the bundle mounts, then
  // fades out. Hands off cleanly from the native splash configured in app.json.
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashMounted, setSplashMounted] = useState(true);
  useEffect(() => {
    const hide = setTimeout(() => setSplashVisible(false), 1200);
    // Unmount after the fade animation finishes (320ms in AppSplash).
    const unmount = setTimeout(() => setSplashMounted(false), 1700);
    return () => { clearTimeout(hide); clearTimeout(unmount); };
  }, []);
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

  const { reputation, loading: repLoading } = useReputation(effectivePublicKey ?? null);

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
  // Re-run when publicKey or linkedSolanaAddress resolves (they can lag behind status).
  useEffect(() => {
    if (solanaWallet.status === "connected") {
      const pubkey = solanaWallet.publicKey ?? linkedSolanaAddress;
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
      }, pubkey);
    } else {
      setPrivySigner(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solanaWallet.status, privySolanaAddress]);

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

  // Deep link handling — terrace://matchup/<address> | terrace://link/<token>
  function handleDeepLink(url: string | null) {
    if (!url) return;
    try {
      const { hostname, path } = Linking.parse(url);
      if (hostname === "matchup" && path) {
        const addr = path.replace(/^\//, "");
        if (addr.length >= 32) {
          setDeepLinkMatchupAddress(addr);
          setShowMatchups(true);
        }
      } else if (hostname === "link" && path) {
        const token = path.replace(/^\//, "");
        if (token.length > 10) setDeepLinkToken(token);
      }
    } catch {}
  }

  // Cold start — app opened via deep link
  useEffect(() => {
    Linking.getInitialURL().then(handleDeepLink);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Warm start — app already running, link tapped
  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Push notifications — register token + sync following list with the worker
  const { following: followingForPush } = useFollowing(effectivePublicKey ?? null);
  usePushNotifications(effectivePublicKey ?? null, followingForPush);

  // When user taps a notification, navigate to Markets tab and open the relevant market
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      setActiveTab("Markets");
      if (typeof data.marketId === "string") {
        const market = markets.find((m) => m.id === data.marketId) ?? null;
        if (market) setSelectedMarket(market);
      }
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets]);

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
            repLoading={repLoading}
            markets={markets}
            marketsLoading={marketsLoading}
            onSelectMarket={handleSelectMarket}
            onNavigateProfile={() => setActiveTab("Profile")}
            onNavigateParlay={() => { refreshMarkets(); setShowParlay(true); }}
            onNavigateMatchup={() => setShowMatchups(true)}
            onNavigateLeague={() => setShowLeagues(true)}
            onRefreshMarkets={refreshMarkets}
          />
        );
      case "Markets":
        return <MarketsTab markets={markets} loading={marketsLoading} onSelectMarket={handleSelectMarket} />;
      case "Create":
        return (
          <CreateMarketScreen
            walletPubkey={effectivePublicKey}
            onConnectWallet={handleConnectWallet}
            onMarketCreated={(market) => {
              prependMarket(market);
              setActiveTab("Markets");
            }}
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
            onNavigateLeague={() => setShowLeagues(true)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <ExpoStatusBar style="light" />
      <NotificationProvider>

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

      {showParlay && (
        <View style={styles.parlayOverlay}>
          <ParlayBuilderScreen
            markets={markets}
            walletPubkey={effectivePublicKey}
            onConnectWallet={handleConnectWallet}
            onClose={() => setShowParlay(false)}
            onNavigateProfile={() => { setShowParlay(false); setActiveTab("Profile"); }}
          />
        </View>
      )}

      {showMatchups && (
        <View style={styles.parlayOverlay}>
          <MatchupScreen
            markets={markets}
            walletPubkey={effectivePublicKey}
            onConnectWallet={handleConnectWallet}
            onClose={() => { setShowMatchups(false); setDeepLinkMatchupAddress(null); }}
            onRefreshMarkets={refreshMarkets}
            initialMatchupAddress={deepLinkMatchupAddress}
          />
        </View>
      )}

      {showLeagues && (
        <View style={styles.parlayOverlay}>
          <LeagueScreen
            walletPubkey={effectivePublicKey}
            onConnectWallet={handleConnectWallet}
            onClose={() => setShowLeagues(false)}
          />
        </View>
      )}

      {deepLinkToken && (
        <LinkWalletModal
          token={deepLinkToken}
          pubkey={effectivePublicKey ?? null}
          onSuccess={() => setDeepLinkToken(null)}
          onDismiss={() => setDeepLinkToken(null)}
        />
      )}

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
      </NotificationProvider>
      {splashMounted && <AppSplash visible={splashVisible} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: "#0a0a0a", paddingTop: StatusBar.currentHeight ?? 0 },
  content: { flex: 1 },
  parlayOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#0a0a0a", zIndex: 50 },
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
