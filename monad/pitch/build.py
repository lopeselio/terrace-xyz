"""Builds pitch.terrace.social from the deck's slide files.

The slides are the same files as the Terrace Pitch Deck (Claude Slides). This turns them into one
static page: images from assets/, icons and arrows as inline SVG, narration captions and speaker
notes left out. Run: python3 build.py  ->  index.html (this folder is the Vercel deploy root; .vercelignore keeps the sources out)
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
SLIDES = HERE / "slides"

BLOBS = {
    "5d425cb423d571326835e9a1c7ba6f9d": "assets/terrace.png",
    "2e19432bfee807aab38a8606f60cb78d": "assets/monad.png",
    "1efc91358a067f89554f94a422066d6e": "assets/chainlink.png",
    "f987c0317d186c4cb070c782a0dfc279": "assets/envio.png",
    "6e1f9096aa548a627584712bfbfbafad": "assets/alchemy.png",
    "fac0fc67b929174df9c8ba2fb5c68053": "assets/founder.jpg",
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
    "CheckCircle": '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
    "Clock": '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
}


def icon(m: re.Match) -> str:
    name, style = m.group(1), m.group(2)
    return (f'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
            f'stroke-linecap="round" stroke-linejoin="round" style="flex:none;{style}">{ICONS[name]}</svg>')


def shape(m: re.Match) -> str:
    kind, style, rest = m.group(1), m.group(2), m.group(3)
    bg = re.search(r"background:([^;]+)", style).group(1)
    style = re.sub(r"background:[^;]+;?", "", style)
    if kind != "arrow-right":
        return f'<div style="{style};background:{bg}"{rest}></div>'
    return (f'<svg aria-hidden="true" viewBox="0 0 48 24" preserveAspectRatio="none" style="{style}"{rest}>'
            f'<path d="M0 8h30V0l18 12-18 12v-8H0z" fill="{bg}"/></svg>')


def clean(html: str) -> str:
    html = re.sub(r"<aside>.*?</aside>", "", html, flags=re.S)
    # narration captions from the video version of the deck
    html = re.sub(r'<p style="position:absolute;left:210px;bottom:36px[^"]*"[^>]*>.*?</p>\n?', "", html, flags=re.S)
    for blob, path in BLOBS.items():
        html = html.replace(f"/_blob/{blob}", path)
    html = re.sub(r'<x-icon name="(\w+)" style="([^"]*)"></x-icon>', icon, html)
    html = re.sub(r'<x-shape kind="([\w-]+)" style="([^"]*)"([^>]*)></x-shape>', shape, html)
    html = html.replace('<a href="http', '<a target="_blank" rel="noopener" href="http')
    return html.strip()


def main():
    order = json.loads((SLIDES / "deck.json").read_text())["order"]
    slides = "\n".join(f'<div class="frame"><div class="slide">{clean((SLIDES / f"{s}.html").read_text())}</div></div>' for s in order)
    page = (HERE / "template.html").read_text().replace("<!--SLIDES-->", slides)
    (HERE / "index.html").write_text(page)
    print(f"{len(order)} slides -> index.html")


if __name__ == "__main__":
    main()
