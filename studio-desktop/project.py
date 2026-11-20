"""Retro Page project files, portable HTML, and separate image assets."""

import base64
import binascii
import hashlib
from functools import lru_cache
from html import escape
from io import BytesIO
import json
import os
from pathlib import Path
import re
import textwrap
import unicodedata
from tempfile import NamedTemporaryFile
from urllib.parse import urlsplit
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile

from PIL import Image, ImageOps, UnidentifiedImageError
from lettering import SIGNAL_FONT, item_lettering
from widgets import PRESETS


FONTS = {
    SIGNAL_FONT: "Arial,Helvetica,sans-serif",
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


def _link(value, *, internal=False):
    value = _text(value, "Link", 2048).strip()
    if not value:
        return ""
    if re.search(r"[\\\s]", value):
        raise ValueError("Links cannot contain spaces or backslashes.")
    if internal and re.fullmatch(r"page:(?:home|[0-9a-f]{32})", value):
        return value
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


def validate_project(doc, *, publishing=False, internal=False):
    """Return normalized project data. Drafts may be empty and have no site address."""
    if not isinstance(doc, dict):
        raise ValueError("Expected a Retro Page project.")
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
            href=_link(obj.get("href", ""), internal=internal),
            font_size=_number(obj.get("font_size", 16), "Font size", 6, 160),
            color=_color(obj.get("color", item["color"])),
            fill=_color(obj.get("fill", ""), True),
        )
        if "widget" in obj:
            widget = obj["widget"]
            if not isinstance(widget, str) or widget not in PRESETS:
                raise ValueError("Unknown object preset.")
            item["widget"] = widget
            if widget == "counter" and not re.fullmatch("[0-9]{1,12}", item["text"]):
                raise ValueError("Enter 1–12 counter digits.")
            if widget == "webring" and obj.get("ringRole") in ("previous", "directory", "next"):
                item["ringRole"] = obj["ringRole"]
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
        if publishing and kind == "text" and item["font_family"] == SIGNAL_FONT:
            # The publishing service and vintage browsers both accept an ordinary GIF.
            data = item_lettering(item)
            if len(data) > IMAGE_BYTES:
                raise ValueError(
                    "The display lettering exceeds 96 KiB. Reduce its size before publishing."
                )
            _verify_image(data)
            item.update(
                kind="image",
                font_family="Arial",
                src="data:image/gif;base64," + base64.b64encode(data).decode("ascii"),
            )
            count += 1
        d["items"].append(item)
    if publishing and count > 3:
        raise ValueError("YesterSites publishing allows up to three pictures per page.")
    if (
        publishing
        and len(json.dumps(d, ensure_ascii=False, separators=(",", ":")).encode())
        > PROJECT_BYTES
    ):
        raise ValueError("Project exceeds the 512 KiB publishing limit.")
    return d


MAX_PAGES = 24
SITE_BYTES = MAX_PAGES * PROJECT_BYTES * 2


def validate_site(doc):
    """Normalize the original homepage and optional additional pages."""
    home = validate_project(doc, internal=True)
    pages = doc.get("pages", [])
    if not isinstance(pages, list) or len(pages) >= MAX_PAGES:
        raise ValueError(f"A project can have up to {MAX_PAGES} pages.")
    seen = {"home"}
    children = []
    for page in pages:
        normalized = validate_project(page, internal=True)
        ident = page.get("page_id")
        if (
            not isinstance(ident, str)
            or not re.fullmatch(r"[0-9a-f]{32}", ident)
            or ident in seen
        ):
            raise ValueError("Invalid or duplicate page ID.")
        seen.add(ident)
        normalized["page_id"] = ident
        children.append(normalized)
    for page in [home, *children]:
        for obj in page["items"]:
            href = obj["href"]
            if href.startswith("page:") and href[5:] not in seen:
                raise ValueError(
                    f"A link on {page['title'] or 'an untitled page'} points to a missing page."
                )
    if children:
        home["pages"] = children
    return home


EDITIONS = ("modern", "phone", "classic", "text")


def page_filename(page_id, text=False, *, edition=None):
    """Resolve the original site entry, or an explicit edition of the same page."""
    if edition is None and text:
        edition = "text"
    if edition is not None and edition not in EDITIONS:
        raise ValueError("Unknown preview edition.")
    if page_id == "home":
        return f"{edition or 'index'}.html"
    suffix = "-" + edition if edition else ""
    return f"page-{page_id}{suffix}.html"


def terminal_lines(page, site, page_id="home", columns=32):
    """Wrap the ASCII screen to its selected width and return numbered destinations."""
    if columns not in (32, 40, 80):
        raise ValueError("Choose a 32-, 40-, or 80-column terminal.")
    names = {
        "home": "Home",
        **{p["page_id"]: p["title"] for p in site.get("pages", [])},
    }
    ordered = sorted(page["items"], key=lambda obj: (obj["y"], obj["x"]))
    authored = [item for item in ordered if item.get("widget", "").startswith("bbs-")]
    if authored:
        lines, links = [], []
        for item in authored:
            label = ascii_text(item["text"].expandtabs(4))
            if item["widget"] in ("bbs-menu", "bbs-files") and item["href"].startswith("page:"):
                links.append(item["href"][5:])
                label = f"{len(links)}  " + (label or names.get(links[-1], "Home"))
            elif item["widget"] in ("bbs-menu", "bbs-files") and item["href"]:
                label += "\n" + ascii_text(item["href"])
            for line in label.split("\n"):
                if item["widget"] in ("bbs-art", "bbs-files"):
                    lines.extend([line[i:i+columns] for i in range(0, len(line), columns)] or [""])
                else:
                    lines.extend(textwrap.wrap(line, width=columns) or [""])
            lines.append("")
        return lines, links
    lines = textwrap.wrap(ascii_text(page["title"].upper()), width=columns) + [""]
    links = []
    body = []
    for item in ordered:
        label = item["text"].strip()
        href = item["href"]
        if href.startswith("page:"):
            dest = href[5:]
            if dest != page_id:
                links.append(dest)
                lines.extend(
                    textwrap.wrap(
                        f"{len(links)}  {ascii_text(label or names.get(dest, 'Page'))}",
                        width=columns,
                    )
                )
        else:
            if item["kind"] == "image":
                label = f"[{label}]" if label else ""
            if label and " ".join(label.lower().split()) != page["title"].lower():
                body.extend(textwrap.wrap(ascii_text(label), width=columns))
                body.append("")
    return lines + ([""] if links else []) + body, links


def ascii_text(value):
    value = value.translate(str.maketrans({"’": "'", "—": "-", "–": "-"}))
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()


def read_project(path):
    path = Path(path)
    if path.stat().st_size > SITE_BYTES:
        raise ValueError("Project file is too large.")
    try:
        raw = json.loads(path.read_bytes())
    except (ValueError, UnicodeError, RecursionError) as exc:
        raise ValueError("This file is not a readable .yst desktop project.") from exc
    if isinstance(raw, dict) and "document" in raw:
        raw = raw["document"]
    return validate_site(raw)


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
    data = json.dumps(validate_site(doc), ensure_ascii=False, indent=2).encode("utf-8")
    if len(data) > SITE_BYTES:
        raise ValueError("Project file is too large to save.")
    _atomic(path, lambda handle: handle.write(data))


def _html(title, body, css="", attrs=""):
    style = f"<style>{css}</style>" if css else ""
    return (
        '<!DOCTYPE html><html lang="en"><head>'
        '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f"<title>{escape(title)}</title>{style}</head><body{attrs}>{body}</body></html>\n"
    ).encode("utf-8")


def _destination(obj, edition):
    href = obj["href"]
    return (
        page_filename(href[5:], edition=edition) if href.startswith("page:") else href
    )


def _linked(obj, content, edition):
    href = _destination(obj, edition)
    if href:
        return f'<a href="{escape(href)}">{content or escape(href)}</a>'
    return content


def _edition_links(page_id, edition, byline):
    links = []
    for key, label in [
        ("modern", "Original layout"),
        ("phone", "Phone layout"),
        ("classic", "Classic HTML"),
        ("text", "Text edition"),
    ]:
        if key != edition:
            links.append(f'<a href="{page_filename(page_id, edition=key)}">{label}</a>')
    author = f"<p>By {escape(byline)}</p>" if byline else ""
    return (
        '<div class="editions"><hr>'
        + author
        + "<p>"
        + " &nbsp;|&nbsp; ".join(links)
        + "</p></div>"
    )


@lru_cache(maxsize=6)
def _classic_gif(data, background):
    with Image.open(BytesIO(data)) as image:
        # GIF has one transparent palette entry. Composite intermediate alpha
        # against the author's fallback color and preserve fully transparent holes.
        rgba = image.convert("RGBA")
        alpha = rgba.getchannel("A")
        matte = Image.new("RGB", rgba.size, background)
        matte.paste(rgba, mask=alpha)
        indexed = matte.quantize(colors=255)
        indexed.paste(255, mask=alpha.point(lambda a: 255 if a == 0 else 0))
        stream = BytesIO()
        indexed.save(stream, "GIF", transparency=255)
        return stream.getvalue()


def _media(page, page_id):
    """Keep original animated source bytes and provide classic PNG fallbacks separately."""
    prefix = "" if page_id == "home" else page_id + "-"
    files, paths = {}, {}
    for index, obj in enumerate(page["items"], start=1):
        if obj["kind"] == "image" and obj["src"]:
            ext, data = _read_image_uri(obj["src"])
            name = f"images/{prefix}picture-{index}.{ext}"
        elif obj["kind"] == "text" and obj["font_family"] == SIGNAL_FONT:
            data = item_lettering(obj)
            name = f"images/{prefix}lettering-{index}.gif"
        else:
            continue
        files[name] = data
        classic_name = name
        if name.endswith(".png"):
            classic_name = name[:-4] + "-classic.gif"
            files[classic_name] = _classic_gif(data, page["background"])
        paths[obj["id"]] = (name, classic_name)
    return files, paths


def _backdrop(page):
    if page["items"]:
        obj = page["items"][0]
        if (
            obj["kind"] == "image"
            and obj["src"]
            and not obj["text"].strip()
            and not obj["href"]
            and (obj["x"], obj["y"], obj["w"], obj["h"])
            == (0, 0, page["width"], page["height"])
        ):
            return obj
    return None


def _flow_rows(page, backdrop):
    # Associate a side illustration with nearby copy when their columns are disjoint.
    # Compare row centers, so a tall picture cannot swallow all subsequent paragraphs.
    items = sorted(
        (o for o in page["items"] if o is not backdrop), key=lambda o: (o["y"], o["x"])
    )
    rows = []
    for obj in items:
        previous = rows[-1] if rows else []
        in_band = previous and obj["y"] < min(p["y"] + p["h"] / 2 for p in previous)
        clear_column = all(
            obj["x"] >= p["x"] + p["w"] or p["x"] >= obj["x"] + obj["w"]
            for p in previous
        )
        if in_band and clear_column:
            previous.append(obj)
        else:
            rows.append([obj])
    return [sorted(row, key=lambda o: o["x"]) for row in rows]


def _contrast_color(hex_color):
    r, g, b = bytes.fromhex(hex_color[1:])
    return "#161616" if r * 299 + g * 587 + b * 114 > 145000 else "#f8f7ee"


def _object_content(obj, paths, edition):
    text = escape(obj["text"]).replace("\n", "<br>")
    if obj.get("widget") in ("bbs-art", "bbs-files"):
        return "<tt>" + text.replace(" ", "&nbsp;") + "</tt>"
    if edition == "text":
        if obj["kind"] == "image":
            return f"[Image: {text}]" if text else ""
    elif obj["id"] in paths:
        name = paths[obj["id"]][int(edition == "classic")]
        return (
            f'<img src="{name}" width="{obj["w"]}" height="{obj["h"]}" '
            f'alt="{escape(obj["text"])}" border="0">'
        )
    return text


def _board(page, paths, edition):
    width, height = page["width"], page["height"]
    # Absolute drawing positions and text metrics use the same scale. At an
    # authored width of 640, one unit is one CSS px; small screens may scale down.
    parts = [
        f'<div class="board" style="max-width:{width}px;'
        f'background:{page["background"]}"><div style="padding-top:{100 * height / width:.8f}%"></div>'
    ]
    for i, obj in enumerate(page["items"]):
        kind = obj["kind"]
        fill = obj["color"] if kind == "rule" else obj["fill"] or "transparent"
        size = obj["font_size"]
        style = (
            f"left:{100 * obj['x'] / width:.8f}%;top:{100 * obj['y'] / height:.8f}%;"
            f"width:{100 * obj['w'] / width:.8f}%;height:{100 * obj['h'] / height:.8f}%;"
            f"z-index:{i + 1};background:{fill};color:{obj['color']};"
            f"text-align:{obj['align']};font-family:{FONTS[obj['font_family']]};"
            f"font-size:{size}px;font-size:min({size}px,{100 * size / width:.8f}vw);"
            f"font-weight:{'bold' if obj['bold'] else 'normal'};"
            f"font-style:{'italic' if obj['italic'] else 'normal'}"
        )
        if kind == "box":
            style += ";box-shadow:inset 0 0 0 1px " + obj["color"]
        content = _object_content(obj, paths, "modern")
        if kind == "image" and not obj["src"]:
            content = content or "Image"
        parts.append(
            f'<div class="object" style="{style}">{_linked(obj, content, edition)}</div>'
        )
    parts.append("</div>")
    return "\n".join(parts)


def _navigation_row(row):
    separators = {"/", "|", "·", "•", "»", "›", "–", "-"}
    return (
        len(row) > 1
        and any(o["href"] for o in row)
        and all(
            o["href"] or (o["kind"] == "text" and o["text"].strip() in separators)
            for o in row
        )
    )


def _flow_item(obj, paths, layout, destination):
    if obj["kind"] == "rule":
        return "<hr>"
    content = _object_content(obj, paths, layout)
    if not content and not obj["href"]:
        return ""
    linked = _linked(obj, content, destination)
    if layout == "text":
        return linked
    if layout == "classic":
        # Map the authored pixel size to the seven settings of HTML's FONT element.
        levels = (10, 13, 16, 18, 24, 32, 48)
        font_size = 1 + min(
            range(len(levels)), key=lambda i: abs(levels[i] - obj["font_size"])
        )
        content = content or escape(_destination(obj, destination))
        if obj["bold"]:
            content = "<b>" + content + "</b>"
        if obj["italic"]:
            content = "<i>" + content + "</i>"
        colored = (
            f'<font color="{obj["color"]}" face="{escape(FONTS[obj["font_family"]])}" '
            f'size="{font_size}">{content}</font>'
        )
        return _linked(obj, colored, destination)
    size = max(16, min(obj["font_size"], 56))
    style = (
        f"font-family:{FONTS[obj['font_family']]};font-size:{size}px;"
        f"color:{obj['color']};text-align:{obj['align']};"
        f"font-style:{'italic' if obj['italic'] else 'normal'};"
        f"font-weight:{'bold' if obj['bold'] else 'normal'}"
    )
    if obj["fill"]:
        style += f";background:{obj['fill']}"
    return f'<span style="{style}">{linked}</span>'


def _flow(page, paths, layout, destination):
    backdrop = _backdrop(page)
    rows = _flow_rows(page, backdrop)
    groups = []
    for row in rows:
        segments = [(obj, _flow_item(obj, paths, layout, destination)) for obj in row]
        segments = [(obj, body) for obj, body in segments if body]
        if not segments:
            continue
        if _navigation_row(row):
            groups.append(
                '<p class="navlinks">' + " ".join(body for _, body in segments) + "</p>"
            )
        elif layout == "classic" and len(segments) > 1:
            columns = "".join(
                f'<td valign="top" align="{obj["align"]}">{body}</td>'
                for obj, body in segments
            )
            groups.append(
                '<table border="0" cellpadding="4" cellspacing="0"><tr>'
                + columns
                + "</tr></table>"
            )
        else:
            for obj, body in segments:
                if obj["kind"] == "rule":
                    groups.append(body)
                else:
                    align = (
                        "center"
                        if layout == "phone" and obj["id"] in paths
                        else obj["align"]
                    )
                    groups.append(f'<p align="{align}">{body}</p>')
    if layout == "text":
        groups.insert(0, "<h1>" + escape(page["title"]) + "</h1>")
        return "\n".join(groups)
    if layout == "classic":
        return (
            '<center><table border="0" cellpadding="6" cellspacing="0" '
            f'width="{min(600, page["width"])}"><tr><td>'
            + "\n".join(groups)
            + "</td></tr></table></center>"
        )
    style = f"background-color:{page['background']};color:{_contrast_color(page['background'])}"
    if backdrop:
        style += f";background-image:url({paths[backdrop['id']][0]})"
    return f'<article class="phone" style="{style}">' + "\n".join(groups) + "</article>"


BOARD_CSS = """
body{margin:0}
.board{position:relative;width:100%;margin:0 auto;overflow:hidden}
.object{position:absolute;box-sizing:border-box;overflow:hidden;pointer-events:none;
line-height:normal;overflow-wrap:anywhere}
.object img{display:block;width:100%;height:100%}
.object a{display:block;width:100%;height:100%;color:inherit;pointer-events:auto}
"""
PHONE_CSS = """
body{margin:0}
.phone{max-width:42rem;margin:0 auto;padding:1rem;box-sizing:border-box;
min-height:70vh;overflow-wrap:anywhere;line-height:1.45}
.phone p{margin:0 0 1rem}
.phone img{max-width:100%;height:auto;vertical-align:middle}
.phone a{display:inline-block;box-sizing:border-box;min-height:44px;align-content:center;color:inherit}
.phone .navlinks{display:flex;flex-wrap:wrap;align-items:center;gap:0 .45em}
"""
FOOTER_CSS = """
.editions{max-width:var(--paper-width,40rem);box-sizing:border-box;margin:0 auto;
padding:.3em .75em .5em;font:13px/1.5 Arial,sans-serif;overflow-wrap:anywhere}
.editions hr{margin:0;border:0;border-top:1px solid currentColor;opacity:.45}
.editions p{margin:.35em 0}.editions a{color:inherit}
"""


def _page_bundle(page, page_id, media=None):
    files, paths = media if media is not None else _media(page, page_id)
    title = page["title"]
    author = page["byline"]
    board = _board(page, paths, "modern")
    phone = _flow(page, paths, "phone", "phone")
    text = _flow(page, paths, "text", "text")
    classic = _flow(page, paths, "classic", "classic")
    background = page["background"]
    ink = _contrast_color(background)
    attrs = f' bgcolor="{background}" text="{ink}" link="{ink}" vlink="{ink}"'
    backdrop = _backdrop(page)
    body_css = f"body{{--paper-width:{page['width']}px;color:{ink};background-color:{background};"
    if backdrop:
        attrs += f' background="{paths[backdrop["id"]][1]}"'
        body_css += (
            f"background-image:url({paths[backdrop['id']][0]});"
            f"background-size:{page['width']}px {page['height']}px;background-position:center top;"
        )
    body_css += "}"

    files[page_filename(page_id, edition="classic")] = _html(
        title, classic + _edition_links(page_id, "classic", author), attrs=attrs
    )
    files[page_filename(page_id, edition="text")] = _html(
        title, text + _edition_links(page_id, "text", author)
    )
    files[page_filename(page_id, edition="modern")] = _html(
        title,
        board + _edition_links(page_id, "modern", author),
        body_css + BOARD_CSS + FOOTER_CSS,
        f' bgcolor="{background}"',
    )
    files[page_filename(page_id, edition="phone")] = _html(
        title,
        phone + _edition_links(page_id, "phone", author),
        body_css + PHONE_CSS + FOOTER_CSS,
        f' bgcolor="{background}"',
    )

    if page["profile"] == "text":
        body = _flow(page, paths, "text", None) + _edition_links(
            page_id, "text", author
        )
        files[page_filename(page_id)] = _html(title, body)
    else:
        # Keep normal page-to-page URLs on the responsive default entry. Explicit
        # edition links above stay within their chosen edition across navigation.
        body = _board(page, paths, None) + _flow(page, paths, "phone", None)
        body += _edition_links(page_id, None, author)
        css = (
            body_css
            + BOARD_CSS
            + PHONE_CSS
            + FOOTER_CSS
            + """
.phone{display:none}
@media (max-width:600px){.phone{display:block}.board{display:none}}
"""
        )
        files[page_filename(page_id)] = _html(
            title, body, css, f' bgcolor="{background}"'
        )
    return files


def _dos_bundle(pages, media):
    """Self-contained FAT 8.3 copy of the classic and text editions."""
    files = {}
    names = {}
    used = set()

    def short_name(prefix, identity, ext):
        key = (prefix, identity, ext)
        if key not in names:
            digest = hashlib.sha256(identity).hexdigest()
            candidate = prefix + digest[:7].upper() + "." + ext.upper()
            while candidate in used:
                digest = hashlib.sha256(digest.encode("ascii")).hexdigest()
                candidate = prefix + digest[:7].upper() + "." + ext.upper()
            names[key] = candidate
            used.add(candidate)
        return names[key]

    destinations = {}
    for edition, prefix, home in (("classic", "P", "INDEX.HTM"), ("text", "T", "TEXT.HTM")):
        destinations[edition] = {
            key: home if key == "home" else short_name(prefix, key.encode("ascii"), "HTM")
            for key in sorted(pages)
        }
    for key, page in pages.items():
        source, long_paths = media[key]
        paths = {}
        for ident, (_, classic_path) in long_paths.items():
            data = source[classic_path]
            extension = Path(classic_path).suffix[1:].replace("jpeg", "jpg")
            name = short_name("I", data, extension)
            files["DOS/" + name] = data
            paths[ident] = (name, name)
        backdrop = _backdrop(page)
        for edition, alternate in (("classic", "text"), ("text", "classic")):
            items = []
            for obj in page["items"]:
                href = obj["href"]
                if href.startswith("page:"):
                    obj = {**obj, "href": destinations[edition][href[5:]]}
                items.append(obj)
            content = _flow({**page, "items": items}, paths, edition, edition)
            body_attrs = ""
            if edition == "classic":
                bg = page["background"]
                ink = _contrast_color(bg)
                body_attrs = f' bgcolor="{bg}" text="{ink}" link="{ink}" vlink="{ink}"'
                if backdrop:
                    body_attrs += f' background="{paths[backdrop["id"]][1]}"'
            label = "Text edition" if alternate == "text" else "Classic HTML"
            content += "<hr>"
            if page["byline"]:
                content += f'<p>By {escape(page["byline"])}</p>'
            content += f'<p><a href="{destinations[alternate][key]}">{label}</a></p>'
            document = _html(page["title"], content, attrs=body_attrs).decode("utf-8")
            document = document.replace("charset=UTF-8", "charset=US-ASCII", 1)
            files["DOS/" + destinations[edition][key]] = document.encode("ascii", "xmlcharrefreplace")
    return files


def _bundle(doc):
    site = validate_site(doc)
    pages = {"home": site, **{page["page_id"]: page for page in site.get("pages", [])}}
    media = {key: _media(page, key) for key, page in pages.items()}
    files = {}
    for key, page in pages.items():
        files.update(_page_bundle(page, key, media[key]))
    files.update(_dos_bundle(pages, media))
    return files


def html_source(doc, page_id, *, edition=None):
    site = validate_site(doc)
    page = (
        site
        if page_id == "home"
        else next(p for p in site["pages"] if p["page_id"] == page_id)
    )
    return _page_bundle(page, page_id)[page_filename(page_id, edition=edition)].decode(
        "utf-8"
    )


def preview_folder(directory, doc, page_id="home", *, edition=None):
    root = Path(directory)
    root.mkdir(parents=True, exist_ok=True)
    for name, data in _bundle(doc).items():
        dest = root / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        _atomic(dest, lambda handle: handle.write(data))
    return root / page_filename(page_id, edition=edition)


def export_zip(path, doc):
    files = _bundle(doc)

    def write(handle):
        with ZipFile(handle, "w", ZIP_DEFLATED) as zip_file:
            for name, data in files.items():
                zip_file.writestr(name, data)

    _atomic(path, write)
