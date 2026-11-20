"""Retro Pages — native, offline-first desktop page compositor."""

import base64
from copy import deepcopy
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from uuid import uuid4
import webbrowser
import tkinter as tk
from tkinter import ttk, colorchooser, filedialog, messagebox
from PIL import Image, ImageTk
from layout_canvas import DesignCanvas
from project import (
    FONTS,
    export_zip,
    image_item,
    new_item,
    new_project,
    preview_folder,
    read_project,
    save_project,
    validate_project,
)

BASE = Path(__file__).resolve().parent
ASSETS = BASE / "assets"
NAME = "Retro Pages"
VERSION = "0.1.1"
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
    ("puddleplum.gif", "Puddleplum"),
    ("diskette.gif", "Dan"),
    ("toast.gif", "Bread Post"),
    ("rimshot.gif", "Rim shot"),
    ("phone.gif", "Telephone"),
    ("ring.gif", "Ring button"),
    ("neighborhood.jpg", "The neighborhood"),
]
PUBLISH = "https://yestersites.com/desktop/publish/"
PROJECT_TYPES = [("Retro Pages projects", "*.yst"), ("All files", "*")]


def make_sample():
    doc = new_project()
    doc.update(
        title="The Neighborhood Post", background="#ffefd4", width=640, height=480
    )

    def add(kind, x, y, w, h, **opts):
        o = new_item(kind, x, y, 640, 480)
        o.update(x=x, y=y, w=w, h=h, **opts)
        doc["items"].append(o)

    add("box", 22, 20, 596, 77, fill="#293846", color="#293846")
    add(
        "text",
        38,
        26,
        553,
        25,
        text="THE WEEKLY WEB GAZETTE",
        font_family="Courier",
        font_size=14,
        bold=True,
        color="#f5cc81",
    )
    add(
        "text",
        36,
        47,
        565,
        47,
        text="The Neighborhood Post",
        font_size=39,
        italic=True,
        bold=True,
        color="#fff4d3",
    )
    pic = image_item(ASSETS / "neighborhood.jpg", 24, 112, 640, 480)
    pic.update(x=24, y=112, w=393, h=197, text="Our five-stop web neighborhood")
    doc["items"].append(pic)
    add(
        "text",
        435,
        111,
        176,
        72,
        text="From the\nnight desk",
        font_size=26,
        bold=True,
        color="#7e3650",
    )
    add(
        "text",
        435,
        185,
        166,
        126,
        text="Someone left a light on at the observatory. Mabel says it counts as a second moon.",
        font_size=17,
        color="#332934",
    )
    add("rule", 25, 329, 585, 4, color="#80445d")
    add(
        "text",
        30,
        349,
        440,
        42,
        text="Notes from the ring keeper",
        font_size=25,
        bold=True,
        color="#293846",
    )
    add(
        "text",
        30,
        390,
        540,
        34,
        text="Open the stamp drawer and add something of your own.",
        font_size=17,
    )
    add(
        "link",
        30,
        432,
        310,
        29,
        text="Visit the neighborhood directory",
        href="https://yestersites.com/",
        color="#583076",
        font_size=17,
    )
    return doc


class Studio:
    def __init__(self, root, initial=None):
        self.root = root
        self.root.geometry("1100x745")
        self.root.minsize(760, 520)
        self.tmp = TemporaryDirectory(prefix="retro-pages-")
        self.path = None
        self.doc = make_sample()
        self.snapshots = [deepcopy(self.doc)]
        self.history_at = 0
        self.saved = deepcopy(self.doc)
        self.clip = None
        self.inline = None
        self.finish_edit = None
        self.thumbs = []
        self.status = tk.StringVar(
            value="Drag an object onto the page. Double-click text to type."
        )
        self.selection = tk.StringVar(value="No object selected")
        self.grid = tk.BooleanVar(value=False)
        self.snap = tk.BooleanVar(value=False)
        self.root.protocol("WM_DELETE_WINDOW", self.close)
        self._widgets()
        self._menus()
        self.draw()
        if initial:
            self.load(initial)

    def _widgets(self):
        style = ttk.Style(self.root)
        if "clam" in style.theme_names():
            style.theme_use("clam")
        style.configure("Desk.TButton", padding=(8, 5))
        tools = ttk.Frame(self.root, padding=(6, 4))
        tools.pack(fill="x")
        for label, fn in [
            ("New", self.new),
            ("Open…", self.open),
            ("Save", self.save),
            ("Undo", self.undo),
            ("Redo", self.redo),
            ("Preview", self.preview),
            ("Publish…", self.publish),
        ]:
            ttk.Button(tools, text=label, command=fn, style="Desk.TButton").pack(
                side="left", padx=1
            )
        ttk.Button(tools, text="Page settings…", command=self.settings).pack(
            side="right"
        )
        work = ttk.Panedwindow(self.root, orient="horizontal")
        work.pack(fill="both", expand=True)
        self.canvas = DesignCanvas(work, self.selected, self.commit, self.edit)
        work.add(self.canvas, weight=5)
        tray = ttk.Frame(work, padding=7, width=210)
        work.add(tray, weight=0)
        ttk.Label(tray, text="Object drawer", font=("TkDefaultFont", 12, "bold")).pack(
            anchor="w"
        )
        tabs = ttk.Notebook(tray)
        tabs.pack(fill="x", pady=(6, 10))
        basics = ttk.Frame(tabs, padding=5)
        gallery = ttk.Frame(tabs, padding=4)
        tabs.add(basics, text="Objects")
        tabs.add(gallery, text="Stamps")
        for kind, label in OBJECT_NAMES.items():
            w = ttk.Label(
                basics,
                text=label,
                relief="raised",
                anchor="w",
                padding=(10, 6),
                cursor="hand2",
            )
            w.pack(fill="x", pady=1)
            self.palette(w, kind)
        for i, (file, label) in enumerate(ART):
            with Image.open(ASSETS / file) as im:
                thumb = im.convert("RGBA")
                thumb.thumbnail((58, 35))
                img = ImageTk.PhotoImage(thumb)
            self.thumbs.append(img)
            w = ttk.Label(
                gallery,
                text=label,
                image=img,
                compound="top",
                anchor="center",
                relief="ridge",
                padding=2,
                cursor="hand2",
            )
            w.grid(row=i // 2, column=i % 2, sticky="nsew", padx=1, pady=1)
            self.palette(w, "image", ASSETS / file)
        ttk.Label(
            tray,
            textvariable=self.selection,
            wraplength=180,
            font=("TkDefaultFont", 9, "bold"),
        ).pack(anchor="w", pady=(3, 8))
        for lbl, fn in [
            ("Object properties…", self.properties),
            ("Bring to front", lambda: self.layer(1)),
            ("Send to back", lambda: self.layer(-1)),
            ("Duplicate", self.duplicate),
        ]:
            ttk.Button(tray, text=lbl, command=fn).pack(fill="x", pady=1)
        ttk.Checkbutton(
            tray,
            text="Show grid",
            variable=self.grid,
            command=lambda: self.canvas.set_grid(self.grid.get()),
        ).pack(anchor="w", pady=(9, 1))
        ttk.Checkbutton(
            tray,
            text="Snap to 8 px",
            variable=self.snap,
            command=lambda: self.canvas.set_snap(self.snap.get()),
        ).pack(anchor="w")
        ttk.Label(
            self.root, textvariable=self.status, relief="sunken", padding=(6, 3)
        ).pack(fill="x")
        try:
            self.icon = tk.PhotoImage(file=str(ASSETS / "icon.gif"))
            self.root.iconphoto(True, self.icon)
        except tk.TclError:
            pass

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
                ("Open project…", self.open, "Ctrl+O"),
                ("Open sample page", self.sample, ""),
                ("Save", self.save, "Ctrl+S"),
                ("Save as…", lambda: self.save(True), ""),
                ("", None, ""),
                ("Import picture…", lambda: self.arm("image"), ""),
                ("Export website ZIP…", self.export, ""),
                ("Preview in browser", self.preview, "F5"),
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
                ("Page settings…", self.settings, ""),
                ("Preview in browser", self.preview, "F5"),
            ],
        )
        menu(
            "View",
            [
                (str(int(z * 100)) + "%", lambda z=z: self.canvas.set_zoom(z), "")
                for z in [0.5, 0.75, 1, 1.5, 2]
            ],
        )
        menu("Help", [("About Retro Pages", self.about, "")])
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
            + OBJECT_NAMES[kind].lower()
            + ". Esc cancels."
        )
        self.canvas.set_placement(lambda x, y: self.insert(kind, x, y, path))

    def insert(self, kind, x, y, path=None):
        if kind == "image" and not path:
            path = filedialog.askopenfilename(
                parent=self.root, filetypes=[("Web images", "*.jpg *.jpeg *.gif *.png")]
            )
            if not path:
                return
        if len(self.doc["items"]) >= 64 or (
            kind == "image"
            and sum(it["kind"] == "image" for it in self.doc["items"]) >= 3
        ):
            return self.error("This page supports 64 objects and three pictures.")
        try:
            bounds = (int(x), int(y), self.doc["width"], self.doc["height"])
            obj = (
                image_item(path, *bounds)
                if kind == "image"
                else new_item(kind, *bounds)
            )
        except (ValueError, OSError) as e:
            return self.error(e)
        self.doc["items"].append(obj)
        self.draw(obj["id"])
        self.commit()
        if kind == "text":
            self.root.after_idle(lambda: self.edit(obj["id"]))

    def get(self, ident=None):
        ident = ident or self.canvas.selected
        return next((o for o in self.doc["items"] if o["id"] == ident), None)

    def selected(self, ident):
        item = self.get(ident) if ident else None
        self.selection.set(
            (
                f"{OBJECT_NAMES[item['kind']]}   {item['w']} × {item['h']} px\nPosition   {item['x']}, {item['y']}"
            )
            if item
            else "No object selected"
        )

    def draw(self, ident=None):
        self.canvas.set_scene(
            self.doc["items"],
            self.doc["width"],
            self.doc["height"],
            self.doc["background"],
            ident,
        )
        self.selected(ident)
        self.title()

    def title(self):
        mark = " *" if self.doc != self.saved else ""
        self.root.title(
            f"{self.path.name if self.path else self.doc['title']}{mark} — {NAME}"
        )

    def commit(self):
        if self.doc != self.snapshots[self.history_at]:
            self.snapshots = self.snapshots[: self.history_at + 1] + [
                deepcopy(self.doc)
            ]
            self.snapshots = self.snapshots[-60:]
            self.history_at = len(self.snapshots) - 1
        self.selected(self.canvas.selected)
        self.title()

    def undo(self):
        if self.finish_edit:
            self.finish_edit()
        if self.history_at:
            self.history_at -= 1
            self.doc = deepcopy(self.snapshots[self.history_at])
            self.draw(self.canvas.selected)

    def redo(self):
        if self.finish_edit:
            self.finish_edit()
        if self.history_at + 1 < len(self.snapshots):
            self.history_at += 1
            self.doc = deepcopy(self.snapshots[self.history_at])
            self.draw(self.canvas.selected)

    def reset(self, doc, path=None):
        self.doc = doc
        self.saved = deepcopy(doc)
        self.path = Path(path) if path else None
        self.snapshots = [deepcopy(doc)]
        self.history_at = 0
        self.draw()

    def error(self, msg):
        messagebox.showerror(NAME, str(msg), parent=self.root)

    def discard(self):
        if self.finish_edit:
            self.finish_edit()
        if self.doc == self.saved:
            return True
        ans = messagebox.askyesnocancel(
            NAME, "Save changes to the current project?", parent=self.root
        )
        return self.save() if ans else ans is False

    def new(self):
        if self.discard():
            self.reset(new_project())

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
            save_project(path, self.doc)
        except (ValueError, OSError) as e:
            self.error(e)
            return False
        self.path = Path(path)
        self.saved = deepcopy(self.doc)
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
            validate_project(candidate)
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
                    validate_project(candidate)
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
                ("text", "Alt text" if obj["kind"] == "image" else "Text", "long")
            )
        if obj["kind"] in ("link", "text", "image", "box"):
            fields.append(("href", "Link to", None))
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
            obj2 = {**obj, **data}
            validate_project(
                {
                    **self.doc,
                    "items": [obj2 if o is obj else o for o in self.doc["items"]],
                }
            )
            obj.update(data)
            self.draw(obj["id"])
            self.commit()

        self._form(OBJECT_NAMES[obj["kind"]] + " properties", fields, obj, apply)

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
            doc = validate_project({**self.doc, **data})
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

    def preview(self):
        if self.finish_edit:
            self.finish_edit()
        try:
            page = preview_folder(Path(self.tmp.name) / "preview", self.doc)
            webbrowser.open(page.resolve().as_uri())
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
                export_zip(name, self.doc)
                self.status.set("Exported graphical and text editions to " + name)
            except (ValueError, OSError) as e:
                self.error(e)

    def publish(self):
        if self.finish_edit:
            self.finish_edit()
        if not self.doc["slug"] and not self.settings():
            return
        try:
            d = validate_project(self.doc, publishing=True)
        except ValueError as e:
            return self.error(e)
        if not self.path or self.doc != self.saved:
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
        dest = PUBLISH + "#draft=" + encoded
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
    root = tk.Tk(className="RetroPages")
    Studio(root, sys.argv[1] if len(sys.argv) > 1 else None)
    root.mainloop()


if __name__ == "__main__":
    main()
