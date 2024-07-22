import { LanceDB }from "@langchain/community/vectorstores/lancedb";
import { BedrockEmbeddings } from "@langchain/community/embeddings/bedrock";
import { connect } from "vectordb"; // LanceDB
import { formatDocumentsAsString } from "langchain/util/document";
import { CognitoIdentityClient, GetIdCommand } from "@aws-sdk/client-cognito-identity";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import jwt from "jsonwebtoken";
import { BedrockClient, ListFoundationModelsCommand } from "@aws-sdk/client-bedrock";
import { BedrockRuntimeClient, ConverseStreamCommand, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

const lanceDbSrc = process.env.s3BucketName;
const awsRegion = process.env.region;
const stackName = process.env.stackName;
const embeddingModel = process.env.EMBEDDING_MODEL;

let foundationModels = [];

const client = new BedrockClient({ region: awsRegion });
const bedrockRuntimeClient = new BedrockRuntimeClient({ region: awsRegion });

const isResponseStreamingSupported = async (modelId) => {

    let streaming = false;

    if (foundationModels.length === 0) {
        const command = new ListFoundationModelsCommand({});
    
        const response = await client.send(command);
        const models = response.modelSummaries;
    
        console.log("Listing the available Bedrock foundation models:");
    
        foundationModels = models.filter(
            (m) => m.modelLifecycle.status === "ACTIVE",
        );
    }

    const modelInfo = foundationModels.filter(
        (m) => m.modelId === modelId,
    );

    streaming = modelInfo.length == 1 ? modelInfo[0].responseStreamingSupported : false


    return streaming;
  };

const runChain = async ({identityId, query, model, streamingFormat, promptOverride, history}, responseStream) => {

    let db, table, vectorStore, embeddings, retriever;

    // if it cannot establish connection to a LanceDB table, the user's knowledge base is empty
    // treat this as non-fatal error and no context will be provided to the LLM.
    try{
    
        db = await connect(`s3://${lanceDbSrc}/embeddings/${identityId}`);
        table = await db.openTable(identityId);
        embeddings = new BedrockEmbeddings({region:awsRegion, model:embeddingModel});
        vectorStore = new LanceDB(embeddings, {table});
        retriever = vectorStore.asRetriever();

    }catch(error){
        console.log("Could not load user's Lance table. Probably they haven't uploaded any documents yet", error);
    }

    console.log('identityId', identityId);
    console.log('query', query);
    console.log('model', model);
    console.log('streamingFormat', streamingFormat);
  
    // TODO: should we initailize this outside and pass it a as a dependency?
    const ssmClient = new SSMClient({region:awsRegion});

    // try to fetch defalut system prompts
    // if no default prompts are found, treat it as a fatal error
    let promptHeader, noContextFooter, contextFooter;
    try {
        [promptHeader, noContextFooter, contextFooter] = await Promise.all([
            getSSMParameter(ssmClient, 'promptHeader'),
            getSSMParameter(ssmClient, 'noContextFooter'),
            getSSMParameter(ssmClient, 'contextFooter'),
        ]);
    } catch (error) {
        console.error('An error occurred while fetching SSM parameters:', error);
        responseStream.write(`An error occurred while fetching prompts from SSM parameters.\n ${error.message}`);
        responseStream.end();
        return;
    }

    // load user overrides
    // if a user override is present, honour it
    promptHeader = promptOverride.promptHeader || promptHeader;
    noContextFooter = promptOverride.noContextFooter || noContextFooter;
    contextFooter = promptOverride.contextFooter || contextFooter;

    let streaming = false;

    try {
        streaming =  await isResponseStreamingSupported(model || 'anthropic.claude-instant-v1')
    }
    catch (e) {
        console.log(e);
        responseStream.write(`An error occurred while listing foundation models.\n ${e.message}`);
        responseStream.end();
        return;
    }

    let docs, docsAsString, documentMetadata;

    // if no documents are found, treat it as a non-fatal error
    try{
        docs = await retriever.invoke(query);
        docsAsString = formatDocumentsAsString(docs);
        documentMetadata = docs.map(d=>{return{content: d.pageContent, metadata: d.metadata}});
    }catch(error){
        console.log(error);
        docs = [];
        docsAsString = '';
        documentMetadata = [];
    }

    let compiledPrompt;

    if(!docs || docs.length === 0){

        compiledPrompt = String(
            promptHeader + noContextFooter
        )
        .replace('{context}', docsAsString)
        .replace('{question}',query);

    }else{
        compiledPrompt = String(
            promptHeader + contextFooter
        )
        .replace('{context}', docsAsString)
        .replace('{question}',query);
    }

    console.log(compiledPrompt);

    const conversation = [
        ...history,
        {
          role: "user",
          content: [{ text: compiledPrompt }],
        },
    ];
    
    let stream;

    try{         
        // sending metadata as first part of the response surrounded by the sequence _~_ for front-end parsing   
        responseStream.write(`_~_${JSON.stringify(documentMetadata)}_~_\n\n`);

        if (streaming){
            const command = new ConverseStreamCommand({
                modelId: model,
                messages: conversation,
                inferenceConfig: { maxTokens: 1000, temperature: 0.0, topP: 0.9 },
            });
            const response = await bedrockRuntimeClient.send(command);
            // Extract and print the streamed response text in real-time.
            for await (const item of response.stream) {
                if (item.contentBlockDelta) {
                    console.log(item.contentBlockDelta.delta?.text);
                    switch (streamingFormat) {
                        case 'fetch-event-source':
                            responseStream.write(`event: message\n`);
                            responseStream.write(`data: ${item.contentBlockDelta.delta?.text}\n\n`);
                            break;
                        default:
                            responseStream.write(item.contentBlockDelta.delta?.text);
                            break;
                    }
                }
            }
        } else {
            const command = new ConverseCommand({
                modelId: model,
                messages: conversation,
                inferenceConfig: { maxTokens: 1000, temperature: 0.0, topP: 0.9 },
            });

            const response = await bedrockRuntimeClient.send(command);
            const responseText = response.output.message.content[0].text;
            console.log(responseText);
            switch (streamingFormat) {
                case 'fetch-event-source':
                    responseStream.write(`event: message\n`);
                    responseStream.write(`data: ${responseText}\n\n`);
                    break;
                default:
                    responseStream.write(responseText);
                    break;
            }
        }
    }catch(e){
        console.log(e);
        responseStream.write(`An error occurred while invoking the selected model.\n ${e.message}`);
    }
    finally{
        responseStream.end();
    }
  };

const  parseBase64 = message => JSON.parse(Buffer.from(message, "base64").toString("utf-8"));

// Initialize the Cognito Identity client
const cognitoIdentity = new CognitoIdentityClient({ region: awsRegion });

const parseIdToken = async (event) => {

    const {idToken} = JSON.parse(event.body);

    console.log("User token");
    console.log(idToken);

    if (!idToken) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'ID token is missing' }),
        };
    }

    // Get IdentityPoolId and UserPoolId from environment variables
    const IdentityPoolId = process.env.IDENTITY_POOL_ID;
    const UserPoolId = process.env.USER_POOL_ID;

    if (!IdentityPoolId || !UserPoolId) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Environment variables for IdentityPoolId or UserPoolId are missing' }),
        };
    }

    try {
        // Decode the ID token to extract claims
        const decodedToken = jwt.decode(idToken);

        if (!decodedToken) {
            throw new Error('Invalid ID token');
        }

        const { sub } = decodedToken; // This is the Cognito user pool ID (sub)
        console.log('Decoded token sub:', sub);

        // Populate the Logins property
        const logins = {
            [`cognito-idp.${awsRegion}.amazonaws.com/${UserPoolId}`]: idToken
        };

        // Get Identity ID using the ID token
        const params = {
            IdentityPoolId,
            Logins: logins
        };

        const command = new GetIdCommand(params);
        const identityIdResponse = await cognitoIdentity.send(command);
        const identityId = identityIdResponse.IdentityId;

        console.log('Identity ID:', identityId);

        return {
            statusCode: 200,
            message: 'Successfully retrieved identityId',
            identityId: identityId
        };
    } catch (error) {
        console.error('Error getting identityId:', error);

        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Failed to get identityId',
                error: error.message,
            }),
        };
    }
};

const getSSMParameter = async (ssmClient, name) => {
    const defaultParameterKey = `/${stackName}/default/${name}`;
    const command = new GetParameterCommand({ Name: defaultParameterKey, WithDecryption: true });
    const response = await ssmClient.send(command);
    return response.Parameter.Value;
};

export const handler = awslambda.streamifyResponse(async (event, responseStream, _context) => {
    console.log(JSON.stringify(event));
    const {
        identityId, statusCode, body: responseBody
    } = await parseIdToken(event);

    if(statusCode !== 200){
        responseStream.write(responseBody);
        responseStream.end();
        return;
    }

    console.log("run on behalf of:", identityId)

    let body = event.isBase64Encoded ? parseBase64(event.body) : JSON.parse(event.body);
    await runChain({...body, identityId}, responseStream);
    console.log(JSON.stringify({"status": "complete"}));
});

/*
Sample event 1:
{
    "query": "What models are available in Amazon Bedrock?",
}
Sample event 2:
{
    "query": "What models are available in Amazon Bedrock?",
    "model": "anthropic.claude-instant-v1"
}
Sample event 3:
{
    "query": "What models are available in Amazon Bedrock?",
    "model": "anthropic.claude-v2",
    "streamingFormat": "fetch-event-source"
}
Sample event 4:
{
    "query": "What models are available in Amazon Bedrock?",
    "model": "anthropic.claude-v2",
    "promptOverride": {
        "promptHeader": "Custom prompt header",
        "noContextFooter": "Custom no context footer",
        "contextFooter": "Custom context footer"
    }
}
*/