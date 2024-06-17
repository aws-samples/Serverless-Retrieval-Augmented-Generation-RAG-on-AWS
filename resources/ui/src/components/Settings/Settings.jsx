import * as React from "react";
import { useState, useEffect } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { SSMClient, GetParametersCommand } from '@aws-sdk/client-ssm';
import { Checkbox, Textarea, SpaceBetween, Container, Header, ColumnLayout, Spinner, ExpandableSection } from '@cloudscape-design/components';

import {
    withAuthenticator,
  } from '@aws-amplify/ui-react';

function Settings({ signOut, user, appConfig }) {

    const stackName = appConfig.websocketStateTable.split("-")[0];

    const [creds, setCreds] = useState({});
    const [loading, setLoading] = useState(true);
    const [state, setState] = useState(() => {
        const savedState = localStorage.getItem('parameterEditorState');
        console.log('retireved state');
        console.log(savedState);
        return savedState ? JSON.parse(savedState) : [];
    });

    const parameterPaths = [
        `/${stackName}/default/prompts/contextFooter`,
        `/${stackName}/default/prompts/noContextFooter`,
        `/${stackName}/default/prompts/promptHeader`,
    ];

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

  useEffect(() => {

    if (!creds || !creds.accessKeyId) {
      return;
    }

    const ssmClient = new SSMClient({
      region: appConfig.region,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      }
    });

    const fetchParameters = async () => {
      try {
          const command = new GetParametersCommand({ Names: parameterPaths });
          const { Parameters } = await ssmClient.send(command);
          
          // Map the fetched parameters to the initial state format
          const initialState = Parameters.map(param => ({
              name: param.Name,
              value: param.Value,
              isChecked: false,
              userInput: ''
          }));
  
          // Load the user inputs from local storage if they exist
          const savedState = localStorage.getItem('parameterEditorState');
          if (savedState) {
              console.log('Loaded state from local storage:', savedState);
              const parsedState = JSON.parse(savedState);
              
              // Merge the SSM parameters with the user inputs from local storage
              const mergedState = initialState.map(param => {
                  const savedParam = parsedState.find(p => p.name === param.name);
                  return savedParam ? { ...param, isChecked: savedParam.isChecked, userInput: savedParam.userInput } : param;
              });
              
              setState(mergedState);
          } else {
              setState(initialState);
          }
      } catch (error) {
          console.error('Error fetching parameters:', error);
      } finally {
          setLoading(false);
      }
  };

    fetchParameters();
  }, [stackName, creds]);

  const handleCheckboxChange = (index) => {
    const newState = [...state];
    newState[index].isChecked = !newState[index].isChecked;
    setState(newState);
};

const handleInputChange = (index, value) => {
    const newState = [...state];
    newState[index].userInput = value;
    setState(newState);
};

  useEffect(() => {
    if (!loading) {
        localStorage.setItem('parameterEditorState', JSON.stringify(state));
    }
    }, [state, loading]);

  if(loading){
    return <>
        <Container header={<Header variant="h3">System Prompt Settings</Header>}>
            <ColumnLayout columns={1}>
                <SpaceBetween size="m">
                    <Spinner 
                    size="large"
                    />
                </SpaceBetween>
            </ColumnLayout>
        </Container>
    </>;
  }

  return (
    <Container header={<Header variant="h3">System Prompt Settings</Header>}>
      <SpaceBetween size="m" direction="vertical">
      <ColumnLayout columns={2} borders="horizontal" variant="text-grid">
          {state.map((param, index) => (
            <React.Fragment key={param.name}>
              <div>
                <Header variant="h4">{param.name.split('/').pop()}</Header>
                {param.value}
              </div>
              <div>
              <Header variant="h4">Override {param.name.split('/').pop()}</Header>
                <Checkbox
                  checked={param.isChecked}
                  onChange={() => handleCheckboxChange(index)}
                />
                  <Textarea
                    value={param.userInput}
                    onChange={(e) => handleInputChange(index, e.detail.value)}
                    disabled={!param.isChecked}
                    placeholder="Enter value"
                  />
              </div>
            </React.Fragment>
          ))}
      </ColumnLayout>

          <ExpandableSection variant="container" headerText="How does the system prompt work?">
            <ColumnLayout columns={2}>
            <div><img src="/systemPrompt.png" /></div>
            <div>
              <ol>
                <li><strong>promptHeader</strong> is the start of your prompt. This prompt will be included at the beginning of the LLM context</li>
                <li><strong>contextFooter</strong> will be appended to <strong>promptHeader</strong> if any context is retreived.</li>
                <li><strong>noContextFooter</strong> is the end of your prompt when there is no context. This prompt will be appended to <strong>promptHeader</strong> when there is no context</li>
                <li>You can override any of the above prompts by checking the checkbox and providing a custom value</li>
                <li>These prompts are only persisted in your browser</li>
                <li>You can override the default system prompts for all users by following these instructions</li>
              </ol>
            </div>
            </ColumnLayout>
          </ExpandableSection>
          </SpaceBetween>
    </Container>
  );
}

export default withAuthenticator(Settings);
