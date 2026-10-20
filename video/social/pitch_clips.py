#!/usr/bin/env python3
"""
The pitch film's social clips (P1–P5 in the workbook's clip cut list), ready to post.

  python3 pitch_clips.py            -> pitch-clips/P*-9x16.mp4 and P*-16x9.mp4

P1–P4  9:16: the 16:9 film centred on a blurred copy of itself, the hook line on top and the
       link underneath, clear of TikTok's and Reels' bottom caption and right rail.
P5     9:16: Elio's phone face-cam full screen, synced to the voiced film, with big captions.
All    16:9: straight cuts of the voiced film for X (it already carries captions and the face-cam).

Cuts sit in pauses of the voice-over (found with silencedetect), so no clip starts or ends mid-word.
This ffmpeg has no drawtext, so text is drawn with PIL and overlaid. Fonts (OFL) are fetched once.
"""
import os
import subprocess
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
FILM = HERE.parent / "pitch/out/Terrace-Pitch-Elio.mp4"
FACE = Path.home() / "Downloads/83868C9B-5219-413B-9325-2169047D84B6.mov"
FACE_OFFSET = -4.534  # face_time = film_time + offset (facesync.py, see pitch/facecam.py)
FACE_LOOK = "curves=all='0/0 0.2/0.36 0.5/0.68 0.8/0.91 1/1',eq=saturation=1.12,colorbalance=rs=0.03:bs=-0.03:rm=0.02:bm=-0.02,unsharp=5:5:0.5"
OUT = HERE / "pitch-clips"
TMP = OUT / ".overlays"
FONTS = HERE / "fonts"
FONT_URLS = {
    "BarlowCondensed-ExtraBold.ttf": "barlowcondensed/BarlowCondensed-ExtraBold.ttf",
    "BarlowCondensed-Bold.ttf": "barlowcondensed/BarlowCondensed-Bold.ttf",
    "Barlow-SemiBold.ttf": "barlow/Barlow-SemiBold.ttf",
}
GREEN = (43, 212, 107)
W, H = 1080, 1920
FG_TOP = (H - 608) // 2  # where the 16:9 film sits in the 9:16 frame

# (code, slug, in, out, hook) — times in the voiced film, in pauses of the voice-over
CLIPS = [
    ("P1", "your-mate-was-right", 5.3, 15.6, "Your mate was right.\nNobody remembers."),
    ("P2", "the-chat-has-no-game", 15.5, 35.6, "3.5 billion fans.\nThe chat has no game."),
    ("P3", "any-take-becomes-a-market", 35.5, 48.9, "Any take becomes\na market"),
    ("P4", "only-terrace-has-all-three", 70.7, 82.7, "Fantasy has friends.\nSportsbooks have stakes.\nCrypto is open."),
    ("P5", "footballer-and-gamer", 96.66, 114.2, "I'm a footballer and a gamer.\nSo I built this."),
]
# P5 captions (film time): each spoken line split in two so it reads at a glance
P5_LINES = [
    (96.78, 100.75, "I'm Elio: footballer, lifelong fan, | and a gamer at heart."),
    (100.75, 105.81, "Straight out of university, | I co-founded IntoTheVerse Games | to build games in web3."),
    (105.81, 110.99, "Terrace is the beautiful game, | with your friends, | where being right finally counts."),
    (110.99, 114.10, "Ahmed deserves a Terrace. | So do you."),
]


def font(name, size):
    path = FONTS / name
    if not path.exists():
        FONTS.mkdir(exist_ok=True)
        urllib.request.urlretrieve(f"https://github.com/google/fonts/raw/main/ofl/{FONT_URLS[name]}", path)
    return ImageFont.truetype(str(path), size)


def centred(draw, y, text, f, fill, spacing=10, stroke=0):
    box = draw.multiline_textbbox((0, 0), text, font=f, spacing=spacing, align="center", stroke_width=stroke)
    draw.multiline_text(((W - (box[2] - box[0])) / 2, y), text, font=f, fill=fill, spacing=spacing, align="center",
                        stroke_width=stroke, stroke_fill=(0, 0, 0, 200))
    return box[3] - box[1]


def fitted(draw, text, name, size, width=960):
    """The biggest size up to `size` at which every line fits the width."""
    while size > 40:
        f = font(name, size)
        box = draw.multiline_textbbox((0, 0), text, font=f, spacing=8, align="center")
        if box[2] - box[0] <= width:
            return f
        size -= 4
    return font(name, size)


def hook_card(text, path, shade=False):
    """Kicker, hook and link on a transparent 9:16 layer."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    if shade:  # darken the top of a full-screen face so the hook reads
        grad = Image.new("L", (1, 760))
        for y in range(760):
            grad.putpixel((0, y), int(225 * (1 - y / 760) ** 0.9))
        img.paste((0, 0, 0, 255), (0, 0, W, 760), grad.resize((W, 760)))
    d = ImageDraw.Draw(img)
    lines = text.upper()
    hook = fitted(d, lines, "BarlowCondensed-ExtraBold.ttf", 104)
    stroke = 3 if shade else 0
    box = d.multiline_textbbox((0, 0), lines, font=hook, spacing=8, align="center")
    block = 52 + (box[3] - box[1])
    top = (FG_TOP - block) / 2 + 30 if not shade else 200
    centred(d, top, "TERRACE", font("BarlowCondensed-Bold.ttf", 40), GREEN, stroke=stroke)
    centred(d, top + 52, lines, hook, (255, 255, 255), spacing=8, stroke=stroke)
    link = font("Barlow-SemiBold.ttf", 42)
    y = FG_TOP + 608 + 70 if not shade else 1530
    centred(d, y, "play.terrace.social", link, (255, 255, 255, 235), stroke=stroke)
    centred(d, y + 58, "Free to play · test money", font("Barlow-SemiBold.ttf", 32), (200, 210, 205, 230), stroke=stroke)
    img.save(path)


def caption_card(text, path):
    """One caption chunk in a dark pill, low in the frame above the platform UI."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f = font("BarlowCondensed-Bold.ttf", 76)
    box = d.textbbox((0, 0), text, font=f)
    tw, th = box[2] - box[0], box[3] - box[1]
    x, y = (W - tw) / 2, 1360
    pill = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(pill).rounded_rectangle((x - 30, y - 18, x + tw + 30, y + th + 34), 26, fill=(8, 12, 10, 190))
    img = Image.alpha_composite(img, pill.filter(ImageFilter.GaussianBlur(0.6)))
    ImageDraw.Draw(img).text((x, y - box[1] + 6), text, font=f, fill=(255, 255, 255))
    img.save(path)


def p5_chunks():
    """Split each line at "|" and share its time by length, so captions track the voice."""
    out = []
    for a, b, text in P5_LINES:
        parts = [p.strip() for p in text.split("|")]
        total = sum(len(p) for p in parts)
        t = a
        for p in parts:
            dt = (b - a) * len(p) / total
            out.append((t, t + dt, p))
            t += dt
    return out


def run(args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


ENC = ["-c:v", "libx264", "-crf", "19", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart"]


def vertical_stacked(code, slug, t0, t1, hook):
    card = TMP / f"{code}-hook.png"
    hook_card(hook, card)
    graph = (
        "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30,eq=brightness=-0.08[bg];"
        f"[0:v]scale=1080:-2[fg];[bg][fg]overlay=0:{FG_TOP}[s];[s][1:v]overlay=0:0[v]"
    )
    run(["-ss", str(t0), "-to", str(t1), "-i", str(FILM), "-i", str(card), "-filter_complex", graph, "-map", "[v]", "-map", "0:a", *ENC, str(OUT / f"{code}-{slug}-9x16.mp4")])


def vertical_face(code, slug, t0, t1, hook):
    dur = t1 - t0
    card = TMP / f"{code}-hook.png"
    hook_card(hook, card, shade=True)
    inputs = ["-ss", str(t0), "-to", str(t1), "-i", str(FILM), "-ss", f"{t0 + FACE_OFFSET:.3f}", "-t", f"{dur:.3f}", "-i", str(FACE), "-i", str(card)]
    graph = f"[1:v]{FACE_LOOK},scale=1080:1920,setsar=1,fps=30[f];[f][2:v]overlay=0:0[v0]"
    for i, (a, b, text) in enumerate(p5_chunks()):
        png = TMP / f"{code}-cap{i}.png"
        caption_card(text, png)
        inputs += ["-i", str(png)]
        graph += f";[v{i}][{i + 3}:v]overlay=0:0:enable='between(t,{a - t0:.2f},{b - t0:.2f})'[v{i + 1}]"
    last = len(p5_chunks())
    run([*inputs, "-filter_complex", graph, "-map", f"[v{last}]", "-map", "0:a", *ENC, str(OUT / f"{code}-{slug}-9x16.mp4")])


def landscape(code, slug, t0, t1):
    run(["-ss", str(t0), "-to", str(t1), "-i", str(FILM), *ENC, str(OUT / f"{code}-{slug}-16x9.mp4")])


if __name__ == "__main__":
    TMP.mkdir(parents=True, exist_ok=True)
    for code, slug, t0, t1, hook in CLIPS:
        (vertical_face if code == "P5" else vertical_stacked)(code, slug, t0, t1, hook)
        landscape(code, slug, t0, t1)
        print(f"{code} {slug}: {t1 - t0:.1f}s")
