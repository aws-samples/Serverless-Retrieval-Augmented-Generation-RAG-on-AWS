import React, { useState, useEffect} from 'react';
import PropTypes from 'prop-types';
import { SignatureV4 } from "@smithy/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw'
import {Prism as SyntaxHighlighter} from 'react-syntax-highlighter'
import darkMarkdown from '../static/themes/awsDark.js';
import lightMarkdown from '../static/themes/awsLight.js';
import { useNavigate } from "react-router-dom";

import {
  Container,
  Select,
  SpaceBetween,
  Textarea,
  Button,
  Header,
  FormField,
  Link, 
  Box
} from '@cloudscape-design/components'
import { BedrockClient, ListFoundationModelsCommand } from '@aws-sdk/client-bedrock';

import { streamingLambda, syncLambda } from './helpers';

export function QAManager({ inferenceURL, creds, region, appConfig }) {

  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState(() => {
    const savedQuery = localStorage.getItem('searchQuery');
    return savedQuery || '';
  });

  const [models, setModels] = useState([]);
  const localStorageModel = localStorage.getItem('llm_model_id') || 'loading...';
  const [model, setModel] = useState(localStorageModel);

  const [searching, setSearching] = useState();
  const [metadata, setMetadata] = useState([]);
  const [results, setResults] = useState([]);

  const [systemPrompt, setSystemPrompt] = useState(() => {
    const savedPrompt = localStorage.getItem('parameterEditorState');
    if(savedPrompt){
      const parsedPrompt = JSON.parse(savedPrompt);
      if (parsedPrompt.some(item => item.isChecked)) {
        return {
          isModified: true,
          ... parsedPrompt
        }

      }
      return {
        isModified: false,
      }
    }
  });

  // when searchQuery changes, store it into the local storage
  useEffect(() => {
      localStorage.setItem('searchQuery', searchQuery);
  });

  const clearResponse = () => {
    setSearching(false);
    setMetadata([]);
    setResults([]);
  }

  const getPresignedUrlAndRedirect = async (objectKey, page) => {
  
    const s3Client = new S3Client({
      region: appConfig.storage.aws_region,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      }
    });
  
    const command = new GetObjectCommand({
      Bucket: appConfig.storage.bucket_name,
      Key: objectKey,
    });
  
    try {
      const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // URL expires in 1 hour
      if (page){
        window.open(`${signedUrl}#page=${page}`, '_blank'); // Open in new tab
      }
      else {
        window.open(signedUrl, '_blank'); // Open in new tab
      }
    } catch (error) {
      console.error('Error generating pre-signed URL', error);
    }
  };

  const getData = async (streaming = true) => {
    clearResponse();
    setSearching(true);

    const sigv4 = new SignatureV4({
      service: "lambda",
      region: creds.identityId.split(":")[0],
      credentials: creds,
      sha256: Sha256
    });

    let apiUrl;
    if (streaming) {
      apiUrl = new URL(inferenceURL);
    }
    else {
      // TODO:  hange this to sync endpoint?
      apiUrl = new URL(inferenceURL);
    }

    const requestBody = {
      query: searchQuery,
      systemPrompt,
      strategy: "rag",
      model: model,
      idToken: creds.idToken.toString()
    }

    try {
      const signed = await sigv4.sign({
        body: JSON.stringify(requestBody),
        method: "POST",
        hostname: apiUrl.hostname,
        path: apiUrl.pathname,
        protocol: apiUrl.protocol,
        headers: {
          "Content-Type": "application/json",
          host: apiUrl.hostname
        }
      });

      if (streaming) {
        await streamingLambda(
          apiUrl.origin,
          signed.method,
          signed.headers,
          requestBody, 
          (value) => { setResults((data) => [...data, value]); }, 
          setMetadata
        );
      }
      else {
        await syncLambda(apiUrl.origin, "POST", requestBody, (value) => { setResults([value.message]); });
      }
      setSearching(false);

    } catch (error) {
      console.error("Error streaming data: ", error);
    }
  };

  const getModelsFromBedrock = async () => {
    const bedrockClient = new BedrockClient({
      region: region,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      }
    });
  
    const command = new ListFoundationModelsCommand({});
    let models;
    try {
      models = await bedrockClient.send(command);
      return models.modelSummaries.filter(model => model.inferenceTypesSupported.includes('ON_DEMAND') && model.outputModalities.includes('TEXT'))
      .map(model => ({
        label: model.modelId,
        value: model.modelId,
      }));
    } catch (error) {
      console.warn("Error listing models: ", error);
      throw error;
    }
  };

  useEffect(() => {
    if (creds.accessKeyId) {
      getModelsFromBedrock().then(models => {
        setModels(models);
        const localStorageModel = localStorage.getItem('llm_model_id');
        if (localStorageModel) {
          setModel(localStorageModel);
        } else {
          setModel(models[0].value)
          localStorage.setItem('llm_model_id', models[0].value);
        }
      }).catch(error => {
        console.error("Error fetching models: ", error);
        setModels([{ value: 'none', label: 'Failed to load models' }]);
        setModel('none')
      });
    }
  }, [creds]);
    

  return (
    <Container header={
      <Header
      variant="h1"
    >
      Ask a question
    </Header>
    }>
      <SpaceBetween direction="vertical" size="m">
        <FormField
          label="LLM Model"
        >
          <Select
            selectedOption={{ label: model, value: model }}
            onChange={(event) => {
                setModel(event.detail.selectedOption.value);
                localStorage.setItem('llm_model_id', event.detail.selectedOption.value);
              }
            }
            options={models}
          />
        </FormField>
        { 
          systemPrompt.isModified 
            && 
          <span> 
            You have modified the system prompt. You can switch back to the default prompt by navigating to <Link onFollow={() => navigate("/Settings")}>Settings</Link>
          </span>
        }
        <Textarea onChange={({ detail }) => setSearchQuery(detail.value)} value={searchQuery}></Textarea>
      <div>
        <Button disabled={searchQuery.length===0 && model !== 'none'} variant="primary" iconName="search" loading={searching} onClick={() => getData(true)}>Submit Question</Button>
      </div>
      <div className="qa_container">
        <div>
          <b>Question:</b> {searchQuery}
        </div>
        <div>
          <b>Response:</b> 

          <Markdown
            rehypePlugins={[rehypeRaw]}
            children={results.join('')}
            components={{
              code(props) {
                let {children, className, node, ...rest} = props
                className = className && className.toLowerCase();
                const match = /language-(\w+)/.exec(className || '');
                return match ? (
                  <SyntaxHighlighter
                    {...rest}
                    PreTag="div"
                    children={String(children).replace(/\n$/, '')}
                    language={match[1]}
                    style={darkMode ? darkMarkdown : lightMarkdown}
                  />
                ) : (
                  <code {...rest} className={className}>
                    {children}
                  </code>
                )
              }
            }}
          />
          
        </div>
        <div>
          <b>Metadata:</b> {metadata.map((x) => <MetadataItem key={x.metadata.id} metadataItem={x} signer={getPresignedUrlAndRedirect} />)}
        </div>
      </div>
      </SpaceBetween>
    </Container>
  );
}

QAManager.propTypes = {
  models: PropTypes.arrayOf(PropTypes.shape({
    value: PropTypes.string
  })),
  inferenceURL: PropTypes.string.isRequired,
  creds: PropTypes.object.isRequired,
  region: PropTypes.string.isRequired,
  appConfig: PropTypes.object.isRequired,
};

function MetadataItem({metadataItem, signer}){
  const {metadata: {id, source, page},  content} = metadataItem;
  const cleanSource = source.replace('/tmp/', '');
  const displaySource = source.split('/').pop();

  return (
    <div>
      <div><b>ID:</b> {id}</div>
      <div><b>Source:</b> <Link onFollow={() => `${signer(cleanSource, parseInt(page)+1)}#page=${page}`}>{displaySource}</Link></div>
      <div><b>Page:</b> {page}</div>
      <div><b>Content:</b> <ExpandableText>{content}</ExpandableText></div>
    </div>
  );
}

// gneerate props types for metadataItem
MetadataItem.propTypes = {
  metadataItem: PropTypes.shape({
    metadata: PropTypes.shape({
      id: PropTypes.string,
      source: PropTypes.string,
      page: PropTypes.string
    }),
    content: PropTypes.string
  }),
  signer: PropTypes.func.isRequired
}

const ExpandableText = ({ children }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const text = children;
  const previewText = text.slice(0, 140);
  
  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <Box>
      {isExpanded ? (
        <>
          {text} <Button onClick={handleToggle} variant="link">[x]</Button>
        </>
      ) : (
        <>
          {previewText}{text.length > 140 && '...'} <Button onClick={handleToggle} variant="link">...</Button>
        </>
      )}
    </Box>
  );
};