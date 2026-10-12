"""Cut the screen recordings into per-shot frame sequences for demo-rec.html.

Each shot gets clips (recording, in, out) squeezed or stretched to fill its slot. Frames are cropped to
the app (Safari's bars removed), scaled to the phone screen width, at 60 fps: clips/NN/00000.jpg.
"""
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent
REC = ROOT.parents[1] / "monad/video-files/screen-recs"
OUT = ROOT / "clips"
FPS = 60

R1 = "passkey-sign-in-player_profile.MP4"
R2 = "bet-claim.MP4"
R3 = "social-feed.MP4"
R4 = "bell_notification-tinder_style_swipe_bets-chat_make_it_market-1v1_matchups--.MP4"
R5 = "flash_markets-parlays-private_leagues.MP4"

# (slot start, slot end, [(recording, in s, out s, share of the slot)])
SHOTS = [
    (0, 8, [(R5, 0, 8, 1)]),
    (8, 22, [(R1, 3.5, 17.5, 1)]),
    (22, 38, [(R5, 30, 46, 1)]),
    (38, 52, [(R5, 240, 254, 1)]),
    (52, 75, [(R5, 178, 224, 1)]),
    (75, 85, [(R5, 220, 230, 1)]),
    (85, 95, None),  # swipe: dark screenshots (the recording is in the light theme)
    (95, 108, None),  # 1v1: dark screenshots
    (108, 115, [(R5, 312, 318, 3 / 7), (R5, 328, 332, 4 / 7)]),
    (115, 145, [(R5, 406, 430, 12 / 30), (R5, 444, 464, 8 / 30), (R5, 484, 504, 10 / 30)]),
    (145, 155, None),  # leaderboard: dark screenshots
    (155, 170, [(R2, 0, 16, 1)]),
    (170, 179, [(R5, 12, 21, 1)]),
]


def run(*a):
    subprocess.run(["ffmpeg", "-y", "-v", "error", *a], check=True)


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    meta = []
    for n, (a, b, clips) in enumerate(SHOTS):
        d = OUT / f"{n:02d}"
        d.mkdir(parents=True)
        if clips is None:
            meta.append({"t0": a, "t1": b, "frames": 0})
            print(n, a, b, "screenshots")
            continue
        frames = 0
        for k, (rec, i, o, share) in enumerate(clips):
            slot = (b - a) * share
            speed = (o - i) / slot
            want = round(slot * FPS)
            tmp = d / f"part{k}"
            tmp.mkdir()
            run("-ss", str(i), "-t", str(o - i), "-i", str(REC / rec),
                "-vf", f"setpts=(PTS-STARTPTS)/{speed},fps={FPS},crop=1284:2254:0:291,scale=442:-2",
                "-frames:v", str(want), "-q:v", "3", str(tmp / "%05d.jpg"))
            got = sorted(tmp.glob("*.jpg"))
            # hold the last frame if a clip comes up a frame or two short
            while len(got) < want:
                shutil.copy(got[-1], tmp / f"{len(got) + 1:05d}.jpg")
                got = sorted(tmp.glob("*.jpg"))
            for f in got[:want]:
                f.rename(d / f"{frames:05d}.jpg")
                frames += 1
            tmp.rmdir() if not any(tmp.iterdir()) else shutil.rmtree(tmp)
        meta.append({"t0": a, "t1": b, "frames": frames})
        print(n, a, b, frames, [f"{(o - i) / ((b - a) * s):.2f}x" for _, i, o, s in clips])
    (OUT / "meta.json").write_text(json.dumps(meta))


if __name__ == "__main__":
    main()
