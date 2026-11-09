import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./Profile.css";
import { Formik, Field, Form } from "formik";
import * as api from "@/lib/api";

function Profile() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [userID, setUserID] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const logout = async () => {
    setIsLoggingOut(true);
    try {
      await api.logout();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  useEffect(() => {
    const load = async () => {
      const { account } = await api.getAccountData();
      setUsername(account.username);
      setUserID(account.userID);
    };
    load();
  }, []);

  return (
    <div className="container profile">
      <div className="userInfoContainer">
        <img src={`https://a.ppy.sh/${userID}`} alt={username} />
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
                <button
                  type="button"
                  className="logoutButton"
                  onClick={logout}
                  disabled={isLoggingOut}
                >
                  Logout
                </button>
              </div>
            </Form>
          </Formik>
        </div>
      </div>
    </div>
  );
}

export default Profile;
