import React, { useState, useEffect } from "react";
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
import { useWallet } from "./hooks/useWallet";
import { useMarkets } from "./hooks/useMarkets";
import { HomeScreen } from "./screens/HomeScreen";
import { MarketListScreen } from "./screens/MarketListScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { SocialScreen } from "./screens/SocialScreen";
import { ParlayBuilderScreen } from "./screens/ParlayBuilderScreen";
import { MarketDetailSheet } from "./components/MarketDetailSheet";
import type { UnifiedMarket } from "@terrace/sdk";
import {
  usePrivy,
  useOAuthFlow,
  useLoginWithEmail,
  useEmbeddedWallet,
  isConnected as privyIsConnected,
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
function MarketsTab({ onSelectMarket }: { onSelectMarket: (id: string) => void }) {
  const { markets, loading } = useMarkets();
  return <MarketListScreen markets={markets} loading={loading} onSelectMarket={onSelectMarket} />;
}

function useAppMarkets() {
  return useMarkets();
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
  mwaError?: string | null;
}

function ConnectSheet({
  onConnectMWA,
  onSendEmailCode,
  onLoginWithCode,
  onConnectGoogle,
  connecting,
  mwaError,
}: ConnectSheetProps) {
  const [step, setStep] = useState<SheetStep>("options");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendCode = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSendEmailCode(email.trim());
      setStep("otp-input");
    } catch (e: any) {
      setError(e?.message ?? "Failed to send code");
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onLoginWithCode(code.trim());
    } catch (e: any) {
      setError(e?.message ?? "Invalid code");
    } finally {
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
          disabled={connecting}
        >
          <Text style={sheet.socialBtnText}>✉  Email</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={sheet.socialBtn}
          onPress={onConnectGoogle}
          disabled={connecting}
        >
          <Text style={sheet.socialBtnText}>G  Google</Text>
        </TouchableOpacity>
      </View>

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
  const { publicKey, connected, connecting, connectMWA, disconnect: disconnectMWA } = useWallet();

  // Privy hooks
  const { logout: privyLogout, user: privyUser } = usePrivy();
  const { start: startOAuth } = useOAuthFlow();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const privyWallet = useEmbeddedWallet();

  const { markets } = useAppMarkets();
  const [activeTab, setActiveTab] = useState<Tab>("Home");
  const [pendingTab, setPendingTab] = useState<Tab>("Home");
  const [showConnect, setShowConnect] = useState(false);
  const [mwaError, setMwaError] = useState<string | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<UnifiedMarket | null>(null);

  // Privy embedded Solana wallet address — from linked_accounts on the user object
  const privyConnected = privyIsConnected(privyWallet);
  const privySolanaAddress = (privyUser?.linked_accounts as any[])?.find(
    (a) => a.type === "wallet" && a.wallet_client_type === "privy" && a.chain_type === "solana"
  )?.address ?? null;

  // Effective wallet — MWA takes priority, Privy embedded wallet as fallback
  const effectivePublicKey = publicKey ?? privySolanaAddress;
  const effectiveConnected = connected || privyConnected;

  // Navigate to pending tab once Privy wallet connects after login
  useEffect(() => {
    if (privyConnected && showConnect) {
      setShowConnect(false);
      setActiveTab(pendingTab);
    }
  }, [privyConnected]);

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
    try {
      await startOAuth({ provider: "google" });
      // useEffect above handles navigation once privyWallet connects
    } catch (e) {
      console.error("Google login error:", e);
    }
  };

  const handleSendEmailCode = async (email: string) => {
    await sendCode({ email });
  };

  const handleLoginWithCode = async (code: string) => {
    await loginWithCode({ code });
    // useEffect above handles navigation once privyWallet connects
  };

  const handleDisconnect = async () => {
    disconnectMWA();
    if (privyConnected) await privyLogout();
    setActiveTab("Home");
  };

  // ------ Render active tab content ------
  const renderContent = () => {
    if (showConnect) return null;

    switch (activeTab) {
      case "Home":
        return (
          <HomeScreen
            walletPubkey={effectivePublicKey}
            winRate={null}
            onSelectMarket={handleSelectMarket}
          />
        );
      case "Markets":
        return <MarketsTab onSelectMarket={handleSelectMarket} />;
      case "Create":
        return (
          <ParlayBuilderScreen
            markets={markets}
            walletPubkey={effectivePublicKey}
            onConnectWallet={() => setShowConnect(true)}
          />
        );
      case "Social":
        return <SocialScreen walletPubkey={effectivePublicKey} />;
      case "Profile":
        return (
          <ProfileScreen
            walletPubkey={effectivePublicKey}
            onConnectWallet={() => setShowConnect(true)}
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

      {showConnect && !effectiveConnected && (
        <ConnectSheet
          onConnectMWA={handleConnectMWA}
          onConnectGoogle={handleConnectGoogle}
          onSendEmailCode={handleSendEmailCode}
          onLoginWithCode={handleLoginWithCode}
          connecting={connecting}
          mwaError={mwaError}
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
