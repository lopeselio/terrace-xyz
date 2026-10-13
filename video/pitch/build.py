"""Build pitch.html (the 2-minute pitch film) from the deck's slide files in slides/.

  python3 build.py            -> pitch.html + out/pitch.srt + out/timings.txt

Each slide's captions become karaoke lines: every word gets a start time from a reading-pace model,
and every data-build-in / data-build-out step is placed on the timeline (click steps land on the caption
that enters with them, auto steps are spread across the line being read).
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent
SLIDES = ROOT / "slides"
OUT = ROOT / "out"
ORDER = ["cover", "story", "market", "problem", "move", "product", "social", "leagues", "compare", "monad", "stack", "growth", "close"]

ASSETS = {
    "/_blob/5d425cb423d571326835e9a1c7ba6f9d": "assets/terrace-logo.png",
    "/_blob/2e19432bfee807aab38a8606f60cb78d": "assets/monad.png",
    "/_blob/1efc91358a067f89554f94a422066d6e": "assets/chainlink.png",
    "/_blob/f987c0317d186c4cb070c782a0dfc279": "assets/envio.png",
    "/_blob/6e1f9096aa548a627584712bfbfbafad": "assets/alchemy.png",
    "/_blob/fac0fc67b929174df9c8ba2fb5c68053": "assets/founder-elio.jpg",
}

ICONS = {
    "Users": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    "Lock": '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    "Key": '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
    "Chat": '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    "Lightning": '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    "Link": '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    "Star": '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    "Play": '<polygon points="6 3 20 12 6 21 6 3"/>',
    "Lightbulb": '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    "Activity": '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    "Clock": '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    "CheckCircle": '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
}

# Reading-pace model (seconds). Tuned so the whole film lands just under two minutes.
WORD_BASE, PER_CHAR = 0.17, 0.042
PAUSE = {",": 0.12, ":": 0.15, ".": 0.22, "?": 0.22, "!": 0.22}
LINE_GAP = 0.30          # breath between two lines on one slide
LEAD = 0.40              # slide on screen before its first line starts
TAIL = 0.35              # after the last line before the next slide
TARGET = 117.0           # whole film, seconds
XFADE = 0.5              # slide transition
AUTO_LEAD = 0.35         # spacing of auto steps before the first line (cover logo, title)


PACE = 1.0  # scales word durations; fitted in main() so the film lands on TARGET


def word_times(text, start):
    words, t = [], start
    for raw in text.split():
        letters = re.sub(r"[^A-Za-z0-9]", "", raw)
        dur = PACE * (WORD_BASE + PER_CHAR * max(len(letters), 1))
        words.append({"w": raw, "t0": round(t, 3), "t1": round(t + dur, 3)})
        t += dur + PAUSE.get(raw[-1], 0)
    return words, t


def builds(attr):
    if not attr:
        return None
    parts = attr.split()
    return {"effect": parts[0], "order": int(parts[1]), "auto": "auto" in parts[2:]}


def convert(sid):
    src = (SLIDES / f"{sid}.html").read_text()
    src = re.sub(r"<aside>.*?</aside>\s*", "", src, flags=re.S)
    caps = []

    def take_caption(m):
        caps.append({"in": builds(m.group(1)), "out": builds(m.group(2)), "text": html.unescape(m.group(3))})
        return ""
    src = re.sub(r'<p style="position:absolute;left:210px;bottom:36px[^"]*" data-build-in="([^"]+)"(?: data-build-out="([^"]+)")?>(.*?)</p>\n?', take_caption, src)
    for blob, path in ASSETS.items():
        src = src.replace(blob, path)
    src = re.sub(r'<x-icon name="(\w+)" style="([^"]*)"></x-icon>',
                 lambda m: f'<svg style="{m.group(2)};flex:none" viewBox="-4 -4 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{ICONS[m.group(1)]}</svg>', src)

    def arrow(m):
        style, rest = m.group(1), m.group(2)
        color = re.search(r"background:([^;\"]+)", style).group(1)
        style = re.sub(r";?background:[^;\"]+", "", style)
        return f'<svg style="{style}"{rest} viewBox="0 0 64 32" preserveAspectRatio="none"><path d="M0 10h38V0l26 16-26 16V22H0z" fill="{color}"/></svg>'
    src = re.sub(r'<x-shape kind="arrow-right" style="([^"]*)"([^>]*)></x-shape>', arrow, src)
    src = src.replace("<section ", '<div class="slide" ', 1).replace("</section>", "</div>")
    return src, caps


def plan(sid, src, caps, start):
    """Return the slide's lines (with word times), its build steps (order -> time) and its end time."""
    orders = sorted({int(o) for o in re.findall(r'data-build-(?:in|out)="\w+ (\d+)', src)} | {c["in"]["order"] for c in caps})
    autos = {}
    for m in re.finditer(r'data-build-(?:in|out)="\w+ (\d+)( auto)?"', src):
        autos.setdefault(int(m.group(1)), []).append(bool(m.group(2)))
    cap_at = {c["in"]["order"]: c for c in caps}
    first_cap = min(cap_at)
    pre = [o for o in orders if o < first_cap]
    t = start + LEAD + AUTO_LEAD * len(pre)
    lines = []
    for o in sorted(cap_at):
        words, end = word_times(cap_at[o]["text"], t)
        lines.append({"order": o, "t0": t, "t1": end, "words": words, "text": cap_at[o]["text"]})
        t = end + LINE_GAP
    last_end = lines[-1]["t1"]
    step_t = {}
    for i, o in enumerate(pre):
        step_t[o] = start + 0.15 + AUTO_LEAD * i
    anchors = [(l["order"], l["t0"], l["t1"]) for l in lines]
    for k, (o, t0, t1) in enumerate(anchors):
        step_t[o] = t0
        nxt = anchors[k + 1][0] if k + 1 < len(anchors) else 10 ** 6
        run = [x for x in orders if o < x < nxt]
        if run:
            span = (t1 - t0) * 0.72
            gap = min(1.3, max(0.3, span / len(run)))
            for j, x in enumerate(run):
                step_t[x] = t0 + gap * (j + 1)
    end = max(last_end + TAIL, max(step_t.values()) + 0.9)
    for l in lines:
        l["t0"], l["t1"] = round(l["t0"], 3), round(l["t1"], 3)
    return lines, {str(k): round(v, 3) for k, v in step_t.items()}, round(end, 3)


# With a face-cam bubble in the bottom-right corner (facecam.py), keep that corner clear:
# no logo badge, captions shifted left, and the few elements that reach into it pulled up.
BUBBLE_SAFE = [
    ("leagues", "left:1060px;top:740px", "left:1060px;top:690px"),
    ("close", "left:1376px;top:128px;width:416px;height:792px", "left:1376px;top:128px;width:416px;height:672px"),
    ("close", "gap:24px;box-shadow", "gap:16px;box-shadow"),
    ("close", 'alt="Terrace logo" style="width:104px;height:104px', 'alt="Terrace logo" style="width:72px;height:72px'),
    ("product", "top:290px;width:395px;height:290px", "top:270px;width:395px;height:262px"),
    ("product", "top:600px;width:395px;height:290px", "top:550px;width:395px;height:262px"),
    ("stack", "top:390px;width:536px", "top:370px;width:536px"),
    ("stack", "top:660px;width:536px", "top:625px;width:536px"),
    ("cover", "left:128px;top:830px;width:1664px", "left:128px;top:830px;width:1440px"),
]
BADGE_RE = r'<img src="assets/terrace-logo.png" alt="Terrace logo" style="position:absolute;right:64px;bottom:48px[^>]*>\n?'


def srt_time(t):
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def layout():
    t = 0.0
    timeline, bodies = [], []
    for sid in ORDER:
        src, caps = convert(sid)
        if BUBBLE:
            src = re.sub(BADGE_RE, "", src)
            for target, old, new in BUBBLE_SAFE:
                if target == sid:
                    assert old in src, (sid, old)
                    src = src.replace(old, new)
        lines, steps, end = plan(sid, src, caps, t)
        transition = re.search(r'data-transition="(\w+)"', src).group(1)
        timeline.append({"id": sid, "t0": round(t, 3), "t1": end, "lines": lines, "steps": steps, "transition": transition})
        bodies.append(src)
        t = end
    return timeline, bodies, round(t + 0.6, 3)


def main():
    global PACE
    OUT.mkdir(exist_ok=True)
    for _ in range(30):
        timeline, bodies, total = layout()
        if abs(total - TARGET) < 0.05:
            break
        speech = sum(w["t1"] - w["t0"] for s in timeline for l in s["lines"] for w in l["words"])
        PACE *= 1 + (TARGET - total) / speech
    data = json.dumps({"slides": timeline, "dur": total, "xfade": XFADE})
    page = (ROOT / "template.html").read_text()
    if BUBBLE:
        page = page.replace("#cap { position: absolute; left: 210px; bottom: 36px; width: 1500px;", "#cap { position: absolute; left: 128px; bottom: 36px; width: 1460px;").replace("/*TIMELINE*/", data).replace("<!--SLIDES-->", "\n".join(bodies))
    (ROOT / "pitch.html").write_text(page)

    n, srt, rep = 1, [], [f"Total {total:.1f}s · {sum(len(l['words']) for s in timeline for l in s['lines'])} words · pace x{PACE:.2f}\n"]
    for s in timeline:
        rep.append(f"{s['id']:8} {s['t0']:6.1f}s – {s['t1']:6.1f}s  ({s['t1'] - s['t0']:.1f}s)")
        for l in s["lines"]:
            srt.append(f"{n}\n{srt_time(l['t0'])} --> {srt_time(l['t1'] + 0.3)}\n{l['text']}\n")
            rep.append(f"           {l['t0']:6.1f}s  {l['text']}")
            n += 1
    (OUT / "pitch.srt").write_text("\n".join(srt))
    (OUT / "timings.txt").write_text("\n".join(rep) + "\n")
    print("\n".join(rep))


BUBBLE = False

if __name__ == "__main__":
    import sys
    BUBBLE = "bubble" in sys.argv[1:]
    main()
