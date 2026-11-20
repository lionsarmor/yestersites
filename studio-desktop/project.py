"""YesterSites desktop project files, portable HTML, and separate image assets."""

import base64
import binascii
from functools import lru_cache
from html import escape
from io import BytesIO
import json
import os
from pathlib import Path
import re
from tempfile import NamedTemporaryFile
from urllib.parse import urlsplit
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile

from PIL import Image, ImageOps, UnidentifiedImageError


FONTS = {
    "Times": "Times New Roman,Times,serif",
    "Times New Roman": "Times New Roman,Times,serif",
    "Georgia": "Georgia,serif",
    "Helvetica": "Helvetica,Arial,sans-serif",
    "Arial": "Arial,Helvetica,sans-serif",
    "Verdana": "Verdana,Arial,sans-serif",
    "Courier": "Courier New,Courier,monospace",
    "Courier New": "Courier New,Courier,monospace",
    "Trebuchet MS": "Trebuchet MS,Arial,sans-serif",
    "Tahoma": "Tahoma,Arial,sans-serif",
}
PROFILES = ("text", "classic", "millennium")
SIZES = {
    "text": (220, 64),
    "link": (180, 32),
    "image": (100, 80),
    "rule": (240, 4),
    "box": (128, 76),
}
MIME_TYPES = {"GIF": "image/gif", "JPEG": "image/jpeg", "PNG": "image/png"}
IMAGE_BYTES = 96 * 1024
PROJECT_BYTES = 512 * 1024
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


def new_project():
    return {
        "title": "Untitled homepage",
        "slug": "",
        "byline": "",
        "profile": "classic",
        "listed": False,
        "width": 640,
        "height": 480,
        "background": "#ffffff",
        "items": [],
    }


def new_item(kind, x=16, y=16, width=640, height=480):
    """Make an object at x/y inside a page with the given width and height."""
    if kind not in SIZES:
        raise ValueError("Unknown object type.")
    w, h = SIZES[kind]
    w, h = min(w, width), min(h, height)
    return {
        "id": uuid4().hex,
        "kind": kind,
        "x": max(0, min(int(x), width - w)),
        "y": max(0, min(int(y), height - h)),
        "w": w,
        "h": h,
        "text": {"text": "Double-click to edit", "link": "My link"}.get(kind, ""),
        "src": "",
        "href": "https://example.com/" if kind == "link" else "",
        "color": "#0000bb" if kind == "link" else "#191919",
        "fill": "#c3c0db" if kind == "box" else "",
        "font_family": "Times",
        "font_size": 16,
        "bold": False,
        "italic": False,
        "align": "left",
    }


def _verify_image(data):
    try:
        with Image.open(BytesIO(data)) as opened:
            kind = opened.format
            if kind not in MIME_TYPES:
                raise ValueError("Choose a GIF, JPEG, or PNG image.")
            width, height = opened.size
            if width * height > 6_000_000 or max(width, height) > 4096:
                raise ValueError(
                    "Image exceeds 4,096 pixels on one side or six megapixels."
                )
            opened.verify()
    except (
        UnidentifiedImageError,
        Image.DecompressionBombError,
        OSError,
        SyntaxError,
    ) as exc:
        raise ValueError("Could not read the image.") from exc
    if (kind == "GIF" and not data.endswith(b";")) or (
        kind == "JPEG" and not data.endswith(b"\xff\xd9")
    ):
        raise ValueError(
            "The image is incomplete or has trailing data. Re-export it first."
        )
    return kind, width, height


@lru_cache(maxsize=12)
def _read_image_uri(uri):
    header, sep, payload = uri.partition(",")
    if (
        not sep
        or len(payload) > 131072
        or header not in {f"data:{mime};base64" for mime in MIME_TYPES.values()}
    ):
        raise ValueError("Use an embedded GIF, JPEG or PNG of 96 KiB or less.")
    try:
        data = base64.b64decode(payload, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError("Corrupt embedded image.") from exc
    kind, _, _ = _verify_image(data)
    if header != f"data:{MIME_TYPES[kind]};base64":
        raise ValueError("Image data and declared type differ.")
    return ("jpg" if kind == "JPEG" else kind.lower()), data


def image_item(path, x, y, width, height):
    """Insert image bytes intact. Scale display dimensions to the page, keeping aspect ratio."""
    path = Path(path)
    if path.stat().st_size > IMAGE_BYTES:
        raise ValueError(
            "Choose an image of 96 KiB or less. Resize or compress this image first."
        )
    data = path.read_bytes()
    kind, w, h = _verify_image(data)
    # Page browsers and the canvas both honor the JPEG's orientation.
    if kind == "JPEG":
        with Image.open(BytesIO(data)) as opened:
            w, h = ImageOps.exif_transpose(opened).size
    item = new_item("image", x, y, width, height)
    factor = min(1, width / w, height / h)
    item["w"], item["h"] = max(1, round(w * factor)), max(1, round(h * factor))
    item["x"], item["y"] = (
        max(0, min(x, width - item["w"])),
        max(0, min(y, height - item["h"])),
    )
    item["text"] = path.stem.replace("_", " ")[:300]
    item["src"] = f"data:{MIME_TYPES[kind]};base64," + base64.b64encode(data).decode(
        "ascii"
    )
    return item


def _number(value, label, low, high):
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f"{label} must be a whole number between {low} and {high}.")
    return value


def _text(value, label, limit, required=False):
    if not isinstance(value, str) or len(value.encode("utf-16-le")) // 2 > limit:
        raise ValueError(f"{label} must be {limit} characters or fewer.")
    if re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", value):
        raise ValueError(f"{label} contains a control character.")
    if required and not value.strip():
        raise ValueError(f"Enter a {label.lower()}.")
    return value


def _color(value, empty=False):
    if empty and value in ("", "transparent"):
        return ""
    if not isinstance(value, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
        raise ValueError("Use a six-digit hex color, such as #334477.")
    return value


def _link(value):
    value = _text(value, "Link", 2048).strip()
    if not value:
        return ""
    if re.search(r"[\\\s]", value):
        raise ValueError("Links cannot contain spaces or backslashes.")
    if value.startswith("/") and not value.startswith("//"):
        return value
    u = urlsplit(value)
    if (
        u.scheme.lower() not in ("http", "https")
        or not u.hostname
        or u.username
        or u.password
    ):
        raise ValueError("Use an http://, https://, or /site-relative link.")
    _ = u.port  # Validates the optional port.
    return value


def validate_project(doc, *, publishing=False):
    """Return normalized project data. Drafts may be empty and have no site address."""
    if not isinstance(doc, dict):
        raise ValueError("Expected a YesterSites desktop project.")
    d = new_project()
    for key, limit in (("title", 80), ("slug", 40), ("byline", 48)):
        d[key] = _text(
            doc.get(key, ""), key, limit, publishing and key in ("title", "slug")
        ).strip()
    if d["slug"] and not SLUG.fullmatch(d["slug"]):
        raise ValueError(
            "Use lowercase letters, numbers, and interior hyphens for the site address."
        )
    if doc.get("profile") not in PROFILES or type(doc.get("listed")) is not bool:
        raise ValueError("Unknown display profile or invalid directory setting.")
    d.update(
        profile=doc["profile"],
        listed=doc["listed"],
        width=_number(doc.get("width"), "Page width", 160, 2048),
        height=_number(doc.get("height"), "Page height", 120, 8192),
        background=_color(doc.get("background")),
    )
    raw_items = doc.get("items")
    if (
        not isinstance(raw_items, list)
        or len(raw_items) > 64
        or (publishing and not raw_items)
    ):
        raise ValueError("A published homepage needs 1–64 objects.")
    ids = set()
    count = 0
    for obj in raw_items:
        if (
            not isinstance(obj, dict)
            or not isinstance(obj.get("kind"), str)
            or obj["kind"] not in SIZES
        ):
            raise ValueError("Invalid canvas object.")
        kind = obj["kind"]
        item = new_item(kind, width=d["width"], height=d["height"])
        ident = _text(obj.get("id"), "Object ID", 80, True)
        if ident in ids:
            raise ValueError("Every object must have a unique ID.")
        ids.add(ident)
        x, y = (
            _number(obj.get("x"), "X", 0, d["width"] - 1),
            _number(obj.get("y"), "Y", 0, d["height"] - 1),
        )
        item.update(
            id=ident,
            x=x,
            y=y,
            w=_number(obj.get("w"), "Width", 1, d["width"] - x),
            h=_number(obj.get("h"), "Height", 1, d["height"] - y),
            text=_text(obj.get("text", ""), "Object text", 8000),
            href=_link(obj.get("href", "")),
            font_size=_number(obj.get("font_size", 16), "Font size", 6, 160),
            color=_color(obj.get("color", item["color"])),
            fill=_color(obj.get("fill", ""), True),
        )
        for key, valid in (
            ("font_family", FONTS),
            ("align", ("left", "right", "center")),
        ):
            value = obj.get(key, item[key])
            if not isinstance(value, str) or value not in valid:
                raise ValueError(f"Unsupported {key.replace('_', ' ')}.")
            item[key] = value
        for key in ("bold", "italic"):
            value = obj.get(key, False)
            if type(value) is not bool:
                raise ValueError(f"Invalid {key} setting.")
            item[key] = value
        if publishing and kind == "link" and not item["href"]:
            raise ValueError("Set a destination for each link.")
        if kind == "image":
            count += 1
            uri = obj.get("src", "")
            if not isinstance(uri, str) or len(uri) > 131110:
                raise ValueError("Image exceeds 96 KiB or is invalid.")
            if uri:
                _read_image_uri(uri)
            elif publishing:
                raise ValueError("Choose a picture for each image object.")
            item["src"] = uri
        d["items"].append(item)
    if count > 3:
        raise ValueError("A homepage can contain up to three images.")
    if (
        publishing
        and len(json.dumps(d, ensure_ascii=False, separators=(",", ":")).encode())
        > PROJECT_BYTES
    ):
        raise ValueError("Project exceeds the 512 KiB publishing limit.")
    return d


def read_project(path):
    path = Path(path)
    if path.stat().st_size > PROJECT_BYTES * 2:
        raise ValueError("Project file is too large.")
    try:
        raw = json.loads(path.read_bytes())
    except (ValueError, UnicodeError, RecursionError) as exc:
        raise ValueError("This file is not a readable .yst desktop project.") from exc
    if isinstance(raw, dict) and "document" in raw:
        raw = raw["document"]
    return validate_project(raw)


def _atomic(path, writer):
    path = Path(path)
    tmp = NamedTemporaryFile(
        mode="wb",
        prefix="." + path.name + ".",
        suffix=".tmp",
        dir=path.parent,
        delete=False,
    )
    try:
        with tmp:
            writer(tmp)
            tmp.flush()
            os.fsync(tmp.fileno())
        os.replace(tmp.name, path)
    finally:
        Path(tmp.name).unlink(missing_ok=True)


def save_project(path, doc):
    data = json.dumps(validate_project(doc), ensure_ascii=False, indent=2).encode(
        "utf-8"
    )
    if len(data) > PROJECT_BYTES * 2:
        raise ValueError("Project file is too large to save.")
    _atomic(path, lambda handle: handle.write(data))


def _html(title, body, css="", background=""):
    style = f"<style>{css}</style>" if css else ""
    attrs = f' bgcolor="{background}"' if background else ""
    return (
        f'<!DOCTYPE html><html lang="en"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8">'
        f"<title>{escape(title)}</title>{style}</head><body{attrs}>{body}</body></html>\n"
    ).encode("utf-8")


def _bundle(doc):
    d = validate_project(doc)
    files = {}
    order = sorted(
        enumerate(d["items"]), key=lambda kv: (kv[1]["y"], kv[1]["x"], kv[0])
    )
    graphic = []
    plain = []
    for i, obj in order:
        kind = obj["kind"]
        text = escape(obj["text"]).replace("\n", "<br>")
        content = text
        label = text
        if kind == "image":
            label = "[Image: " + (text or "illustration") + "]"
            if obj["src"]:
                ext, data = _read_image_uri(obj["src"])
                filename = f"images/picture-{i + 1}.{ext}"
                files[filename] = data
                content = f'<img src="{filename}" width="{obj["w"]}" height="{obj["h"]}" alt="{escape(obj["text"])}">'
            else:
                content = label
        href = obj["href"]
        if href:
            content = f'<a href="{escape(href)}">{content or escape(href)}</a>'
            label = f'<a href="{escape(href)}">{label or escape(href)}</a>'
        if kind == "rule":
            plain.append("<hr>")
        elif label:
            plain.append(f"<p>{label}</p>")
        fill = obj["color"] if kind == "rule" else obj["fill"] or "transparent"
        style = (
            f"position:absolute;box-sizing:border-box;overflow:hidden;left:{obj['x']}px;top:{obj['y']}px;"
            f"width:{obj['w']}px;height:{obj['h']}px;z-index:{i + 1};background:{fill};color:{obj['color']};"
            f"text-align:{obj['align']};font-family:{FONTS[obj['font_family']]};font-size:{obj['font_size']}px;"
            f"font-weight:{'bold' if obj['bold'] else 'normal'};font-style:{'italic' if obj['italic'] else 'normal'}"
        )
        if kind == "box":
            style += ";border:1px solid " + obj["color"]
        graphic.append(f'<div style="{style}">{content}</div>')
    author = ("<p>By " + escape(d["byline"]) + "</p>") if d["byline"] else ""
    text = "<h1>" + escape(d["title"]) + "</h1>" + "\n".join(plain) + "<hr>" + author
    files["text.html"] = _html(
        d["title"], text + '<p><a href="index.html">Home</a></p>'
    )
    if d["profile"] == "text":
        files["index.html"] = _html(d["title"], text)
    else:
        page = (
            f'<div style="position:relative;overflow:hidden;margin:0 auto;width:{d["width"]}px;'
            f'height:{d["height"]}px;background:{d["background"]}">'
            + "\n".join(graphic)
            + "</div>"
        )
        foot = (
            '<div class="credits"><hr>'
            + author
            + '<a href="text.html">Text edition</a></div>'
        )
        css = (
            "body{margin:0}img{display:block;border:0}a{color:inherit}"
            ".credits{background:white;color:#242035;font:14px Arial,sans-serif;padding:1px 1em}"
        )
        files["index.html"] = _html(d["title"], page + foot, css, d["background"])
    return files


def preview_folder(directory, doc):
    root = Path(directory)
    root.mkdir(parents=True, exist_ok=True)
    for name, data in _bundle(doc).items():
        dest = root / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        _atomic(dest, lambda handle: handle.write(data))
    return root / "index.html"


def export_zip(path, doc):
    files = _bundle(doc)

    def write(handle):
        with ZipFile(handle, "w", ZIP_DEFLATED) as zip_file:
            for name, data in files.items():
                zip_file.writestr(name, data)

    _atomic(path, write)
