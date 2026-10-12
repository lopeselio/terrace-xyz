"""Crop Safari's address bar and toolbar off the app screenshots -> screens/sNN.png (NN = sorted index)."""
import glob
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(__file__).parents[2] / "monad/video-files"
OUT = Path(__file__).parent / "screens"
OUT.mkdir(exist_ok=True)

for i, f in enumerate(sorted(glob.glob(str(SRC / "IMG_*.PNG")))):
    im = Image.open(f).convert("RGB")
    a = np.asarray(im).astype(int)
    m, s = a.mean(axis=(1, 2)), a.std(axis=(1, 2))
    h = a.shape[0]
    # top: the browser chrome ends where the app's near-black canvas starts, below the status bar
    top = next(y for y in range(150, 500) if m[y] < 30 and s[y] < 6 and m[y - 1] > 40)
    # bottom: Safari's toolbar is a flat grey band; screenshots with the compact bar have none
    bot = next((y for y in range(2400, h) if m[y] > 45 and s[y] < 45 and m[y - 1] < 30), h)
    im.crop((0, top, im.width, bot)).save(OUT / f"s{i:02d}.png", optimize=True)
    print(i, Path(f).name, top, bot)
