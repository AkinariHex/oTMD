## v3.0.0-beta.1

oTMD has been rewritten from the ground up. This is the first beta of 3.0, so things may still break here and there. If something feels off, let me know on GitHub.

### App

- The app now runs on Tauri instead of Electron. The download is a fraction of the old size and it uses far less memory.
- When you send it to the tray, the window is closed for real and the app drops to low priority. Only the overlay server keeps running, so OBS still gets live data while the rest of your PC stays free for osu!.
- You log in with your osu! account now, no more creating and pasting an osu! API key. The session renews itself in the background, so it will never log you out in the middle of a stream.
- A completely new look. You can choose between a sidebar or tabs at the top, whichever fits your screen better.
- Your display settings are saved to your profile on [otmd.app](https://otmd.app) and follow you to any PC you log in from.
- There is a portable version too. Unzip it anywhere and run it, everything it saves stays in a folder next to the exe.
- Updates are never forced on you. When a new version is out you get a small notice and an "Update" button in the sidebar, and you decide when to install it.
- This changelog is now part of the app, so it always matches the version you have installed and opens even without internet.
- New Legal page with licences and credits.

### Dashboard

- Your home page now shows your saved matches, your win rate, your Ranked Play tier with a chart of your last results, and your recent matches with the players you met the most, all in one place.

### Match

- Choose where the tournament name comes from: read it automatically from the lobby name (for example `OWC: (Team A) vs (Team B)`), pick it from the list of known tournaments, or write your own.
- Can't find your tournament in the list? Propose it straight from the app and a moderator will add it with the right mod multipliers.
- Mod multipliers have been updated, and live scores now show up on the overlay.

### Ranked

- A new live overlay for osu!lazer Ranked Play. It shows the match as it happens, with life points, rounds and how much rating you win or lose.
- Your Ranked Play tier, wins and losses and rating changes are on the Dashboard, next to your saved matches.

### Broadcast

- Made for people who stream other players' tournaments. Paste the MP links and follow up to 8 matches at once in a single overlay.

### Overlay

- The match overlay has a brand new design.
- The OBS URL is the same as before (**<http://localhost:21086/visualizer>**), so your existing scenes keep working. Maps, Ranked and Broadcast get their own pages next to it.
- Connect OBS once in Settings and you can add any overlay to a scene with one click, without touching OBS.
- If the app restarts, the overlay reconnects by itself. No need to refresh the browser source.

## v2.0.0

### App

- New UI.
- New settings file.
- New Login system.
  ![Login System](https://akinariosu.s-ul.eu/cB0twF37)
- New Design when the app is updating.
  ![Updating app](https://akinariosu.s-ul.eu/Wv3Z53E1)

### Account Tab

- Moved **Apikey** field from Match tab to Account tab.
- You can only edit the **Apikey** field.
- Streamer mode is enabled to hide your apikey when any OBS/SLOBS is open.

### Match Tab

- While selecting the **Qualifiers** stage the app will automatically set it as 1vs1 match. (still working on qualifiers match as teamVS)
- Now the **Score Reverse** only invert the names. (Ex. Akinari 2 - 5 kib | kib 2 - 5 Akinari)
- When **Save** button is clicked, the app automatically copies to clipboard the new URL.

### Displayer Settings Tab

- The displayer now uses a new URL to put into obs source. **URL: <http://localhost:21086/visualizer>**
- Changed design of displayer preview.
- Removed **Old Colors** field. (It was causing so much problems while setting up the match, so now the colors are [1st team: RED, 2nd team: BLUE)

### App Settings Tab

- Added **Export Matches** feature.
  This feature will allow you to export and save your matches on **osu! Tourney Match Displayer** website.

### Displayer

- Improved significantly the design of the displayer.
- Long names of players or teams now use a slide animation to show them correctly.
- Support for Teams images. You can put the images of teams into **teams** folder at: 'AppData/Roaming/otmd/teams'.
  The name of the image should be exactly the name of the team. (Ex. Team name: Vitun Vite / Image name: Vitun Vite.png)
  ![Folder Image](https://akinariosu.s-ul.eu/5bguE7xn)
  ![Teams Images](https://akinariosu.s-ul.eu/dZDnLS5a)

### Known bugs

- Sometimes at first start of OBS/SLOBS or while changing match, the browser source doesn't refresh automatically. Just refresh by yourself to fix it.
- Maximize window button doesn't work on Linux systems.
- Minimize to system tray doesn't work on Linux systems.
- Streamer mode doesn't work on Linux systems. (Make sure to not show your osu apikey on stream)
