import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  SafeAreaView,
  StatusBar,
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
// Markets tab — live feed from on-chain + Jupiter
// ---------------------------------------------------------------------------
function MarketsTab({ onSelectMarket }: { onSelectMarket: (id: string) => void }) {
  const { markets, loading } = useMarkets();
  return <MarketListScreen markets={markets} loading={loading} onSelectMarket={onSelectMarket} />;
}

// ---------------------------------------------------------------------------
// Re-export markets for sub-screens that need the live feed
// ---------------------------------------------------------------------------
function useAppMarkets() {
  return useMarkets();
}

// ---------------------------------------------------------------------------
// Connect wallet overlay — shown on first open if not connected
// ---------------------------------------------------------------------------
interface ConnectSheetProps {
  onConnectMWA: () => void;
  onConnectPrivy: (method: "email" | "google") => void;
  connecting: boolean;
}

function ConnectSheet({ onConnectMWA, onConnectPrivy, connecting }: ConnectSheetProps) {
  return (
    <View style={sheet.root}>
      <View style={sheet.handle} />
      <Text style={sheet.title}>Back your team.</Text>
      <Text style={sheet.sub}>Bet your take. Build your rep.</Text>

      {/* Primary: Solana wallet (MWA) */}
      <TouchableOpacity style={sheet.btn} onPress={onConnectMWA} disabled={connecting}>
        <Text style={sheet.btnText}>{connecting ? "Connecting…" : "Connect Solana wallet"}</Text>
      </TouchableOpacity>

      {/* Divider */}
      <View style={sheet.dividerRow}>
        <View style={sheet.dividerLine} />
        <Text style={sheet.dividerText}>or continue with</Text>
        <View style={sheet.dividerLine} />
      </View>

      {/* Social login track (Privy) */}
      <View style={sheet.socialRow}>
        <TouchableOpacity
          style={sheet.socialBtn}
          onPress={() => onConnectPrivy("email")}
          disabled={connecting}
        >
          <Text style={sheet.socialBtnText}>✉  Email</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={sheet.socialBtn}
          onPress={() => onConnectPrivy("google")}
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
  btn:     { backgroundColor: "#22c55e", borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  btnText: { fontSize: 16, fontWeight: "700", color: "#000" },
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
  const { publicKey, connected, connecting, connectMWA, connectPrivy } = useWallet();
  const { markets, loading: marketsLoading } = useAppMarkets();
  const [activeTab, setActiveTab] = useState<Tab>("Home");
  const [showConnect, setShowConnect] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<UnifiedMarket | null>(null);

  const handleSelectMarket = (id: string) => {
    const market = markets.find((m) => m.id === id) ?? null;
    setSelectedMarket(market);
  };

  // Tapping "Create" or "Profile" when not connected triggers the wallet sheet
  const handleTabPress = (tab: Tab) => {
    if (!connected && tab === "Profile") {
      setShowConnect(true);
      return;
    }
    setShowConnect(false);
    setActiveTab(tab);
  };

  const handleConnectMWA = async () => {
    await connectMWA();
    setShowConnect(false);
    setActiveTab("Home");
  };

  const handleConnectPrivy = async (method: "email" | "google") => {
    await connectPrivy(method);
    setShowConnect(false);
    setActiveTab("Home");
  };

  // ------ Render active tab content ------
  const renderContent = () => {
    if (showConnect) return null; // sheet overlays below

    switch (activeTab) {
      case "Home":
        return (
          <HomeScreen
            walletPubkey={publicKey}
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
            walletPubkey={publicKey}
            onConnectWallet={() => setShowConnect(true)}
          />
        );
      case "Social":
        return <SocialScreen walletPubkey={publicKey} />;
      case "Profile":
        return (
          <ProfileScreen
            walletPubkey={publicKey}
            onConnectWallet={() => setShowConnect(true)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <ExpoStatusBar style="light" />

      {/* Main content area */}
      <View style={styles.content}>
        {renderContent()}
      </View>

      {/* Connect sheet (partial bottom overlay) */}
      {showConnect && !connected && (
        <ConnectSheet
          onConnectMWA={handleConnectMWA}
          onConnectPrivy={handleConnectPrivy}
          connecting={connecting}
        />
      )}

      {/* Market detail sheet — shown when user taps a market card */}
      <MarketDetailSheet
        market={selectedMarket}
        visible={selectedMarket !== null}
        onClose={() => setSelectedMarket(null)}
      />

      {/* ── Bottom navigation ────────────────────────────── */}
      <View style={styles.bottomNav}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id && !showConnect;
          const isCreate = tab.id === "Create";
          return (
            <Pressable key={tab.id} style={styles.navBtn} onPress={() => handleTabPress(tab.id)}>
              <View
                style={[
                  styles.navIconCircle,
                  isCreate  && styles.navIconCreate,
                  isActive  && !isCreate && styles.navIconActive,
                ]}
              >
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

  // Bottom nav
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
