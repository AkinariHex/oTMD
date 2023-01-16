## v2.0.0

### App

- New UI.
- New settings file.
- New Login system.\n
  ![Login System](https://akinariosu.s-ul.eu/cB0twF37)
- New Design when the app is updating.\n
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
  The name of the image should be exactly the name of the team. (Ex. Team name: Vitun Vite / Image name: Vitun Vite.png)\n
  ![Folder Image](https://akinariosu.s-ul.eu/5bguE7xn)\n
  ![Teams Images](https://akinariosu.s-ul.eu/dZDnLS5a)

### Known bugs

- Sometimes at first start of OBS/SLOBS or while changing match, the browser source doesn't refresh automatically. Just refresh by yourself to fix it.
- Maximize window button doesn't work on Linux systems.
- Minimize to system tray doesn't work on Linux systems.
- Streamer mode doesn't work on Linux systems. (Make sure to not show your osu apikey on stream)
