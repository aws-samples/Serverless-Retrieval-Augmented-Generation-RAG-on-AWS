import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import useWebSocket from 'react-use-websocket';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import React from 'react';
import {
  withAuthenticator,
} from '@aws-amplify/ui-react';
import { fetchAuthSession } from 'aws-amplify/auth';

import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";

function WebSocketManager({ user, websocketURL, websocketStateTable, region, toast }) {
  const [connectionId, setConnectionId] = useState("");
  const [creds, setCreds] = useState({});
  const [hasErrored, setHasErrored] = useState(false);


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

    // check if this component has actually unmounted
    useEffect(() => {
      return () => {
        didUnmount.current = true;
      };
    }, []);

  const didUnmount = useRef(false);

  const { sendMessage, lastMessage, readyState } = useWebSocket(
    `${websocketURL}?idToken=${creds.idToken}`,
    {
      onOpen: (event) => {
        console.log("Connected to websocket", event);
        sendMessage(JSON.stringify({ action: "whoami" }))
        setHasErrored(false)
      },
      onError: (event) => console.log(event) || creds.idToken? setHasErrored(true) : null,
      heartbeat: {
        interval: 45 * 1000,
        timeout: 60000,
        message: JSON.stringify({ action: "whoami" })
      },
      onReconnectStop: (event) => console.log("reconnect stop", event) || setHasErrored(true),
      shouldReconnect: () => didUnmount.current === false,
      reconnectAttempts: 10,
      reconnectInterval: 3000,
    }
  );

    window.sendMessage = sendMessage;

  const onErrorHandler = () => location.reload();

  // Manage incoming messages from websocket
  useEffect(() => {
    if (lastMessage !== null) {
      console.log(lastMessage.data);

      let data, type;

      try {
        data = JSON.parse(lastMessage.data);
        type = data.type;
      } catch (e) {
        console.log(e);
        return;
      }

      if (type === "whoami") {
        return;
      }

      if (type === "connection") {
        const {connectionId, level} = data;
        const messageLevel = level || "info";

        setConnectionId(connectionId);
        window.debug && toast[messageLevel](`Connected to websocket: ${connectionId}`);
        return;
      }

      if(type === "message"){
        const {message, level } = data;
        const messageLevel = level || "info";
        toast[messageLevel](message);
      }
    }
  }, [lastMessage, toast]);


  // Update DynamoDB table with new connection value for this user
  useEffect(() => {
    if (connectionId) {
      console.info("connectionID changed: updating connectionId");
      const params = {
        TableName: websocketStateTable,
        Key: {
          "userId": { S: creds.identityId }
        },
        UpdateExpression: "set ConnectionId = :c, ReadyState = :rs",
        ExpressionAttributeValues: {
          ":c": { S: connectionId },
          ":rs": { S: String(readyState) }
        },
        ReturnValues: "UPDATED_NEW"
      };

      const updateConnection = async () => {
        const client = new DynamoDBClient({
             region,
             credentials: {
                accessKeyId: creds.accessKeyId,
                secretAccessKey: creds.secretAccessKey,
                sessionToken: creds.sessionToken,
            }
        });
        const command = new UpdateItemCommand(params);

        try {
          const data = await client.send(command);
          console.log(data);
        } catch (err) {
          console.error(err);
          toast.error("Trouble updating connection.");
        }
      };

      updateConnection();
    }
  }, [
    connectionId, creds.accessKeyId, creds.secretAccessKey,
    creds.sessionToken, region, websocketStateTable
]);

  return <ReloadModal
    visible={hasErrored}
    setVisible={setHasErrored}
    message="There was an error connecting to the websocket. Please reload the page."
    action={onErrorHandler}
    header="Lost Connection to Backend"
  />;
}

export default withAuthenticator(WebSocketManager);

WebSocketManager.propTypes = {
  user: PropTypes.object.isRequired,
  websocketURL: PropTypes.string.isRequired,
  websocketStateTable: PropTypes.string.isRequired,
  region: PropTypes.string.isRequired,
  toast: PropTypes.func.isRequired
};

const ReloadModal =  ({visible, setVisible,  message, action, header}) => {
  return (
    <Modal
      onDismiss={() => setVisible(false)}
      visible={visible}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="primary" onClick={() => action()}>Reload</Button>
          </SpaceBetween>
        </Box>
      }
      header={header}
    >
      {message}
    </Modal>
  );
}

ReloadModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  setVisible: PropTypes.func.isRequired,
  message: PropTypes.string.isRequired,
  action: PropTypes.func.isRequired,
  header: PropTypes.string.isRequired
};