import * as Haptics from "expo-haptics";

/**
 * UI cue helpers — fires a haptic (and later a sound) for the given event.
 *
 * Wrapped in try/catch so the call site never has to think about missing
 * permissions, silent mode, or unsupported devices. If hardware can't deliver
 * the cue, we just no-op.
 *
 * Sound: expo-av is installed but no audio assets are wired yet. Drop
 * win.mp3, error.mp3, tap.mp3 into packages/app/src/assets/sounds/ and
 * uncomment the playSound() blocks below to enable.
 */

export function cueSuccess() {
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
}

export function cueError() {
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
}

export function cueWarning() {
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
}

// Punchier win burst — two staged taptic events feel more "moment-of-victory"
// than a single notificationAsync(Success). Used by confetti firing sites.
export function cueWin() {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 120);
  } catch {}
}

// Light single tap — for "you placed a bet" / button confirmations.
export function cueTap() {
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
}

// Medium thud — for tx-pending → submitted transitions.
export function cueSubmit() {
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
}
