import { LanceDB }from "@langchain/community/vectorstores/lancedb";
import { BedrockEmbeddings } from "@langchain/community/embeddings/bedrock";
import { connect } from "vectordb"; // LanceDB
import { PromptTemplate } from "@langchain/core/prompts";
import { BedrockChat } from "@langchain/community/chat_models/bedrock";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence, RunnablePassthrough } from "@langchain/core/runnables";
import { formatDocumentsAsString } from "langchain/util/document";
import { CognitoIdentityClient, GetIdCommand } from "@aws-sdk/client-cognito-identity";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import jwt from "jsonwebtoken";

const lanceDbSrc = process.env.s3BucketName;
const awsRegion = process.env.region;
const stackName = process.env.stackName;

const runChain = async ({identityId, query, model, streamingFormat, promptOverride}, responseStream) => {
    const db = await connect(`s3://${lanceDbSrc}/embeddings/${identityId}`);
    const table = await db.openTable(identityId);

    console.log('identityId', identityId);
    console.log('query', query);
    console.log('model', model);
    console.log('streamingFormat', streamingFormat);
  
    const embeddings = new BedrockEmbeddings({region:awsRegion});
    const vectorStore = new LanceDB(embeddings, {table});
    const retriever = vectorStore.asRetriever();

    const ssmClient = new SSMClient({region:awsRegion});

    let promptHeader, noContextFooter, contextFooter;
    try {
        [promptHeader, noContextFooter, contextFooter] = await Promise.all([
            getSSMParameter(ssmClient, 'promptHeader'),
            getSSMParameter(ssmClient, 'noContextFooter'),
            getSSMParameter(ssmClient, 'contextFooter'),
        ]);
    } catch (error) {
        console.error('An error occurred while fetching SSM parameters:', error);
        responseStream.write(`An error occurred while fetching prompts from SSM parameters.\n ${e.message}`);
        responseStream.end();
        return;
    }

    // if a user override is present, honour it
    promptHeader = promptOverride.promptHeader || promptHeader;
    noContextFooter = promptOverride.noContextFooter || noContextFooter;
    contextFooter = promptOverride.contextFooter || contextFooter;

    const llmModel = new BedrockChat({
        model: model || 'anthropic.claude-instant-v1',
        region: awsRegion,
        streaming: true,
        maxTokens: 1000,
    });

    let docs, docsAsString, documentMetadata;

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
        compiledPrompt = PromptTemplate.fromTemplate(promptHeader + noContextFooter);
    }else{
        compiledPrompt = PromptTemplate.fromTemplate(promptHeader + contextFooter);
    }

    const chain = RunnableSequence.from([
        {
            context: () => docsAsString,
            question: new RunnablePassthrough(query)
        },
        compiledPrompt,
        llmModel,
        new StringOutputParser()
    ]);

    let stream;
    try{
        stream = await chain.stream(query);
    }catch(e){
        console.log(e);
        responseStream.write(`An error occurred while invoking the selected model.\n ${e.message}`);
        responseStream.end();
        return;
    }

    responseStream.write(`_~_${JSON.stringify(documentMetadata)}_~_\n\n`);
    for await (const chunk of stream){
        console.log(chunk);
        switch (streamingFormat) {
            case 'fetch-event-source':
                responseStream.write(`event: message\n`);
                responseStream.write(`data: ${chunk}\n\n`);
                break;
            default:
                responseStream.write(chunk);
                break;
        }
    }
    responseStream.end();

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