import React, { useState, useEffect } from "react";
import "./AppLogin.css";
import Logo from "../../Images/otmd.ico";
import { ArrowDown2, Add } from "iconsax-react";
import { NavLink } from "react-router-dom";
import { Formik, Field, Form } from "formik";
const { ipcRenderer } = window.require("electron");

function AppLogin() {
  /* True if user clicked on "Create New Account" */
  const [isCreating, setIsCreating] = useState(false);
  /* If true shows a loading when fetching user data from osu! */
  const [isLoading, setIsLoading] = useState(false);
  /* If true the user gave incorrect userID or apikey */
  const [isError, setIsError] = useState(false);
  /* UserID and APIKEY when editing the input data */
  const [creatingUserID, setCreatingUserID] = useState("");
  const [creatingApikey, setCreatingApikey] = useState("");
  /* Array of all users */
  const [accountsArray, setAccountsArray] = useState([]);

  const changeActiveAccount = (userID) => {
    ipcRenderer.send("changeActiveAccount", userID);
  };

  const createNewAccount = (userID, apikey) => {
    fetch(`https://osu.ppy.sh/api/get_user?k=${apikey}&u=${userID}`)
      .then(async (user) => {
        setIsLoading(false);
        if (user.status === 200) {
          let userData = await user.json();
          let data = {
            userID: userData[0].user_id,
            username: userData[0].username,
            country: userData[0].country,
            apikey: apikey,
            id: accountsArray.length + 1,
          };
          ipcRenderer.send("createNewAccount", data);
          setIsCreating(false);
          setIsError(false);
          setCreatingUserID("");
          setCreatingApikey("");
          setAccountsArray([...accountsArray, data]);
        } else {
          setIsError(true);
        }
      })
      .catch((err) => {
        setIsError(true);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    ipcRenderer.send("getLoginAccounts");
    ipcRenderer.once("loginAccountDataReturn", (event, array) => {
      setAccountsArray(array);
    });
  }, []);

  return (
    <div className="containerLogin">
      <div className="logoContainer">
        <img src={Logo} alt="Logo" className="logo" />
        <div className="title">Welcome to o!TMD</div>
        <div className="subtext">
          <span>Select</span> or <span>Create</span> an account to continue!
        </div>
      </div>
      <div className="accountsContainer">
        {accountsArray.map((account, index) => {
          return (
            <NavLink
              to="/app/match"
              className="account"
              key={index}
              onClick={() => changeActiveAccount(account.userID)}
              style={{
                backgroundImage: `linear-gradient(0deg, rgba(0,0,0,0.8), rgba(0,0,0,0.5)), url(https://s.ppy.sh/a/${account.userID})`,
              }}
            >
              <div className="info">
                <div className="user">
                  <img
                    src={`https://s.ppy.sh/a/${account.userID}`}
                    alt={account.userID}
                    className="userPropic"
                  />
                  <div className="username">{account.username}</div>
                </div>
                <div className="loginText">
                  <span>Login</span>
                  <ArrowDown2 size="22" />
                </div>
              </div>
            </NavLink>
          );
        })}
        <div
          className="account"
          style={{
            backgroundImage: `linear-gradient(0deg, rgba(0,0,0,0.8), rgba(0,0,0,0.5)), url(https://s.ppy.sh/a/${creatingUserID})`,
          }}
        >
          {isCreating ? (
            <div className="info c">
              <div className="userCreate">
                <img
                  src={`https://s.ppy.sh/a/${creatingUserID}`}
                  alt={creatingUserID}
                  className="userPropic"
                />
              </div>
              <Formik>
                <Form id="formNewAccount">
                  {isError ? (
                    <div className="error">Invalid UserID or APIkey!</div>
                  ) : (
                    <a
                      href="https://osu.ppy.sh/p/api"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="getApiKey"
                    >
                      Get the APIkey here!
                    </a>
                  )}
                  <div className="item">
                    <Field
                      id="userIDNew"
                      name="userIDNew"
                      value={creatingUserID}
                      onChange={(e) => {
                        setCreatingUserID(e.target.value);
                      }}
                      placeholder="userID"
                    />
                  </div>
                  <div className="item">
                    <Field
                      id="apikeyNew"
                      name="apikeyNew"
                      value={creatingApikey}
                      placeholder="APIkey"
                      onChange={(e) => {
                        setCreatingApikey(e.target.value);
                      }}
                      spellCheck={false}
                    />
                  </div>
                  <div
                    className="confirm"
                    onClick={() => {
                      createNewAccount(creatingUserID, creatingApikey);
                      setIsLoading(true);
                    }}
                  >
                    {isLoading ? (
                      <div className="buttonLoader"></div>
                    ) : (
                      "Create"
                    )}
                  </div>
                </Form>
              </Formik>
            </div>
          ) : (
            <div className="create" onClick={() => setIsCreating(true)}>
              <Add size="24" />
              Create New Account
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AppLogin;
