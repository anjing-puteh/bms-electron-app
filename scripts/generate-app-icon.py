"""Generate the BMS Desktop app icon (build/icon.png + build/icon.ico).

Design: a dark rounded-square tile (zinc-900, matching the app's UI) with four
vertical lanes and falling note bars in the app's blue accent (blue-400), with a
judgment line near the bottom. Run once: `python scripts/generate-app-icon.py`.
Requires Pillow (`pip install pillow`); the output files are committed.
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
SIZE = 1024

BG_TOP = (39, 39, 42)  # zinc-800
BG_BOTTOM = (9, 9, 11)  # zinc-950
LANE = (63, 63, 70)  # zinc-700
ACCENT = (96, 165, 250)  # blue-400
ACCENT_DEEP = (37, 99, 235)  # blue-600
JUDGE = (250, 250, 250)


def gradient_tile(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size))
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        color = tuple(round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3))
        for x in range(size):
            px[x, y] = (*color, 255)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.2), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def draw_icon(size: int) -> Image.Image:
    base = gradient_tile(size)
    draw = ImageDraw.Draw(base, "RGBA")
    s = size / 1024

    lane_w = int(150 * s)
    gap = int(28 * s)
    total = 4 * lane_w + 3 * gap
    left = (size - total) // 2
    top = int(170 * s)
    bottom = int(850 * s)

    for i in range(4):
        x0 = left + i * (lane_w + gap)
        draw.rounded_rectangle((x0, top, x0 + lane_w, bottom), radius=int(28 * s), fill=(*LANE, 150))

    # Falling note bars, staggered across lanes
    notes = [(0, 300, 60), (1, 430, 60), (2, 560, 60), (3, 430, 60), (1, 690, 60), (2, 710, 60)]
    note_h = int(54 * s)
    for lane, y, _ in notes:
        x0 = left + lane * (lane_w + gap) + int(14 * s)
        x1 = left + lane * (lane_w + gap) + lane_w - int(14 * s)
        y0 = int(y * s)
        draw.rounded_rectangle((x0, y0, x1, y0 + note_h), radius=int(16 * s), fill=(*ACCENT, 255))
        draw.rounded_rectangle((x0, y0 + note_h - int(10 * s), x1, y0 + note_h), radius=int(10 * s), fill=(*ACCENT_DEEP, 255))

    # Judgment line
    jy = int(760 * s)
    draw.rounded_rectangle((left - int(20 * s), jy, left + total + int(20 * s), jy + int(18 * s)), radius=int(9 * s), fill=(*JUDGE, 255))
    return base


def main() -> None:
    BUILD.mkdir(exist_ok=True)
    master = draw_icon(SIZE)
    master.save(BUILD / "icon.png", format="PNG")
    sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    master.save(BUILD / "icon.ico", format="ICO", sizes=sizes)
    print("wrote", BUILD / "icon.png", "and", BUILD / "icon.ico")


if __name__ == "__main__":
    main()
