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
  }
];

export default routes;
