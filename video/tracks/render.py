"""Render the sponsor-track explainers from tracks.html (window.seek(t), pure function of time).

  ../demo/.venv/bin/python render.py probe envio 5 15 33 60     -> out/probe-envio.png (contact sheet)
  ../demo/.venv/bin/python render.py video envio                -> out/Terrace-x-Envio.mp4 (1080p60, music bed)
  ../demo/.venv/bin/python render.py video all                  -> every track, in parallel

Tracks: envio, alchemy, chainlink, mera, keys.
"""
import http.server
import socketserver
import subprocess
import sys
import threading
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parent
OUT = ROOT / "out"
BED = ROOT.parent / "demo/out/bed.wav"
TRACKS = {"envio": "Envio", "alchemy": "Alchemy", "chainlink": "Chainlink-CRE", "mera": "Mera-UX", "keys": "Mera-Many-Keys"}
W, H, FPS = 1920, 1080, 60


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = lambda *a, **k: Quiet(*a, directory=str(ROOT), **k)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


def open_page(p, track, port):
    browser = p.chromium.launch(args=["--force-color-profile=srgb", "--font-render-hinting=none", "--disable-threaded-animation"])
    page = browser.new_page(viewport={"width": W, "height": H})
    page.goto(f"http://127.0.0.1:{port}/tracks.html?track={track}&render=1")
    page.wait_for_function("window.ready === true", timeout=60_000)
    return browser, page


def shoot(page, t):
    page.evaluate(f"window.seek({t})")
    page.evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
    return page.screenshot(clip={"x": 0, "y": 0, "width": W, "height": H})


def probe(track, times):
    d = OUT / f"probe-{track}"
    d.mkdir(parents=True, exist_ok=True)
    httpd, port = serve()
    with sync_playwright() as p:
        browser, page = open_page(p, track, port)
        for i, t in enumerate(times):
            (d / f"{i:02d}.png").write_bytes(shoot(page, t))
        browser.close()
    httpd.shutdown()
    rows = (len(times) + 1) // 2
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(d / "%02d.png"), "-vf", f"scale=960:-1,tile=2x{rows}:padding=8:color=0x333333",
                    "-frames:v", "1", str(OUT / f"probe-{track}.png")], check=True)
    print(OUT / f"probe-{track}.png")


def video(track):
    silent = OUT / f"{track}-silent.mp4"
    httpd, port = serve()
    with sync_playwright() as p:
        browser, page = open_page(p, track, port)
        dur = page.evaluate("window.DUR")
        enc = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "png", "-i", "-",
                                "-vf", "scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p", "-color_range", "tv", "-colorspace", "bt709",
                                "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-g", "120", str(silent)], stdin=subprocess.PIPE)
        for n in range(int(dur * FPS)):
            enc.stdin.write(shoot(page, n / FPS))
        browser.close()
        enc.stdin.close()
        enc.wait()
    httpd.shutdown()
    # Music bed: the demo's bed, quietly, faded in and out to the track's length.
    final = OUT / f"Terrace-x-{TRACKS[track]}.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(silent), "-i", str(BED),
                    "-filter_complex", f"[1:a]atrim=0:{dur},volume=0.55,afade=t=in:d=1.2,afade=t=out:st={dur - 2.5}:d=2.5[a]",
                    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(final)], check=True)
    print(final, f"{dur:.1f}s")
    return str(final)


if __name__ == "__main__":
    mode, track = sys.argv[1], sys.argv[2]
    OUT.mkdir(exist_ok=True)
    if mode == "probe":
        probe(track, [float(x) for x in sys.argv[3:]])
    elif mode == "video":
        names = list(TRACKS) if track == "all" else [track]
        with ProcessPoolExecutor(len(names)) as ex:
            for f in ex.map(video, names):
                pass
