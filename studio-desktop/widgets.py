"""Shared Retro Page catalog, placement, and offline odometer artwork."""

import base64
import json
import re
from functools import lru_cache
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw

CATALOG = json.loads((Path(__file__).parent / "assets/objects.json").read_text())
PRESETS = CATALOG["presets"]


@lru_cache(maxsize=64)
def counter_source(digits):
    if not re.fullmatch("[0-9]{1,12}", digits):
        raise ValueError("Enter 1–12 counter digits, including any leading zeroes.")
    im = Image.new("RGB", (len(digits) * 12 + 4, 20), "#171d22")
    draw = ImageDraw.Draw(im)
    draw.rectangle((0, 0, im.width - 1, 19), outline="#889298")
    for i, ch in enumerate(digits):
        left = 2 + i * 12
        draw.rectangle((left, 2, left + 10, 17), fill="#283239")
        draw.line((left, 10, left + 10, 10), fill="#161d22")
        for j, bit in enumerate(CATALOG["digits"][ch]):
            if bit == "1":
                x, y = left + 2 + (j % 3) * 2, 4 + (j // 3) * 2
                draw.rectangle((x, y, x + 1, y + 1), fill="#ffda86")
    stream = BytesIO()
    im.save(stream, "GIF")
    return "data:image/gif;base64," + base64.b64encode(stream.getvalue()).decode()


def place_widget(key, page, x, y, make_item, destination="home"):
    """Create a group of editable primitives and keep the complete group on the page."""
    parts = PRESETS[key]["parts"]
    width, height = page["width"], page["height"]
    group_w = max(p.get("dx", 0) + p["w"] for p in parts)
    group_h = max(p.get("dy", 0) + p["h"] for p in parts)
    scale = min(1, width / group_w, height / group_h)
    x = max(0, min(int(x), width - int(group_w * scale)))
    y = max(0, min(int(y), height - int(group_h * scale)))
    result = []
    for part in parts:
        obj = make_item(part["kind"], 0, 0, width, height)
        obj.update({k: v for k, v in part.items() if k not in ("dx", "dy")})
        stored_widget = PRESETS[key].get("saveAs", key)
        if stored_widget:
            obj["widget"] = stored_widget
        obj.update(
            x=x + int(part.get("dx", 0) * scale),
            y=y + int(part.get("dy", 0) * scale),
            w=max(1, int(part["w"] * scale)),
            h=max(1, int(part["h"] * scale)),
        )
        if key == "counter":
            obj["src"] = counter_source(obj["text"])
        if key == "wallpaper":
            obj.update(x=0, y=0, w=width, h=height)
        if key == "bbs-menu":
            obj["href"] = "page:" + destination
        result.append(obj)
    return result


def set_wallpaper(items, obj):
    first = items[0] if items else None
    if (
        first
        and first["kind"] == "image"
        and not first["text"].strip()
        and not first["href"]
        and all(first[k] == obj[k] for k in ("x", "y", "w", "h"))
    ):
        items[0] = obj
    else:
        items.insert(0, obj)
