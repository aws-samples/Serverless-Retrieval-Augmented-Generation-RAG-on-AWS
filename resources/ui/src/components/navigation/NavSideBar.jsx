import React, { useContext } from "react";
import { SideNavigation } from "@cloudscape-design/components";
import { PROJECT_NAME } from "../utils/constNames";
import { useNavigate, useLocation } from "react-router-dom";
import routes from "./constRoutes";

const header = {
  href: "/",
  text: `${PROJECT_NAME}`,
};

const NavSideBar = () => {

  const routesWithLanguageTitles = routes.map((route) => ({
    ...route,
    title: route.title,
  }));

  const items = routesWithLanguageTitles
    .filter((route) => route.show)
    .map((route) => ({
      type: "link",
      text: route.title,
      href: route.routePath,
      items: [],
    }));

  const navigate = useNavigate();
  const location = useLocation();

  function onFollowHandler(ev) {
    if (!ev.detail.external) {
      ev.preventDefault();
      if (ev.detail.href) {
        navigate(ev.detail.href);
      }
    }
  }

  return (
    <SideNavigation
      items={items}
      header={header}
      onFollow={onFollowHandler}
      activeHref={location.pathname}
    />
  );
};

export default NavSideBar;
