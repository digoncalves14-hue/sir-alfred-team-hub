"""Gera o ícone original do JARVIS AI (anéis holográficos ciano sobre azul-marinho).
Uso: python3 scripts/make-icon.py  → apps/mobile/assets/icon.png e splash-icon.png"""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "apps" / "mobile" / "assets"
S = 1024
CYAN = (56, 220, 255)
BLUE = (30, 123, 255)
VIOLET = (124, 108, 255)

def orb(size: int, background: bool) -> Image.Image:
    scale = size / S
    img = Image.new("RGBA", (size, size), (3, 6, 15, 255) if background else (0, 0, 0, 0))
    c = size / 2
    if background:
        bg = Image.new("RGBA", (size, size))
        d = ImageDraw.Draw(bg)
        for r in range(int(size * 0.72), 0, -4):
            t = r / (size * 0.72)
            col = (int(3 + 10 * (1 - t)), int(8 + 30 * (1 - t)), int(20 + 50 * (1 - t)), 255)
            d.ellipse([c - r, c - r, c + r, c + r], fill=col)
        img = Image.alpha_composite(img, bg)

    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    lw = lambda w: max(1, int(w * scale))
    R = lambda f: f * size
    # anel externo segmentado
    for k in range(6):
        start = k * 60 + 6
        g.arc([c - R(0.40), c - R(0.40), c + R(0.40), c + R(0.40)], start, start + 40, fill=CYAN + (255,), width=lw(22))
    # anel interno tracejado
    for k in range(24):
        start = k * 15
        g.arc([c - R(0.33), c - R(0.33), c + R(0.33), c + R(0.33)], start, start + 9, fill=CYAN + (170,), width=lw(8))
    for k in range(4):
        start = k * 90 + 20
        g.arc([c - R(0.29), c - R(0.29), c + R(0.29), c + R(0.29)], start, start + 30, fill=VIOLET + (220,), width=lw(14))
    # ondas radiais
    for i in range(48):
        a = 2 * math.pi * i / 48
        amp = 0.03 + 0.05 * abs(math.sin(i * 0.7))
        r1, r2 = R(0.205), R(0.205 + amp)
        g.line([c + r1 * math.cos(a), c + r1 * math.sin(a), c + r2 * math.cos(a), c + r2 * math.sin(a)], fill=CYAN + (230,), width=lw(7))
    blurred = glow.filter(ImageFilter.GaussianBlur(radius=18 * scale))
    img = Image.alpha_composite(img, blurred)
    img = Image.alpha_composite(img, glow)

    # núcleo com gradiente radial
    core = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cd = ImageDraw.Draw(core)
    rmax = R(0.17)
    steps = 120
    for s in range(steps, 0, -1):
        t = s / steps
        r = rmax * t
        if t < 0.25:
            col = (255, 255, 255, 255)
        elif t < 0.7:
            u = (t - 0.25) / 0.45
            col = (int(255 - (255 - CYAN[0]) * u), int(255 - (255 - CYAN[1]) * u), 255, 255)
        else:
            u = (t - 0.7) / 0.3
            col = (int(CYAN[0] + (BLUE[0] - CYAN[0]) * u), int(CYAN[1] + (BLUE[1] - CYAN[1]) * u), int(255 + (BLUE[2] - 255) * u), int(255 - 120 * u))
        cd.ellipse([c - r, c - r, c + r, c + r], fill=col)
    core_glow = core.filter(ImageFilter.GaussianBlur(radius=30 * scale))
    img = Image.alpha_composite(img, core_glow)
    img = Image.alpha_composite(img, core)
    return img

OUT.mkdir(parents=True, exist_ok=True)
orb(S, True).convert("RGB").save(OUT / "icon.png")  # iOS: ícone sem transparência
orb(512, False).save(OUT / "splash-icon.png")
print("ok", OUT)
