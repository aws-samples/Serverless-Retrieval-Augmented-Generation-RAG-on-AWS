// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import "./styles.css";
import React, { useState } from "react";
import { SignatureV4 } from "@smithy/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";

export default function App() {
  const [searchQuery, setSearchQuery] = useState();
  const [chat, setChat] = useState([]);

  const streamData = async () => {

    const credentials = {
      accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.REACT_APP_AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.REACT_APP_AWS_SESSION_TOKEN,
    };
    setChat([]);
    const sigv4 = new SignatureV4({
      service: "lambda",
      region: process.env.REACT_APP_AWS_REGION,
      credentials,
      sha256: Sha256
    });
    const apiUrl = new URL(process.env.REACT_APP_LAMBDA_ENDPOINT_URL);

    const query = document.getElementById("searchQuery").value;
    setSearchQuery(query);
    let body = JSON.stringify({
      query: query,
      model: "anthropic.claude-instant-v1",
      // Other model examples that you can use.
      // model: "anthropic.claude-3-haiku-20240307-v1:0",
      // model: "anthropic.claude-3-sonnet-20240229-v1:0",
      // model: "mistral.mistral-large-2402-v1:0",
    });
    
    let signed = await sigv4.sign({
      body,
      method: "POST",
      hostname: apiUrl.hostname,
      path: apiUrl.pathname.toString(),
      protocol: apiUrl.protocol,
      headers: {
        "Content-Type": "application/json",
        host: apiUrl.hostname
      }
    });

    try {
      let response = await fetch(apiUrl, {
        method: signed.method,
        headers: signed.headers,
        body: body,
        mode: "cors"
      });

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        setChat((data) => [...data, value]);
      }
    }
    catch (err) {
      console.log('Something went wrong');
      console.log(err);
      return;
    }

  };

  return (
    <div>
      <div>
        <span className="label">Ask a question: </span>
        <input id="searchQuery"></input>
        <br></br>
        <button onClick={() => streamData()}>Submit Question</button>
      </div>
      <div>
        <p>
          <b>Question:</b> {searchQuery}
          <br></br>
          <br></br>
          <b>Response:</b> {chat.join("")}
        </p>
      </div>
    </div>
  );
}
