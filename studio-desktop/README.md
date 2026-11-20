# Retro Page 0.4.2

Arrange text, links, pictures, boxes and rules on a desktop canvas. Your local `.yst` file holds the editable page and its pictures. You can build, preview and export a page offline.

## Install on Debian or Ubuntu

From the folder containing the download, run the following command. Apt also installs Tk and Pillow.

```sh
sudo apt install ./Retro-Page-0.4.2-all.deb
```

Open **Retro Page** from the applications menu or run `retro-page`. Double-click a `.yst` project to reopen it. Projects saved by YesterSites Studio 0.1.0 also open in Retro Page.

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

1. Start with Late Night Signal, choose **File → New blank page**, or choose **File → New from template**. The 1995 Fan Club, 1999 Radio Shack, 2002 Personal Blog, and Dial-up BBS starters each include editable artwork and a linked second page. Save a new .yst file to keep your copy.
2. Open **GIFs** at the bottom of the Pages drawer, choose Retro Page, Mosaic icons or Web animations, and drag a stamp or choose Text, Image or Link in the toolbar and click the drawing board. Double-click text to write. Drag a selected object's handles to resize it. The inspector edits exact sizes and positions. **Edit object** opens the link and typography settings.
3. Open **Page → Page settings** to choose a page title, background and display profile. Save your editable copy with **File → Save**.
4. Press **F5** or **Preview** to open a local browser workbench. Choose the desktop layout, phone, authored canvas size, Classic at 640×480 or 800×600, text HTML, or an interactive BBS screen. The ordinary exported `index.html` switches to a readable phone layout at 600 CSS pixels and below. Choose **File → Export website ZIP** and extract the archive before browsing it. Classic and text editions work without CSS or JavaScript.
5. To put the page on YesterSites, set a site address in **Page settings**, choose whether to list it in the directory and click **Publish**. Your browser opens the publishing desk for sign-in and review. If it asks for a project, select your saved `.yst` file. Confirm publication in the browser.

**Objects → Web objects** includes an editable odometer, individual 88×31 buttons, a three-button wall, guestbook sign, webring strip, wallpaper and an animated divider. Double-click a button to set its destination. Select the odometer and edit **Counter digits** to set its offline display. Each button in a wall or webring can be edited separately.

Choose **BBS Preview → Options → Author this BBS screen** to place a welcome message, ASCII art, numbered menu entry, bulletin or file directory. The first BBS object gives that page a custom terminal screen. Arrange BBS objects top to bottom, select a destination for each menu entry, and test it at 32, 40 or 80 columns. Removing the last BBS object restores the automatically derived text screen.

Use the Pages drawer to switch pages. The **+** in its header adds another page. Choose an internal destination in the Link object's properties. Links survive page renames and work in both exported editions. **View → HTML Source** shows the generated markup, and BBS Preview accepts a link number or **H** for Home.

Each page supports up to 64 objects and imports GIF, JPEG, and PNG up to 96 KiB per image. Browser preview and export preserve embedded GIF animation. Publish the complete project from the publishing desk. Its version selector restores earlier publications at the same address. Select directory listing to join Grub. The terminal preview runs inside the editor.
