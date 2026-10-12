"use client";
/*
 * Small UI sounds, synthesised with Web Audio (no files to load): a rising chime for a win, a soft
 * fall for a loss, a coin for points, a crowd-ish fanfare for a gameweek, a tick when something is
 * locked in. Off with one switch in Profile → Appearance. Browsers only allow sound after the fan
 * has touched the page, so the audio context wakes on the first tap.
 */

export type Sound = "win" | "lose" | "refund" | "points" | "done" | "fanfare" | "notify";

const KEY = "terrace.sound";
let ctx: AudioContext | null = null;

export function soundOn() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}
export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  if (on) play("done");
}

function audio() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// Wake audio on the first touch, so sounds triggered later (a popup after polling) can play.
if (typeof window !== "undefined") {
  const wake = () => {
    audio();
    window.removeEventListener("pointerdown", wake);
    window.removeEventListener("keydown", wake);
  };
  window.addEventListener("pointerdown", wake, { passive: true });
  window.addEventListener("keydown", wake);
}

/** One soft note: frequency, start offset and length in seconds. */
function note(a: AudioContext, freq: number, at: number, len: number, { type = "sine" as OscillatorType, gain = 0.16, slideTo }: { type?: OscillatorType; gain?: number; slideTo?: number } = {}) {
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + len + 0.02);
}

export function play(kind: Sound) {
  if (!soundOn()) return;
  const a = audio();
  if (!a || a.state !== "running") return;
  switch (kind) {
    case "win": // bright rising arpeggio, C major
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(a, f, i * 0.085, 0.32, { type: "triangle", gain: 0.18 }));
      note(a, 1567.98, 0.34, 0.5, { gain: 0.07 });
      break;
    case "lose": // two soft falling notes
      note(a, 392, 0, 0.22, { type: "triangle", gain: 0.13 });
      note(a, 311.13, 0.16, 0.42, { type: "triangle", gain: 0.12, slideTo: 261.63 });
      break;
    case "refund": // neutral double tap
      note(a, 587.33, 0, 0.12, { gain: 0.12 });
      note(a, 587.33, 0.13, 0.16, { gain: 0.1 });
      break;
    case "points": // coin: quick upward blip
      note(a, 987.77, 0, 0.08, { type: "square", gain: 0.05 });
      note(a, 1318.51, 0.07, 0.22, { type: "square", gain: 0.05 });
      break;
    case "done": // short tick when something is locked in
      note(a, 880, 0, 0.07, { gain: 0.1 });
      note(a, 1174.66, 0.05, 0.1, { gain: 0.08 });
      break;
    case "fanfare": // gameweek results: three-note horn call and a held chord
      [392, 523.25, 659.25].forEach((f, i) => note(a, f, i * 0.12, 0.2, { type: "sawtooth", gain: 0.05 }));
      [523.25, 659.25, 783.99].forEach((f) => note(a, f, 0.38, 0.7, { type: "triangle", gain: 0.08 }));
      break;
    case "notify": // gentle two-tone ping
      note(a, 783.99, 0, 0.12, { gain: 0.09 });
      note(a, 1046.5, 0.1, 0.2, { gain: 0.08 });
      break;
  }
}
