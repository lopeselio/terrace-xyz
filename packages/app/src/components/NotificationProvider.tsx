/**
 * App-wide, fan-friendly notification system.
 *
 * Replaces the tiny `showToast` that lived inside LeagueScreen. Any component
 * can call `useNotify().show({ kind, message, action })` and a top-of-screen
 * banner slides in. Five visual variants (success / info / warning / error /
 * loading), optional action button (e.g. "Retry"), tap-to-dismiss, auto-stack
 * if multiple fire at once.
 *
 * Design choices:
 *   - Top of screen, not bottom — feels like a real notification, not a hint
 *   - 16px text — readable without glasses
 *   - Coloured left bar per variant, dark glass surface — consistent with the
 *     rest of the dark Terrace UI
 *   - Loading variant has an inline spinner and is persistent until the caller
 *     dismisses or replaces it (e.g. "Setting up your spot…" → "All set!")
 *   - Errors stick around for 6s by default and can carry a Retry CTA
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  ActivityIndicator,
  Easing,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
// NOTE: we intentionally avoid `useSafeAreaInsets()` here — it requires a
// <SafeAreaProvider> at the app root, which Terrace doesn't currently mount.
// A hardcoded status-bar offset is good enough for top-of-screen toasts.

export type NotifyKind = "success" | "info" | "warning" | "error" | "loading";

type Action = { label: string; onPress: () => void };

type NotifyArgs = {
  kind?: NotifyKind;            // default 'info'
  message: string;
  action?: Action;              // optional CTA (e.g. Retry)
  durationMs?: number;          // 0 = stay until dismissed; default 3500 for info, 6000 for error
  id?: string;                  // pass an id to replace/update an existing toast
};

type Toast = {
  id: string;
  kind: NotifyKind;
  message: string;
  action?: Action;
};

type Ctx = {
  show: (a: NotifyArgs) => string;             // returns the id (so caller can dismiss it later)
  dismiss: (id: string) => void;
  update: (id: string, a: Partial<NotifyArgs>) => void; // replace fields of an existing toast
};

const NotifyContext = createContext<Ctx | null>(null);

function defaultDuration(kind: NotifyKind): number {
  if (kind === "loading") return 0;          // persistent
  if (kind === "error" || kind === "warning") return 6000;
  return 3500;
}

const VARIANT: Record<NotifyKind, { color: string; icon: string }> = {
  success: { color: "#22c55e", icon: "✓" },
  info:    { color: "#6366f1", icon: "ⓘ" },
  warning: { color: "#f59e0b", icon: "!" },
  error:   { color: "#ef4444", icon: "✕" },
  loading: { color: "#a855f7", icon: "" },
};

let _id = 0;
const nextId = () => `t${++_id}_${Date.now()}`;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const scheduleAutoDismiss = useCallback((id: string, ms: number) => {
    if (timers.current[id]) clearTimeout(timers.current[id]);
    if (ms <= 0) return;
    timers.current[id] = setTimeout(() => dismiss(id), ms);
  }, [dismiss]);

  const show = useCallback((a: NotifyArgs): string => {
    const kind = a.kind ?? "info";
    const id = a.id ?? nextId();
    const dur = a.durationMs ?? defaultDuration(kind);

    setToasts((prev) => {
      const without = prev.filter((t) => t.id !== id);
      return [...without, { id, kind, message: a.message, action: a.action }];
    });
    scheduleAutoDismiss(id, dur);
    return id;
  }, [scheduleAutoDismiss]);

  const update = useCallback((id: string, a: Partial<NotifyArgs>) => {
    setToasts((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              kind: a.kind ?? t.kind,
              message: a.message ?? t.message,
              action: a.action !== undefined ? a.action : t.action,
            }
          : t
      )
    );
    if (a.durationMs !== undefined) {
      scheduleAutoDismiss(id, a.durationMs);
    } else if (a.kind && a.kind !== "loading") {
      // Promoted from loading → set the default duration for the new kind
      scheduleAutoDismiss(id, defaultDuration(a.kind));
    }
  }, [scheduleAutoDismiss]);

  // Clear all pending timers on unmount
  useEffect(() => () => {
    Object.values(timers.current).forEach(clearTimeout);
  }, []);

  const ctx = useMemo<Ctx>(() => ({ show, dismiss, update }), [show, dismiss, update]);

  return (
    <NotifyContext.Provider value={ctx}>
      {children}
      <ToastStack toasts={toasts} dismiss={dismiss} />
    </NotifyContext.Provider>
  );
}

export function useNotify(): Ctx {
  const ctx = useContext(NotifyContext);
  if (!ctx) {
    // Soft fallback so callers don't crash if provider isn't mounted yet
    return {
      show: (a) => { console.log("[notify]", a.kind ?? "info", a.message); return "_"; },
      dismiss: () => {},
      update: () => {},
    };
  }
  return ctx;
}

// ── Visual ───────────────────────────────────────────────────────────────────

// Top offset for the toast stack. iOS notch/dynamic-island devices get ~50;
// Android reads StatusBar.currentHeight (may be 0 on edge-to-edge configs).
const TOP_INSET = Platform.OS === "ios"
  ? 50
  : (StatusBar.currentHeight ?? 24);

function ToastStack({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.stack, { top: TOP_INSET + 8 }]}
    >
      {toasts.map((t) => (
        <ToastView key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </View>
  );
}

function ToastView({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const tx = useRef(new Animated.Value(-80)).current;     // slide-in from above
  const op = useRef(new Animated.Value(0)).current;        // fade-in
  const variant = VARIANT[toast.kind];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(tx, { toValue: 0,  duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(op, { toValue: 1,  duration: 220, useNativeDriver: true }),
    ]).start();
  }, [tx, op]);

  const animatedStyle = { opacity: op, transform: [{ translateY: tx }] };

  return (
    <Animated.View style={[styles.toastWrap, animatedStyle]}>
      <Pressable style={[styles.toast, { borderLeftColor: variant.color }]} onPress={onDismiss}>
        <View style={styles.iconCol}>
          {toast.kind === "loading"
            ? <ActivityIndicator size="small" color={variant.color} />
            : <Text style={[styles.icon, { color: variant.color }]}>{variant.icon}</Text>
          }
        </View>
        <Text style={styles.message} numberOfLines={3}>{toast.message}</Text>
        {toast.action ? (
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: variant.color }]}
            onPress={(e) => { e.stopPropagation?.(); toast.action!.onPress(); onDismiss(); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.actionText, { color: variant.color }]}>{toast.action.label}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.closeHint}>×</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: {
    position: "absolute",
    left: 12,
    right: 12,
    alignItems: "stretch",
    zIndex: 10000,
  },
  toastWrap: {
    marginBottom: 8,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(20,20,22,0.96)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#2a2a2a",
    borderLeftWidth: 3,
    borderRadius: 12,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 10,
    minHeight: 52,
    // Shadow (iOS) / elevation (Android) for separation from content below
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  iconCol: { width: 24, alignItems: "center", marginRight: 10 },
  icon: { fontSize: 16, fontWeight: "700" },
  message: { flex: 1, color: "#f3f4f6", fontSize: 15, lineHeight: 20 },
  actionBtn: {
    marginLeft: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  actionText: { fontSize: 13, fontWeight: "700" },
  closeHint: { color: "#6b7280", fontSize: 22, marginLeft: 8, paddingHorizontal: 4 },
});
