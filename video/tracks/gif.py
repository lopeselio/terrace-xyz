"""Short looping GIFs of the sponsor-track explainers, for the README.

  ../demo/.venv/bin/python gif.py all        -> ../../media/sponsors/<track>.gif
  ../demo/.venv/bin/python gif.py envio

Same engine as render.py (tracks.html, window.seek(t)), time-warped: the intro card, the first few
seconds of every beat (headline lands, diagram animates) and the outro card, cut together. The long
captions and the progress bar are hidden; the README carries the detail.
"""
import subprocess
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from playwright.sync_api import sync_playwright

from render import serve

ROOT = Path(__file__).parent
DEST = ROOT.parent.parent / "media/sponsors"
TRACKS = ["envio", "alchemy", "chainlink", "mera", "keys"]
FPS, WIDTH, HOLD = 10, 800, 3.2
INTRO, OUTRO = 4.4, 6


def segments(beats, dur):
    segs = [(0.3, INTRO - 0.5)]
    segs += [(t - 0.1, t + HOLD) for t in beats]
    segs.append((dur - OUTRO - 0.1, dur - OUTRO + 3.6))
    return segs


def gif(track):
    httpd, port = serve()
    with tempfile.TemporaryDirectory() as tmp, sync_playwright() as p:
        browser = p.chromium.launch(args=["--force-color-profile=srgb", "--font-render-hinting=none", "--disable-threaded-animation"])
        page = browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=WIDTH / 1920)
        page.goto(f"http://127.0.0.1:{port}/tracks.html?track={track}&render=1")
        page.wait_for_function("window.ready === true", timeout=60_000)
        page.add_style_tag(content="#cap, #bar { display: none !important; }")
        beats = page.evaluate("T.beats.map((b) => b.t)")
        dur = page.evaluate("window.DUR")
        clip = Path(tmp) / "clip.mp4"
        enc = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "png", "-i", "-",
                                "-c:v", "libx264", "-crf", "10", "-preset", "fast", "-pix_fmt", "yuv444p", str(clip)], stdin=subprocess.PIPE)
        for a, b in segments(beats, dur):
            for n in range(int((b - a) * FPS)):
                page.evaluate(f"window.seek({a + n / FPS})")
                page.evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
                enc.stdin.write(page.screenshot())
        browser.close()
        enc.stdin.close()
        enc.wait()
        DEST.mkdir(parents=True, exist_ok=True)
        out = DEST / f"{track}.gif"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(clip), "-filter_complex",
                        "split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
                        "-loop", "0", str(out)], check=True)
    httpd.shutdown()
    print(f"{out}  {out.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    which = TRACKS if sys.argv[1] == "all" else sys.argv[1:]
    with ProcessPoolExecutor(max_workers=len(which)) as ex:
        list(ex.map(gif, which))
