"""Editable pixel lettering for a GIF-era page, drawn with original polygon glyphs."""

from functools import lru_cache
from io import BytesIO
from PIL import Image, ImageColor, ImageDraw, ImageFont


SIGNAL_FONT = "Lightning Display"

# Glyph outlines are drawn on a 14 x 16 workshop grid. Additional paths cut counters.
GLYPHS = {
    "A": ["0,16 5,0 11,0 15,16 11,16 10,12 5,12 4,16", "6,9 10,9 8,3"],
    "B": [
        "0,0 10,0 13,2 13,6 11,8 14,10 14,14 12,16 0,16",
        "4,3 4,6 8,6 9,5 9,4 8,3",
        "4,10 4,13 9,13 10,12 10,11 9,10",
    ],
    "C": [
        "12,5 9,5 9,4 8,3 6,3 4,5 4,11 6,13 8,13 10,11 13,11 13,13 10,16 4,16 0,13 0,4 4,0 10,0 13,3 13,5"
    ],
    "D": ["0,0 9,0 14,4 14,12 10,16 0,16", "4,3 4,13 8,13 10,11 10,5 8,3"],
    "E": ["0,0 13,0 13,3 4,3 4,6 11,6 11,9 4,9 4,13 13,13 13,16 0,16"],
    "F": ["0,0 13,0 13,3 4,3 4,7 11,7 11,10 4,10 4,16 0,16"],
    "G": [
        "13,5 10,5 10,4 9,3 6,3 4,5 4,11 6,13 9,13 10,12 10,10 7,10 7,7 14,7 14,13 11,16 4,16 0,13 0,4 4,0 11,0 14,3 14,5"
    ],
    "H": ["0,0 4,0 4,6 10,6 10,0 14,0 14,16 10,16 10,10 4,10 4,16 0,16"],
    "I": ["0,0 4,0 4,16 0,16"],
    "J": ["7,0 11,0 11,13 8,16 3,16 0,13 0,10 4,10 4,12 5,13 6,13 7,12"],
    "K": ["0,0 4,0 4,7 9,0 14,0 8,8 15,16 10,16 5,10 4,11 4,16 0,16"],
    "L": ["0,0 4,0 4,13 12,13 12,16 0,16"],
    "M": ["0,0 5,0 8,8 11,0 16,0 16,16 12,16 12,6 9,14 7,14 4,6 4,16 0,16"],
    "N": ["0,0 4,0 10,10 10,0 14,0 14,16 10,16 4,6 4,16 0,16"],
    "O": [
        "4,0 10,0 14,4 14,12 10,16 4,16 0,12 0,4",
        "6,3 9,3 10,5 10,11 8,13 6,13 4,11 4,5",
    ],
    "P": ["0,0 10,0 14,3 14,8 10,11 4,11 4,16 0,16", "4,3 4,8 8,8 10,6 10,5 8,3"],
    "Q": [
        "4,0 10,0 14,4 14,11 12,13 15,16 10,16 9,15 7,16 4,16 0,12 0,4",
        "6,3 9,3 10,5 10,9 8,8 6,10 8,12 6,13 4,11 4,5",
    ],
    "R": [
        "0,0 10,0 14,3 14,8 10,10 15,16 10,16 6,11 4,11 4,16 0,16",
        "4,3 4,7 9,7 10,6 10,4 9,3",
    ],
    "S": [
        "13,5 10,5 10,4 9,3 6,3 4,5 4,6 5,7 10,7 13,9 13,12 9,16 3,16 0,14 0,11 4,11 4,12 5,13 8,13 10,11 9,10 4,10 0,8 0,4 4,0 11,0 14,2 14,5"
    ],
    "T": ["0,0 14,0 14,3 9,3 9,16 5,16 5,3 0,3"],
    "U": ["0,0 4,0 4,11 6,13 8,13 10,11 10,0 14,0 14,12 10,16 4,16 0,12"],
    "V": ["0,0 4,0 7,12 11,0 15,0 10,16 5,16"],
    "W": ["0,0 4,0 6,11 8,3 11,3 13,11 15,0 19,0 16,16 12,16 10,9 8,16 3,16"],
    "X": ["0,0 5,0 8,5 11,0 16,0 10,8 16,16 11,16 8,11 5,16 0,16 6,8"],
    "Y": ["0,0 5,0 8,6 11,0 16,0 10,10 10,16 6,16 6,10"],
    "Z": ["0,0 14,0 14,3 5,13 14,13 14,16 0,16 0,13 9,3 0,3"],
    "0": ["4,0 10,0 14,4 14,12 10,16 4,16 0,12 0,4", "5,4 8,3 10,5 5,12 4,11 4,5"],
    "1": ["1,3 5,0 8,0 8,13 11,13 11,16 1,16 1,13 4,13 4,5 1,6"],
    "2": ["0,5 0,3 3,0 10,0 13,3 13,7 5,13 13,13 13,16 0,16 0,12 9,5 8,3 5,3 4,5"],
    "3": [
        "0,4 3,0 10,0 13,3 13,6 10,8 13,10 13,13 10,16 3,16 0,13 0,11 4,11 5,13 8,13 9,12 9,10 8,9 4,9 4,7 8,7 9,5 8,3 5,3 4,5"
    ],
    "4": [
        "8,0 12,0 12,10 14,10 14,13 12,13 12,16 8,16 8,13 0,13 0,10",
        "4,10 8,10 8,5",
    ],
    "5": [
        "1,0 13,0 13,3 5,3 4,7 10,7 13,10 13,13 10,16 3,16 0,13 0,11 4,11 5,13 8,13 9,12 9,11 8,10 0,10"
    ],
    "6": [
        "4,0 11,0 13,2 13,4 9,4 8,3 6,3 4,5 4,6 10,6 13,9 13,13 10,16 3,16 0,13 0,4",
        "4,9 4,12 5,13 8,13 9,12 9,10 8,9",
    ],
    "7": ["0,0 13,0 13,3 6,16 2,16 9,3 0,3"],
    "8": [
        "3,0 10,0 13,3 13,6 11,8 13,10 13,13 10,16 3,16 0,13 0,10 2,8 0,6 0,3",
        "5,3 4,4 4,6 5,7 8,7 9,6 9,4 8,3",
        "5,9 4,10 4,12 5,13 8,13 9,12 9,10 8,9",
    ],
    "9": [
        "3,0 10,0 13,3 13,12 9,16 2,16 0,14 0,12 4,12 5,13 7,13 9,11 9,10 3,10 0,7 0,3",
        "5,3 4,4 4,6 5,7 9,7 9,4 8,3",
    ],
}


@lru_cache(maxsize=128)
def glyph(char):
    if char in GLYPHS:
        paths = [
            [tuple(map(int, point.split(","))) for point in s.split()]
            for s in GLYPHS[char]
        ]
        return max(x for path in paths for x, _ in path), paths
    return (6 if char.isspace() else 9), []


@lru_cache(maxsize=12)
def lettering_gif(text, width, height, size, color, align, italic, bold):
    """Render at double-size pixels, preserving the original editable string in the project."""
    # Cap the intermediate GIF size even when a document has very tall display objects.
    factor = max(2, (max(width, height) + 2047) // 2048)
    w, h = (
        max(1, (width + factor - 1) // factor),
        max(1, (height + factor - 1) // factor),
    )
    ink = ImageColor.getrgb(color)
    out = Image.new("P", (w, h))
    out.putpalette(
        [0, 0, 0, *ink, *[min(255, c + 4) for c in ink], 255, 232, 91, 250, 208, 60]
    )
    d = ImageDraw.Draw(out)
    scale = size / (16 * factor)
    italic_offset = 5.4 if italic else 0
    gap = 2.2 if bold else 3.2
    y = 0
    longest = 0
    for line_index, line in enumerate(text.upper().splitlines() or [""]):
        if y >= h:
            break
        xscale = scale * (1.13 if line_index else 0.94)
        letters = []
        advance = 0
        for char in line:
            if advance * xscale > w * 1.5:
                break
            gw, paths = glyph(char)
            letters.append((char, advance, paths))
            advance += gw + gap
        linewidth = max(0, advance - gap + italic_offset) * xscale
        longest = max(longest, min(w, linewidth))
        start = {"center": (w - linewidth) / 2, "right": w - linewidth}.get(align, 0)
        if align == "center" and line_index:
            start -= min(w * 0.06, scale * 4.5)
        for char, position, paths in letters:

            def transform(xx, yy):
                ax = (position + xx + (1 - yy / 16) * italic_offset) * xscale
                return round(start + ax), round(
                    y + yy * scale + (linewidth - ax) * 0.025
                )

            if paths:
                for i, path in enumerate(paths):
                    d.polygon([transform(*pt) for pt in path], fill=1 if i == 0 else 0)
            elif not char.isspace():
                mask = Image.new("L", (16, 16))
                try:
                    ImageDraw.Draw(mask).text(
                        (1, 0), char, font=ImageFont.load_default(), fill=255
                    )
                except UnicodeEncodeError:
                    ImageDraw.Draw(mask).text(
                        (1, 0), "?", font=ImageFont.load_default(), fill=255
                    )
                box = mask.getbbox()
                if box:
                    mark = mask.crop(box).resize(
                        (max(1, round(7 * xscale)), max(1, round(13 * scale))),
                        Image.Resampling.NEAREST,
                    )
                    out.paste(1, transform(0, 3), mark)
            if start + position * xscale > w:
                break
        y += max(1, round(size * 1.14 / factor))
    if longest and y < h and text.strip():
        bolt_width = min(longest * 0.67, w * 0.76)
        left = {"center": (w - bolt_width) / 2, "right": w - bolt_width}.get(align, 0)
        by = min(h - 1, y + round(scale * 0.7))
        bolt = [
            (0, 16),
            (19, 9),
            (34, 6),
            (46, 5),
            (44, 8),
            (63, 3),
            (76, 1),
            (91, 2),
            (99, 4),
            (100, 5),
            (91, 4),
            (79, 4),
            (66, 6),
            (51, 10),
            (35, 15),
            (38, 9),
            (24, 11),
            (10, 14),
        ]
        bh = max(2, size * 0.37 / factor)
        d.polygon(
            [
                (round(left + x * bolt_width / 100), round(by + yy * bh / 16))
                for x, yy in bolt
            ],
            fill=3,
        )
    if out.size != (width, height):
        out = out.resize((width, height), Image.Resampling.NEAREST)
    stream = BytesIO()
    out.save(stream, format="GIF", transparency=0, optimize=False)
    return stream.getvalue()


def item_lettering(item):
    return lettering_gif(
        item["text"],
        item["w"],
        item["h"],
        item["font_size"],
        item["color"],
        item["align"],
        item["italic"],
        item["bold"],
    )
