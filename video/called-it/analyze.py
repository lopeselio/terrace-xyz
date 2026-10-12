"""Find where a track's energy jumps (the drop), bar by bar, assuming 120 BPM (2 s bars)."""
import subprocess, sys
import numpy as np

def load(path, sr=22050):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32), sr

for path in sys.argv[1:]:
    x, sr = load(path)
    win = int(0.05 * sr)
    rms = np.sqrt(np.convolve(x * x, np.ones(win) / win, mode="same"))
    bars = [rms[int(b * 2 * sr):int((b + 1) * 2 * sr)].mean() for b in range(int(len(x) / sr / 2))]
    jumps = sorted(range(1, len(bars)), key=lambda b: bars[b] / max(bars[b - 1], 1e-6), reverse=True)[:4]
    print(path, "loudest jumps (bar start s, ratio):", [(b * 2, round(bars[b] / bars[b - 1], 2)) for b in jumps])
    # refine the biggest jump to 10 ms
    b = jumps[0]
    seg = rms[int((b * 2 - 1) * sr):int((b * 2 + 1) * sr)]
    d = np.diff(seg[:: int(0.01 * sr)])
    print("   refined drop ≈", round(b * 2 - 1 + np.argmax(d) * 0.01, 2), "s")
