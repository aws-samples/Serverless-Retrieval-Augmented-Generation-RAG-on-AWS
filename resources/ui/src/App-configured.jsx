import React, { useEffect, useState } from "react";
import {
  Alert,
  Authenticator,
  Heading,
  useTheme,
} from "@aws-amplify/ui-react";
import { StatusIndicator, AppLayout } from "@cloudscape-design/components";

import { Amplify } from "aws-amplify";
import App from './App.jsx'
import "@aws-amplify/ui-react/styles.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import TopNav from "./components/navigation/TopNav";
import NavSideBar from "./components/navigation/NavSideBar";
import Documents from "./components/Documents/Documents.jsx";
import WebSocketManager from './components/WebSocketManager';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Settings from "./components/Settings/Settings.jsx";

export default function AppConfigured() {
  const { tokens } = useTheme();
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await fetch("appconfig.json");
        const awsExports = await result.json();

        Amplify.configure(awsExports);

        setConfig(awsExports);
      } catch (e) {
        console.error(e);
        setError(true);
      }
    })();
  }, []);

  

  if (!config) {
    if (error) {
      return (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Alert heading="Configuration error" variation="error">
            Error loading configuration from "
            <a href="/appconfig.json" style={{ fontWeight: "600" }}>
              /appconfig.json
            </a>
            "
          </Alert>
        </div>
      );
    }

    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <StatusIndicator type="loading">Loading</StatusIndicator>
      </div>
    );
  }

  return (
    
      <Authenticator
        hideSignUp={false}
        components={{
          SignIn: {
            Header: () => {
              return (
                <Heading
                  padding={`${tokens.space.xl} 0 0 ${tokens.space.xl}`}
                  level={3}
                >
                  Serverless RAG
                </Heading>
              );
            },
          },
        }}
      >
      <WebSocketManager 
        websocketURL={config.websocketURL}
        websocketStateTable={config.websocketStateTable}
        region={config.storage.aws_region}
        toast={toast}
      />
      <ToastContainer/>
        <BrowserRouter basename="/">
          {<TopNav />}
          <AppLayout
            navigation={<NavSideBar />}
            navigationHide={false}
            toolsHide={true}
            content={
              <Routes>
                <Route path="/" element={ <App  appConfig={config}/>} />
                <Route path="/Documents" element={ <Documents appConfig={config}/>} />
                <Route path="/Settings" element={ <Settings appConfig={config}/>} />
              </Routes>
            }
          />
        </BrowserRouter>
      </Authenticator>
    
  );
}


