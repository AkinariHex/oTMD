import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import "./Changelog.css";

function Changelog() {
  const [changelog, setChangelog] = useState("");

  useEffect(() => {
    fetch("https://raw.githubusercontent.com/AkinariHex/oTMD/main/CHANGELOG.md")
      .then((res) => res.text())
      .then((text) => setChangelog(text));

    return () => {};
  });

  return (
    <div className="container markdown">
      <ReactMarkdown children={changelog} />
    </div>
  );
}

export default Changelog;
