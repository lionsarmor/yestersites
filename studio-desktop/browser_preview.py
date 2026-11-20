"""Open a local browser workbench around a snapshot of the exported editions."""

import json
import shutil
from pathlib import Path
from tempfile import mkdtemp

from project import page_filename, preview_folder, terminal_lines


ASSETS = Path(__file__).resolve().parent / "assets"
TERMINAL_COLUMNS = (32, 40, 80)
TERMINAL_COLORS = {"Green": "#69ed45", "Amber": "#ffc05b", "White": "#f3f1e7"}
TERMINAL_HELP = (
    "TERMINAL HELP", "",
    "1, 2, ...  Open a numbered link.",
    "H          Go to Home.",
    "B          Go back.",
    "?          Show these commands.",
    "", "Press B to return to the page.",
)


def browser_workbench(directory, site, active_page, *, terminal=False, columns=32, color="Green"):
    # A second F5 must not overwrite images another open preview is reading.
    snapshot = Path(mkdtemp(prefix="preview-", dir=directory)).resolve()
    try:
        entry = preview_folder(snapshot / "site", site, active_page)
        pages = {}
        all_pages = {"home": site, **{p["page_id"]: p for p in site.get("pages", [])}}
        for key, page in all_pages.items():
            screens = {}
            for width in TERMINAL_COLUMNS:
                screens[width], links = terminal_lines(page, site, key, width)
            pages[key] = {
                "title": page["title"] or ("Home" if key == "home" else "Untitled"),
                "width": page["width"],
                "height": page["height"],
                "editions": {
                    edition: "site/" + page_filename(key, edition=edition)
                    for edition in ("modern", "phone", "classic", "text")
                },
                "terminal": {"screens": screens, "links": links},
            }
        mode = "text" if all_pages[active_page]["profile"] == "text" else "modern"
        settings = {
            "active": active_page,
            "site": site["title"] or "Untitled site",
            "mode": "bbs" if terminal else mode,
            "terminal": {
                "widths": TERMINAL_COLUMNS, "columns": columns,
                "colors": TERMINAL_COLORS, "color": color, "help": TERMINAL_HELP,
            },
            "pages": pages,
        }
        data = json.dumps(settings, ensure_ascii=True, separators=(",", ":")).replace("<", "\\u003c")
        template = (ASSETS / "browser-preview.html").read_text(encoding="utf-8")
        template = template.replace("@@ENTRY@@", "site/" + entry.name)
        shell = snapshot / entry.name
        shell.write_text(template.replace("@@PROJECT@@", data), encoding="utf-8")
        shutil.copyfile(ASSETS / "retro-page-logo.png", snapshot / "retro-page-logo.png")
        return shell
    except Exception:
        shutil.rmtree(snapshot, ignore_errors=True)
        raise
