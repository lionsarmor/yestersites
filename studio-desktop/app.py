"""Retro Page — native, offline-first desktop page compositor."""

import base64
from io import BytesIO
from copy import deepcopy
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from uuid import uuid4
import webbrowser
import tkinter as tk
from tkinter import ttk, colorchooser, filedialog, messagebox, simpledialog
from PIL import Image, ImageTk
from widgets import PRESETS, counter_source, place_widget, set_wallpaper
from classic_chrome import (
    Artwork,
    FACE,
    INK,
    LIGHT,
    MONITOR,
    PAPER,
    PHOSPHOR,
    WINE,
    configure_styles,
    panel,
)
from layout_canvas import DesignCanvas
from browser_preview import TERMINAL_COLORS, TERMINAL_COLUMNS, TERMINAL_HELP, browser_workbench
from project import (
    FONTS,
    MAX_PAGES,
    export_zip,
    image_item,
    new_item,
    new_project,
    read_project,
    save_project,
    terminal_lines,
    html_source,
    validate_project,
    validate_site,
)

BASE = Path(__file__).resolve().parent
ASSETS = BASE / "assets"
NAME = "Retro Page"
VERSION = "0.4.0"
PROFILE_NAMES = {
    "classic": "1990s graphical",
    "millennium": "Early 2000s",
    "text": "Text / BBS",
}
OBJECT_NAMES = {
    "text": "Text",
    "image": "Picture",
    "link": "Web link",
    "box": "Box",
    "rule": "Rule",
}
ART = [
    ("on-air.gif", "On air"),
    ("new.gif", "New!"),
    ("guestbook.gif", "Guestbook"),
    ("signal-tower.gif", "Radio tower"),
    ("puddleplum.gif", "Puddleplum"),
    ("diskette.gif", "Dan"),
    ("toast.gif", "Bread Post"),
    ("phone.gif", "Telephone"),
    ("ring.gif", "Ring button"),
]
PUBLISH = "https://yestersites.com/desktop/publish/"
PROJECT_TYPES = [("Retro Page projects", "*.yst"), ("All files", "*")]


def make_sample():
    from lettering import SIGNAL_FONT

    doc = new_project()
    doc.update(title="Late Night Signal", background="#090a30")
    log, links = (
        {
            **new_project(),
            "page_id": uuid4().hex,
            "title": title,
            "background": doc["background"],
        }
        for title in ("Station Log", "Links")
    )
    doc["pages"] = [log, links]

    def add(page, kind, x, y, w, h, **options):
        item = new_item(kind, x, y)
        item.update(x=x, y=y, w=w, h=h, **options)
        page["items"].append(item)
        return item

    sky = image_item(ASSETS / "signal-sky.gif", 0, 0, 640, 480)
    sky["text"] = ""
    for page in (doc, log, links):
        page["items"].append({**sky, "id": uuid4().hex})

    cream = "#ffeb90"

    def caption(page, x, y, w, h, text, size=18):
        return add(
            page,
            "text",
            x,
            y,
            w,
            h,
            text=text,
            font_family="Courier New",
            font_size=size,
            bold=True,
            color=cream,
        )

    def heading(page, x, y, w, h, text, size):
        return add(
            page,
            "text",
            x,
            y,
            w,
            h,
            text=text,
            font_family=SIGNAL_FONT,
            font_size=size,
            italic=True,
            bold=True,
            color="#ff891e",
            align="center",
        )

    def nav(page, x, y):
        caption(page, x + 63, y, 18, 30, "/", 19)
        caption(page, x + 228, y, 18, 30, "/", 19)
        for offset, width, label, dest in (
            (0, 55, "Home", "home"),
            (86, 137, "Station Log", log["page_id"]),
            (250, 66, "Links", links["page_id"]),
        ):
            add(
                page,
                "link",
                x + offset,
                y,
                width,
                32,
                text=label,
                href="page:" + dest,
                color=cream,
                font_family="Courier New",
                font_size=19,
                bold=True,
            )

    nav(doc, 34, 339)
    caption(
        doc,
        29,
        231,
        343,
        107,
        "A small corner of the web for\nradio, scanning, and late-night\nsignals. Logs, links, and notes\nfrom the shack.",
    )
    heading(doc, 70, 36, 517, 157, "LATE NIGHT\nSIGNAL", 58)
    tower = image_item(ASSETS / "signal-tower.gif", 384, 192, 640, 480)
    tower["text"] = "Radio tower at night"
    doc["items"].append(tower)

    heading(log, 29, 32, 580, 83, "STATION LOG", 48)
    caption(
        log,
        43,
        152,
        556,
        71,
        "01:18 AM  A distant station drifted in after the rain. A voice read the hours in three languages.",
    )
    caption(
        log,
        43,
        250,
        556,
        69,
        "02:07 AM  Swung the loop toward the ridge. Under the static: a piano and a train horn.",
    )
    nav(log, 43, 376)

    heading(links, 29, 32, 580, 83, "LINKS", 48)
    caption(
        links,
        43,
        154,
        554,
        67,
        "A few places to tune the dial when the shortwave bands go quiet.",
    )
    add(
        links,
        "link",
        43,
        241,
        470,
        32,
        text="YesterSites neighborhood",
        href="https://yestersites.com/",
        color=cream,
        font_family="Courier New",
        font_size=18,
        bold=True,
    )
    nav(links, 43, 376)
    return doc


class Studio:
    def __init__(self, root, initial=None):
        self.root = root
        self.root.geometry("1184x670")
        self.root.minsize(800, 570)
        self.tmp = TemporaryDirectory(prefix="retro-pages-")
        self.path = None
        self.site = make_sample()
        self.active_page = self.bbs_page = "home"
        self.bbs_history = []
        self.bbs_help = False
        self.bbs_columns = tk.IntVar(value=32)
        self.bbs_color = tk.StringVar(value="Green")
        self.snapshots = [(deepcopy(self.site), "home")]
        self.history_at = 0
        self.saved = deepcopy(self.site)
        self.clip = None
        self.inline = None
        self.finish_edit = None
        self.thumbs = []
        self.status = tk.StringVar(
            value="Drag an object onto the page. Double-click text to type."
        )
        self.grid = tk.BooleanVar(value=False)
        self.snap = tk.BooleanVar(value=False)
        self.root.protocol("WM_DELETE_WINDOW", self.close)
        self._widgets()
        self._menus()
        self.draw(
            next(
                obj["id"]
                for obj in self.doc["items"]
                if obj["text"] == "Radio tower at night"
            )
        )
        if initial:
            self.load(initial)

    def _widgets(self):
        configure_styles(self.root)
        self.art = Artwork(ASSETS)
        self.hidden_layers = {}
        self.layer_icons = {}
        self._toolbar()

        work = ttk.Panedwindow(self.root, orient="horizontal")
        work.pack(fill="both", expand=True, padx=4, pady=(5, 4))
        pages = ttk.Frame(work, width=175)
        center = ttk.Frame(work, relief="sunken", borderwidth=2)
        inspector = ttk.Frame(work, width=277)
        work.add(pages, weight=0)
        work.add(center, weight=1)
        work.add(inspector, weight=0)
        self._pages_drawer(pages)
        self._inspector(inspector)

        self.canvas = DesignCanvas(center, self.selected, self.commit, self.edit)
        self.canvas.pack(fill="both", expand=True)
        self.source_view = tk.Text(
            center,
            wrap="word",
            font=("Courier", -14),
            bg=LIGHT,
            fg=INK,
            padx=10,
            pady=9,
            state="disabled",
        )
        self.mode = tk.StringVar(value="design")

        status = ttk.Frame(self.root, relief="sunken", borderwidth=1, padding=(8, 2))
        status.pack(side="bottom", fill="x", before=work)
        self.page_status = tk.StringVar()
        ttk.Label(status, textvariable=self.page_status).pack(side="left")
        self._separator(status)
        ttk.Label(status, textvariable=self.status, anchor="w").pack(
            side="left", fill="x", expand=True
        )
        tk.Button(
            status,
            image=self.art.roddy,
            command=lambda: webbrowser.open("https://roddy.world/"),
            cursor="hand2",
            bg=FACE,
            activebackground=PAPER,
            relief="flat",
            overrelief="raised",
            highlightthickness=0,
            bd=1,
            padx=2,
            pady=0,
        ).pack(side="right")
        self.icon = tk.PhotoImage(file=str(ASSETS / "icon.png"))
        self.root.iconphoto(True, self.icon)

    @staticmethod
    def _separator(parent):
        tk.Frame(parent, width=2, bd=1, relief="sunken", bg=FACE).pack(
            side="left", fill="y", padx=6, pady=3
        )

    def _toolbar(self):
        strip = tk.Frame(self.root, background=FACE, relief="raised", bd=1)
        strip.pack(fill="x")
        actions = [
            (2, "Save", self.save),
            (3, "Undo", self.undo),
            (4, "Text", lambda: self.arm("text")),
            (5, "Image", lambda: self.arm("image")),
            (6, "Link", lambda: self.arm("link")),
            (7, "Preview", self.preview),
            (8, "Publish", self.publish),
        ]
        buttons = []
        for index, label, command in actions:
            if index in (3, 4, 7, 8):
                self._separator(strip)
            publish = label == "Publish"
            button = tk.Button(
                strip,
                image=self.art.tools[index],
                text=label,
                command=command,
                compound="left" if publish else "top",
                background=WINE if publish else FACE,
                fg="white" if publish else INK,
                activebackground="#9b263a" if publish else PAPER,
                activeforeground="white" if publish else INK,
                relief="raised" if publish else "flat",
                overrelief="raised",
                bd=2,
                highlightthickness=0,
                padx=10 if publish else 9,
                pady=1,
                font=("TkDefaultFont", 11, "bold"),
            )
            button.pack(side="left", padx=1, pady=5)
            if not publish:
                buttons.append(button)
        tk.Label(strip, image=self.art.product, background=FACE, borderwidth=0).pack(
            side="right", padx=12
        )

        def size_tools(event):
            padding = min(21, max(5, (event.width - 800) // 22 + 5))
            for button in buttons:
                button.configure(padx=padding)

        strip.bind("<Configure>", size_tools)

    def _pages_drawer(self, parent):
        self.drawer_title = tk.StringVar(value="Pages")
        frame, header = panel(parent, self.drawer_title)
        frame.pack(fill="both", expand=True)
        self.add_page_button = ttk.Button(
            header, text="+", width=2, padding=0, command=self.add_page
        )
        self.add_page_button.pack(side="right")
        switches = ttk.Frame(frame)
        switches.pack(side="bottom", fill="x")
        self.drawer = tk.StringVar(value="Pages")
        self.drawers = {}
        for label in ("Pages", "Objects", "GIFs"):
            tk.Radiobutton(
                switches,
                text=label,
                variable=self.drawer,
                value=label,
                indicatoron=False,
                bd=1,
                highlightthickness=0,
                bg=FACE,
                fg=INK,
                activebackground=LIGHT,
                selectcolor=LIGHT,
                relief="raised",
                padx=3,
                pady=3,
                command=self.show_drawer,
            ).pack(side="left", fill="x", expand=True)
            self.drawers[label] = ttk.Frame(frame, style="Paper.TFrame", padding=3)
        self.page_list = ttk.Treeview(
            self.drawers["Pages"],
            style="Side.Treeview",
            show="tree",
            height=6,
            selectmode="browse",
        )
        self.page_list.column("#0", width=152, minwidth=75)
        self.page_list.pack(fill="both", expand=True)
        self.page_list.bind("<<TreeviewSelect>>", self.choose_page)
        self.page_list.bind("<Double-Button-1>", lambda e: self.rename_page())
        basics = self.drawers["Objects"]
        self.object_group = tk.StringVar(value="Web objects")
        pick = ttk.Combobox(basics, textvariable=self.object_group, state="readonly",
                            values=("Web objects", "BBS objects", "Basic shapes"), width=14)
        pick.pack(fill="x", pady=(1, 4))
        choices = ttk.Frame(basics)
        choices.pack(fill="both", expand=True)
        self.object_icons = {}
        for key, preset in PRESETS.items():
            part = preset["parts"][0]
            uri = counter_source(part["text"]) if key == "counter" else part.get("src")
            if uri:
                with Image.open(BytesIO(base64.b64decode(uri.split(",", 1)[1]))) as source:
                    image = source.convert("RGBA")
                image.thumbnail((29, 18), Image.Resampling.NEAREST)
                self.object_icons[key] = ImageTk.PhotoImage(image)
        def populate(_event=None):
            for child in choices.winfo_children():
                child.destroy()
            group = self.object_group.get()
            entries = OBJECT_NAMES.items() if group == "Basic shapes" else (
                (key, spec["label"]) for key, spec in PRESETS.items()
                if key.startswith("bbs-") == (group == "BBS objects"))
            for key, label in entries:
                kind = PRESETS[key]["parts"][0]["kind"] if key in PRESETS else key
                button = ttk.Label(choices, text=label, image=self.object_icons.get(key, self.art.type_icons[kind]),
                                   compound="left", relief="raised", padding=(3, 3), cursor="hand2")
                button.pack(fill="x", pady=1)
                self.palette(button, key)
        self.refresh_objects = populate
        pick.bind("<<ComboboxSelected>>", populate)
        populate()
        gallery = self.drawers["GIFs"]
        self.stamp_packs = {"Retro Page": ART}
        self.stamp_defaults = {}
        catalog_path = ASSETS / "stamps" / "library.json"
        for collection in json.loads(catalog_path.read_text(encoding="utf-8")):
            self.stamp_packs[collection["name"]] = [
                (Path("stamps") / art["file"], art["label"]) for art in collection["assets"]
            ]
            for art in collection["assets"]:
                self.stamp_defaults[ASSETS / "stamps" / art["file"]] = art
        self.stamp_collection = tk.StringVar(value="Retro Page")
        packs = ttk.Combobox(gallery, textvariable=self.stamp_collection, state="readonly",
                             width=13, values=list(self.stamp_packs))
        packs.pack(fill="x", pady=(1, 4))
        packs.bind("<<ComboboxSelected>>", lambda _e: self.show_stamps(0))
        self.stamp_grid = ttk.Frame(gallery, style="Paper.TFrame")
        self.stamp_grid.pack(fill="x")
        for column in range(2):
            self.stamp_grid.columnconfigure(column, weight=1, uniform="stamps")
        self.stamp_pager = ttk.Frame(gallery, style="Paper.TFrame")
        self.stamp_page = 0
        self.stamp_back = ttk.Button(self.stamp_pager, text="‹", width=2,
                                     command=lambda: self.show_stamps(self.stamp_page - 1))
        self.stamp_back.pack(side="left")
        self.stamp_next = ttk.Button(self.stamp_pager, text="›", width=2,
                                     command=lambda: self.show_stamps(self.stamp_page + 1))
        self.stamp_next.pack(side="right")
        self.stamp_position = ttk.Label(self.stamp_pager, style="Paper.TLabel", anchor="center")
        self.stamp_position.pack(fill="x", expand=True)
        self.show_stamps(0)
        self.show_drawer()

    def show_stamps(self, page):
        stamps = self.stamp_packs[self.stamp_collection.get()]
        per_page = 10
        last_page = (len(stamps) - 1) // per_page
        self.stamp_page = max(0, min(page, last_page))
        for widget in self.stamp_grid.winfo_children():
            widget.destroy()
        self.thumbs.clear()
        start = self.stamp_page * per_page
        for index, (file, label) in enumerate(stamps[start:start + per_page]):
            with Image.open(ASSETS / file) as img:
                if getattr(img, "is_animated", False):
                    img.seek(img.n_frames // 2)
                thumb = img.convert("RGBA")
                thumb.thumbnail((56, 29), Image.Resampling.NEAREST)
                photo = ImageTk.PhotoImage(thumb)
            self.thumbs.append(photo)
            button = ttk.Label(self.stamp_grid, style="Gallery.TLabel", text=label, image=photo,
                               compound="top", anchor="center", relief="raised", padding=1,
                               wraplength=72, cursor="hand2")
            button.grid(row=index // 2, column=index % 2, sticky="nsew", padx=1, pady=2)
            self.palette(button, "image", ASSETS / file)
        if last_page:
            self.stamp_position.configure(text=f"{self.stamp_page + 1} / {last_page + 1}")
            self.stamp_back.state(["disabled" if self.stamp_page == 0 else "!disabled"])
            self.stamp_next.state(["disabled" if self.stamp_page == last_page else "!disabled"])
            self.stamp_pager.pack(fill="x", pady=(2, 0))
        else:
            self.stamp_pager.pack_forget()

    def show_drawer(self):
        choice = self.drawer.get()
        for frame in self.drawers.values():
            frame.pack_forget()
        self.drawer_title.set("GIF Stamps" if choice == "GIFs" else choice)
        if choice == "Pages":
            self.add_page_button.pack(side="right")
        else:
            self.add_page_button.pack_forget()
        self.drawers[choice].pack(fill="both", expand=True)

    def _inspector(self, parent):
        layers, _ = panel(parent, "Layers")
        layers.pack(fill="x")
        listing = ttk.Frame(layers, style="Paper.TFrame", padding=2)
        listing.pack(fill="x")
        self.layer_list = ttk.Treeview(
            listing, style="Side.Treeview", show="tree", height=4, selectmode="browse"
        )

        def fit_layers(event):
            rows = 2 if event.height < 465 else 4
            if int(self.layer_list["height"]) != rows:
                self.layer_list.configure(height=rows)

        parent.bind("<Configure>", fit_layers)
        self.layer_list.column("#0", width=245, minwidth=80)
        scroll = ttk.Scrollbar(listing, command=self.layer_list.yview)
        self.layer_list.configure(yscrollcommand=scroll.set)
        self.layer_list.pack(side="left", fill="x", expand=True)
        scroll.pack(side="right", fill="y")
        self.layer_list.bind("<<TreeviewSelect>>", self.choose_layer)
        self.layer_list.bind("<Button-1>", self.layer_press)
        self.layer_list.bind("<space>", self.toggle_focused_layer)
        self.layer_list.bind("<Double-Button-1>", self.layer_double_click)

        self.inspector_title = tk.StringVar(value="Properties")
        fields, _ = panel(parent, self.inspector_title)
        fields.pack(fill="x", pady=5)
        prop = ttk.Frame(fields, style="Paper.TFrame", padding=(8, 5))
        prop.pack(fill="x")
        self.fields = {key: tk.StringVar() for key in ("x", "y", "w", "h", "text")}
        self.field_controls = {}
        for row, label in enumerate(("Position (X, Y)", "Size (W, H)")):
            ttk.Label(prop, text=label, style="Paper.TLabel").grid(
                row=row, column=0, sticky="w"
            )
        for i, key in enumerate(("x", "y", "w", "h")):
            control = ttk.Spinbox(
                prop,
                from_=0 if i < 2 else 1,
                to=8192,
                width=5,
                textvariable=self.fields[key],
                command=self.apply_inspector,
            )
            self.field_controls[key] = control
            control.grid(row=i // 2, column=1 + i % 2, padx=(4, 0), pady=2, sticky="ew")
        prop.columnconfigure(1, weight=1)
        prop.columnconfigure(2, weight=1)
        self.text_label = ttk.Label(prop, text="Text", style="Paper.TLabel")
        self.text_label.grid(row=2, column=0, columnspan=3, sticky="w", pady=(4, 1))
        self.field_controls["text"] = ttk.Entry(
            prop, textvariable=self.fields["text"], width=20
        )
        self.field_controls["text"].grid(row=3, column=0, columnspan=3, sticky="ew")
        for control in self.field_controls.values():
            control.bind("<Return>", lambda e: self.apply_inspector())
        buttons = ttk.Frame(prop, style="Paper.TFrame")
        buttons.grid(row=4, column=0, columnspan=3, sticky="e", pady=(5, 0))
        self.apply_button = ttk.Button(
            buttons, text="Apply", width=5, padding=(2, 1), command=self.apply_inspector
        )
        self.apply_button.pack(side="left", padx=3)
        ttk.Button(
            buttons, text="Edit object…", padding=(3, 1), command=self.properties
        ).pack(side="left")

        self.bbs_title = tk.StringVar()
        bbs, header = panel(parent, self.bbs_title)
        options = ttk.Menubutton(header, text="Options", takefocus=True, padding=(3, 0))
        options.pack(side="right")
        menu = tk.Menu(options, tearoff=False)
        options.configure(menu=menu)
        for title, choices, variable in (
            ("Columns", TERMINAL_COLUMNS, self.bbs_columns),
            ("Phosphor", TERMINAL_COLORS, self.bbs_color),
        ):
            submenu = tk.Menu(menu, tearoff=False)
            menu.add_cascade(label=title, menu=submenu)
            for value in choices:
                submenu.add_radiobutton(label=str(value), value=value, variable=variable, command=self.refresh_terminal)
        menu.add_separator()
        def author_screen():
            self.object_group.set("BBS objects")
            self.refresh_objects()
            self.drawer.set("Objects")
            self.show_drawer()
            self.status.set("Place BBS objects in reading order. These objects define the terminal screen for this page.")
        menu.add_command(label="Author this BBS screen…", command=author_screen)
        menu.add_command(label="Expand in browser…", command=lambda: self.preview(terminal=True))
        menu.add_command(label="Back    B", command=lambda: self.bbs_command(command="b"))
        menu.add_command(label="Help    ?", command=lambda: self.bbs_command(command="?"))
        bbs.pack(fill="both", expand=True)
        terminal = tk.Frame(bbs, background=MONITOR, relief="sunken", borderwidth=2)
        terminal.pack(fill="both", expand=True, padx=4, pady=4)
        terminal_font = (
            "Consolas" if sys.platform == "win32" else "DejaVu Sans Mono",
            -14,
        )
        self.bbs_text = tk.Text(
            terminal,
            width=32,
            height=3,
            wrap="none",
            padx=6,
            pady=6,
            bg=MONITOR,
            fg=PHOSPHOR,
            font=terminal_font,
            relief="flat",
            highlightthickness=0,
            state="disabled",
        )
        self.bbs_text.pack(fill="both", expand=True)
        prompt = tk.Frame(terminal, background=MONITOR)
        prompt.pack(side="bottom", fill="x", padx=6, pady=(0, 5), before=self.bbs_text)
        self.bbs_prompt = tk.Label(
            prompt,
            text="Select >",
            bg=MONITOR,
            fg=PHOSPHOR,
            font=terminal_font,
        )
        self.bbs_prompt.pack(side="left")
        self.bbs_input = tk.Entry(
            prompt,
            bg=MONITOR,
            fg=PHOSPHOR,
            insertbackground=PHOSPHOR,
            width=5,
            relief="flat",
            highlightthickness=0,
            font=terminal_font,
        )
        self.bbs_input.pack(side="left")
        self.bbs_input.bind("<Return>", self.bbs_command)
        self.bbs_enter = tk.Button(
            prompt,
            text="↵",
            command=self.bbs_command,
            bg=MONITOR,
            fg=PHOSPHOR,
            activebackground=MONITOR,
            activeforeground="white",
            relief="flat",
            highlightthickness=0,
            bd=0,
            padx=4,
            pady=0,
        )
        self.bbs_enter.pack(side="right")
        scroll = ttk.Scrollbar(terminal, orient="horizontal", command=self.bbs_text.xview)

        def scroll_range(first, last):
            scroll.set(first, last)
            if float(first) > 0 or float(last) < 1:
                if not scroll.winfo_manager():
                    scroll.pack(side="bottom", fill="x", before=self.bbs_text)
            elif scroll.winfo_manager():
                scroll.pack_forget()

        self.bbs_text.configure(xscrollcommand=scroll_range)

    def _menus(self):
        bar = tk.Menu(self.root)

        def menu(name, entries):
            m = tk.Menu(bar, tearoff=False)
            for label, fn, key in entries:
                if not label:
                    m.add_separator()
                    continue
                m.add_command(label=label, command=fn, accelerator=key)
            bar.add_cascade(label=name, menu=m)

        menu(
            "File",
            [
                ("New blank page", self.new, "Ctrl+N"),
                ("New from template…", self.new_from_template, ""),
                ("Open project…", self.open, "Ctrl+O"),
                ("Open sample page", self.sample, ""),
                ("Save", self.save, "Ctrl+S"),
                ("Save as…", lambda: self.save(True), ""),
                ("", None, ""),
                ("Import picture…", lambda: self.arm("image"), ""),
                ("Export website ZIP…", self.export, ""),
                ("Browser preview…", self.preview, "F5"),
                ("Publish to YesterSites…", self.publish, ""),
                ("Close", self.close, ""),
            ],
        )
        menu(
            "Edit",
            [
                ("Undo", self.undo, "Ctrl+Z"),
                ("Redo", self.redo, "Ctrl+Y"),
                ("Copy object", self.copy, "Ctrl+C"),
                ("Paste object", self.paste, "Ctrl+V"),
                ("Duplicate object", self.duplicate, "Ctrl+D"),
                ("Delete object", self.delete, "Delete"),
            ],
        )
        menu(
            "Object",
            [(v, lambda k=k: self.arm(k), "") for k, v in OBJECT_NAMES.items()]
            + [
                ("", None, ""),
                ("Properties…", self.properties, ""),
                ("Bring to front", lambda: self.layer(1), ""),
                ("Send to back", lambda: self.layer(-1), ""),
            ],
        )
        menu(
            "Page",
            [
                ("Add page…", self.add_page, ""),
                ("Rename page…", self.rename_page, ""),
                ("Duplicate page", self.duplicate_page, ""),
                ("Delete page…", self.delete_page, ""),
                ("Page settings…", self.settings, ""),
                ("Browser preview…", self.preview, "F5"),
            ],
        )
        view = tk.Menu(bar, tearoff=False)
        bar.add_cascade(label="View", menu=view)
        for label, value in [("Design", "design"), ("HTML Source", "source")]:
            view.add_radiobutton(
                label=label,
                variable=self.mode,
                value=value,
                command=lambda v=value: self.switch_view(v),
            )
        view.add_separator()
        view.add_checkbutton(
            label="Show grid",
            variable=self.grid,
            command=lambda: self.canvas.set_grid(self.grid.get()),
        )
        view.add_checkbutton(
            label="Snap to 8 px",
            variable=self.snap,
            command=lambda: self.canvas.set_snap(self.snap.get()),
        )
        view.add_separator()
        for scale in (0.5, 0.75, 1, 1.5, 2):
            view.add_command(
                label=f"{scale:.0%}", command=lambda z=scale: self.zoom_to(z)
            )
        menu("Help", [("About Retro Page", self.about, "")])
        self.root.configure(menu=bar)
        for key, fn in [
            ("n", self.new),
            ("o", self.open),
            ("s", self.save),
            ("z", self.undo),
            ("y", self.redo),
            ("d", self.duplicate),
            ("c", self.copy),
            ("v", self.paste),
        ]:

            def shortcut(event, action=fn, letter=key):
                if self.root.focus_get().__class__ in (
                    tk.Text,
                    ttk.Entry,
                    ttk.Spinbox,
                    tk.Entry,
                    ttk.Combobox,
                ) and letter in ("c", "v", "z", "y"):
                    return
                action()
                return "break"

            self.root.bind("<Control-" + key + ">", shortcut)
        self.canvas.canvas.bind("<Delete>", lambda e: self.delete())
        self.root.bind("<F5>", lambda e: self.preview())

    def about(self):
        messagebox.showinfo(
            NAME,
            f"{NAME} {VERSION}\nBuild a homepage on your desktop and publish it to YesterSites.",
            parent=self.root,
        )

    def palette(self, widget, kind, path=None):
        def release(e):
            pt = self.canvas.point_at_screen(e.x_root, e.y_root)
            if pt:
                self.insert(kind, *pt, path=path)
            else:
                self.arm(kind, path)

        widget.bind(
            "<ButtonPress-1>",
            lambda e: self.status.set(
                "Drop on the page, or release here and click a position."
            ),
        )
        widget.bind("<ButtonRelease-1>", release)
        widget.bind("<Return>", lambda e: self.arm(kind, path))
        widget.configure(takefocus=True)

    def arm(self, kind, path=None):
        self.switch_view("design")
        if kind == "image" and not path:
            path = filedialog.askopenfilename(
                parent=self.root,
                title="Import picture",
                filetypes=[
                    ("Web images", "*.jpg *.jpeg *.gif *.png"),
                    ("All files", "*"),
                ],
            )
            if not path:
                return
        self.status.set(
            "Click on the page to place "
            + (PRESETS[kind]["label"] if kind in PRESETS else OBJECT_NAMES[kind]).lower()
            + ". Esc cancels."
        )
        self.canvas.set_placement(lambda x, y: self.insert(kind, x, y, path))

    def insert(self, kind, x, y, path=None):
        self.switch_view("design")
        if kind in PRESETS:
            available = next((ident for ident, _ in self.page_entries() if ident != self.active_page), "home")
            group = place_widget(kind, self.doc, x, y, new_item, available)
            items = list(self.doc["items"])
            if kind == "wallpaper":
                set_wallpaper(items, group[0])
            else:
                items.extend(group)
            if len(items) > 64:
                return self.error("This page supports up to 64 objects.")
            self.doc["items"] = items
            self.draw(group[0]["id"])
            self.commit()
            self.status.set("Placed " + PRESETS[kind]["label"] + ". Double-click to edit.")
            return
        if kind == "image" and not path:
            path = filedialog.askopenfilename(
                parent=self.root, filetypes=[("Web images", "*.jpg *.jpeg *.gif *.png")]
            )
            if not path:
                return
        if len(self.doc["items"]) >= 64:
            return self.error("This page supports up to 64 objects.")
        try:
            bounds = (int(x), int(y), self.doc["width"], self.doc["height"])
            obj = (
                image_item(path, *bounds)
                if kind == "image"
                else new_item(kind, *bounds)
            )
        except (ValueError, OSError) as e:
            return self.error(e)
        if kind == "image" and path and (stamp := self.stamp_defaults.get(Path(path))):
            obj["text"] = stamp.get("alt", stamp["label"])
            width = min(stamp.get("stamp_width", obj["w"]), obj["w"])
            obj["h"] = max(1, round(obj["h"] * width / obj["w"]))
            obj["w"] = width
            obj["x"] = max(0, min(int(x), self.doc["width"] - width))
            obj["y"] = max(0, min(int(y), self.doc["height"] - obj["h"]))
        self.doc["items"].append(obj)
        self.draw(obj["id"])
        self.commit()
        if kind == "text":
            self.root.after_idle(lambda: self.edit(obj["id"]))
        elif kind == "link":
            self.properties()

    def get(self, ident=None):
        ident = ident or self.canvas.selected
        return next((o for o in self.doc["items"] if o["id"] == ident), None)

    def page_entries(self):
        return [
            ("home", self.site),
            *((p["page_id"], p) for p in self.site.get("pages", [])),
        ]

    def page(self, ident):
        return next(page for page_id, page in self.page_entries() if page_id == ident)

    @property
    def doc(self):
        return self.page(self.active_page)

    @doc.setter
    def doc(self, value):
        target = self.doc
        pages = self.site.get("pages") if self.active_page == "home" else None
        ident = target.get("page_id")
        target.clear()
        target.update(value)
        if pages:
            target["pages"] = pages
        if ident:
            target["page_id"] = ident

    def switch_page(self, ident):
        if self.finish_edit:
            self.finish_edit()
        if ident == self.active_page:
            return
        self.active_page = self.bbs_page = ident
        self.bbs_history.clear()
        self.bbs_help = False
        self.canvas.set_placement(None)
        self.canvas.canvas.xview_moveto(0)
        self.canvas.canvas.yview_moveto(0)
        self.draw()

    def choose_page(self, event=None):
        selection = self.page_list.selection()
        if selection and selection[0] != self.active_page:
            self.switch_page(selection[0])

    def add_page(self):
        if len(self.page_entries()) >= MAX_PAGES:
            return self.error(f"A project can have up to {MAX_PAGES} pages.")
        title = simpledialog.askstring("Add page", "Page title", parent=self.root)
        if not title or not title.strip():
            return
        if self.finish_edit:
            self.finish_edit()
        page = new_project()
        page.update(
            page_id=uuid4().hex,
            title=title.strip()[:80],
            profile=self.site["profile"],
            background=self.doc["background"],
            width=self.doc["width"],
            height=self.doc["height"],
        )
        self.site.setdefault("pages", []).append(page)
        self.switch_page(page["page_id"])
        self.commit()

    def rename_page(self):
        if self.finish_edit:
            self.finish_edit()
        title = simpledialog.askstring(
            "Rename page",
            "Page title",
            initialvalue=self.doc["title"],
            parent=self.root,
        )
        if title and title.strip():
            self.doc["title"] = title.strip()[:80]
            self.draw(self.canvas.selected)
            self.commit()

    def duplicate_page(self):
        if len(self.page_entries()) >= MAX_PAGES:
            return self.error(f"A project can have up to {MAX_PAGES} pages.")
        if self.finish_edit:
            self.finish_edit()
        page = deepcopy(
            {key: value for key, value in self.doc.items() if key != "pages"}
        )
        page.update(page_id=uuid4().hex, title=(page["title"][:73] + " copy").strip())
        self.site.setdefault("pages", []).append(page)
        self.switch_page(page["page_id"])
        self.commit()

    def delete_page(self):
        if self.active_page == "home":
            return self.error("The homepage is required.")
        if self.finish_edit:
            self.finish_edit()
        ident = self.active_page
        references = [
            obj
            for page_id, page in self.page_entries()
            if page_id != ident
            for obj in page["items"]
            if obj["href"] == "page:" + ident
        ]
        title = self.doc["title"] or "Untitled"
        label = f"Delete “{title}”?"
        if references:
            label += f" This also clears {len(references)} incoming link(s)."
        if not messagebox.askyesno("Delete page", label, parent=self.root):
            return
        for obj in references:
            obj["href"] = ""
        self.site["pages"] = [
            page for page in self.site["pages"] if page["page_id"] != ident
        ]
        if not self.site["pages"]:
            del self.site["pages"]
        self.switch_page("home")
        self.commit()

    def choose_layer(self, event=None):
        selection = self.layer_list.selection()
        if selection and selection[0] != self.canvas.selected:
            if self.finish_edit:
                self.finish_edit()
            self.canvas.select(selection[0])

    def layer_press(self, event):
        tree = self.layer_list
        ident = tree.identify_row(event.y)
        if not ident or not tree.identify_element(event.x, event.y).endswith("image"):
            return
        if event.x - tree.bbox(ident)[0] < 24:
            self.toggle_layer(ident)
            return "break"

    def layer_double_click(self, event):
        if self.layer_press(event) != "break" and self.layer_list.identify_row(event.y):
            self.properties()
        return "break"

    def toggle_focused_layer(self, event):
        selection = self.layer_list.selection()
        if selection:
            self.toggle_layer(selection[0])
        return "break"

    def toggle_layer(self, ident):
        if self.finish_edit:
            self.finish_edit()
        hidden = self.hidden_layers.setdefault(self.active_page, set())
        if ident in hidden:
            hidden.remove(ident)
        else:
            hidden.add(ident)
        self.status.set("Layer visibility changed on the drawing board.")
        self.draw(ident)

    def switch_view(self, mode):
        self.mode.set(mode)
        if mode == "source":
            if self.finish_edit:
                self.finish_edit()
            self.refresh_source()
            self.canvas.pack_forget()
            self.source_view.pack(fill="both", expand=True)
        else:
            self.source_view.pack_forget()
            self.canvas.pack(fill="both", expand=True)

    def refresh_source(self):
        if self.mode.get() != "source":
            return
        source = html_source(self.site, self.active_page)
        self.source_view.configure(state="normal")
        self.source_view.delete("1.0", "end")
        self.source_view.insert("1.0", source)
        self.source_view.configure(state="disabled")

    def zoom_to(self, scale):
        self.canvas.set_zoom(scale)
        self.update_page_status()

    def update_page_status(self):
        label = "Home" if self.active_page == "home" else self.doc["title"]
        self.page_status.set(
            f"{label}    •    {self.doc['width']} × {self.doc['height']}    •    {self.canvas.zoom:.0%}"
        )

    def refresh_terminal(self):
        columns = self.bbs_columns.get()
        color = TERMINAL_COLORS[self.bbs_color.get()]
        self.bbs_title.set(f"BBS Preview · {columns} col")
        lines, self.bbs_links = terminal_lines(
            self.page(self.bbs_page), self.site, self.bbs_page, columns
        )
        self.bbs_text.configure(state="normal", fg=color)
        self.bbs_text.delete("1.0", "end")
        # Tk computes its scroll range from the visible lines. Blank terminal
        # cells keep all columns reachable even when the first few lines are short.
        screen = TERMINAL_HELP if self.bbs_help else lines
        self.bbs_text.insert("1.0", "\n".join(line.ljust(columns) for line in screen))
        self.bbs_text.configure(state="disabled")
        self.bbs_text.xview_moveto(0)
        self.bbs_prompt.configure(fg=color)
        self.bbs_enter.configure(fg=color)
        self.bbs_input.configure(fg=color, insertbackground=color)

    def bbs_command(self, event=None, *, command=None):
        command = (self.bbs_input.get() if command is None else command).strip().lower()
        self.bbs_input.delete(0, "end")
        if command in {"?", "help"}:
            self.bbs_help = True
        elif command in {"b", "back"}:
            if self.bbs_help:
                self.bbs_help = False
            elif self.bbs_history:
                self.bbs_page = self.bbs_history.pop()
            else:
                self.status.set("BBS preview is at the start of this visit.")
                return "break"
        elif command in {"h", "home"}:
            self._bbs_visit("home")
        elif (
            command.isascii()
            and command.isdecimal()
            and len(command) < 4
            and 1 <= int(command) <= len(self.bbs_links)
        ):
            self._bbs_visit(self.bbs_links[int(command) - 1])
        else:
            self.status.set("Enter a link number, H for Home, B for Back, or ? for Help.")
            return "break"
        self.refresh_terminal()
        self.bbs_text.yview_moveto(0)
        return "break"

    def _bbs_visit(self, destination):
        self.bbs_help = False
        if destination != self.bbs_page:
            self.bbs_history.append(self.bbs_page)
            self.bbs_page = destination

    def apply_inspector(self):
        obj = self.get()
        if not obj:
            return
        try:
            values = {key: int(self.fields[key].get()) for key in ("x", "y", "w", "h")}
            if obj["kind"] == "image":
                values["text"] = self.fields["text"].get()
            self.apply_object(obj, values)
        except ValueError as exc:
            self.error(exc)

    def apply_object(self, obj, values):
        if obj.get("widget") == "counter" and "text" in values:
            values = {**values, "src": counter_source(values["text"])}
        updated = {**obj, **values}
        validate_project(
            {
                **self.doc,
                "items": [updated if o is obj else o for o in self.doc["items"]],
            },
            internal=True,
        )
        obj.update(values)
        self.draw(obj["id"])
        self.commit()

    def selected(self, ident):
        item = self.get(ident) if ident else None
        self.inspector_title.set(
            f"{('Image' if item['kind'] == 'image' else OBJECT_NAMES[item['kind']])} Properties"
            if item
            else "Properties"
        )
        self.text_label.configure(
            text="Counter digits" if item and item.get("widget") == "counter" else "Alt text" if item and item["kind"] == "image" else "Text"
        )
        self.apply_button.state(["!disabled" if item else "disabled"])
        for key, value in self.fields.items():
            value.set(str(item[key]) if item else "")
            editable = item and (key != "text" or item["kind"] == "image")
            self.field_controls[key].state(["!disabled" if editable else "disabled"])
        if ident and self.layer_list.exists(ident):
            if self.layer_list.selection() != (ident,):
                self.layer_list.selection_set(ident)
            self.layer_list.see(ident)
        elif self.layer_list.selection():
            self.layer_list.selection_remove(*self.layer_list.selection())

    def draw(self, ident=None):
        self.canvas.hidden = self.hidden_layers.get(self.active_page, set())
        self.canvas.set_scene(
            self.doc["items"],
            self.doc["width"],
            self.doc["height"],
            self.doc["background"],
            ident,
        )
        self.page_list.delete(*self.page_list.get_children())
        for page_id, page in self.page_entries():
            self.page_list.insert(
                "",
                "end",
                iid=page_id,
                image=self.art.page,
                text="Home" if page_id == "home" else page["title"] or "Untitled",
            )
        self.page_list.selection_set(self.active_page)
        self.page_list.see(self.active_page)
        self.layer_list.delete(*self.layer_list.get_children())
        self.layer_icons.clear()
        for obj in reversed(self.doc["items"]):
            key = obj["id"]
            label = " ".join(obj["text"].split())
            kind = "Image" if obj["kind"] == "image" else OBJECT_NAMES[obj["kind"]]
            icon = self.art.layer(
                obj["kind"], key in self.canvas.hidden, obj.get("src", "")
            )
            self.layer_icons[key] = icon
            self.layer_list.insert(
                "",
                "end",
                iid=key,
                image=icon,
                text=f"{kind}: {label}" if label else kind,
            )
        self.selected(self.canvas.selected)
        self.update_page_status()
        self.refresh_source()
        self.refresh_terminal()
        self.title()

    def title(self):
        mark = " *" if self.site != self.saved else ""
        self.root.title(
            f"{NAME} — {self.path.name if self.path else self.site['title']}{mark}"
        )

    def commit(self):
        if self.site != self.snapshots[self.history_at][0]:
            self.snapshots = self.snapshots[: self.history_at + 1] + [
                (deepcopy(self.site), self.active_page)
            ]
            self.snapshots = self.snapshots[-60:]
            self.history_at = len(self.snapshots) - 1
        self.selected(self.canvas.selected)
        self.refresh_source()
        self.refresh_terminal()
        self.title()

    def restore_history(self, step):
        if self.finish_edit:
            self.finish_edit()
        next_index = self.history_at + step
        if 0 <= next_index < len(self.snapshots):
            self.history_at = next_index
            self.site, self.active_page = deepcopy(self.snapshots[next_index])
            self.bbs_page = self.active_page
            self.bbs_history.clear()
            self.bbs_help = False
            self.draw(self.canvas.selected)

    def undo(self):
        self.restore_history(-1)

    def redo(self):
        self.restore_history(1)

    def reset(self, doc, path=None):
        self.hidden_layers.clear()
        self.site = doc
        self.active_page = self.bbs_page = "home"
        self.bbs_history.clear()
        self.bbs_help = False
        self.saved = deepcopy(doc)
        self.path = Path(path) if path else None
        self.snapshots = [(deepcopy(doc), "home")]
        self.history_at = 0
        self.draw()

    def error(self, msg):
        messagebox.showerror(NAME, str(msg), parent=self.root)

    def discard(self):
        if self.finish_edit:
            self.finish_edit()
        if self.site == self.saved:
            return True
        ans = messagebox.askyesnocancel(
            NAME, "Save changes to the current project?", parent=self.root
        )
        return self.save() if ans else ans is False

    def new(self):
        if self.discard():
            self.reset(new_project())

    def new_from_template(self):
        choices = {path.stem: path for path in sorted((ASSETS / "templates").glob("*.yst"))}
        if not choices:
            return self.error("The starter templates could not be found.")

        def create(values):
            starter = read_project(choices[values["template"]])
            if self.discard():
                self.reset(starter)
                self.status.set("Created a new project from " + values["template"] + ".")

        self._form("New from template", [("template", "Starter site", tuple(choices))],
                   {"template": next(iter(choices))}, create)

    def sample(self):
        if self.discard():
            self.reset(make_sample())

    def load(self, path):
        try:
            self.reset(read_project(path), path)
        except (ValueError, OSError) as e:
            self.error(e)

    def open(self):
        if not self.discard():
            return
        path = filedialog.askopenfilename(parent=self.root, filetypes=PROJECT_TYPES)
        if path:
            self.load(path)

    def save(self, ask=False):
        if self.finish_edit:
            self.finish_edit()
        path = self.path if not ask else None
        if not path:
            path = filedialog.asksaveasfilename(
                parent=self.root, defaultextension=".yst", filetypes=PROJECT_TYPES
            )
        if not path:
            return False
        try:
            save_project(path, self.site)
        except (ValueError, OSError) as e:
            self.error(e)
            return False
        self.path = Path(path)
        self.saved = deepcopy(self.site)
        self.title()
        self.status.set("Saved " + str(self.path))
        return True

    def close(self):
        if self.discard():
            self.tmp.cleanup()
            self.root.destroy()

    def copy(self):
        if self.finish_edit:
            self.finish_edit()
        item = self.get()
        if item:
            self.clip = deepcopy(item)
            self.status.set("Object copied.")

    def paste(self):
        if self.finish_edit:
            self.finish_edit()
        if self.clip is None:
            return
        item = deepcopy(self.clip)
        item["id"] = uuid4().hex
        for pos, dim, axis in [("x", "w", "width"), ("y", "h", "height")]:
            item[dim] = min(item[dim], self.doc[axis])
            item[pos] = min(item[pos] + 10, self.doc[axis] - item[dim])
        candidate = {**self.doc, "items": self.doc["items"] + [item]}
        try:
            validate_project(candidate, internal=True)
        except ValueError as e:
            return self.error(e)
        self.doc["items"].append(item)
        self.draw(item["id"])
        self.commit()

    def duplicate(self):
        if self.finish_edit:
            self.finish_edit()
        if self.get():
            self.copy()
            self.paste()

    def delete(self):
        if self.finish_edit:
            self.finish_edit()
        obj = self.get()
        if obj:
            self.doc["items"].remove(obj)
            self.draw()
            self.commit()

    def layer(self, front):
        if self.finish_edit:
            self.finish_edit()
        obj = self.get()
        if obj:
            arr = self.doc["items"]
            arr.remove(obj)
            arr.insert(len(arr) if front > 0 else 0, obj)
            self.draw(obj["id"])
            self.commit()

    def edit(self, ident):
        obj = self.get(ident)
        if not obj:
            return
        if obj["kind"] not in ("text", "link"):
            return self.properties()
        if self.inline is not None:
            self.inline.focus_set()
            return
        cv = self.canvas.canvas
        x, y, _, _ = self.canvas._screen_rect(obj)
        x -= cv.canvasx(0)
        y -= cv.canvasy(0)
        t = tk.Text(
            cv,
            wrap="word",
            bd=2,
            relief="solid",
            font=(
                obj["font_family"],
                -max(8, round(obj["font_size"] * self.canvas.zoom)),
                " ".join(name for name in ("bold", "italic") if obj[name]),
            ),
            bg=obj["fill"] or self.doc["background"],
            fg=obj["color"],
            undo=True,
            highlightthickness=1,
        )
        self.inline = t
        t.insert("1.0", obj["text"])
        t.place(
            x=x,
            y=y,
            width=max(35, obj["w"] * self.canvas.zoom),
            height=max(27, obj["h"] * self.canvas.zoom),
        )

        def finish(event=None, cancel=False):
            if self.inline is not t:
                return
            value = t.get("1.0", "end-1c")
            self.inline = None
            self.finish_edit = None
            t.destroy()
            if not cancel:
                candidate = deepcopy(self.doc)
                target = next(o for o in candidate["items"] if o["id"] == ident)
                target["text"] = value
                try:
                    validate_project(candidate, internal=True)
                except ValueError as exc:
                    self.error(exc)
                else:
                    obj["text"] = value
                    self.commit()
            self.draw(ident)
            return "break"

        self.finish_edit = finish
        t.bind("<Control-Return>", finish)
        t.bind("<Escape>", lambda e: finish(e, True))
        t.bind("<FocusOut>", finish)
        t.focus_set()
        t.tag_add("sel", "1.0", "end-1c")
        self.status.set("Type on the page. Ctrl+Enter applies your edit. Esc cancels.")

    def _form(self, title, fields, values, accept):
        dlg = tk.Toplevel(self.root)
        dlg.title(title)
        dlg.transient(self.root)
        dlg.resizable(False, False)
        outer = ttk.Frame(dlg, padding=14)
        outer.pack()
        vs = {}
        for i, (key, label, choices) in enumerate(fields):
            ttk.Label(outer, text=label).grid(
                row=i, column=0, sticky="nw", padx=(0, 10), pady=3
            )
            if choices == "bool":
                v = tk.BooleanVar(value=values[key])
                control = ttk.Checkbutton(outer, variable=v)
            elif choices == "long":
                control = tk.Text(outer, width=39, height=3, wrap="word")
                control.insert("1.0", values[key])
                v = control
            else:
                v = tk.StringVar(value=str(values.get(key, "")))
                control = (
                    ttk.Combobox(
                        outer,
                        textvariable=v,
                        values=list(choices),
                        state="readonly",
                        width=27,
                    )
                    if isinstance(choices, (tuple, list))
                    else ttk.Entry(outer, textvariable=v, width=32)
                )
            control.grid(row=i, column=1, sticky="ew", pady=2)
            vs[key] = v
            if choices == "color":

                def pick(variable=v):
                    color = colorchooser.askcolor(
                        initialcolor=variable.get() or "#ffffff", parent=dlg
                    )[1]
                    if color:
                        variable.set(color)

                ttk.Button(outer, text="Choose…", command=pick).grid(
                    row=i, column=2, padx=(5, 0)
                )

        def ok():
            data = {
                key: (v.get("1.0", "end-1c") if isinstance(v, tk.Text) else v.get())
                for key, v in vs.items()
            }
            try:
                accept(data)
            except (ValueError, OSError) as exc:
                messagebox.showerror(title, str(exc), parent=dlg)
                return
            dlg.destroy()

        buttons = ttk.Frame(outer)
        buttons.grid(row=len(fields), column=0, columnspan=3, sticky="e", pady=(12, 0))
        ttk.Button(buttons, text="Cancel", command=dlg.destroy).pack(
            side="left", padx=3
        )
        ttk.Button(buttons, text="Apply", command=ok).pack(side="left")
        dlg.bind("<Escape>", lambda e: dlg.destroy())
        dlg.grab_set()
        dlg.wait_window()

    def properties(self):
        if self.finish_edit:
            self.finish_edit()
        obj = self.get()
        if not obj:
            return
        fields = [
            ("x", "Left (px)", None),
            ("y", "Top (px)", None),
            ("w", "Width (px)", None),
            ("h", "Height (px)", None),
        ]
        if obj["kind"] in ("image", "text", "link"):
            fields.append(
                ("text", "Counter digits" if obj.get("widget") == "counter" else "Alt text" if obj["kind"] == "image" else "Text", "long")
            )
        if obj["kind"] in ("link", "text", "image", "box"):
            fields.append(("href", "Web address", None))
            targets = {
                f"{i + 1}. {('Home' if ident == 'home' else page['title'])}": ident
                for i, (ident, page) in enumerate(self.page_entries())
            }
            fields.append(("target", "Or link to page", ["", *targets]))
        if obj["kind"] in ("text", "link"):
            fields += [
                ("font_family", "Typeface", list(FONTS)),
                ("font_size", "Size (px)", None),
                ("bold", "Bold", "bool"),
                ("italic", "Italic", "bool"),
                ("align", "Alignment", ["left", "center", "right"]),
            ]
        fields += [("color", "Ink", "color"), ("fill", "Fill (blank = clear)", "color")]

        def apply(data):
            for k in ("x", "y", "w", "h", "font_size"):
                if k in data:
                    data[k] = int(data[k])
            target = data.pop("target", "")
            if target:
                data["href"] = "page:" + targets[target]
            self.apply_object(obj, data)

        values = dict(obj)
        if obj["href"].startswith("page:"):
            values["href"] = ""
            values["target"] = next(
                (name for name, ident in targets.items() if ident == obj["href"][5:]),
                "",
            )
        self._form(OBJECT_NAMES[obj["kind"]] + " properties", fields, values, apply)

    def settings(self):
        if self.finish_edit:
            self.finish_edit()
        fields = [
            ("title", "Page title", None),
            ("slug", "Site address", None),
            ("byline", "Webmaster", None),
            ("profile", "Page format", list(PROFILE_NAMES.values())),
            ("width", "Page width (px)", None),
            ("height", "Page height (px)", None),
            ("background", "Page color", "color"),
            ("listed", "List in Grub", "bool"),
        ]
        done = False

        def apply(data):
            nonlocal done
            for k in ("width", "height"):
                data[k] = int(data[k])
            data["profile"] = next(
                k for k, n in PROFILE_NAMES.items() if n == data["profile"]
            )
            doc = validate_project({**self.doc, **data}, internal=True)
            self.doc = doc
            self.draw()
            self.commit()
            done = True

        self._form(
            "Page and publishing settings",
            fields,
            {**self.doc, "profile": PROFILE_NAMES[self.doc["profile"]]},
            apply,
        )
        return done

    def preview(self, *, terminal=False):
        if self.finish_edit:
            self.finish_edit()
        try:
            page = browser_workbench(
                self.tmp.name, self.site, self.bbs_page if terminal else self.active_page,
                terminal=terminal, columns=self.bbs_columns.get(), color=self.bbs_color.get(),
            )
            if webbrowser.open(page.as_uri()):
                self.status.set("Opened browser preview. Choose a display in the preview toolbar.")
            else:
                self.error(f"Open this preview in your browser:\n{page}")
        except (ValueError, OSError) as exc:
            self.error(exc)

    def export(self):
        if self.finish_edit:
            self.finish_edit()
        name = filedialog.asksaveasfilename(
            parent=self.root,
            initialfile=(self.doc["slug"] or "homepage") + ".zip",
            defaultextension=".zip",
            filetypes=[("Website ZIP", "*.zip")],
        )
        if name:
            try:
                export_zip(name, self.site)
                self.status.set("Exported graphical and text editions to " + name)
            except (ValueError, OSError) as e:
                self.error(e)

    def publish(self):
        if self.finish_edit:
            self.finish_edit()
        if not self.site["slug"]:
            self.switch_page("home")
            if not self.settings():
                return
        try:
            d = validate_site(self.site)
        except ValueError as e:
            return self.error(e)
        if not self.path or self.site != self.saved:
            if not self.save():
                return
        # A short local bootstrap URL avoids command-line limits on Windows. Only
        # the client fragment contains the draft; browser approval performs the write.
        encoded = (
            base64.urlsafe_b64encode(
                json.dumps(d, separators=(",", ":"), ensure_ascii=False).encode()
            )
            .decode()
            .rstrip("=")
        )
        dest = PUBLISH + ("#draft=" + encoded if len(encoded) <= 1150000 else "")
        bridge = Path(self.tmp.name) / "publish.html"
        bridge.write_text(
            '<!doctype html><meta charset="utf-8"><title>Open YesterSites</title><p>Opening YesterSites publishing desk…</p><script>location.replace('
            + json.dumps(dest)
            + ")</script>",
            encoding="utf-8",
        )
        webbrowser.open(bridge.as_uri())
        self.status.set(
            "Review and confirm in your browser. If asked for a project, select "
            + self.path.name
            + "."
        )


def main():
    root = tk.Tk(className="RetroPage")
    Studio(root, sys.argv[1] if len(sys.argv) > 1 else None)
    root.mainloop()


if __name__ == "__main__":
    main()
