import {
  Flex,
  Button,
  useTheme
} from '@aws-amplify/ui-react';

import '@aws-amplify/ui-react/styles.css';

import PropTypes from 'prop-types';

import 'react-toastify/dist/ReactToastify.css';

import React from 'react';

export function Header({ signOut, user }) {
    const { tokens } = useTheme();
  
    return (
      <Flex
        backgroundColor={tokens.colors.blue[80]}
        direction="row"
        justifyContent="space-between"
      >
        <h3>Hello {user?.signInDetails?.loginId ?? "uh?!"}!</h3>
        <Button onClick={signOut}>Sign out</Button>
      </Flex>
    );
  }
  
  Header.propTypes = {
    signOut: PropTypes.func.isRequired,
    user: PropTypes.shape({
      signInDetails: PropTypes.shape({
        loginId: PropTypes.string
      })
    })
  };
