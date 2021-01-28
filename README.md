<img src="https://akinariosu.s-ul.eu/2zvhZbVV">

# o!TMD Project

osu! Tourney Match Displayer is a simple displayer made to be used as a browser source on OBS/SLOBS that displays the current state of a tournament match!

-   <b>[How to use o!TMD](https://github.com/AkinariHex/oTMD#how-to-use-otmd)</b>
    -   [Installation](https://github.com/AkinariHex/oTMD#installation)
    -   [Display on OBS](https://github.com/AkinariHex/oTMD#display-on-obs)
    -   [Close the displayer](https://github.com/AkinariHex/oTMD#close-the-displayer)

### Bugs and Code Format

The project is currently into its early stage and is not written perfectly. We'll fix the problems and the code going forward through updates.

### Contributors

<table>
  <tr>
    <td align="center"><a href="https://github.com/AkinariHex"><img src="https://avatars.githubusercontent.com/u/28952344?v=3" width="100px;" alt=""/><br /><sub><b>Akinari</b>         </sub></a></td>
    <td align="center"><a href="https://github.com/Relepega"><img src="https://avatars.githubusercontent.com/u/33182302?v=3" width="100px;" alt=""/><br /><sub><b>Relepega</b>         </sub></a></td>
      <td align="center"><a href="https://github.com/nrabulinski"><img src="https://avatars.githubusercontent.com/u/24574288?v=3" width="100px;" alt=""/><br /><sub><b>nrabulinski</b></sub></a></td>
 </tr>
</table>

## How to use o!TMD

The current documentation is valid for the `v1.4` of o!TMD. Download the latest version [here](https://github.com/AkinariHex/oTMD/releases/latest)!<br>

### Installation

Extract the content of the `.zip` file into a folder.
 
 <img src="https://akinariosu.s-ul.eu/OjSZT1a0">
 
You should have the same files into the folder:
-   `Teams`: Put here the images of the teams! The images should have the same name of the teams but lowercases and without spaces! (Ex. Team name: `Alligator Space Jam` // Image name: `alligatorspacejam`)<br /><img src="https://akinariosu.s-ul.eu/lYl1RZLQ">
-   `otmd.exe`: Launcher of displayer.
-   `settings.json`: Settings file.
-   `updater.exe`: Updater that will update the displayer when a new release is available.
-   `version.txt`: Version file. **Do NOT delete** this file.
 
 ### Display on OBS
 
 Open ``otmd.exe`` from your folder, it should open a console and a page into your browser to change the settings.
 At first run it will ask you to allow the ``.exe`` for the firewall, check only for private networks and allow access.
 
 <img src="https://drive.google.com/uc?export=view&id=1npQ2EXYADfIzxlzXMnVn03ZiY8px17U1">
 
 After accepting the firewall, open your browser and you'll find the settings page, the ``.exe`` should have opened this page by itself. **You can always access this page using this URL "http://localhost:3000"**

Change the fields:<br>

-   `APIkey`: put your apikey of osu! | **You can find and request the key at https://osu.ppy.sh/p/api**.
-   `UserID`: put your userid | **Your userid will be used only if you want to display a 1vs1 match but it's required to have it always saved for next times. You can find your userid at the end of your profile link https&#58;//osu.ppy.sh/users/`4001304`**
-   `MatchID`: put the ID of the match you want to display. | **You can find the matchid at the end of an mp link https&#58;//osu.ppy.sh/community/matches/`69509292`**
-   `Match Type`: select the type of the match between **1vs1** and **TeamVS**
-   `Stage`: select the current stage of the tournament. | **Friendly is meant to be used if you want to display a match that isn't of a tournament**
-   `Best of`: select the BO of the match.
-   `Warmups`: put the number of warmups. In the most of cases it's 2.
-   `Score Reverse`: check it only if the first team of the lobby has the colour red.<br>**For example let's see this lobby: `5WC: (Indonesia A) vs (Italy A)`, Indonesia A should be the blue team as blue teams are always the first team for the api. If a referee make this, you can fix it checking the box of score reverse.**
    <img src="https://akinariosu.s-ul.eu/LU90Cq05">

Click the `Save` button, it'll save your settings and automatically start to display your match by opening a new tab with this URL "http://localhost:3000/visualizer".

 <img src="https://akinariosu.s-ul.eu/qxS7WTfd">
 
 Now you can close your browser and open OBS/SLOBS, the displayer will always work until you close the console.<br>**Do not close the console is you want to display it on OBS**<br>
 The example I made was made with Streamlabs OBS but it's the same thing for OBS.
 
 On OBS add a new ``source > browser source``, name it and put these settings:
 * Uncheck "Local File box"
 * ``URL``: ``http://localhost:3000/visualizer`` 
 * ``Width``: ``400`` 
 * ``Height``: ``130``
 * Check "Refresh browser when scene becomes active" box
 
 <img src="https://drive.google.com/uc?export=view&id=1BTEAz996uFtjzTXmIORPMMHJX6pOXOsV">
 <img src="https://drive.google.com/uc?export=view&id=1OQ4QJDhjjK7it-xvrUOFPnrxgbDVffa5">
 
 And you're done! Now you can display your match on your livestreams!
 
 ### Close the diplayer
 
 Close the console and you're done!
 
## Displayer styles

You can change the style of displayer to match it with your overlay or just to change it as you prefer.

Going to "http://localhost:3000" and clicking to "Settings" tab on top-left you'll see the "Visualizer Style" field.
<img src="https://akinariosu.s-ul.eu/NhGDMx2w">
You can choose from 4 different styles:
* `Default`: No rounded corners <img src="https://akinariosu.s-ul.eu/PMSB7638">
* `Rounded`: All 4 corners rounded  <img src="https://akinariosu.s-ul.eu/7j4nClSu">
* `Top-Rounded`: Top 2 corners rounded  <img src="https://akinariosu.s-ul.eu/6GWWbzZ4">
* `Bottom-Rounded`: Bottom 2 corners rounded    <img src="https://akinariosu.s-ul.eu/gU7hWChk">

Click the `Save` button and the style will be applied!

## Join the community

Join the official discord server to be always updated about new updates. You can also talk with other player and talk with the developers about any problem/suggestion/question you want!

[![OTMD Discord Server](https://discord.com/api/guilds/775868748158337064/widget.png?style=banner3)](https://discord.gg/gf7rWj942q)

## Contacts

Feel free to contact us:

**Akinari**: [Twitter](https://twitter.com/Akinari_osu) | Akinari#3171 on Discord

**Relepega (aka RLPG)**: [Twitter](https://twitter.com/xRLPG) | RLPG#1608 on Discord

## License

Check the license [here](https://github.com/AkinariHex/oTMD/blob/main/LICENSE)
