"""Sound for "Called it": a Mixkit track with its drop on the payout, plus SFX synthesised on exact frames.

  python3 audio.py   -> out/mix.wav (48 kHz stereo, -14 LUFS, true peak -1.3 dB)

Music: Mixkit #190 (free licence), 120 BPM, drop measured by energy at 16.00 s. We repeat its first
2-second bar once so the drop lands at 18.00 s in the film.
"""
import json
import subprocess
from pathlib import Path

import numpy as np

ROOT = Path(__file__).parent
SR = 48000
DUR = 30.0
SONG, SONG_DROP, FILM_DROP = ROOT / "audio/m190.mp3", 16.0, 18.0


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()


def env(n, attack=0.004, decay=0.08):
    t = np.arange(n) / SR
    return np.minimum(1, t / attack) * np.exp(-t / decay)


def tone(f0, f1, dur, decay, kind="sine"):
    n = int(dur * SR)
    f = np.geomspace(f0, f1, n)
    ph = 2 * np.pi * np.cumsum(f) / SR
    w = np.sin(ph) if kind == "sine" else np.sign(np.sin(ph)) * 0.3
    return w * env(n, decay=decay)


def add(*parts):
    n = max(len(p) for p in parts)
    return sum(np.pad(p, (0, n - len(p))) for p in parts)


def noise(dur, lo, hi, seed):
    n = int(dur * SR)
    rng = np.random.default_rng(seed)  # seeded: identical every render
    x = rng.standard_normal(n)
    spec = np.fft.rfft(x)
    fr = np.fft.rfftfreq(n, 1 / SR)
    spec[(fr < lo) | (fr > hi)] = 0
    y = np.fft.irfft(spec, n)
    y /= np.abs(y).max() + 1e-9
    win = np.sin(np.linspace(0, np.pi, n)) ** 2  # swell in and out
    return y * win


SFX = {
    "pop": lambda: tone(520, 880, 0.09, 0.035),
    "softpop": lambda: tone(380, 560, 0.08, 0.03),
    "tick": lambda: tone(1800, 1600, 0.03, 0.008),
    "click": lambda: add(tone(2400, 1200, 0.04, 0.01), noise(0.02, 2000, 8000, 1) * 0.3),
    "whoosh": lambda: noise(0.38, 400, 4000, 2),
    "swish": lambda: noise(0.22, 800, 6000, 3),
    "thump": lambda: tone(140, 55, 0.35, 0.12),
    "goal": lambda: add(tone(160, 50, 0.5, 0.16), noise(0.25, 200, 2500, 4) * 0.5),
    "sparkle": lambda: add(*[tone(f, f * 1.01, 0.9, 0.25) * (0.6 ** i) for i, f in enumerate([1568, 2093, 2637, 3136])]),
}

# (time s, sound, gain): every cue sits on the same frame as its picture event in film.html
CUES = [
    (0.55, "pop", 0.16), (1.15, "pop", 0.2), (2.6, "pop", 0.14), (3.25, "pop", 0.14),
    (5.55, "tick", 0.12), (5.95, "tick", 0.14), (6.8, "click", 0.22), (7.12, "whoosh", 0.12), (7.75, "tick", 0.1),
    (10.35, "softpop", 0.12), (10.85, "softpop", 0.12), (11.35, "softpop", 0.12), (11.85, "softpop", 0.12),
    (12.35, "softpop", 0.12), (12.95, "softpop", 0.14), (13.15, "tick", 0.12),
    (14.9, "swish", 0.08), (17.2, "goal", 0.3), (18.25, "sparkle", 0.16),
    (22.0, "swish", 0.08), (23.35, "swish", 0.08), (24.7, "swish", 0.08), (25.3, "tick", 0.12),
    (25.95, "whoosh", 0.1), (26.5, "thump", 0.22),
]


def main():
    n = int(DUR * SR)
    song = load(SONG)
    bar = int(2.0 * SR)
    music = np.concatenate([song[:bar], song])[:n]  # repeat bar 1 so the 16.0 s drop lands at 18.0 s
    music = np.pad(music, ((0, max(0, n - len(music))), (0, 0)))
    t = np.arange(n) / SR
    # a little air before the drop (15-18 s), then full; fade the tail
    gain = np.ones(n)
    gain *= np.where((t > 15.0) & (t < 18.0), 0.55, 1.0)
    gain *= np.clip((DUR - t) / 1.6, 0, 1)
    music *= (0.5 * gain)[:, None]

    fx = np.zeros((n, 2), np.float32)
    for at, name, g in CUES:
        s = SFX[name]().astype(np.float32) * g
        i = int(at * SR)
        j = min(n, i + len(s))
        fx[i:j] += s[: j - i, None]
    mix = music + fx

    tmp = ROOT / "out/premix.wav"
    out = ROOT / "out/mix.wav"
    out.parent.mkdir(exist_ok=True)
    pcm = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
    import wave
    with wave.open(str(tmp), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    # two-pass loudnorm to -14 LUFS / -1.3 dBTP
    first = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(tmp), "-af", "loudnorm=I=-14:TP=-1.3:LRA=11:print_format=json", "-f", "null", "-"], capture_output=True, text=True).stderr
    m = json.loads(first[first.rindex("{"):first.rindex("}") + 1])
    af = f"loudnorm=I=-14:TP=-1.3:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(tmp), "-af", af, "-ar", str(SR), str(out)], check=True)
    tmp.unlink()
    print(out)


if __name__ == "__main__":
    main()
