# YesterSites Studio 0.1.0

Arrange text, links, pictures, boxes and rules on a desktop canvas. Your local `.yst` file holds the editable page and its pictures. You can build, preview and export a page offline.

## Install on Debian or Ubuntu

From the folder containing the download, run the following command. Apt also installs Tk and Pillow.

```sh
sudo apt install ./YesterSites-Studio-0.1.0-all.deb
```

Open **YesterSites Studio** from the applications menu or run `yestersites-studio`. Double-click a `.yst` project to reopen it.

## Run the source edition

Use Python 3.9 or newer with Tk 8.6. On Debian or Ubuntu, install `python3-tk` and `python3-venv`. On macOS or Windows, the standard Python installer from python.org includes Tk. Run these commands from the extracted folder on Linux or macOS.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python app.py
```

For the source edition on Windows, use the following commands.

```bat
py -3 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe app.py
```

Pass a project filename after `app.py` to open it directly.

## Make a homepage

1. Try the sample newspaper or choose **File → New blank page**.
2. Drag an object or stamp from the drawer onto the page. Double-click text to write. Drag a selected object's handles to resize it. **Object → Properties** edits its exact size and position.
3. Open **Page settings** to choose a page title, background and display profile. Save your editable copy with **File → Save**.
4. Use **Preview** to open a local browser view. **File → Export website ZIP** creates an archive containing `index.html`, `text.html` and the page's image files. Extract the ZIP before opening it. The text edition follows reading order and works without CSS or JavaScript.
5. To put the page on YesterSites, set a site address in **Page settings**, choose whether to list it in the directory and click **Publish**. Your browser opens the publishing desk for sign-in and review. If it asks for a project, select your saved `.yst` file. Confirm publication in the browser.

A page supports 64 objects, including up to three GIF, JPEG or PNG pictures of 96 KiB each. The editor preserves animated GIFs for the published page. Use the Text / BBS profile for a text-first web edition.
