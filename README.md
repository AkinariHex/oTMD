<img src="https://akinariosu.s-ul.eu/CKOXOZMi">

# osu! Tourney Match Displayer

osu! Tourney Match Displayer is a simple displayer made to be used as a browser source on OBS/SLOBS that displays the current state of a tournament match!

-   <b>[How to Install](https://github.com/AkinariHex/oTMD#how-to-install)</b>
    -   [Installer](https://github.com/AkinariHex/oTMD#installer)
    -   [Zip File](https://github.com/AkinariHex/oTMD#zip-file)
-   <b>[Change the fields](https://github.com/AkinariHex/oTMD#change-the-fields)</b>
    -   [Match Section](https://github.com/AkinariHex/oTMD#match-section)
    -   [Displayer Settings Section](https://github.com/AkinariHex/oTMD#displayer-settings-section)
    -   [Teams Section](https://github.com/AkinariHex/oTMD#teams-section)
    -   [App Settings Section](https://github.com/AkinariHex/oTMD#app-settings-section)
-   <b>[How to add a team](https://github.com/AkinariHex/oTMD#how-to-add-a-team)</b>
-   <b>[Display on OBS](https://github.com/AkinariHex/oTMD#display-on-obs)</b>
-   <b>[Join the community](https://github.com/AkinariHex/oTMD#join-the-community)</b>
-   <b>[Contacts](https://github.com/AkinariHex/oTMD#contacts)</b>
-   <b>[License](https://github.com/AkinariHex/oTMD#license)</b>

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

## How to Install

The current documentation is valid for the `v1.7.0` of o!TMD. Download the latest version [here](https://github.com/AkinariHex/oTMD/releases/latest)!<br>
With the latest update now you have two methods to install it, using the installer or just unzipping the `.zip` file.

### Installer

First of all you need to download the `otmd_v1.7.0_installer.exe` from the release page!<br>
Once downloaded, run the installer and continue installing it!

The installer runs with Administrator Privileges.<br>
If Microsoft Defender SmartScreen alert you, don't worry about it and click <b>Run anyway</b>.<br>
<b>(Make sure you have downloaded it from [GitHub releases](https://github.com/AkinariHex/oTMD/releases/latest) to avoid malicius softwares!).</b>

The default installation folder is `C:\Program Files\osu-tourney-match-displayer` but you can change it in the installer!

At first run it will ask you to allow the ``.exe`` for the firewall, check only for private networks and allow access.

### Zip File

First of all you need to download the `otmd_v1.7.0_x64.zip` from the release page!<br>
Once downloaded, extract the ``.zip`` file wherever you want and you're done!

Now you can open the folder and run `osu! Tourney Match Displayer.exe`!

## Change the fields

### Match section

-   `APIkey`: put your apikey of osu! | **You can find and request the key at https://osu.ppy.sh/p/api**.
-   `UserID`: put your userid | **Your userid will be used only if you want to display a 1vs1 match but it's required to have it always saved for next times. You can find your userid at the end of your profile link https&#58;//osu.ppy.sh/users/`4001304`**
-   `MatchID`: put the ID of the match you want to display. | **You can find the matchid at the end of an mp link https&#58;//osu.ppy.sh/community/matches/`69509292`**
-   `Match Type`: select the type of the match between **1vs1** and **TeamVS**
-   `Stage`: select the current stage of the tournament. | **Friendly is meant to be used if you want to display a match that isn't of a tournament**
-   `N. of maps`: put the number of maps of the Qualifiers Pool | **You'll see and use this field only if you select Qualifiers as Stage**
-   `Best of`: select the BO of the match.
-   `Warmups`: put the number of warmups. In the most of cases it's 2.
-   `Score Reverse`: check it only if the first team of the lobby has the colour red.<br>**For example let's see this lobby: `5WC: (Indonesia A) vs (Italy A)`, Indonesia A should be the blue team as blue teams are always the first team for the api. If a referee make this, you can fix it checking the box of score reverse.**
    <img src="https://akinariosu.s-ul.eu/LU90Cq05">

### Displayer Settings section

-   `APIkey`: put your apikey of osu! | **You can find and request the key at https://osu.ppy.sh/p/api**.
-   `UserID`: put your userid | **Your userid will be used only if you want to display a 1vs1 match but it's required to have it always saved for next times. You can find your userid at the end of your profile link https&#58;//osu.ppy.sh/users/`4001304`**
-   `Old Colors`: Enable the old colors that matches the old osu! stable colors (First team = blue / Second team = red)
-   `Small Displayer`: Enable the small displayer that have less height.
-   `Visualizer Style`: You can choose from 4 different styles:
    * `Default`: No rounded corners <img src="https://akinariosu.s-ul.eu/PMSB7638">
    * `Rounded`: All 4 corners rounded  <img src="https://akinariosu.s-ul.eu/7j4nClSu">
    * `Top-Rounded`: Top 2 corners rounded  <img src="https://akinariosu.s-ul.eu/6GWWbzZ4">
    * `Bottom-Rounded`: Bottom 2 corners rounded    <img src="https://akinariosu.s-ul.eu/gU7hWChk">
-   `Width`: shows the current width of the displayer | This value will be used in OBS
-   `Height`: shows the current height of the displayer | This value will be used in OBS

### Teams Section

-   `Add Team`: Open dialog to import `.otmdt` files
-   `Open Teams Folder`: Open Teams Directory

### App Settings section

-   `User Interface`: Enable compact UI
-   `System Tray`: Enable minimize to system tray

## How to add a team

### Using the .otmdt files

``.otmdt`` files are archive files that contain all the info about a team. These files are generated by the app.
Double clicking these files the app will automatically add the teams. You can see them by switching between teams section and another section to reload the teams list.
 
### Using the Add Team button

The ``Add Team`` button will open a dialog that will make you choose the ``.otmdt`` file to import.
The app will execute the import of the team and you can see the team switching between this section and another section to reload the teams list.

### Using the Open Teams Folder button

The ``Open Teams Folder`` button will open the Teams Directory where you can add your teams manually or add the image of the team to initialize the configuration of it.
Switch between the Teams section and another section to reload the teams list and start editing the team.

## Display on OBS
 
 On OBS add a new ``source > browser source``, name it and put these settings:
 * Uncheck "Local File box"
 * ``URL``: ``http://localhost:3000/visualizer`` (the app copy automatically the url when you save the settings so you can just paste it inside obs)
 * ``Width``: ``400`` 
 * ``Height``: ``130`` or ``80`` (if you're using the small displayer)
 * Check "Refresh browser when scene becomes active" box
 
 <img src="https://drive.google.com/uc?export=view&id=1BTEAz996uFtjzTXmIORPMMHJX6pOXOsV">
 <img src="https://akinariosu.s-ul.eu/m6JOryPe">
 
 And you're done! Now you can display your match on your livestreams!
 

## Join the community

Join the official discord server to be always updated about new updates. You can also talk with other player and talk with the developers about any problem/suggestion/question you want!

[![OTMD Discord Server](https://discord.com/api/guilds/775868748158337064/widget.png?style=banner3)](https://discord.gg/gf7rWj942q)

## Contacts

Feel free to contact us:

**Akinari**: [Twitter](https://twitter.com/Akinari_osu) | Akinari#3171 on Discord

**Relepega (aka RLPG)**: [Twitter](https://twitter.com/xRLPG) | RLPG#1608 on Discord

## License

Check the license [here](https://github.com/AkinariHex/oTMD/blob/main/LICENSE)
