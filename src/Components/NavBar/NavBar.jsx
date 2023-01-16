import React, { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import "./NavBar.css";
import {
  RecordCircle,
  Setting,
  Setting2,
  UserOctagon,
  DocumentText,
} from "iconsax-react";
const { ipcRenderer } = window.require("electron");

function NavBar() {
  const [account, setAccount] = useState({});
  const [ui, setUi] = useState("compact");
  const [appInfo, setAppInfo] = useState({});

  useEffect(() => {
    ipcRenderer.send("getNavBarData");
    ipcRenderer.on("navbarDataReturn", (event, arg) => {
      const { account, navbar, appInfo } = arg;
      setAccount(account);
      navbar ? setUi("compact") : setUi("");
      setAppInfo(appInfo);
    });
  }, []);

  return (
    <div className={`navbarContainer ${ui}`}>
      <div className="topRoutes">
        <NavLink
          to="/app/profile"
          className="item account"
          activeClassName="active"
          style={{
            backgroundImage: `linear-gradient(0deg, rgba(0,0,0,0.88), rgba(0,0,0,0.2)), url(http://s.ppy.sh/a/${account.userID})`,
          }}
        >
          <UserOctagon size="25" />
          <div className="name">{account.username}</div>
          <img
            src={`https://raw.githubusercontent.com/ppy/osu-resources/master/osu.Game.Resources/Textures/Flags/${account.country}.png`}
            alt={account.country}
            className="flag"
          />
          {/* <i className={`twa twa-2x twa-${'AD'} flag`}></i> */}
        </NavLink>
        <NavLink to="/app/match" className="item" activeClassName="active">
          <RecordCircle size="25" />
          <div className="text">Match</div>
        </NavLink>
        <NavLink to="/app/dsettings" className="item" activeClassName="active">
          <Setting size="25" />
          <div className="text">Displayer Settings</div>
        </NavLink>
        <NavLink
          to="/app/appsettings"
          className="item"
          activeClassName="active"
        >
          <Setting2 size="25" />
          <div className="text">App Settings</div>
        </NavLink>
      </div>
      <div className="bottomRoutes">
        <NavLink to="/app/changelog" className="item" activeClassName="active">
          <DocumentText size="25" />
          <div className="text">Changelog</div>
        </NavLink>
      </div>
      <div className="appInfo">
        <div className="version">v{appInfo.version}</div>
        <div className="copyright">- {appInfo.copyright}</div>
      </div>
    </div>
  );
}

export default NavBar;
