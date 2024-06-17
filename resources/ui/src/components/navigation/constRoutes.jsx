import React from "react";
import App from '../../App.jsx'

const routes = [
  {
    routePath: "/",
    title: "Chat",
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
    title: "Settings",
    show: true,
    main: () => <div />,
  }
];

export default routes;
