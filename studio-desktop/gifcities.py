"""An inline GifCities results panel. Tk widgets are updated on the UI thread."""
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import json
from pathlib import Path
import re
from tkinter import ttk
from urllib.parse import urlencode
from urllib.request import urlopen

from PIL import Image, ImageTk

SEARCH = "https://gifcities.archive.org/api/v1/gifsearch?"
BLOBS = "https://blob.gifcities.org/gifcities/"
PAGE = 8
LIMIT = 96 * 1024


def read_url(url, limit):
    with urlopen(url, timeout=25) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError("File too large")
    return data


def find_matches(query):
    rows = json.loads(read_url(SEARCH + urlencode({"q": query}), 16 * 1024 * 1024))
    found = {}
    for row in rows:
        digest = row.get("checksum", "")
        if re.fullmatch("[A-Z2-7]{32}", digest):
            name = row.get("gif", "").rsplit("/", 1)[-1] or query
            found.setdefault(digest, name[:90])
    return list(found.items())


def thumbnail(folder, digest):
    data = read_url(BLOBS + digest + ".gif", 3 * 1024 * 1024)
    with Image.open(BytesIO(data)) as source:
        if source.format != "GIF" or max(source.size) > 4096 or source.width * source.height > 6000000:
            raise ValueError("Unsupported image size")
        preview = source.convert("RGBA")
        preview.thumbnail((60, 42), Image.Resampling.NEAREST)
    path = None
    if len(data) <= LIMIT:
        path = folder / (digest + ".gif")
        path.write_bytes(data)
    return preview, path


class GifPanel(ttk.Frame):
    def __init__(self, parent, studio):
        super().__init__(parent)
        self.studio = studio
        self.workers = ThreadPoolExecutor(max_workers=4)
        self.generation = 0
        self.pending = []
        self.folder = Path(studio.tmp.name) / "gifcities"
        self.folder.mkdir(exist_ok=True)
        self.rows = []
        self.photos = []
        self.columnconfigure((0, 1), weight=1, uniform="gif")
        self.bind("<Destroy>", self.shutdown)

    def shutdown(self, event):
        if event.widget == self:
            self.clear()
            self.workers.shutdown(wait=False, cancel_futures=True)

    def clear(self):
        self.generation += 1
        for future in self.pending:
            future.cancel()
        self.pending.clear()
        self.photos.clear()
        for child in self.winfo_children():
            child.destroy()

    def run(self, fn, receive, failed, *args):
        generation = self.generation
        future = self.workers.submit(fn, *args)
        self.pending.append(future)

        def poll():
            if generation != self.generation:
                return
            if not future.done():
                self.after(80, poll)
                return
            self.pending.remove(future)
            try:
                value = future.result()
            except (ValueError, OSError, TypeError, KeyError) as error:
                failed(error)
            else:
                receive(value)
        self.after(40, poll)

    def message(self, text):
        ttk.Label(self, text=text, wraplength=145).grid(columnspan=2, sticky="w")

    def search(self, query):
        self.clear()
        self.pack(fill="x")
        if not query.strip():
            self.message("Enter a word to search GifCities.")
            return
        self.message("Searching GifCities…")
        def ready(rows):
            self.rows = rows
            self.show_page(0)
        def failed(_error):
            self.clear()
            self.message("GifCities could not be reached. Search again to retry.")
        self.run(find_matches, ready, failed, query.strip()[:160])

    def show_page(self, offset):
        self.clear()
        if not self.rows:
            self.message("No GifCities matches. Try another word.")
            return
        nav = ttk.Frame(self)
        nav.grid(columnspan=2, sticky="ew")
        for text, target in [("‹", offset-PAGE), ("›", offset+PAGE)]:
            btn = ttk.Button(nav, text=text, width=2, command=lambda i=target: self.show_page(i))
            btn.pack(side="left" if target < offset else "right")
            if not 0 <= target < len(self.rows):
                btn.state(["disabled"])
        ttk.Label(nav, text=f"{offset+1}–{min(offset+PAGE,len(self.rows))} of {len(self.rows)}").pack()
        for i, (digest, name) in enumerate(self.rows[offset:offset+PAGE]):
            tile = ttk.Label(self, text=name, wraplength=72, anchor="center", compound="top",
                             style="Gallery.TLabel", relief="raised")
            tile.grid(row=1+i//2, column=i%2, sticky="nsew", padx=1, pady=2)
            def ready(result, tile=tile, name=name):
                preview, path = result
                photo = ImageTk.PhotoImage(preview)
                self.photos.append(photo)
                tile.configure(image=photo)
                if path:
                    self.studio.stamp_defaults[path] = {"label":name,"alt":name,"stamp_width":4096}
                    self.studio.palette(tile,"image",path)
                else:
                    tile.configure(text=name+" (over 96 KiB)")
            def failed(_error, tile=tile, name=name):
                tile.configure(text=name+" (unavailable)")
            self.run(thumbnail, ready, failed, self.folder, digest)
