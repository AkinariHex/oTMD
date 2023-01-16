import React, { useEffect, useState } from "react";
import "./AppSettings.css";
import { Formik, Field, Form } from "formik";
const { ipcRenderer } = window.require("electron");

function AppSettings() {
  const [ui, setUi] = useState(false);
  const [systemTray, setSystemTray] = useState(false);
  const [exportMatchesStatus, setExportMatchesStatus] = useState(false);
  const [exportMatchesAPIkey, setExportMatchesAPIkey] = useState("");

  const [apiLoading, setApiLoading] = useState(false);
  const [validate, setValidate] = useState("");

  const saveSettings = (
    CompactUI,
    SystemTray,
    ExportMatchesStatus,
    ExportMatchesAPI
  ) => {
    const settings = {
      CompactUI,
      SystemTray,
      ExportMatches: { status: ExportMatchesStatus, apikey: ExportMatchesAPI },
    };
    ipcRenderer.send("saveAppSettings", settings);
  };

  const validateAPI = async (apikey) => {
    setApiLoading(true);
    let data = await fetch(`https://otmd.app/api/validate?api=${apikey}`).then(
      (res) => res.json()
    );
    setValidate(data.user ? true : false);
    setApiLoading(false);
  };

  useEffect(() => {
    ipcRenderer.send("getAppSettings");
    ipcRenderer.once("appSettingsReturn", (event, appSettings) => {
      setUi(appSettings.CompactUI);
      setSystemTray(appSettings.SystemTray);
      setExportMatchesStatus(appSettings.ExportMatches.status);
      setExportMatchesAPIkey(appSettings.ExportMatches.apikey);
      if (appSettings.ExportMatches.apikey !== "") {
        validateAPI(appSettings.ExportMatches.apikey);
      }
    });
  }, []);

  return (
    <div className="container">
      <Formik>
        <Form id="formAppSettings">
          <div className="item">
            <label className="nameField" htmlFor="compactUI">
              User Interface
            </label>
            <div className="clickable">
              <label className="switch">
                <Field
                  type="checkbox"
                  id="compactUI"
                  name="compactUI"
                  checked={ui}
                  onChange={(e) => {
                    setUi(e.target.checked);
                    saveSettings(
                      !ui,
                      systemTray,
                      exportMatchesStatus,
                      exportMatchesAPIkey
                    );
                  }}
                />
                <span className="slider round"></span>
              </label>
              <span>Enable compact UI</span>
            </div>
          </div>
          <div className="item">
            <label className="nameField" htmlFor="systemTray">
              System Tray
            </label>
            <div className="clickable">
              <label className="switch">
                <Field
                  type="checkbox"
                  id="systemTray"
                  name="systemTray"
                  checked={systemTray}
                  onChange={(e) => {
                    setSystemTray(e.target.checked);
                    saveSettings(
                      ui,
                      !systemTray,
                      exportMatchesStatus,
                      exportMatchesAPIkey
                    );
                  }}
                />
                <span className="slider round"></span>
              </label>
              <span>Enable minimize to system tray</span>
            </div>
          </div>
          <div className="item">
            <label className="nameField" htmlFor="systemTray">
              Export Matches
            </label>
            <div className="clickable">
              <label className="switch">
                <Field
                  type="checkbox"
                  id="exportMatches"
                  name="exportMatches"
                  checked={exportMatchesStatus}
                  onChange={(e) => {
                    setExportMatchesStatus(e.target.checked);
                    saveSettings(
                      ui,
                      systemTray,
                      !exportMatchesStatus,
                      exportMatchesAPIkey
                    );
                  }}
                />
                <span className="slider round"></span>
              </label>
              <span>
                Enable to export the matches to the osu! Tourney Match Displayer
                website
              </span>
            </div>
            <div className="description">
              You need to put the o!TMD Website Apikey in order to let him work!{" "}
              <b>It saves automatically when you paste it!</b>
            </div>
            <div className="inputField">
              <label className="nameField" htmlFor="matchesApikey">
                o!TMD Website Apikey
              </label>
              <div className="fields">
                <Field
                  id="matchesApikey"
                  name="matchesApikey"
                  value={exportMatchesAPIkey}
                  placeholder="Apikey"
                  onChange={(e) => {
                    setExportMatchesAPIkey(e.target.value);
                    saveSettings(
                      ui,
                      systemTray,
                      exportMatchesStatus,
                      e.target.value
                    );
                  }}
                />

                {validate === "" ? (
                  <div className="validitytext"></div>
                ) : validate ? (
                  <div className="validitytext green">
                    The apikey is correct!
                  </div>
                ) : (
                  <div className="validitytext red">Wrong apikey!</div>
                )}

                <div
                  className={`validity`}
                  onClick={() => {
                    validateAPI(exportMatchesAPIkey);
                  }}
                >
                  {apiLoading ? (
                    <div className="buttonLoaderAPI"></div>
                  ) : (
                    "Check validity"
                  )}
                </div>
              </div>
              <div className="description">
                Get the Apikey by logging into your account from the{" "}
                <a href="https://otmd.app" rel="noreferrer" target={"_blank"}>
                  Website
                </a>{" "}
                and head to the settings page to get it!
              </div>
            </div>
          </div>
        </Form>
      </Formik>
    </div>
  );
}

export default AppSettings;
