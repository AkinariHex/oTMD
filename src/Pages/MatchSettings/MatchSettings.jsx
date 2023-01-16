import React, { useState, useEffect } from "react";
import "./MatchSettings.css";
import { Formik, Field, Form } from "formik";
const { ipcRenderer } = window.require("electron");

function MatchSettings() {
  const [activeAccount, setActiveAccount] = useState("");
  const [matchID, setMatchID] = useState("");
  const [matchType, setMatchType] = useState("teamVS");
  const [stage, setStage] = useState("");
  const [bestOF, setBestOF] = useState("");
  const [nMapsQualif, setNMapsQualif] = useState(0);
  const [warmups, setWarmups] = useState(0);
  const [scoreReverse, setScoreReverse] = useState(false);

  const [popupClass, setPopupClass] = useState("");

  const saveSettings = (
    ActiveAccount,
    MatchID,
    MatchType,
    Stage,
    BestOF,
    MapsNqualifiers,
    Warmups,
    ScoreReverse
  ) => {
    const settings = {
      ActiveAccount,
      MatchID,
      MatchType,
      Stage,
      BestOF,
      MapsNqualifiers,
      Warmups,
      ScoreReverse,
      isFinished: false,
    };
    ipcRenderer.send("saveMatchSettings", settings);
  };

  useEffect(() => {
    ipcRenderer.send("getMatchSettings");
    ipcRenderer.once("matchSettingsReturn", (event, matchSettings) => {
      let {
        ActiveAccount,
        MatchID,
        MatchType,
        Stage,
        BestOF,
        MapsNqualifiers,
        Warmups,
        ScoreReverse,
      } = matchSettings;

      setActiveAccount(ActiveAccount);
      setMatchID(MatchID);
      setMatchType(MatchType);
      setStage(Stage);
      setBestOF(BestOF);
      setNMapsQualif(MapsNqualifiers);
      setWarmups(Warmups);
      setScoreReverse(ScoreReverse);
    });
  }, []);

  return (
    <div className="container">
      <Formik>
        <Form id="formMatchSettings">
          <div className="row">
            <div className="item">
              <label className="nameField" htmlFor="matchID">
                Match ID
              </label>
              <Field
                id="matchID"
                name="matchID"
                value={matchID}
                placeholder="Match ID"
                onChange={(e) => {
                  setMatchID(e.target.value);
                }}
                required
              />
            </div>
            <div className="item">
              <label className="nameField" htmlFor="matchType">
                Match Type
              </label>
              <Field
                as="select"
                id="matchType"
                name="matchType"
                value={matchType}
                onChange={(e) => {
                  setMatchType(e.target.value);
                }}
                spellCheck={false}
                required
              >
                <option value="1vs1">1vs1</option>
                <option value="teamVS">TeamVS</option>
              </Field>
            </div>
          </div>
          <div className="row">
            <div className="item">
              <label className="nameField" htmlFor="stage">
                Stage
              </label>
              <Field
                as="select"
                id="stage"
                name="stage"
                value={stage}
                onChange={(e) => {
                  setStage(e.target.value);
                }}
                spellCheck={false}
                required
              >
                <option value="Friendly">Friendly</option>
                <option value="Qualifiers">Qualifiers</option>
                <option value="Round of 128">Round of 128</option>
                <option value="Round of 64">Round of 64</option>
                <option value="Round of 32">Round of 32</option>
                <option value="Round of 16">Round of 16</option>
                <option value="Quarterfinals">Quarterfinals</option>
                <option value="Semifinals">Semifinals</option>
                <option value="Finals">Finals</option>
                <option value="Grandfinals">Grand Finals</option>
              </Field>
            </div>
          </div>
          <div className="row">
            {stage === "Qualifiers" && (
              <div className="item">
                <label className="nameField" htmlFor="nMaps">
                  N. of Maps
                </label>
                <Field
                  type="number"
                  id="nMaps"
                  name="nMaps"
                  value={nMapsQualif}
                  onChange={(e) => {
                    setNMapsQualif(e.target.value);
                  }}
                  spellCheck={false}
                  required
                />
              </div>
            )}
            {stage !== "Qualifiers" && (
              <>
                <div className="item">
                  <label className="nameField" htmlFor="bestOf">
                    Best of
                  </label>
                  <Field
                    as="select"
                    id="bestOf"
                    name="bestOf"
                    value={bestOF}
                    onChange={(e) => {
                      setBestOF(e.target.value);
                    }}
                    spellCheck={false}
                    required
                  >
                    <option value="3">BO3</option>
                    <option value="5">BO5</option>
                    <option value="7">BO7</option>
                    <option value="9">BO9</option>
                    <option value="11">BO11</option>
                    <option value="13">BO13</option>
                    <option value="15">BO15</option>
                    <option value="17">BO17</option>
                    <option value="19">BO19</option>
                    <option value="21">BO21</option>
                  </Field>
                </div>
                <div className="item">
                  <label className="nameField" htmlFor="warmups">
                    Warmups
                  </label>
                  <Field
                    type="number"
                    id="warmups"
                    name="warmups"
                    value={warmups}
                    onChange={(e) => {
                      setWarmups(e.target.value);
                    }}
                    spellCheck={false}
                    required
                  />
                </div>
              </>
            )}
            {stage !== "Qualifiers" && (
              <div className="item">
                <label className="nameField" htmlFor="scoreReverse">
                  Score Reverse
                </label>
                <div className="clickable">
                  <label className="switch">
                    <Field
                      type="checkbox"
                      id="scoreReverse"
                      name="scoreReverse"
                      checked={scoreReverse}
                      onChange={(e) => {
                        setScoreReverse(e.target.checked);
                      }}
                    />
                    <span className="slider round"></span>
                  </label>
                  <span>Invert the scores</span>
                </div>
              </div>
            )}
          </div>
          <div className="row">
            <div className="item">
              <div
                className="saveButton"
                onClick={() => {
                  saveSettings(
                    activeAccount,
                    matchID,
                    matchType,
                    stage,
                    bestOF,
                    nMapsQualif,
                    warmups,
                    scoreReverse
                  );
                  navigator.clipboard.writeText(
                    "http://localhost:21086/visualizer"
                  );
                  setPopupClass("show");
                  setTimeout(() => {
                    setPopupClass("");
                  }, 3000);
                }}
              >
                Save
              </div>
            </div>
          </div>
        </Form>
      </Formik>
      <div className={`popupContainer ${popupClass}`}>
        <div className="popup">Settings Changed!</div>
      </div>
    </div>
  );
}

export default MatchSettings;
