import React, { useState, useEffect } from "react";
import "./Profile.css";
import { Formik, Field, Form } from "formik";
const { ipcRenderer } = window.require("electron");

function Profile() {
  const [username, setUsername] = useState("");
  const [userID, setUserID] = useState("");
  const [apikey, setApikey] = useState("");
  const [numberAccount, setNumberAccount] = useState(0);

  const [isOBSactive, setIsOBSactive] = useState(true);

  const saveSettings = (apikey, number) => {
    let settings = { apikey, number };
    ipcRenderer.send("saveAccountSettings", settings);
  };

  useEffect(() => {
    ipcRenderer.send("obs_active");
    ipcRenderer.once("obs_active_return", (event, arg) => {
      setIsOBSactive(arg);
    });
    ipcRenderer.send("getAccountData");
    ipcRenderer.once("accountDataReturn", (event, arg) => {
      const { account } = arg;
      setUsername(account.username);
      setUserID(account.userID);
      setApikey(account.apikey);
      setNumberAccount(account.id - 1);
    });
  }, []);

  return (
    <div className="container profile">
      <div className="userInfoContainer">
        <img src={`https://s.ppy.sh/a/${userID}`} alt="4001304" />
        <div className="info">
          <div className="name">{username}</div>
          <Formik>
            <Form id="formAccountSettings">
              <div className="item">
                <label className="nameField" htmlFor="userID">
                  User ID
                </label>
                <Field id="userID" name="userID" value={userID} disabled />
              </div>
              <div className="item">
                <label className="nameField" htmlFor="apikey">
                  APIkey
                </label>
                {isOBSactive ? (
                  <Field
                    id="apikey"
                    name="apikey"
                    value="Streamer Mode Enabled"
                    spellCheck={false}
                    style={{ color: "#bbb" }}
                    disabled
                  />
                ) : (
                  <Field
                    id="apikey"
                    name="apikey"
                    value={apikey}
                    onChange={(e) => {
                      setApikey(e.target.value);
                      saveSettings(e.target.value, numberAccount);
                    }}
                    spellCheck={false}
                  />
                )}
              </div>
            </Form>
          </Formik>
        </div>
      </div>
    </div>
  );
}

export default Profile;
