"""Find how far to shift a muted face clip so the lips match a voiced video.

  python3 facesync.py <voiced video> <face clip> <mouth x,y,w,h> <reference x,y,w,h>

Mouth-region motion (minus the motion of a still part of the face, so head moves don't count) is
cross-correlated with the voice envelope. Prints the offset to skip in the face clip: face_time = video_time + offset.
"""
import subprocess
import sys

import numpy as np


def crop(path, box):
    x, y, w, h = box
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps=30,crop={w}:{h}:{x}:{y},format=gray", "-f", "rawvideo", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.float32)


def main(video, face, mouth, ref):
    dm = np.abs(np.diff(crop(face, mouth), axis=0)).mean((1, 2))
    dr = np.abs(np.diff(crop(face, ref), axis=0)).mean((1, 2))
    m = np.convolve(np.maximum(0, dm - dr * np.median(dm) / np.median(dr)), np.ones(5) / 5, "same")
    sr = 16000
    a = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vn", "-ac", "1", "-ar", str(sr), "-af", "highpass=f=150,lowpass=f=3500",
                                      "-f", "f32le", "-"], capture_output=True, check=True).stdout, np.float32)
    hop = sr // 30
    n = len(a) // hop
    env = np.convolve(np.sqrt((a[:n * hop].reshape(n, hop) ** 2).mean(1)), np.ones(5) / 5, "same")
    z = lambda v: (v - v.mean()) / (v.std() + 1e-9)

    def best(e, f, top=1):
        e, f = z(e), z(f)
        res = []
        for lag in range(-30 * 8, 30 * 8 + 1):
            x, y = (e[:len(f) - lag], f[lag:]) if lag >= 0 else (e[-lag:], f[:len(f) + lag])
            k = min(len(x), len(y))
            res.append((round(float(np.dot(x[:k], y[:k]) / k), 3), round(lag / 30, 3)))
        return sorted(res, reverse=True)[:top]
    k = min(len(env), len(m)) // 2
    # each half on its own too, so one strong section can't fake the answer
    print("best (corr, offset s):", best(env, m, 5), " first half:", best(env[:k], m[:k]), " second half:", best(env[k:], m[k:]))

if __name__ == "__main__":
    p = lambda s: tuple(int(v) for v in s.split(","))
    main(sys.argv[1], sys.argv[2], p(sys.argv[3]), p(sys.argv[4]))
