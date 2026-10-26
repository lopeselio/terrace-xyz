"""Render the Terrace "Two ways in" film from film.html (window.seek(t), pure function of time).

  .venv/bin/python render.py probe 16x9 1.5 8.5 12.5 19.5      -> out/probe-16x9.png (contact sheet)
  .venv/bin/python render.py draft 16x9                         -> out/draft-16x9.mp4 (30 fps, half size, no audio)
  .venv/bin/python render.py full 16x9                          -> out/frames-16x9/*.png, then out/video-16x9.mp4 (60 fps)

The page is served over HTTP from this folder. After each seek we wait two animation frames before
the screenshot, so the frame on screen is exactly the one for that time.
"""
import http.server
import socketserver
import subprocess
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parent
OUT = ROOT / "out"
SIZES = {"16x9": (1920, 1080), "9x16": (1080, 1920), "4x5": (1080, 1350)}
DUR = 53.0


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = lambda *a, **k: Quiet(*a, directory=str(ROOT), **k)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


def open_page(p, fmt, port, scale=1.0):
    w, h = SIZES[fmt]
    browser = p.chromium.launch(args=["--force-color-profile=srgb", "--font-render-hinting=none", "--disable-threaded-animation"])
    page = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=scale)
    page.goto(f"http://127.0.0.1:{port}/film.html?render=1&f={fmt}")
    page.wait_for_function("window.ready === true", timeout=60_000)
    return browser, page


def shoot(page, t, path):
    page.evaluate(f"window.seek({t})")
    page.evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
    page.screenshot(path=str(path), clip={"x": 0, "y": 0, **dict(zip(("width", "height"), page.viewport_size.values()))})


def ffmpeg(*args):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True)


def probe(fmt, times):
    OUT.mkdir(exist_ok=True)
    d = OUT / f"probe-{fmt}"
    d.mkdir(exist_ok=True)
    httpd, port = serve()
    with sync_playwright() as p:
        browser, page = open_page(p, fmt, port)
        for i, t in enumerate(times):
            shoot(page, t, d / f"{i:02d}.png")
        browser.close()
    httpd.shutdown()
    cols = 2 if len(times) > 1 else 1
    rows = (len(times) + cols - 1) // cols
    w = 960 if fmt == "16x9" else 540
    ffmpeg("-i", str(d / "%02d.png"), "-vf", f"scale={w}:-1,tile={cols}x{rows}:padding=8:color=0x333333", "-frames:v", "1", str(OUT / f"probe-{fmt}.png"))
    print(OUT / f"probe-{fmt}.png")


def frames(fmt, fps, scale, a, b, tag):
    d = OUT / f"frames-{tag}"
    d.mkdir(parents=True, exist_ok=True)
    httpd, port = serve()
    with sync_playwright() as p:
        browser, page = open_page(p, fmt, port, scale)
        for n in range(a, b):
            path = d / f"{n:05d}.png"
            if path.exists():
                continue
            shoot(page, n / fps, path)
        browser.close()
    httpd.shutdown()
    return d


def encode(d, fps, dest, scale_to=None):
    vf = "scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p"
    if scale_to:
        vf = f"scale={scale_to}:flags=lanczos," + vf
    ffmpeg("-framerate", str(fps), "-i", str(d / "%05d.png"), "-vf", vf, "-color_range", "tv", "-colorspace", "bt709",
           "-c:v", "libx264", "-crf", "16", "-preset", "slow", "-movflags", "+faststart", str(dest))
    print(dest)


def stream(fmt, fps, a, b, dest):
    """Frames a..b straight into ffmpeg (no PNGs on disk)."""
    w, h = SIZES[fmt]
    httpd, port = serve()
    enc = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(fps), "-c:v", "png", "-i", "-",
                            "-vf", "scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p", "-color_range", "tv", "-colorspace", "bt709",
                            "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-g", "120", str(dest)], stdin=subprocess.PIPE)
    with sync_playwright() as p:
        browser, page = open_page(p, fmt, port)
        for n in range(a, b):
            page.evaluate(f"window.seek({n / fps})")
            page.evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
            enc.stdin.write(page.screenshot(clip={"x": 0, "y": 0, "width": w, "height": h}))
        browser.close()
    httpd.shutdown()
    enc.stdin.close()
    enc.wait()
    print(dest)


if __name__ == "__main__":
    mode, fmt = sys.argv[1], sys.argv[2]
    OUT.mkdir(exist_ok=True)
    if mode == "probe":
        probe(fmt, [float(x) for x in sys.argv[3:]])
    elif mode == "draft":
        fps = 30
        d = frames(fmt, fps, 0.5, 0, int(DUR * fps), f"draft-{fmt}")
        encode(d, fps, OUT / f"draft-{fmt}.mp4")
    elif mode == "chunk":  # full-quality frames a..b (for parallel rendering)
        frames(fmt, 60, 1.0, int(sys.argv[3]), int(sys.argv[4]), f"full-{fmt}")
    elif mode == "stream":  # .venv/bin/python render.py stream 16x9 <first frame> <last frame> <part.mp4>
        stream(fmt, 60, int(sys.argv[3]), int(sys.argv[4]), OUT / sys.argv[5])
    elif mode == "encode":
        encode(OUT / f"frames-full-{fmt}", 60, OUT / f"video-{fmt}.mp4")
