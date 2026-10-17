"""Thumbnails for the "Called it" ad.

  .venv/bin/python cover.py          -> out/cover-{16x9,9x16,4x5}.png
  .venv/bin/python cover.py embed    -> also out/Terrace-Called-it-{fmt}-cover.mp4: the ad with the cover
                                        as its first two frames (X and most players use frame 0 as the poster),
                                        audio and timing untouched.
"""
import subprocess
import sys

from playwright.sync_api import sync_playwright

from render import OUT, SIZES, serve


def shoot_covers():
    httpd, port = serve()
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--force-color-profile=srgb", "--font-render-hinting=none"])
        for fmt, (w, h) in SIZES.items():
            page = browser.new_page(viewport={"width": w, "height": h})
            page.goto(f"http://127.0.0.1:{port}/cover.html?f={fmt}")
            page.wait_for_function("window.ready === true", timeout=60_000)
            path = OUT / f"cover-{fmt}.png"
            page.screenshot(path=str(path), clip={"x": 0, "y": 0, "width": w, "height": h})
            print(path)
            page.close()
        browser.close()
    httpd.shutdown()


def embed(fmt):
    src, cover, dest = OUT / f"Terrace-Called-it-{fmt}.mp4", OUT / f"cover-{fmt}.png", OUT / f"Terrace-Called-it-{fmt}-cover.mp4"
    vf = "[1:v]scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p[c];[0:v][c]overlay=0:0:enable='lt(n,2)'"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-loop", "1", "-i", str(cover),
                    "-filter_complex", vf, "-shortest", "-map", "0:a", "-c:a", "copy",
                    "-color_range", "tv", "-colorspace", "bt709", "-c:v", "libx264", "-crf", "16", "-preset", "slow",
                    "-r", "60", "-movflags", "+faststart", str(dest)], check=True)
    print(dest)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    shoot_covers()
    if sys.argv[1:] == ["embed"]:
        for fmt in SIZES:
            embed(fmt)
