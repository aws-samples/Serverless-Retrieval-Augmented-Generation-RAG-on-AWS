import PropTypes from 'prop-types';
import React, { useState, useEffect } from 'react';

import {
  withAuthenticator,
  Flex,
} from '@aws-amplify/ui-react';

import { fetchAuthSession } from 'aws-amplify/auth';
import { applyMode, Mode } from '@cloudscape-design/global-styles';

import '@aws-amplify/ui-react/styles.css';
import "@cloudscape-design/global-styles/index.css";
import 'react-toastify/dist/ReactToastify.css';

import { QAManager } from './components/QAManager';

applyMode(Mode.Dark);

function MainComponent({ signOut, user, appConfig }) {

  const [creds, setCreds] = useState({});


  // Getting STS credentials for user
  useEffect(() => {
    const getSession = async () => {
      try {
        const { credentials, identityId, tokens } = await fetchAuthSession();
        setCreds({
          ...credentials,
          ...tokens,
          identityId
        });
      } catch (error) {
        console.error("Error fetching session: ", error);
      }
    };
    getSession();
  }, [user]);

  return (
    <Flex direction="column">
      <Flex direction="column" justifyContent="space-around" alignItems="center">
        <QAManager
          user={user}
          inferenceURL={appConfig.inferenceURL}
          websocketURL={appConfig.websocketURL}
          websocketStateTable={appConfig.websocketStateTable}
          region={appConfig.storage.aws_region}
          creds={creds}
          appConfig={appConfig}
        />
      </Flex>
    </Flex>
  );
}

MainComponent.propTypes = {
  signOut: PropTypes.func.isRequired,
  user: PropTypes.object.isRequired,
  appConfig: PropTypes.object.isRequired,
};

export default withAuthenticator(MainComponent);
