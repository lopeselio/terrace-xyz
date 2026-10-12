"""A 3-minute music bed for the demo: Mixkit #190 (free licence) looped from its drop, sat under a voice-over.

  python3 bed.py  -> out/bed.wav (48 kHz stereo, -20 LUFS so speech sits clearly on top)
"""
import json
import subprocess
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).parent
SR = 48000
DUR = 180.0
SONG = ROOT.parent / "called-it/audio/m190.mp3"


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()


song = load(SONG)
n = int(DUR * SR)
# loop the body (16 s drop to 112 s, whole 2 s bars at 120 BPM) with a 2 s crossfade at each seam
a, b = int(16 * SR), int(112 * SR)
body, xf = song[a:b], int(2 * SR)
out = song[:b].copy()
while len(out) < n:
    ramp = np.linspace(0, 1, xf)[:, None]
    out[-xf:] = out[-xf:] * (1 - ramp) + body[:xf] * ramp
    out = np.concatenate([out, body[xf:]])
out = out[:n]
t = np.arange(n) / SR
out *= (np.clip(t / 1.5, 0, 1) * np.clip((DUR - t) / 4, 0, 1))[:, None]

tmp, dest = ROOT / "out/bed-raw.wav", ROOT / "out/bed.wav"
with wave.open(str(tmp), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(out, -1, 1) * 32767).astype(np.int16).tobytes())
first = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(tmp), "-af", "loudnorm=I=-20:TP=-2:LRA=11:print_format=json", "-f", "null", "-"], capture_output=True, text=True).stderr
m = json.loads(first[first.rindex("{"):first.rindex("}") + 1])
af = f"loudnorm=I=-20:TP=-2:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true"
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(tmp), "-af", af, "-ar", str(SR), str(dest)], check=True)
tmp.unlink()
print(dest)
