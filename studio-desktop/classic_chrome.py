"""Native controls and bitmap artwork for the Retro Page editor."""

from base64 import b64decode
from functools import lru_cache
from io import BytesIO
import tkinter as tk
from tkinter import ttk

from PIL import Image, ImageTk

FACE = "#e5e0d4"
PAPER = "#f2ede2"
HEADER = "#cecac1"
INK = "#211f1d"
SHADOW = "#837f77"
LIGHT = "#fffdf5"
ACTIVE = "#373a39"
WINE = "#811b2c"
MONITOR = "#070907"
PHOSPHOR = "#69ed45"


def configure_styles(root):
    root.configure(bg=FACE)
    style = ttk.Style(root)
    if "clam" in style.theme_names():
        style.theme_use("clam")
    style.configure(
        ".",
        background=FACE,
        foreground=INK,
        bordercolor=SHADOW,
        lightcolor=LIGHT,
        darkcolor="#a29d93",
        troughcolor="#d5d1c6",
        selectbackground=ACTIVE,
        selectforeground="white",
    )
    style.configure("TButton", padding=(6, 3), relief="raised")
    style.map("TButton", background=[("pressed", HEADER), ("active", PAPER)])
    style.configure("TEntry", fieldbackground=LIGHT, padding=3)
    style.configure("TSpinbox", fieldbackground=LIGHT, padding=2, arrowsize=10)
    style.configure("TScrollbar", arrowsize=11, gripcount=0)
    style.configure("Sash", sashthickness=5, gripcount=0)
    style.configure("Paper.TFrame", background=PAPER)
    style.configure("Paper.TLabel", background=PAPER)
    style.configure("Panel.TFrame", background=HEADER)
    style.configure(
        "Panel.TLabel", background=HEADER, font=("TkDefaultFont", 11, "bold")
    )
    style.configure("Gallery.TLabel", background=PAPER, font=("TkDefaultFont", 9))
    style.configure(
        "Side.Treeview",
        rowheight=28,
        fieldbackground=PAPER,
        background=PAPER,
        foreground=INK,
        borderwidth=0,
        font=("TkDefaultFont", 10),
    )
    style.layout("Side.Treeview", [("Treeview.treearea", {"sticky": "nswe"})])
    style.layout(
        "Side.Treeview.Item",
        [
            (
                "Treeitem.padding",
                {
                    "sticky": "nswe",
                    "children": [
                        ("Treeitem.image", {"side": "left", "sticky": ""}),
                        ("Treeitem.text", {"side": "left", "sticky": ""}),
                    ],
                },
            )
        ],
    )
    style.map(
        "Side.Treeview",
        background=[("selected", ACTIVE)],
        foreground=[("selected", "white")],
    )
    root.option_add("*Menu.background", FACE)
    root.option_add("*Menu.foreground", INK)
    root.option_add("*Menu.activeBackground", ACTIVE)
    root.option_add("*Menu.activeForeground", "white")


def panel(parent, title):
    frame = ttk.Frame(parent, style="Paper.TFrame", borderwidth=2, relief="sunken")
    head = ttk.Frame(
        frame, style="Panel.TFrame", padding=(6, 3), relief="raised", borderwidth=1
    )
    head.pack(fill="x")
    options = (
        {"textvariable": title} if isinstance(title, tk.Variable) else {"text": title}
    )
    ttk.Label(head, style="Panel.TLabel", **options).pack(side="left")
    return frame, head


class Artwork:
    def __init__(self, assets):
        with Image.open(assets / "tools.png") as sheet:
            self.tools = [
                ImageTk.PhotoImage(sheet.crop((x, 0, x + 36, 36)))
                for x in range(0, sheet.width, 36)
            ]
        with Image.open(assets / "list-glyphs.png") as sheet:
            self.glyphs = [
                sheet.crop((x, 0, x + 20, 20)).convert("RGBA")
                for x in range(0, sheet.width, 20)
            ]
        glyph_for_kind = {"image": 2, "text": 3, "link": 5, "box": 6, "rule": 7}
        self.type_art = {kind: self.glyphs[i] for kind, i in glyph_for_kind.items()}
        self.type_icons = {
            kind: ImageTk.PhotoImage(img) for kind, img in self.type_art.items()
        }
        page = Image.new("RGBA", (30, 20))
        page.alpha_composite(self.glyphs[0], (3, 0))
        self.page = ImageTk.PhotoImage(page)
        with Image.open(assets / "retro-page-logo.png") as image:
            self.product = ImageTk.PhotoImage(image)
        with Image.open(assets / "roddy-wordmark.png") as image:
            image.thumbnail((76, 22), Image.Resampling.LANCZOS)
            self.roddy = ImageTk.PhotoImage(image)

        self.layer = lru_cache(maxsize=128)(self._layer)

    def _layer(self, kind, hidden, source):
        bit = self.type_art[kind]
        if kind == "image" and source:
            try:
                with Image.open(BytesIO(b64decode(source.split(",", 1)[1]))) as img:
                    img.thumbnail((23, 19), Image.Resampling.NEAREST)
                    bit = img.convert("RGBA")
            except (ValueError, OSError, IndexError):
                pass
        row = Image.new("RGBA", (54, 22))
        row.alpha_composite(self.glyphs[4 if hidden else 1], (2, 1))
        row.alpha_composite(bit, (27, (22 - bit.height) // 2))
        return ImageTk.PhotoImage(row)
