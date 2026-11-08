"""Export the PromptSkjold toolbar/store icons from design/logo/hand-small-cutout.png.

Run with the base conda env (Pillow, numpy, scipy):
    conda run -n base python scripts/export-icons.py

16/32 px: shield + redaction bar only (the text lines blur at that size).
48/128 px: shield + bar + teal "text lines" above and below the bar.
active-* / icon*: teal tile. inactive-* / dark-*: grey tile (monitoring off).
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "design", "logo", "hand-small-cutout.png")
OUT = os.path.join(ROOT, "src", "assets", "icons")
PAPER = (0xF3, 0xF2, 0xEF, 255)
TEAL = (0x3E, 0xC6, 0xBD, 255)
GREY = (0xB9, 0xB7, 0xB0, 255)
GREY_LINE = (0x8E, 0x8C, 0x85, 255)
S = 1024

art = Image.open(SRC).convert("RGBA")
a = np.asarray(art)[..., 3]
ink = a > 90
lab, _ = ndi.label(~ink)
interior = (~ink) & (lab != lab[0, 0])
rowsum = ink.sum(axis=1)
bar_rows = np.where(rowsum > 0.75 * rowsum.max())[0]
bar_y0, bar_y1 = bar_rows.min(), bar_rows.max()
ys, xs = np.where(interior)
ix0, ix1 = xs.min(), xs.max()
iw = ix1 - ix0


def layer(mask, color):
    arr = np.zeros((S, S, 4), np.uint8)
    arr[mask] = color
    return Image.fromarray(arr, "RGBA")


base = Image.alpha_composite(layer(interior, PAPER), art)


def wobbly(draw, rng, p0, p1, width, color, segs=5, jitter=3):
    pts = [
        (
            p0[0] + (p1[0] - p0[0]) * i / segs + rng.normal(0, jitter),
            p0[1] + (p1[1] - p0[1]) * i / segs + rng.normal(0, jitter),
        )
        for i in range(segs + 1)
    ]
    draw.line(pts, fill=color, width=width, joint="curve")
    r = width // 2
    for p in (pts[0], pts[-1]):
        draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=color)


def lines(color):
    rng = np.random.default_rng(7)  # same seed as the approved logo
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    left = ix0 + 70
    for k, frac in enumerate([0.62, 0.38]):
        y = bar_y0 - 80 - 80 * k
        wobbly(d, rng, (left, y), (left + int(iw * frac), y - 4), 30, color)
    for k, frac in enumerate([0.70, 0.36]):
        y = bar_y1 + 80 + 80 * k
        row = np.where(interior[y])[0]
        l2 = max(left, row.min() + 60)
        r2 = row.max() - 60
        wobbly(d, rng, (l2, y), (min(r2, l2 + int(iw * frac)), y - 4), 30, color)
    m = Image.fromarray((interior * 255).astype(np.uint8), "L").filter(ImageFilter.MinFilter(21))
    arr = np.asarray(im).copy()
    arr[..., 3] = np.minimum(arr[..., 3], np.asarray(m))
    return Image.fromarray(arr, "RGBA")


def tile(img, bg, pad=0.1, radius=0.22, size=1024):
    t = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(t).rounded_rectangle([0, 0, size - 1, size - 1], int(size * radius), fill=bg)
    inner = int(size * (1 - 2 * pad))
    t.alpha_composite(img.resize((inner, inner), Image.LANCZOS), (int(size * pad), int(size * pad)))
    return t


variants = {
    "teal-plain": tile(base, TEAL),
    "teal-lines": tile(Image.alpha_composite(base, lines(TEAL)), TEAL),
    "grey-plain": tile(base, GREY),
    "grey-lines": tile(Image.alpha_composite(base, lines(GREY_LINE)), GREY),
}

os.makedirs(OUT, exist_ok=True)
for size in (16, 32, 48, 128):
    kind = "plain" if size <= 32 else "lines"
    teal = variants[f"teal-{kind}"].resize((size, size), Image.LANCZOS)
    grey = variants[f"grey-{kind}"].resize((size, size), Image.LANCZOS)
    teal.save(os.path.join(OUT, f"icon{size}.png"))
    teal.save(os.path.join(OUT, f"active-{size}.png"))
    grey.save(os.path.join(OUT, f"inactive-{size}.png"))
    grey.save(os.path.join(OUT, f"dark-{size}.png"))
variants["teal-lines"].resize((256, 256), Image.LANCZOS).save(os.path.join(ROOT, "src", "assets", "logo.png"))
print("icons written to", OUT)
