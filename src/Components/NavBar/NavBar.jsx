import React, { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import "./NavBar.css";
import {
  CircleDot,
  FileText,
  Monitor,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import * as api from "@/lib/api";

const ICON_SIZE = 25;
const ICON_STROKE = 1.5;

function NavBar() {
  const [account, setAccount] = useState({});
  const [ui, setUi] = useState("compact");
  const [appInfo, setAppInfo] = useState({});

  useEffect(() => {
    const apply = ({ account, navbar, appInfo }) => {
      setAccount(account);
      navbar ? setUi("compact") : setUi("");
      setAppInfo(appInfo);
    };
    const load = async () => {
      apply(await api.getNavBarData());
    };
    load();
    return api.onNavBarData(apply);
  }, []);

  return (
    <div className={`navbarContainer ${ui}`}>
      <div className="topRoutes">
        <NavLink
          to="/app/profile"
          className="item account"
          activeClassName="active"
          style={{
            backgroundImage: `linear-gradient(0deg, rgba(0,0,0,0.88), rgba(0,0,0,0.2)), url(https://a.ppy.sh/${account.userID})`,
          }}
        >
          <UserRound size={ICON_SIZE} strokeWidth={ICON_STROKE} />
          <div className="name">{account.username}</div>
          <img
            src={`https://raw.githubusercontent.com/ppy/osu-resources/master/osu.Game.Resources/Textures/Flags/${account.country}.png`}
            alt={account.country}
            className="flag"
          />
          {/* <i className={`twa twa-2x twa-${'AD'} flag`}></i> */}
        </NavLink>
        <NavLink to="/app/match" className="item" activeClassName="active">
          <CircleDot size={ICON_SIZE} strokeWidth={ICON_STROKE} />
          <div className="text">Match</div>
        </NavLink>
        <NavLink to="/app/dsettings" className="item" activeClassName="active">
          <Monitor size={ICON_SIZE} strokeWidth={ICON_STROKE} />
          <div className="text">Displayer Settings</div>
        </NavLink>
        <NavLink
          to="/app/appsettings"
          className="item"
          activeClassName="active"
        >
          <SlidersHorizontal size={ICON_SIZE} strokeWidth={ICON_STROKE} />
          <div className="text">App Settings</div>
        </NavLink>
      </div>
      <div className="bottomRoutes">
        <NavLink to="/app/changelog" className="item" activeClassName="active">
          <FileText size={ICON_SIZE} strokeWidth={ICON_STROKE} />
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
