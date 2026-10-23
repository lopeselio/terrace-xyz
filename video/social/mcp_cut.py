#!/usr/bin/env python3
"""
"Claude v Claude": the terrace-mcp screen recording cut to ~2 min for a quote-post of @pareen.

  python3 mcp_cut.py        -> out/Terrace-Claude-v-Claude.mp4 (silent, 1920x1080, 30 fps)
  python3 mcp_cut.py small  -> out/Terrace-Claude-v-Claude-small-subs.mp4 (smaller subtitles)
  python3 mcp_cut.py none   -> out/Terrace-Claude-v-Claude-no-subs.mp4 (no subtitles)
                               out/Terrace-Claude-v-Claude.srt and -vo.txt (the voice-over lines)

Each shot is a slice of the recording, sped up or slowed to fit, cropped onto the text that matters.
The moments a transaction lands (challenge live in Claude Code, the accept in Claude Desktop, both on
the explorer) are held near real time. Shots are joined with xfade; subtitles are PNGs drawn with PIL
(this ffmpeg has no drawtext) and faded in over the whole timeline. They double as the voice-over
script, so each runs at ~2.5 words a second.
"""
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
SRC = HERE / "terrace-claude-mcp - HD 1080p.mov"
OUT = HERE / "out"
TMP = OUT / ".mcp-cut"
FONTS = HERE / "fonts"
NAME = "Terrace-Claude-v-Claude"
GREEN = (43, 212, 107)
W, H, FPS = 1920, 1080, 30
XF = 0.35  # transition length
SUB_STYLE = sys.argv[1] if len(sys.argv) > 1 else "big"  # big | small | none
# font size, padding x/y, box height, top of the box from the bottom, corner radius
SUB_LOOK = {"big": (50, 34, 18, 70, 150, 22), "small": (32, 22, 12, 46, 92, 14)}
SUFFIX = {"big": "", "small": "-small-subs", "none": "-no-subs"}[SUB_STYLE]

FULL = (0, 0, 1920, 1080)
TERM = (0, 180, 1600, 900)  # terminal, prompt end (the bottom) in view
CARD = (409, 90, 1102, 620)  # the 1v1 card on play.terrace.social
DESK = (560, 200, 1280, 720)  # Claude Desktop's chat column
DESK_TOP = (560, 0, 1280, 720)

# (in, out, length on screen, crop x,y,w,h, transition into the next shot, subtitle)
# subtitle None = the previous one carries on over this shot; *word* is drawn green
SHOTS = [
    (0.0, 2.0, 3.0, FULL, "fade", "Yesterday *Pareen* posted this."),
    (2.0, 4.2, 5.6, (495, 440, 960, 540), "smoothleft",
     "Why can't my Claude bet his Claude, *peer to peer*, over an MCP server?"),
    (4.2, 7.8, 5.6, (440, 30, 1140, 641), "fadeblack",
     "Earlier today I replied that a *Claude-to-Claude* server was next on my list."),
    (11.0, 18.0, 3.0, TERM, "fade", "So I built it. *terrace-mcp* gives every Claude its own wallet."),
    (18.0, 23.0, 3.8, (0, 30, 1600, 900), "smoothleft", None),
    (27.0, 30.5, 5.8, (240, 180, 1600, 900), "smoothright",
     "Mine lives on *Monad testnet*. Every bet is a transaction you can look up."),
    (8.0, 10.8, 4.8, (640, 60, 1000, 563), "smoothleft",
     "My mate's Claude, in *Claude Desktop*, has a wallet of its own."),
    (36.3, 44.6, 5.0, TERM, "fade", "I ask Claude Code what's on. *Villa v City*, tomorrow."),
    (44.6, 47.5, 2.8, TERM, "fade", "My take, in plain words: *City win*."),
    (54.0, 55.8, 6.6, (0, 100, 1600, 900), "fade",
     "Claude turns it into a *rule*: yes if City outscore Villa at full time."),
    (56.0, 66.6, 4.6, TERM, "fade", "Then: bet my mate *$10*, and only his Claude can accept."),
    (66.8, 69.0, 4.6, TERM, "fade", "Challenge 16 goes *on-chain*. My $10 is locked in escrow."),
    (69.0, 72.0, 5.2, (0, 240, 1493, 840), "smoothleft",
     "I get a link, an invite to send, and the *transaction* hash."),
    (73.6, 77.0, 3.8, CARD, "smoothright", "The link opens the bet on *play.terrace.social*."),
    (86.0, 91.0, 2.6, TERM, "smoothleft", "I copy the invite and paste it into my mate's Claude."),
    (91.5, 94.5, 2.6, DESK, "fade", None),
    (94.5, 103.5, 4.2, DESK, "fade", "It looks up challenge 16 through the *same MCP server*."),
    (103.8, 109.5, 6.6, DESK, "fade",
     "And reads it back: the take, who's on which side, the *stake* and the deadline."),
    (109.5, 111.5, 2.4, DESK_TOP, "fade", "It won't stake a thing until I say *yes*."),
    (111.5, 117.5, 1.6, DESK_TOP, "fade", None),
    (117.6, 119.3, 5.4, DESK_TOP, "fade", "Done. It matches my $10 on the *no* side, in its own transaction."),
    (119.3, 121.0, 3.8, DESK_TOP, "smoothleft", "*$20* in the pot. Chainlink settles it after full time."),
    (123.6, 127.8, 5.6, (200, 180, 1600, 900), "smoothleft",
     "On the explorer: the *accept*, $10 in test dollars from his Claude's wallet."),
    (128.6, 136.5, 6.0, CARD, "fadeblack", "The page shows both sides now: *Claude v Mate's Claude*."),
    (143.5, 150.6, 6.0, (640, 0, 960, 540), "fadeblack",
     "His Claude talks football too, and it *collects* the $20 if it wins."),
    (152.2, 155.8, 4.8, FULL, "smoothleft", "To try it: in Claude Desktop, switch on the *terrace* connector."),
    (156.2, 158.9, 4.0, (300, 280, 1400, 788), "smoothleft", "In Claude Code, add it with *npx terrace-mcp*."),
    (160.0, 163.5, 4.6, (200, 60, 1400, 788), "fadeblack", "It's open source, MIT. Go bet your *mates' Claudes*."),
]
END_CARD = 4.0

# (first shot, last shot, line), from the subtitles above
SUBS = []
for _i, _shot in enumerate(SHOTS):
    if _shot[5] is None:
        SUBS[-1] = (SUBS[-1][0], _i, SUBS[-1][2])
    else:
        SUBS.append((_i, _i, _shot[5]))


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def run(args):
    subprocess.run(args, check=True)


def shot_starts():
    starts, t = [], 0.0
    for i, s in enumerate(SHOTS):
        starts.append(t)
        t += s[2] - XF
    return starts, t + XF  # end of the last shot; the end card overlaps it by XF


def cut_shot(i, shot):
    a, b, length, (x, y, w, h) = shot[:4]
    dst = TMP / f"shot{i:02d}.mp4"
    vf = (f"setpts=(PTS-STARTPTS)*{length / (b - a):.5f},fps={FPS},"
          f"crop={w}:{h}:{x}:{y},scale={W}:{H}:flags=lanczos,setsar=1,format=yuv420p")
    run(["ffmpeg", "-v", "error", "-y", "-ss", f"{a}", "-t", f"{b - a}", "-i", str(SRC), "-map", "0:v:0",
         "-vf", vf, "-t", f"{length}", "-c:v", "libx264", "-crf", "12", "-preset", "fast", str(dst)])
    return dst


def segments(line):
    """'a *b* c' -> [('a ', False), ('b', True), (' c', False)]"""
    return [(part, i % 2 == 1) for i, part in enumerate(line.split("*")) if part]


def draw_sub(i, line):
    size, pad_x, pad_y, box_h, from_bottom, radius = SUB_LOOK[SUB_STYLE]
    f = font("Barlow-SemiBold.ttf", size)
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    parts = segments(line)
    width = sum(d.textlength(p, font=f) for p, _ in parts)
    x0 = (W - width) / 2
    top = H - from_bottom
    d.rounded_rectangle((x0 - pad_x, top - pad_y, x0 + width + pad_x, top + box_h + pad_y - 10),
                        radius=radius, fill=(10, 10, 10, 215))
    x = x0
    for p, hot in parts:
        d.text((x, top + size * 0.08), p, font=f, fill=GREEN if hot else (245, 245, 245))
        x += d.textlength(p, font=f)
    dst = TMP / f"sub{i:02d}.png"
    img.save(dst)
    return dst


def end_card():
    img = Image.new("RGB", (W, H), (11, 11, 11))
    d = ImageDraw.Draw(img)
    big = font("BarlowCondensed-ExtraBold.ttf", 150)
    small = font("Barlow-SemiBold.ttf", 46)
    tiny = font("Barlow-SemiBold.ttf", 34)
    for text, y, fill, f in [
        ("TERRACE", 250, GREEN, font("BarlowCondensed-ExtraBold.ttf", 64)),
        ("BET YOUR MATE'S", 340, (245, 245, 245), big),
        ("CLAUDE.", 490, GREEN, big),
        ("play.terrace.social   ·   npx terrace-mcp", 700, (245, 245, 245), small),
        ("Monad testnet  ·  test dollars  ·  settled by Chainlink", 775, (150, 150, 150), tiny),
    ]:
        d.text(((W - d.textlength(text, font=f)) / 2, y), text, font=f, fill=fill)
    png = TMP / "end.png"
    img.save(png)
    dst = TMP / "end.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", str(FPS), "-i", str(png), "-t", f"{END_CARD}",
         "-vf", "format=yuv420p", "-c:v", "libx264", "-crf", "12", "-preset", "fast", str(dst)])
    return dst


def stamp(t):
    ms = round(t * 1000)
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def main():
    TMP.mkdir(parents=True, exist_ok=True)
    clips = [cut_shot(i, s) for i, s in enumerate(SHOTS)] + [end_card()]
    starts, last_end = shot_starts()
    total = last_end - XF + END_CARD

    # subtitle windows: from just after the first shot's transition to just before the last shot's
    windows = []
    for first, last, line in SUBS:
        a = starts[first] + (0.15 if first else 0.3)
        b = starts[last] + SHOTS[last][2] - XF - 0.05
        windows.append((a, b, line))

    inputs, graph = [], []
    for c in clips:
        inputs += ["-i", str(c)]
    prev, length = "[0:v]", SHOTS[0][2]
    for i in range(1, len(clips)):
        kind = SHOTS[i - 1][4]
        out = f"[x{i}]"
        graph.append(f"{prev}[{i}:v]xfade=transition={kind}:duration={XF}:offset={length - XF:.3f}{out}")
        prev = out
        length += (SHOTS[i][2] if i < len(SHOTS) else END_CARD) - XF
    n = len(clips)
    for j, (a, b, line) in enumerate(windows if SUB_STYLE != "none" else []):
        inputs += ["-loop", "1", "-framerate", str(FPS), "-t", f"{total:.3f}", "-i", str(draw_sub(j, line))]
        graph.append(f"[{n + j}:v]format=rgba,fade=t=in:st={a:.3f}:d=0.18:alpha=1,"
                     f"fade=t=out:st={b - 0.18:.3f}:d=0.18:alpha=1[s{j}]")
        graph.append(f"{prev}[s{j}]overlay=0:0:shortest=1[o{j}]")
        prev = f"[o{j}]"

    OUT.mkdir(exist_ok=True)
    video = OUT / f"{NAME}{SUFFIX}.mp4"
    run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(graph), "-map", prev,
         "-t", f"{total:.3f}", "-r", str(FPS), "-c:v", "libx264", "-crf", "18", "-preset", "slow",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(video)])

    srt, vo = [], []
    for k, (a, b, line) in enumerate(windows, 1):
        plain = line.replace("*", "")
        srt.append(f"{k}\n{stamp(a)} --> {stamp(b)}\n{plain}\n")
        vo.append(f"{a:5.1f}–{b:5.1f} s  {plain}")
    (OUT / f"{NAME}.srt").write_text("\n".join(srt))
    (OUT / f"{NAME}-vo.txt").write_text("\n".join(vo) + "\n")
    print(f"{video}  {total:.1f} s")


if __name__ == "__main__":
    main()
