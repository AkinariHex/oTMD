<img src="https://drive.google.com/uc?export=view&id=1UbuyzqezxvD1OzbuTuxYJ_u8qXvDJflM">

# o!TMD Project

osu! Tourney Match Displayer is a simple displayer made to be used as a browser source on OBS/SLOBS that displays the current state of a tournament match!

-   <b>[How to use o!TMD](https://github.com/AkinariHex/oTMD#how-to-use-otmd)</b>
    -   [Installation](https://github.com/AkinariHex/oTMD#installation)
    -   [Display on OBS](https://github.com/AkinariHex/oTMD#display-on-obs)
    -   [Close the displayer](https://github.com/AkinariHex/oTMD#close-the-displayer)

### Bugs and Code Format

The project is into his earlier stage and it's written not in the perfect way. We'll fix the problems and the code going on with the updates.

### Contributors

<table>
  <tr>
    <td align="center"><a href="https://github.com/AkinariHex"><img src="https://avatars.githubusercontent.com/u/28952344?v=3" width="100px;" alt=""/><br /><sub><b>Akinari</b>         </sub></a></td>
    <td align="center"><a href="https://github.com/xRLPGx"><img src="https://avatars.githubusercontent.com/u/33182302?v=3" width="100px;" alt=""/><br /><sub><b>xRLPGx</b>         </sub></a></td>
 </tr>
</table>

## How to use o!TMD

The current documentation is valid for the `v1.0` of o!TMD. Download the latest version [here](https://github.com/AkinariHex/oTMD/releases/latest)!<br>
**CURRENTLY WORKS ONLY WITH LOBBIES WITH TEAMVS**

### Installation

Extract the content of the `.zip` file into a folder. Should you have the same files into the folder:

 <img src="https://drive.google.com/uc?export=view&id=1TLudygIrCEcOS6xvVq5aXK0W_-PlhP6g">
 
 ### Display on OBS
 
 Open ``o!TMD.exe`` from your folder, it should open a console and a page into your browser to change the settings.
 At first run it will ask you to allow the ``.exe`` for the firewall, check only for private networks and accept.
 
 <img src="https://drive.google.com/uc?export=view&id=1Bc7aaPMk1_o-Bo9pgmlp3gT90CzfRFtW">
 
 After accepting the firewall, open your browser and you'll find the settings page, the ``.exe`` should have opened this page by himself. **You can always access to this page using this URL "http://localhost:3000"**

Change the fields:<br>

-   `api key`: put your apikey of osu! | **You can find and request the key at https://osu.ppy.sh/p/api**.
-   `match ID`: put the ID of the match you want to display. | **You can find the matchid at the end of an mp link https&#58;://osu.ppy.sh/community/matches/`69509292`**
-   `best of`: select the BO of the match.
-   `warmups`: put the number of warmups. In the most of cases it's 2.
-   `score reverse`: check it only if the first team of the lobby has the colour red.<br>**For example let's see this lobby: `5WC: (Spain B) vs (South Korea A)`, Spain B should be the blue team as blue teams are always the first team for the api. If a referee make this error you can fix it checking the box of score reverse.**

Click the `save new config file` button, it'll save your settings and automatically start to display your match opening a new tab with this URL "http://localhost:3000/visualizer".

 <img src="https://drive.google.com/uc?export=view&id=1v6XiISX_8WFTw2kbSwTZ2290jaZ26AHf">
 
 Now you can close your browser and open OBS/SLOBS, the displayer will always work until you close the console.<br>**Do not close the console is you want to display it on OBS**
 The example I made was made with Streamlabs OBS but it's the same thing for OBS.
 
 On OBS add a new ``source > browser source``, name it and put these settings:
 * Uncheck "Local File box"
 * ``URL``: ``http://localhost:3000/visualizer`` 
 * ``Width``: ``400`` 
 * ``Height``: ``80``
 * Check "Refresh browser when scene becomes active" box
 
 <img src="https://drive.google.com/uc?export=view&id=1BTEAz996uFtjzTXmIORPMMHJX6pOXOsV">
 <img src="https://drive.google.com/uc?export=view&id=1OQ4QJDhjjK7it-xvrUOFPnrxgbDVffa5">
 
 And you're done! Now you can display your match on your livestreams!
 
 ### Close the diplayer
 
 Close the console and you're done!
 
## Contacts

Feel free to contact us:

**Akinari**: [Twitter](https://twitter.com/Akinari_osu) | Akinari#3171 on Discord

**Relepega (aka RLPG)**: [Twitter](https://twitter.com/xRLPG) | RLPG#1608 on Discord

Copyright © 2020 o!TMD Akinari
