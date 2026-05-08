"""
Generates the supporter-only alternate-app-icon variants from the brand
shape. Outputs 1024x1024 PNGs (no transparency, per iOS alt-icon rules) into
src/assets/icons/.

Each variant is rebuilt from primitives rather than recolored from the base
PNG so we can fully control gradients, accents, and the minimalist re-cut.
The geometry mirrors the existing icon.png: a rounded RECTANGLE (wider than
tall, ratio ~1.28:1) with a vertical gradient, a horizontally-inset card
positioned in the lower-middle carrying a person silhouette (circle head +
half-ellipse "dome" torso clipped at card bottom) plus two equal-length
horizontal bars on the right.

Run: python3 scripts/generate-app-icons.py
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
OUT_DIR = Path(__file__).resolve().parent.parent / "src" / "assets" / "icons"

# Geometry — measured from the source icon.png so the variants line up
# pixel-for-pixel with the brand mark.
BG_COLOR_LIGHT = (245, 245, 247)
BG_COLOR_DARK = (10, 10, 10)

# Outer rounded rectangle: wider than tall, vertically and horizontally
# centered in the 1024 canvas.
OUTER_W = 650
OUTER_H = 506
OUTER_RADIUS = 61

# Card is inset horizontally by 55 on each side, sits in the lower-middle of
# the outer rect (145 from the top, 55 from the bottom).
CARD_W = 540
CARD_H = 306
CARD_RADIUS = 26
CARD_TOP_INSET = 145  # from outer top
CARD_SIDE_INSET = 55  # from outer left/right

# Person silhouette (card-relative coordinates).
HEAD_CX = 179
HEAD_CY = 107
HEAD_R = 72
BODY_CX = 179
BODY_CY = 305  # at card bottom — only the top half of the ellipse shows
BODY_RX = 127
BODY_RY = 97

# Two equal-length horizontal pills on the right side of the card
# (card-relative). The card is 540 wide, so bars are pushed to the right of
# the silhouette.
BAR_W = 145
BAR_H = 50
BAR_CX = 414
BAR_TOP_CY = 82
BAR_BOT_CY = 190

# Accent badge sits inside the card, top-right.
ACCENT_INSET = 32
ACCENT_RADIUS = 34


def lerp(c1: tuple[int, int, int], c2: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(round(c1[i] + (c2[i] - c1[i]) * t)) for i in range(3))


# Pulls both gradient endpoints toward their midpoint so the gradient reads as
# a subtle sheen rather than a hard two-color split. 0 keeps the original
# endpoints; 1 collapses to a flat midpoint color.
GRADIENT_DAMPEN = 0.55


def soften(top: tuple[int, int, int], bottom: tuple[int, int, int]) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
    mid = lerp(top, bottom, 0.5)
    return lerp(top, mid, GRADIENT_DAMPEN), lerp(bottom, mid, GRADIENT_DAMPEN)


def vertical_gradient(size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    img = Image.new("RGB", size, top)
    px = img.load()
    w, h = size
    for y in range(h):
        t = y / max(h - 1, 1)
        c = lerp(top, bottom, t)
        for x in range(w):
            px[x, y] = c
    return img


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return mask


def draw_person(
    draw: ImageDraw.ImageDraw,
    head_cx: int,
    head_cy: int,
    head_r: int,
    body_cx: int,
    body_cy: int,
    body_rx: int,
    body_ry: int,
    color: tuple[int, int, int],
) -> None:
    # Head: full circle.
    draw.ellipse(
        [head_cx - head_r, head_cy - head_r, head_cx + head_r, head_cy + head_r],
        fill=color,
    )
    # Body: full ellipse — the bottom half is hidden because we paint into a
    # card-sized layer that gets masked at the card's rounded edges, leaving a
    # flat-bottomed dome at card bottom.
    draw.ellipse(
        [body_cx - body_rx, body_cy - body_ry, body_cx + body_rx, body_cy + body_ry],
        fill=color,
    )


def draw_bars(
    draw: ImageDraw.ImageDraw,
    cx: int,
    top_cy: int,
    bot_cy: int,
    bar_w: int,
    bar_h: int,
    color: tuple[int, int, int],
) -> None:
    radius = bar_h // 2
    for cy in (top_cy, bot_cy):
        draw.rounded_rectangle(
            [cx - bar_w // 2, cy - bar_h // 2, cx + bar_w // 2, cy + bar_h // 2],
            radius=radius,
            fill=color,
        )


def draw_blossom(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int, color: tuple[int, int, int]) -> None:
    petal_r = int(r * 0.42)
    for i in range(5):
        angle = i * (2 * math.pi / 5) - math.pi / 2
        px = cx + int(r * 0.55 * math.cos(angle))
        py = cy + int(r * 0.55 * math.sin(angle))
        draw.ellipse([px - petal_r, py - petal_r, px + petal_r, py + petal_r], fill=color)
    cr = int(r * 0.28)
    draw.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill=color)


def draw_sun(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int, color: tuple[int, int, int]) -> None:
    core_r = int(r * 0.5)
    draw.ellipse([cx - core_r, cy - core_r, cx + core_r, cy + core_r], fill=color)
    ray_count = 8
    ray_inner = r * 0.62
    ray_outer = r * 0.98
    ray_w = max(int(r * 0.16), 6)
    for i in range(ray_count):
        angle = i * (2 * math.pi / ray_count)
        x1 = cx + ray_inner * math.cos(angle)
        y1 = cy + ray_inner * math.sin(angle)
        x2 = cx + ray_outer * math.cos(angle)
        y2 = cy + ray_outer * math.sin(angle)
        draw.line([(x1, y1), (x2, y2)], fill=color, width=ray_w)


def draw_leaf(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int, color: tuple[int, int, int]) -> None:
    # Stylized maple silhouette: 5 lobes with valleys between, tapering to a
    # stem at the bottom. Hand-tuned point list (clockwise from stem base) so
    # it reads unambiguously as a leaf at icon scale.
    points = [
        (cx, cy + r * 0.55),              # base (where stem meets leaf)
        (cx + r * 0.22, cy + r * 0.50),
        (cx + r * 0.82, cy + r * 0.42),   # lower-right lobe tip
        (cx + r * 0.32, cy + r * 0.08),   # right inner valley
        (cx + r * 0.95, cy - r * 0.30),   # upper-right lobe tip
        (cx + r * 0.22, cy - r * 0.45),   # upper valley right
        (cx, cy - r * 0.95),              # top lobe tip
        (cx - r * 0.22, cy - r * 0.45),   # upper valley left
        (cx - r * 0.95, cy - r * 0.30),   # upper-left lobe tip
        (cx - r * 0.32, cy + r * 0.08),   # left inner valley
        (cx - r * 0.82, cy + r * 0.42),   # lower-left lobe tip
        (cx - r * 0.22, cy + r * 0.50),
    ]
    draw.polygon(points, fill=color)
    # Stem
    stem_w = max(int(r * 0.14), 4)
    draw.line(
        [(cx, cy + int(r * 0.50)), (cx, cy + int(r * 1.10))],
        fill=color,
        width=stem_w,
    )


def draw_snowflake(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int, color: tuple[int, int, int]) -> None:
    width = max(int(r * 0.16), 5)
    branches = 6
    for i in range(branches):
        angle = i * (math.pi / 3)
        x2 = cx + r * math.cos(angle)
        y2 = cy + r * math.sin(angle)
        draw.line([(cx, cy), (x2, y2)], fill=color, width=width)
        # Side branches at 2/3 along each main arm
        bx = cx + r * 0.55 * math.cos(angle)
        by = cy + r * 0.55 * math.sin(angle)
        side_len = r * 0.32
        for sign in (-1, 1):
            sa = angle + sign * (math.pi / 4)
            sx = bx + side_len * math.cos(sa)
            sy = by + side_len * math.sin(sa)
            draw.line([(bx, by), (sx, sy)], fill=color, width=max(width - 1, 3))
    cr = max(int(r * 0.14), 4)
    draw.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill=color)


def render_icon(
    bg_color: tuple[int, int, int],
    grad_top: tuple[int, int, int],
    grad_bottom: tuple[int, int, int],
    card_color: tuple[int, int, int],
    silhouette_color: tuple[int, int, int],
    show_card: bool = True,
    accent: callable | None = None,
    accent_color: tuple[int, int, int] | None = None,
) -> Image.Image:
    canvas = Image.new("RGB", (SIZE, SIZE), bg_color)

    # Outer rounded rectangle with vertical gradient (softened toward midpoint
    # so the gradient reads as a sheen, not a two-tone split).
    grad_top, grad_bottom = soften(grad_top, grad_bottom)
    grad = vertical_gradient((OUTER_W, OUTER_H), grad_top, grad_bottom)
    outer_mask = rounded_mask((OUTER_W, OUTER_H), OUTER_RADIUS)
    outer_x = (SIZE - OUTER_W) // 2
    outer_y = (SIZE - OUTER_H) // 2
    canvas.paste(grad, (outer_x, outer_y), outer_mask)

    if show_card:
        card_x = outer_x + CARD_SIDE_INSET
        card_y = outer_y + CARD_TOP_INSET

        # Build the card on its own layer so the silhouette/body ellipse get
        # naturally clipped at the card's rounded edges (the body's bottom
        # half ends up hidden, producing the flat-bottomed dome torso).
        card_layer = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
        card_mask = rounded_mask((CARD_W, CARD_H), CARD_RADIUS)
        cd = ImageDraw.Draw(card_layer)
        cd.rectangle([0, 0, CARD_W, CARD_H], fill=card_color + (255,))
        draw_person(
            cd,
            HEAD_CX,
            HEAD_CY,
            HEAD_R,
            BODY_CX,
            BODY_CY,
            BODY_RX,
            BODY_RY,
            silhouette_color,
        )
        draw_bars(cd, BAR_CX, BAR_TOP_CY, BAR_BOT_CY, BAR_W, BAR_H, silhouette_color)

        if accent:
            ac = accent_color or silhouette_color
            ax = CARD_W - ACCENT_INSET - ACCENT_RADIUS
            ay = ACCENT_INSET + ACCENT_RADIUS
            accent(cd, ax, ay, ACCENT_RADIUS, ac)

        canvas.paste(card_layer, (card_x, card_y), card_mask)
    else:
        # Minimalist: full-bleed gradient tile with a centered silhouette and
        # no card. card_color is interpreted as the silhouette color here.
        # The silhouette is scaled up to fill the outer rect proportionally;
        # the body is still a dome (centered on the outer rect bottom-ish so
        # only the top of the ellipse is visible above the outer's lower
        # rounded edge after masking against the outer shape).
        outer_layer = Image.new("RGBA", (OUTER_W, OUTER_H), (0, 0, 0, 0))
        ld = ImageDraw.Draw(outer_layer)
        # Sized for generous padding around the glyph.
        scale = 0.95
        m_head_r = int(HEAD_R * scale)
        m_body_rx = int(BODY_RX * scale)
        m_body_ry = int(BODY_RY * scale)
        # Center the head-plus-dome composition vertically: total visible
        # height = head diameter + gap + body_ry. Head/body share an x.
        gap = int(38 * scale)
        total_h = 2 * m_head_r + gap + m_body_ry
        top_y = (OUTER_H - total_h) // 2
        cx = OUTER_W // 2
        head_cy = top_y + m_head_r
        body_cy = top_y + 2 * m_head_r + gap + m_body_ry  # body bottom = full ellipse bottom
        # We want only the top half of the body to show — drawing the full
        # ellipse and clipping against the outer rounded mask achieves this
        # only if the ellipse extends past the outer's rounded bottom. Easier
        # to draw a half-ellipse via a chord/pieslice.
        ld.ellipse(
            [cx - m_head_r, head_cy - m_head_r, cx + m_head_r, head_cy + m_head_r],
            fill=card_color + (255,),
        )
        # Top half of an ellipse — pieslice from 180° to 360° gives a dome
        # closed by a flat chord at body_cy.
        ld.pieslice(
            [cx - m_body_rx, body_cy - m_body_ry, cx + m_body_rx, body_cy + m_body_ry],
            start=180,
            end=360,
            fill=card_color + (255,),
        )
        # Composite using the silhouette's own alpha so we don't overwrite
        # the gradient with the layer's transparent (black) pixels.
        canvas.paste(outer_layer, (outer_x, outer_y), outer_layer)

    return canvas


VARIANTS: dict[str, dict] = {
    "Gold": {
        "bg_color": BG_COLOR_LIGHT,
        "grad_top": (244, 216, 122),
        "grad_bottom": (184, 134, 11),
        "card_color": (255, 255, 255),
        "silhouette_color": (184, 134, 11),
    },
    "Dark": {
        # Apple Watch app-icon palette: deep near-black with a faint cool
        # top-down sheen, an elevated dark surface for the card, and a soft
        # light-gray silhouette that reads without shouting.
        "bg_color": BG_COLOR_DARK,
        "grad_top": (38, 38, 42),
        "grad_bottom": (6, 6, 9),
        "card_color": (44, 44, 48),
        "silhouette_color": (210, 210, 214),
    },
    "Minimalist": {
        "bg_color": BG_COLOR_LIGHT,
        "grad_top": (75, 210, 124),
        "grad_bottom": (75, 210, 124),
        "card_color": (255, 255, 255),  # interpreted as silhouette color
        "silhouette_color": (255, 255, 255),
        "show_card": False,
    },
    "SeasonalSpring": {
        "bg_color": BG_COLOR_LIGHT,
        "grad_top": (255, 195, 160),
        "grad_bottom": (168, 230, 207),
        "card_color": (255, 255, 255),
        "silhouette_color": (110, 180, 150),
        "accent": draw_blossom,
        "accent_color": (245, 130, 160),
    },
    "SeasonalSummer": {
        "bg_color": BG_COLOR_LIGHT,
        "grad_top": (251, 215, 134),
        "grad_bottom": (247, 121, 125),
        "card_color": (255, 255, 255),
        "silhouette_color": (220, 110, 110),
        "accent": draw_sun,
        "accent_color": (240, 175, 60),
    },
    "SeasonalFall": {
        "bg_color": BG_COLOR_LIGHT,
        "grad_top": (240, 152, 25),
        "grad_bottom": (168, 35, 31),
        "card_color": (255, 255, 255),
        "silhouette_color": (168, 60, 35),
        "accent": draw_leaf,
        "accent_color": (200, 60, 30),
    },
    "SeasonalWinter": {
        "bg_color": BG_COLOR_LIGHT,
        "grad_top": (182, 251, 255),
        "grad_bottom": (131, 164, 212),
        "card_color": (255, 255, 255),
        "silhouette_color": (105, 140, 195),
        "accent": draw_snowflake,
        "accent_color": (90, 130, 195),
    },
}


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, params in VARIANTS.items():
        img = render_icon(**params)
        # iOS alt-icons must be flat RGB without alpha; we already use RGB mode
        out = OUT_DIR / f"{name}.png"
        img.save(out, format="PNG", optimize=True)
        print(f"wrote {out.relative_to(OUT_DIR.parent.parent.parent)}")


if __name__ == "__main__":
    main()
