import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Icon, type IconName } from "./Icon";
import { color as C, font, radius, layout } from "../theme/tokens";

// ---------------------------------------------------------------------------
// Bottom tab bar — 5 tabs, 22px line icons in 44×26 pills, raised green Create.
// Matches the redesign (styles.css .tabbar). No emoji.
// ---------------------------------------------------------------------------

export type Tab = "Home" | "Markets" | "Create" | "Social" | "Profile";

const TABS: { id: Tab; icon: IconName; label: string }[] = [
  { id: "Home", icon: "home", label: "Home" },
  { id: "Markets", icon: "list", label: "Markets" },
  { id: "Create", icon: "plus", label: "Create" },
  { id: "Social", icon: "users", label: "Social" },
  { id: "Profile", icon: "trophy", label: "Profile" },
];

interface Props {
  activeTab: Tab;
  onPress: (tab: Tab) => void;
  /** When true (e.g. the connect gate is up), no tab reads as active. */
  inactive?: boolean;
}

export function TabBar({ activeTab, onPress, inactive }: Props) {
  return (
    <View style={styles.bar}>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id && !inactive;
        if (tab.id === "Create") {
          return (
            <Pressable key={tab.id} style={styles.tab} onPress={() => onPress(tab.id)}>
              <View style={styles.createPill}>
                <Icon name="plus" size={24} color={C.onGreen} />
              </View>
              <Text style={styles.createLabel}>{tab.label}</Text>
            </Pressable>
          );
        }
        return (
          <Pressable key={tab.id} style={styles.tab} onPress={() => onPress(tab.id)}>
            <View style={[styles.pill, isActive && styles.pillActive]}>
              <Icon name={tab.icon} size={22} color={isActive ? C.green : C.ink4} />
            </View>
            <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    height: layout.tabbarH + layout.tabbarSafe,
    paddingBottom: layout.tabbarSafe,
    backgroundColor: "rgba(9,9,9,0.96)",
    borderTopWidth: 1,
    borderTopColor: C.lineHair,
  },
  tab: { flex: 1, alignItems: "center", gap: 3, paddingTop: 6 },
  pill: {
    width: 44,
    height: 26,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  pillActive: { backgroundColor: C.greenGlow },
  label: { fontFamily: font.sansMed, fontSize: 10, fontWeight: "600", letterSpacing: 0.2, color: C.ink4 },
  labelActive: { color: C.green },

  createPill: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginTop: -16,
    backgroundColor: C.green,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.green,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  createLabel: { fontFamily: font.sansMed, fontSize: 10, fontWeight: "600", color: C.ink3, marginTop: 1 },
});
