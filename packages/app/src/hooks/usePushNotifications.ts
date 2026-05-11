import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";

// ---------------------------------------------------------------------------
// Replace with your deployed worker URL after `wrangler deploy`
// ---------------------------------------------------------------------------
const WORKER_URL = "https://terrace-notifications.terrace-xyz.workers.dev";

// Show alerts + play sound for foreground notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldShowBanner: true,
    shouldShowList:   true,
    shouldPlaySound:  true,
    shouldSetBadge:   false,
  }),
});

async function getExpoPushToken(): Promise<string | null> {
  // Android requires a channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name:       "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  const finalStatus = existing !== "granted"
    ? (await Notifications.requestPermissionsAsync()).status
    : existing;

  if (finalStatus !== "granted") return null;

  // EAS projectId is required for Expo push tokens on SDK 49+
  const projectId =
    (Constants.expoConfig?.extra as any)?.eas?.projectId ??
    (Constants as any).easConfig?.projectId;

  if (!projectId) {
    console.warn("[usePushNotifications] No EAS projectId found — push token unavailable");
    return null;
  }

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

// ---------------------------------------------------------------------------
// Hook — call once at app root when wallet is connected
// ---------------------------------------------------------------------------

export function usePushNotifications(
  walletPubkey: string | null,
  following: Set<string>,
): void {
  const tokenRef = useRef<string | null>(null);

  // Register (or re-register) whenever wallet or following list changes
  useEffect(() => {
    if (!walletPubkey) return;

    getExpoPushToken()
      .then((token) => {
        if (!token) return;
        tokenRef.current = token;
        return fetch(`${WORKER_URL}/register`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pubkey:    walletPubkey,
            token,
            following: [...following],
          }),
        });
      })
      .catch(() => {}); // non-critical — fail silently
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletPubkey, following.size]); // re-sync when follow count changes
}
