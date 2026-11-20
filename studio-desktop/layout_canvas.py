"""Free-placement page canvas for the Retro Page desktop editor.

Object coordinates are CSS pixels measured from the page's top-left corner.
Objects are shared with the document model. Their list order is the paint order.
"""

import base64
from collections import OrderedDict
from io import BytesIO
import tkinter as tk
from tkinter import font as tkfont
from tkinter import ttk

from PIL import Image, ImageOps, ImageTk
from lettering import SIGNAL_FONT, item_lettering


MAT = "#c3bfb4"
RULER = "#ece8dc"
INK = "#312e2a"
SELECTION = "#262421"
HANDLE = 4
MARGIN = 7
GRID_STEP = 8


def clamp(value, low, high):
    return max(low, min(value, max(low, high)))


class DesignCanvas(ttk.Frame):
    """A native, scrollable, pixel-ruler page with direct object manipulation."""

    def __init__(self, parent, on_select, on_change, on_edit):
        super().__init__(parent)
        self.on_select = on_select
        self.on_change = on_change
        self.on_edit = on_edit
        self.items = []
        self.hidden = set()
        self.page_width, self.page_height = 640, 480
        self.background = "#ffffff"
        self.selected = None
        self.zoom = 1.0
        self.show_grid = False
        self.snap = False
        self._placement = None
        self._gesture = None
        self._paint_pending = False
        self._rulers_pending = False
        self._font_cache = {}
        self._photos = {}
        self._image_cache = OrderedDict()

        self.columnconfigure(1, weight=1)
        self.rowconfigure(1, weight=1)
        tk.Label(
            self,
            text="",
            bg=RULER,
            fg=INK,
            bd=1,
            relief="flat",
            font=("TkDefaultFont", 8),
        ).grid(row=0, column=0, sticky="nsew")
        self.top = tk.Canvas(self, height=23, bg=RULER, highlightthickness=0)
        self.left = tk.Canvas(self, width=31, bg=RULER, highlightthickness=0)
        self.top.grid(row=0, column=1, sticky="ew")
        self.left.grid(row=1, column=0, sticky="ns")
        self.canvas = tk.Canvas(
            self,
            bg=MAT,
            bd=0,
            highlightthickness=0,
            takefocus=True,
            xscrollincrement=1,
            yscrollincrement=1,
        )
        self.canvas.grid(row=1, column=1, sticky="nsew")
        self.hbar = ttk.Scrollbar(self, orient="horizontal", command=self.canvas.xview)
        self.vbar = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        self.hbar.grid(row=2, column=1, sticky="ew")
        self.vbar.grid(row=1, column=2, sticky="ns")
        self.canvas.configure(
            xscrollcommand=self._scroll_x, yscrollcommand=self._scroll_y
        )
        self.canvas.bind("<Configure>", self._on_configure)
        self.canvas.bind("<ButtonPress-1>", self._pointer_down)
        self.canvas.bind("<B1-Motion>", self._pointer_drag)
        self.canvas.bind("<ButtonRelease-1>", self._pointer_up)
        self.canvas.bind("<Double-Button-1>", self._double_click)
        self.canvas.bind("<Motion>", self._hover)
        self.canvas.bind("<Escape>", self._cancel)
        self.canvas.bind("<Return>", self._keyboard_edit)
        for key in ("Left", "Right", "Up", "Down"):
            self.canvas.bind("<" + key + ">", self._nudge)
            self.canvas.bind("<Shift-" + key + ">", self._nudge)
        for event in (
            "<MouseWheel>",
            "<Shift-MouseWheel>",
            "<Button-4>",
            "<Button-5>",
            "<Shift-Button-4>",
            "<Shift-Button-5>",
        ):
            self.canvas.bind(event, self._wheel)

    def set_scene(self, items, width, height, background, selected=None):
        self.items = items
        self.page_width = max(1, int(width))
        self.page_height = max(1, int(height))
        self.background = background or "#ffffff"
        self.selected = selected if self._find(selected) is not None else None
        self._gesture = None
        self._invalidate()

    def select(self, object_id):
        object_id = object_id if self._find(object_id) is not None else None
        if self.selected != object_id:
            self.selected = object_id
            self.on_select(object_id)
            self._invalidate()

    def set_snap(self, enabled):
        self.snap = bool(enabled)

    def set_grid(self, enabled):
        self.show_grid = bool(enabled)
        self._invalidate()

    def set_zoom(self, scale):
        self.zoom = clamp(float(scale), 0.25, 3.0)
        self._invalidate()

    def set_placement(self, callback):
        """Arm a one-shot tool. A click inside the paper returns integer x,y."""
        self._placement = callback
        self.canvas.configure(cursor="crosshair" if callback else "")
        self.canvas.focus_set()

    def point_at_screen(self, x_root, y_root):
        """Convert a global pointer position to paper coordinates, including scroll and zoom."""
        cv = self.canvas
        cx, cy = x_root - cv.winfo_rootx(), y_root - cv.winfo_rooty()
        if not (0 <= cx < cv.winfo_width() and 0 <= cy < cv.winfo_height()):
            return None
        x = (cv.canvasx(cx) - MARGIN) / self.zoom
        y = (cv.canvasy(cy) - MARGIN) / self.zoom
        if 0 <= x < self.page_width and 0 <= y < self.page_height:
            return (
                clamp(self._snap_coord(x), 0, self.page_width - 1),
                clamp(self._snap_coord(y), 0, self.page_height - 1),
            )
        return None

    def _find(self, object_id):
        return next((item for item in self.items if item["id"] == object_id), None)

    def _on_configure(self, _event):
        self._invalidate()

    def _invalidate(self):
        if not self._paint_pending:
            self._paint_pending = True
            self.after_idle(self._paint)

    def _queue_rulers(self):
        if not self._rulers_pending:
            self._rulers_pending = True
            self.after_idle(self._paint_rulers)

    def _scroll_x(self, first, last):
        self.hbar.set(first, last)
        self._queue_rulers()

    def _scroll_y(self, first, last):
        self.vbar.set(first, last)
        self._queue_rulers()

    def _wheel(self, event):
        if event.num in (4, 5):
            distance = -40 if event.num == 4 else 40
        else:
            delta = event.delta
            distance = -int(delta / 120) * 40 if abs(delta) >= 120 else -delta * 4
        scroll = (
            self.canvas.xview_scroll if event.state & 1 else self.canvas.yview_scroll
        )
        scroll(int(distance), "units")
        return "break"

    def _page_pos(self, event):
        return (
            (self.canvas.canvasx(event.x) - MARGIN) / self.zoom,
            (self.canvas.canvasy(event.y) - MARGIN) / self.zoom,
        )

    def _screen_rect(self, item):
        x, y, w, h = (item[key] * self.zoom for key in ("x", "y", "w", "h"))
        return MARGIN + x, MARGIN + y, MARGIN + x + w, MARGIN + y + h

    def _paint(self):
        self._paint_pending = False
        cv = self.canvas
        cv.delete("all")
        right = MARGIN + self.page_width * self.zoom
        bottom = MARGIN + self.page_height * self.zoom
        cv.configure(
            scrollregion=(
                0,
                0,
                max(cv.winfo_width(), right + MARGIN),
                max(cv.winfo_height(), bottom + MARGIN),
            )
        )
        cv.create_rectangle(
            MARGIN + 3, MARGIN + 3, right + 3, bottom + 3, fill="#50545b", outline=""
        )
        cv.create_rectangle(
            MARGIN, MARGIN, right, bottom, fill=self.background, outline="#39404a"
        )
        if self.show_grid:
            # Grid lines remain affordable on tall pages and under high zoom.
            spacing = GRID_STEP if self.zoom >= 1 else GRID_STEP * 2
            for x in range(spacing, self.page_width, spacing):
                pos = MARGIN + x * self.zoom
                cv.create_line(pos, MARGIN, pos, bottom, fill="#acafae", dash=(1, 7))
            for y in range(spacing, self.page_height, spacing):
                pos = MARGIN + y * self.zoom
                cv.create_line(MARGIN, pos, right, pos, fill="#acafae", dash=(1, 7))

        current_photos = {}
        for item in self.items:
            if item["id"] not in self.hidden:
                self._draw_object(item, current_photos)
        self._photos = current_photos
        selected = self._find(self.selected)
        if selected is not None and self.selected not in self.hidden:
            x1, y1, x2, y2 = self._screen_rect(selected)
            cv.create_rectangle(x1 - 1, y1 - 1, x2 + 1, y2 + 1, outline=SELECTION)
            cv.create_rectangle(x1, y1, x2, y2, outline="white")
            for x, y in self._handles(selected).values():
                cv.create_rectangle(
                    x - HANDLE,
                    y - HANDLE,
                    x + HANDLE,
                    y + HANDLE,
                    fill="white",
                    outline=SELECTION,
                )
        self._queue_rulers()

    def _paint_rulers(self):
        self._rulers_pending = False
        for horizontal, ruler, scroll, extent in (
            (True, self.top, self.canvas.canvasx(0), self.page_width),
            (False, self.left, self.canvas.canvasy(0), self.page_height),
        ):
            ruler.delete("all")
            length = ruler.winfo_width() if horizontal else ruler.winfo_height()
            minor = 8 if self.zoom >= 0.75 else 16
            start = max(0, int((scroll - MARGIN) / self.zoom / minor) * minor)
            end = min(extent, int((scroll + length - MARGIN) / self.zoom))
            for value in range(start, end + 1, minor):
                pos = MARGIN + value * self.zoom - scroll
                major = value % (minor * 8) == 0
                tick = 7 if major else 3
                if horizontal:
                    ruler.create_line(pos, 22, pos, 22 - tick, fill=INK)
                    if major:
                        ruler.create_text(
                            pos + 2,
                            1,
                            text=str(value),
                            anchor="nw",
                            fill=INK,
                            font=("TkDefaultFont", 8),
                        )
                else:
                    ruler.create_line(30, pos, 30 - tick, pos, fill=INK)
                    if major:
                        ruler.create_text(
                            1,
                            pos + 1,
                            text=str(value),
                            anchor="nw",
                            fill=INK,
                            font=("TkDefaultFont", 7),
                        )

    def _font(self, item):
        size = max(5, round(float(item.get("font_size", 16)) * self.zoom))
        family = item.get("font_family") or "Times"
        key = (
            family,
            size,
            bool(item.get("bold")),
            bool(item.get("italic")),
            bool(item.get("href")) or item["kind"] == "link",
        )
        if key not in self._font_cache:
            self._font_cache[key] = tkfont.Font(
                root=self,
                family=family,
                size=-size,
                weight="bold" if key[2] else "normal",
                slant="italic" if key[3] else "roman",
                underline=key[4],
            )
        return self._font_cache[key]

    def _draw_object(self, item, current_photos):
        cv = self.canvas
        x, y, x2, y2 = self._screen_rect(item)
        kind = item["kind"]
        color = item.get("color") or ("#0000bb" if kind == "link" else "#191919")
        fill = item.get("fill") or ""
        if kind == "rule":
            cv.create_rectangle(x, y, x2, y2, fill=color, outline="")
            return
        if fill or kind == "box":
            cv.create_rectangle(
                x, y, x2, y2, fill=fill, outline=color if kind == "box" else ""
            )
        if kind == "text" and item.get("font_family") == SIGNAL_FONT:
            source = "data:image/gif;base64," + base64.b64encode(item_lettering(item)).decode("ascii")
            w, h = max(1, round(x2 - x)), max(1, round(y2 - y))
            key = (item["id"], source, w, h)
            photo = self._photos.get(key) or self._get_photo(source, w, h)
            if photo is not None:
                current_photos[key] = photo
                cv.create_image(x, y, image=photo, anchor="nw")
                return
        if kind == "image":
            src = item.get("src") or ""
            if src:
                w, h = max(1, round(x2 - x)), max(1, round(y2 - y))
                key = (item["id"], src, w, h)
                photo = self._photos.get(key)
                if photo is None:
                    photo = self._get_photo(src, w, h)
                if photo is not None:
                    current_photos[key] = photo
                    cv.create_image(x, y, image=photo, anchor="nw")
                    return
            cv.create_rectangle(x, y, x2, y2, outline="#777777", dash=(3, 2))
            cv.create_text(
                (x + x2) / 2,
                (y + y2) / 2,
                text=item.get("text") or "Image",
                width=max(1, int(x2 - x)),
                fill=color,
                font="TkDefaultFont",
            )
        elif kind in ("text", "link", "box"):
            font = self._font(item)
            width = max(1, int(x2 - x))
            height = max(1, int(y2 - y))
            cap = max(1, height // max(1, font.metrics("linespace")))
            text = self._fit_text(str(item.get("text") or ""), font, width, cap)
            align = item.get("align", "left")
            anchor, pos = {"center": ("n", (x + x2) / 2), "right": ("ne", x2)}.get(
                align, ("nw", x)
            )
            cv.create_text(
                pos,
                y,
                text=text,
                fill=color,
                anchor=anchor,
                font=font,
                justify=align if align in ("center", "right") else "left",
            )

    @staticmethod
    def _fit_text(text, font, width, lines_allowed):
        lines = []
        for paragraph in text.split("\n"):
            line = ""
            for word in paragraph.split():
                if line and font.measure(line + " " + word) > width:
                    lines.append(line)
                    line = ""
                line = (line + " " + word).lstrip()
                while len(line) > 1 and font.measure(line) > width:
                    lo, hi = 1, len(line)
                    while hi - lo > 1:
                        mid = (hi + lo) // 2
                        if font.measure(line[:mid]) <= width:
                            lo = mid
                        else:
                            hi = mid
                    lines.append(line[:lo])
                    line = line[lo:]
                    if len(lines) >= lines_allowed:
                        break
                if len(lines) >= lines_allowed:
                    break
            lines.append(line)
            if len(lines) >= lines_allowed:
                break
        return "\n".join(lines[:lines_allowed])

    def _get_photo(self, src, width, height):
        try:
            if src not in self._image_cache:
                if not src.startswith("data:image/") or len(src) > 4_000_000:
                    return None
                raw = base64.b64decode(src.split(",", 1)[1], validate=True)
                with Image.open(BytesIO(raw)) as image:
                    if image.width * image.height > 6_000_000:
                        return None
                    self._image_cache[src] = ImageOps.exif_transpose(image).convert(
                        "RGBA"
                    )
                while len(self._image_cache) > 6:
                    self._image_cache.popitem(last=False)
            self._image_cache.move_to_end(src)
            img = self._image_cache[src]
            # Large documents can be zoomed without allocating unbounded preview bitmaps.
            if width * height > 10_000_000:
                return None
            return ImageTk.PhotoImage(
                img.resize((width, height), Image.Resampling.LANCZOS), master=self
            )
        except (IndexError, ValueError, OSError, Image.DecompressionBombError):
            return None

    def _handles(self, item):
        x, y, x2, y2 = self._screen_rect(item)
        midx, midy = (x + x2) / 2, (y + y2) / 2
        return {
            "nw": (x, y),
            "ne": (x2, y),
            "sw": (x, y2),
            "se": (x2, y2),
            "n": (midx, y),
            "s": (midx, y2),
            "w": (x, midy),
            "e": (x2, midy),
        }

    def _hit(self, x, y):
        for item in reversed(self.items):
            if (
                item["id"] not in self.hidden
                and item["x"] <= x <= item["x"] + item["w"]
                and item["y"] <= y <= item["y"] + item["h"]
            ):
                return item
        return None

    def _handle_at(self, event):
        selected = self._find(self.selected)
        if selected is not None and self.selected not in self.hidden:
            x, y = self.canvas.canvasx(event.x), self.canvas.canvasy(event.y)
            for name, (px, py) in self._handles(selected).items():
                if abs(x - px) <= HANDLE + 1 and abs(y - py) <= HANDLE + 1:
                    return name
        return None

    def _hover(self, event):
        if self._placement:
            cursor = "crosshair"
        elif self._handle_at(event):
            cursor = "crosshair"
        elif self._hit(*self._page_pos(event)):
            cursor = "fleur"
        else:
            cursor = ""
        if self.canvas["cursor"] != cursor:
            self.canvas.configure(cursor=cursor)

    def _snap_coord(self, value):
        return round(value / GRID_STEP) * GRID_STEP if self.snap else round(value)

    def _pointer_down(self, event):
        self.canvas.focus_set()
        x, y = self._page_pos(event)
        if self._placement:
            if 0 <= x <= self.page_width and 0 <= y <= self.page_height:
                callback = self._placement
                self.set_placement(None)
                callback(
                    clamp(self._snap_coord(x), 0, self.page_width - 1),
                    clamp(self._snap_coord(y), 0, self.page_height - 1),
                )
            return "break"
        handle = self._handle_at(event)
        item = self._find(self.selected) if handle else self._hit(x, y)
        self.select(item["id"] if item else None)
        if item:
            self._gesture = (
                item["id"],
                handle or "move",
                x,
                y,
                tuple(item[k] for k in ("x", "y", "w", "h")),
            )
        return "break"

    def _pointer_drag(self, event):
        if not self._gesture:
            return
        object_id, mode, start_x, start_y, original = self._gesture
        item = self._find(object_id)
        if item is None:
            return
        mx, my = self._page_pos(event)
        dx, dy = mx - start_x, my - start_y
        x, y, w, h = original
        if mode == "move":
            if dx:
                x = clamp(self._snap_coord(x + dx), 0, self.page_width - w)
            if dy:
                y = clamp(self._snap_coord(y + dy), 0, self.page_height - h)
        else:
            right, bottom = x + w, y + h
            min_w = min(8, w)
            min_h = min(2 if item["kind"] == "rule" else 8, h)
            if "w" in mode and dx:
                x = clamp(self._snap_coord(x + dx), 0, right - min_w)
            if "e" in mode and dx:
                right = clamp(self._snap_coord(right + dx), x + min_w, self.page_width)
            if "n" in mode and dy:
                y = clamp(self._snap_coord(y + dy), 0, bottom - min_h)
            if "s" in mode and dy:
                bottom = clamp(
                    self._snap_coord(bottom + dy), y + min_h, self.page_height
                )
            w, h = right - x, bottom - y
        item.update(x=x, y=y, w=w, h=h)
        self._invalidate()
        return "break"

    def _pointer_up(self, _event):
        if self._gesture:
            object_id, _, _, _, before = self._gesture
            self._gesture = None
            item = self._find(object_id)
            if item and tuple(item[k] for k in ("x", "y", "w", "h")) != before:
                self.on_change()
        return "break"

    def _cancel(self, _event):
        if self._placement:
            self.set_placement(None)
        if self._gesture:
            object_id, _, _, _, before = self._gesture
            item = self._find(object_id)
            if item:
                item.update(zip(("x", "y", "w", "h"), before))
            self._gesture = None
            self._invalidate()
        return "break"

    def _double_click(self, event):
        if self._placement:
            return self._pointer_down(event)
        item = self._hit(*self._page_pos(event))
        if item:
            self.select(item["id"])
            self._gesture = None
            self.on_edit(item["id"])
        return "break"

    def _keyboard_edit(self, _event):
        if self.selected is not None:
            self.on_edit(self.selected)
        return "break"

    def _nudge(self, event):
        item = self._find(self.selected)
        if item is not None:
            step = 10 if event.state & 1 else 1
            dx, dy = {"Left": (-1, 0), "Right": (1, 0), "Up": (0, -1), "Down": (0, 1)}[
                event.keysym
            ]
            x = clamp(item["x"] + dx * step, 0, self.page_width - item["w"])
            y = clamp(item["y"] + dy * step, 0, self.page_height - item["h"])
            if (x, y) != (item["x"], item["y"]):
                item.update(x=x, y=y)
                self._invalidate()
                self.on_change()
        return "break"
