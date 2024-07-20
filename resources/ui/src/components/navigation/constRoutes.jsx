import React from "react";
import App from '../../App.jsx'

const routes = [
  {
    routePath: "/",
    title: "Chat Playground",
    show: true,
    main: () => <div />,
  },
  {
    routePath: "/ChatHistory",
    title: "Chat History",
    show: true,
    main: () => <div />,
  },
  {
    routePath: "/Documents",
    title: "Documents",
    show: true,
    main: () => <App />,
  },
  {
    routePath: "/Settings",
    title: "System Prompt Settings",
    show: true,
    main: () => <div />,
  }
];

export default routes;
