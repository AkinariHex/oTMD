import React, { useEffect, useState } from "react";
import "./AppSettings.css";
import { Formik, Field, Form } from "formik";
import * as api from "@/lib/api";
import { ToggleGroup, ToggleGroupItem } from "@/Components/ui/toggle-group";

const TRAY_BEHAVIOR_HINTS = {
  closeToTray: "X keeps o!TMD running in the tray. Minimize works as usual.",
  minimizeToTray: "Minimize sends o!TMD to the tray. X quits the app.",
};

function AppSettings() {
  const [ui, setUi] = useState(false);
  const [trayBehavior, setTrayBehavior] = useState("closeToTray");
  const [exportMatchesStatus, setExportMatchesStatus] = useState(false);
  const [exportMatchesAPIkey, setExportMatchesAPIkey] = useState("");

  const [apiLoading, setApiLoading] = useState(false);
  const [validate, setValidate] = useState("");

  const saveSettings = (
    CompactUI,
    TrayBehavior,
    ExportMatchesStatus,
    ExportMatchesAPI
  ) => {
    const settings = {
      CompactUI,
      TrayBehavior,
      ExportMatches: { status: ExportMatchesStatus, apikey: ExportMatchesAPI },
    };
    api.saveAppSettings(settings);
  };

  const validateAPI = async (apikey) => {
    setApiLoading(true);
    try {
      setValidate(await api.validateExportKey(apikey));
    } catch {
      setValidate(false);
    } finally {
      setApiLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      const appSettings = await api.getAppSettings();
      setUi(appSettings.CompactUI);
      setTrayBehavior(appSettings.TrayBehavior);
      setExportMatchesStatus(appSettings.ExportMatches.status);
      setExportMatchesAPIkey(appSettings.ExportMatches.apikey);
      if (appSettings.ExportMatches.apikey !== "") {
        validateAPI(appSettings.ExportMatches.apikey);
      }
    };
    load();
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
                      trayBehavior,
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
            <span className="nameField">System Tray</span>
            <ToggleGroup
              type="single"
              spacing={0}
              value={trayBehavior}
              data-selected={trayBehavior}
              className="trayBehavior"
              aria-label="System tray behavior"
              onValueChange={(value) => {
                if (!value) return;
                setTrayBehavior(value);
                saveSettings(
                  ui,
                  value,
                  exportMatchesStatus,
                  exportMatchesAPIkey
                );
              }}
            >
              <ToggleGroupItem value="closeToTray">Close to tray</ToggleGroupItem>
              <ToggleGroupItem value="minimizeToTray">
                Minimize to tray
              </ToggleGroupItem>
            </ToggleGroup>
            <span className="trayBehaviorHint">
              {TRAY_BEHAVIOR_HINTS[trayBehavior]}
            </span>
          </div>
          <div className="item">
            <label className="nameField" htmlFor="exportMatches">
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
                      trayBehavior,
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
                      trayBehavior,
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
                <a
                  href="https://otmd.app"
                  onClick={(e) => {
                    e.preventDefault();
                    api.openExternal("https://otmd.app");
                  }}
                >
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
