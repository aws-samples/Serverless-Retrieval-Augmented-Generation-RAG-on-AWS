import TopNavigation from "@cloudscape-design/components/top-navigation";
import { useNavigate } from "react-router-dom";
import React from 'react';

import {
  withAuthenticator,
  Flex,
  Divider,
  ScrollView,
  Card
} from '@aws-amplify/ui-react';
const TopNav = ({signOut, user}) => {
  const navigate = useNavigate();
  return (
    <TopNavigation
      identity={{
        href: "#",
        title: "Serverless RAG",
        onFollow: () => navigate("/"),
      }}
      utilities={[
        {
          type: "menu-dropdown",
          text: user.signInDetails.loginId,
          description: user.signInDetails.loginId,
          iconName: "user-profile",
          items: [
            { id: "signout", text: "Sign out" }
          ],
          onItemClick: () => signOut()
        }
      ]}
    />
  );
};

export default withAuthenticator(TopNav);
