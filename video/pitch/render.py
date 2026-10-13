"""Render pitch.html (window.seek(t), a pure function of time) to video.

  .venv/bin/python render.py probe 1.5 8 20       -> out/probe.png (contact sheet of those times)
  .venv/bin/python render.py stream <a> <b> <part.mp4>   frames a..b at 60 fps piped into ffmpeg
  .venv/bin/python render.py all                  -> out/Terrace-Pitch.mp4 (4 parts in parallel, then joined)
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


def open_page(p, port):
    browser = p.chromium.launch(args=["--force-color-profile=srgb", "--font-render-hinting=none"])
    page = browser.new_page(viewport={"width": W, "height": H})
    page.goto(f"http://127.0.0.1:{port}/pitch.html?render=1")
    page.wait_for_function("window.ready === true", timeout=60_000)
    return browser, page


def frame(page, t):
    page.evaluate(f"window.seek({t})")
    page.evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
    return page.screenshot(clip={"x": 0, "y": 0, "width": W, "height": H})


def duration():
    import json, re
    return json.loads(re.search(r"const TL = (\{.*?\});\n", (ROOT / "pitch.html").read_text(), re.S).group(1))["dur"]


def probe(times):
    d = OUT / "probe"
    d.mkdir(parents=True, exist_ok=True)
    httpd, port = serve()
    with sync_playwright() as p:
        browser, page = open_page(p, port)
        for i, t in enumerate(times):
            (d / f"{i:02d}.png").write_bytes(frame(page, t))
        browser.close()
    httpd.shutdown()
    cols = 2 if len(times) > 1 else 1
    rows = (len(times) + cols - 1) // cols
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(d / "%02d.png"), "-vf", f"scale=960:-1,tile={cols}x{rows}:padding=8:color=0x333333",
                    "-frames:v", "1", str(OUT / "probe.png")], check=True)
    print(OUT / "probe.png")


def stream(a, b, dest):
    httpd, port = serve()
    enc = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "png", "-i", "-",
                            "-vf", "scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p", "-color_range", "tv", "-colorspace", "bt709",
                            "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-g", "120", str(dest)], stdin=subprocess.PIPE)
    with sync_playwright() as p:
        browser, page = open_page(p, port)
        for n in range(a, b):
            enc.stdin.write(frame(page, n / FPS))
        browser.close()
    httpd.shutdown()
    enc.stdin.close()
    enc.wait()


def render_all(parts=4):
    total = int(round(duration() * FPS))
    step = -(-total // parts)
    step += (-step) % 120  # parts start on keyframes (-g 120) so concat -c copy is clean
    procs, names = [], []
    for i in range(parts):
        a, b = i * step, min(total, (i + 1) * step)
        if a >= b:
            break
        name = OUT / f"part{i}.mp4"
        names.append(name)
        procs.append(subprocess.Popen([sys.executable, __file__, "stream", str(a), str(b), str(name)]))
    for pr in procs:
        assert pr.wait() == 0
    lst = OUT / "parts.txt"
    lst.write_text("".join(f"file '{n.name}'\n" for n in names))
    dest = OUT / "Terrace-Pitch.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", "-movflags", "+faststart", str(dest)], check=True)
    for n in names:
        n.unlink()
    lst.unlink()
    print(dest)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    mode = sys.argv[1]
    if mode == "probe":
        probe([float(x) for x in sys.argv[2:]])
    elif mode == "stream":
        stream(int(sys.argv[2]), int(sys.argv[3]), Path(sys.argv[4]))
    elif mode == "all":
        render_all()
