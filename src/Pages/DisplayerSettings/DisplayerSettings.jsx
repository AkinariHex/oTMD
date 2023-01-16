import React, { useState, useEffect } from "react";
import "./DisplayerSettings.css";
import { Formik, Field, Form } from "formik";
const { ipcRenderer } = window.require("electron");

function DisplayerSettings() {
  const [displayerHeight, setDisplayerHeight] = useState("130px");
  const [displayerRadius, setDisplayerRadius] = useState("");
  const [displayerRadiusSizes, setDisplayerRadiusSizes] = useState([
    "0px",
    "0px",
    "0px",
    "0px",
  ]);
  const [displayerTranspBackground, setDisplayerTranspBackground] =
    useState(false);

  const saveSettings = (
    VisualizerStyle,
    SmallDisplayer,
    TransparentBackground
  ) => {
    const settings = { VisualizerStyle, SmallDisplayer, TransparentBackground };
    ipcRenderer.send("saveDisplayerSettings", settings);
  };

  useEffect(() => {
    ipcRenderer.send("getDisplayerSettings");
    ipcRenderer.once("displayerSettingsReturn", (event, displayerSettings) => {
      let { VisualizerStyle, SmallDisplayer, TransparentBackground } =
        displayerSettings;
      SmallDisplayer && setDisplayerHeight("90px");
      setDisplayerRadius(VisualizerStyle);
      setDisplayerRadiusSizes(VisualizerStyle.split(" "));
      setDisplayerTranspBackground(TransparentBackground);
    });
  }, []);

  return (
    <div className="container visualizer">
      <div className="visualizerExampleContainer">
        <div
          className="example"
          style={{ borderRadius: displayerRadius, height: displayerHeight }}
        >
          <div className="height sizes">{displayerHeight}</div>
          <div className="width sizes">400px</div>
          <div className="topLeft sizes">{displayerRadiusSizes[0]}</div>
          <div className="topRight sizes">{displayerRadiusSizes[1]}</div>
          <div className="bottomLeft sizes">{displayerRadiusSizes[3]}</div>
          <div className="bottomRight sizes">{displayerRadiusSizes[2]}</div>
          {
            /* Show a text if the Transparent Background feature is enabled */
            displayerTranspBackground && (
              <div className="transparentBackground">
                Transparent Background Enabled
              </div>
            )
          }
        </div>
      </div>
      <Formik>
        <Form id="formDisplayerSettings">
          <div className="item">
            <label className="nameField" htmlFor="visualizerStyle">
              Visualizer Style
            </label>
            <Field
              as="select"
              id="visualizerStyle"
              name="visualizerStyle"
              value={displayerRadius}
              onChange={(e) => {
                setDisplayerRadius(e.target.value);
                setDisplayerRadiusSizes(e.target.value.split(" "));
                saveSettings(
                  e.target.value,
                  displayerHeight === "90px" ? true : false,
                  displayerTranspBackground
                );
              }}
            >
              <option value="0px 0px 0px 0px">Default</option>
              <option value="15px 15px 15px 15px">Rounded</option>
              <option value="15px 15px 0px 0px">Top-Rounded</option>
              <option value="0px 0px 15px 15px">Bottom-Rounded</option>
            </Field>
          </div>
          <div className="item">
            <label className="nameField" htmlFor="smallDisplayer">
              Small Displayer
            </label>
            <div className="clickable">
              <label className="switch">
                <Field
                  type="checkbox"
                  id="smallDisplayer"
                  name="smallDisplayer"
                  checked={displayerHeight === "90px" ? true : false}
                  onChange={(e) => {
                    e.target.checked
                      ? setDisplayerHeight("90px")
                      : setDisplayerHeight("130px");
                    saveSettings(
                      displayerRadius,
                      e.target.checked,
                      displayerTranspBackground
                    );
                  }}
                />
                <span className="slider round"></span>
              </label>
              <span>Enable Small Displayer</span>
            </div>
            <div className="description">
              Enable the small displayer that have less height.
              <br />
              Instead of tournament name will be displayed its acronym if is too
              long.
            </div>
          </div>
          <div className="item">
            <label className="nameField" htmlFor="transparentBackground">
              Transparent Background
            </label>
            <div className="clickable">
              <label className="switch">
                <Field
                  type="checkbox"
                  id="transparentBackground"
                  name="transparentBackground"
                  checked={displayerTranspBackground}
                  onChange={(e) => {
                    setDisplayerTranspBackground(e.target.checked);
                    saveSettings(
                      displayerRadius,
                      displayerHeight === "90px" ? true : false,
                      e.target.checked
                    );
                  }}
                />
                <span className="slider round"></span>
              </label>
              <span>Enable Transparent Background</span>
            </div>
          </div>
        </Form>
      </Formik>
    </div>
  );
}

export default DisplayerSettings;
