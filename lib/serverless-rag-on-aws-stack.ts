// TODO: split this into multiple stacks

import {
  Stack,
  StackProps,
  RemovalPolicy,
  Duration,
  aws_lambda as lambda,
  aws_lambda_event_sources as lambdaEventSources,
  aws_iam as iam,
  aws_dynamodb as dynamodb,
  aws_sqs as sqs,
  aws_s3 as s3,
  aws_s3_notifications as s3Notifications,
  aws_apigatewayv2 as apigw,
  aws_apigatewayv2_authorizers as apigwAuth,
  aws_apigatewayv2_integrations as integrations,
  aws_cloudfront as cloudfront,
  aws_s3_deployment as s3Deploy,
  CfnOutput,
  aws_lambda_nodejs as node,
  DockerImage,
  aws_ssm as ssm,
} from 'aws-cdk-lib';

import * as path from "path";
import { Construct } from 'constructs';
import { AmplifyAuth } from '@aws-amplify/auth-construct';
import {
  ExecSyncOptionsWithBufferEncoding,
  execSync,
} from "node:child_process";
import { Utils } from "./utils";
import * as fs from 'fs';
import * as yaml from 'js-yaml';

const pythonRuntime = lambda.Runtime.PYTHON_3_11;
const lambdaArchitecture = lambda.Architecture.X86_64;


export class ServerlessRagOnAws extends Stack {

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // BACKEND

    const dlq = new sqs.Queue(this, 'DeadLetterQueue', {
      visibilityTimeout: Duration.seconds(300)
    });

    const queue = new sqs.Queue(this, 'DocumentProcessingQueue', {
      visibilityTimeout: Duration.seconds(320),
      deadLetterQueue: {
        maxReceiveCount: 5,
        queue: dlq
      },
    });

    const lanceDbVectorBucket = new s3.Bucket(this, "LanceDBVectorBucket", {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // create a s3 bucket for documents to be ingested into the vector store
    const documentsBucket = new s3.Bucket(this, "documents-bucket", {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Add S3 event notification to SQS for object creation for pdfs only
    documentsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED, 
      new s3Notifications.SqsDestination(queue),
      {suffix: ".pdf"}
    );

    // Add S3 event notification to SQS for object creation for PDFs only
    documentsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED, 
      new s3Notifications.SqsDestination(queue),
      {suffix: ".PDF"}
    );

    // Add S3 event notification to SQS for object deletion
    documentsBucket.addEventNotification(
      s3.EventType.OBJECT_REMOVED, 
      new s3Notifications.SqsDestination(queue),
      {suffix: ".pdf"}
    );

    // Add S3 event notification to SQS for object deletion
    documentsBucket.addEventNotification(
      s3.EventType.OBJECT_REMOVED, 
      new s3Notifications.SqsDestination(queue),
      {suffix: ".PDF"}
    );

    /* dynamodb table for document registry */
    const documentRegistryTable = new dynamodb.Table(this, 'documentRegistryTable', {
      partitionKey: { name: 'md5', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 's3_path', type: dynamodb.AttributeType.STRING },
      tableClass: dynamodb.TableClass.STANDARD,
      pointInTimeRecovery: false,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY
    });

    const documentRegistryTableIndexOnS3Path : string = 's3_path_index';

    documentRegistryTable.addGlobalSecondaryIndex({
      indexName: documentRegistryTableIndexOnS3Path,
      partitionKey: { name: 's3_path', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const websocketStateTable = new dynamodb.Table(this, 'websocketStateTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      tableClass: dynamodb.TableClass.STANDARD,
      pointInTimeRecovery: false,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // FRONT-END

    // create a s3 bucket to host the frontend
    const frontendBucket = new s3.Bucket(this, "FrontendBucket", {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Create an Origin Access Identity
    const oai = new cloudfront.OriginAccessIdentity(this, 'OAI');

    // Create the CloudFront distribution
    const webDistribution = new cloudfront.CloudFrontWebDistribution(this, 'WebDistribution', {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      defaultRootObject: 'index.html',
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: frontendBucket,
            originAccessIdentity: oai,
          },
          behaviors: [{ isDefaultBehavior: true }],
        },
      ],
    });

    const invalidateLambda = new lambda.Function(this, 'InvalidateLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/frontend-invalidation/'),
      environment: {
          DISTRIBUTION_ID: webDistribution.distributionId
      },
      timeout: Duration.seconds(300),
    });

    const distributionArn = `arn:aws:cloudfront::${this.account}:distribution/${webDistribution.distributionId}`;


    // Grant the Lambda function permission to invalidate CloudFront distributions
    invalidateLambda.addToRolePolicy(new iam.PolicyStatement({
        actions: ['cloudfront:CreateInvalidation'],
        resources: [distributionArn], // Consider restricting this to specific resources
    }));

    // Add the S3 event notification to trigger the Lambda function on index.html update
    frontendBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3Notifications.LambdaDestination(invalidateLambda), {
        prefix: 'index.html',
    });

    // Update the S3 bucket policy to allow access only from the OAI
    frontendBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [frontendBucket.arnForObjects('*')],
      principals: [new iam.CanonicalUserPrincipal(oai.cloudFrontOriginAccessIdentityS3CanonicalUserId)],
    }));

    // add cors from web distribution domain name for all http methods
    documentsBucket.addCorsRule({
      allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD, s3.HttpMethods.PUT, s3.HttpMethods.POST, s3.HttpMethods.DELETE],
      allowedOrigins: [
        `https://${webDistribution.distributionDomainName}`,
        'http://localhost:5173',
        'https://localhost:5173'
      ],
      allowedHeaders: ['*']
    });


    // Cognito auth stack
    const frontendAuth = new AmplifyAuth(this, 'frontendAuth', {
      loginWith: {
        email: true
      }
    });

    const userPoolId = frontendAuth.resources.userPool.userPoolId;
    const userPoolClientId = frontendAuth.resources.userPoolClient.userPoolClientId;
    const identityPoolAuthenticatedRole = frontendAuth.resources.authenticatedUserIamRole;
    const identityPoolId = frontendAuth.resources.cfnResources.cfnIdentityPool.ref;

     // WebSocket Stack
     const webSocketApi = new apigw.WebSocketApi(this, 'WebSocketApi', {
      apiName: 'WebSocketApi',
      routeSelectionExpression: '$request.body.action',
    });

    // Create the WebSocket API stage
    const deployment = new apigw.WebSocketStage(this, 'WebSocketDeployment', {
      webSocketApi,
      stageName: 'Prod',
      autoDeploy: true,
    });

    // Read the prompt-templates YAML file
    const filePath = path.join(__dirname, 'prompt-templates.yml');
    const fileContents = fs.readFileSync(filePath, 'utf8');
    // Parse the prompt-templates YAML file
    const data = yaml.load(fileContents) as Record<string, string>;

    // Create the SSM parameters
    for (const key in data) {
      new ssm.StringParameter(this, `${key}SSMParameter`, {
        parameterName: `/${this.stackName}/default/${key}`,
        stringValue: data[key],
      });
    }

    // Lambda function for authorizer
    const authorizerFunction = new node.NodejsFunction(this, 'WsLambdaAuthorizer', {
      entry: path.join(__dirname, '../lambda/websocket-authorizer/index.mjs'),
      bundling: {
        minify: true,
        nodeModules: [
          'aws-jwt-verify'
        ]
      },
      depsLockFilePath: path.join(__dirname, '../lambda/websocket-authorizer/package-lock.json'),
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambdaArchitecture,
      timeout: Duration.seconds(3),
      memorySize: 128,
      environment: {
        COMMA_SEPARATED_ORIGINS: `https://${webDistribution.distributionDomainName}`,
        USER_POOL_ID: userPoolId,
        APP_CLIENT_ID: userPoolClientId
      },
    });

    // Authorizer permission for API Gateway
    new lambda.CfnPermission(this, 'AuthInvokePermission', {
      action: 'lambda:InvokeFunction',
      principal: 'apigateway.amazonaws.com',
      functionName: authorizerFunction.functionName,
    });

    // Lambda function for WebSocket API routes
    const webSocketLambda = new lambda.Function(this, 'WebSocketLambda', {
      code: lambda.Code.fromAsset('lambda/websocket-handler/'),
      handler: 'index.handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: {
        WEBSOCKET_ENDPOINT: `https://${webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${deployment.stageName}`,
      },
    });

    // Grant permissions to the Lambda function
    webSocketLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['execute-api:ManageConnections'],
      resources: ['*'],
    }));

    // Create the Lambda integrations
    const defaultIntegration = new integrations.WebSocketLambdaIntegration('DefaultIntegration', webSocketLambda);
    const connectIntegration = new integrations.WebSocketLambdaIntegration('ConnectIntegration', webSocketLambda);
    const disconnectIntegration = new integrations.WebSocketLambdaIntegration('DisconnectIntegration', webSocketLambda);
    const messageIntegration = new integrations.WebSocketLambdaIntegration('MessageIntegration', webSocketLambda);
    const whoamiIntegration = new integrations.WebSocketLambdaIntegration('WhoamiIntegration', webSocketLambda);

    // Create the authorizer
    // INFO: the authentication strategy for the authorizer is to check the Origin header
    // Not the best from security perspective. If we want to harden this, we should probably
    // look into IAM authentication, given we have a Cognito users
    const authorizer = new apigwAuth.WebSocketLambdaAuthorizer('WebsocketAuhtorizer', authorizerFunction, {
      identitySource: ['route.request.multivalueheader.Origin']
    });

    // Create the routes
    webSocketApi.addRoute('$default', {
      integration: defaultIntegration,
    });
    webSocketApi.addRoute('$connect', {
      integration: connectIntegration,
      authorizer
    });
    webSocketApi.addRoute('$disconnect', {
      integration: disconnectIntegration,
    });
    // this route is used to send messages to the front-end
    webSocketApi.addRoute('message', {
      integration: messageIntegration,
    });

    // this route is used from the front-end to get the connection id
    // the front-end will then update the websocket status table
    webSocketApi.addRoute('whoami', {
      integration: whoamiIntegration,
    });

    // Lambda permissions for routes
    this.addLambdaPermission('LambdaPermissionForDefault', webSocketLambda, webSocketApi, '$default');
    this.addLambdaPermission('LambdaPermissionForConnect', webSocketLambda, webSocketApi, '$connect');
    this.addLambdaPermission('LambdaPermissionForDisconnect', webSocketLambda, webSocketApi, '$disconnect');
    this.addLambdaPermission('LambdaPermissionForMessage', webSocketLambda, webSocketApi, 'message');
    this.addLambdaPermission('LambdaPermissionForWhoami', webSocketLambda, webSocketApi, 'whoami');

    const lambdaDocumentProcessorFunction_Docker = new lambda.DockerImageFunction(this, "lambdaDocumentProcessorFunctioDocker", {
      code: lambda.DockerImageCode.fromImageAsset('./lambda/document-processor', {
        cmd: ["app.lambda_handler"],
        file: 'Dockerfile',
      }),
      architecture: lambda.Architecture.X86_64,
      memorySize: 2048,
      // we want to limit the maximum number of concurrent executions to one until LanceDB supports concurrent writers
      // As of now, LanceDB provides a solution for concurrents write but in experimental mode:
      // https://lancedb.github.io/lance/read_and_write.html#concurrent-writer-on-s3-using-dynamodb
      reservedConcurrentExecutions: 1, 
      timeout: Duration.minutes(5),
      environment: {
        WEBSOCKET_ENDPOINT: `wss://${webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${deployment.stageName}`,
        DYNAMODB_WEBSOCKET_STATE_TABLE: websocketStateTable.tableName,
        SQS_QUEUE_URL: queue.queueUrl,
        DYNAMODB_DOCUMENT_REGISTRY_TABLE: documentRegistryTable.tableName,
        DYNAMODB_MD5_BY_S3_PATH_INDEX: documentRegistryTableIndexOnS3Path,
        LANCEDB_BUCKET: lanceDbVectorBucket.bucketName
      },
    });

    // event source mapping for SQS queue
    const sqsEventSource = new lambdaEventSources.SqsEventSource(queue, {
      batchSize: 5
    });

    lambdaDocumentProcessorFunction_Docker.addEventSource(sqsEventSource);

    documentRegistryTable.grantReadWriteData(lambdaDocumentProcessorFunction_Docker);
    websocketStateTable.grantReadWriteData(lambdaDocumentProcessorFunction_Docker);
    queue.grantConsumeMessages(lambdaDocumentProcessorFunction_Docker);
    lanceDbVectorBucket.grantReadWrite(lambdaDocumentProcessorFunction_Docker);
    lanceDbVectorBucket.grantDelete(lambdaDocumentProcessorFunction_Docker);
    documentsBucket.grantReadWrite(lambdaDocumentProcessorFunction_Docker);

    // add policy for an authenticated user to interact with its own connection state
    frontendAuth.resources.authenticatedUserIamRole.attachInlinePolicy(
      new iam.Policy(this, 'authenticatedUserIamRolePolicy-websocketState', {
        statements: [
          new iam.PolicyStatement({
            actions: [
              "dynamodb:DeleteItem",
              "dynamodb:GetItem",
              "dynamodb:PutItem",
              "dynamodb:Query",
              "dynamodb:UpdateItem"
            ],
            resources: [websocketStateTable.tableArn],
            conditions: {
              "ForAllValues:StringEquals": {
                "dynamodb:LeadingKeys": [
                  "${cognito-identity.amazonaws.com:sub}" // maps to Amplify's identityId not to User Pool sub ¯\_(ツ)_/¯
                ]
              }
            }
          })
        ]
      })
    );

    // add policy for an authenticated user to interact with the document registry
    frontendAuth.resources.authenticatedUserIamRole.attachInlinePolicy(
      new iam.Policy(this, 'authenticatedUserIamRolePolicy-s3-ingest', {
        statements: [
          new iam.PolicyStatement({
            actions: [
              "s3:PutObject",
              "s3:GetObject",
              "s3:ListBucket",
              "s3:DeleteObject"
            ],
            resources: [
              documentsBucket.bucketArn,
              documentsBucket.arnForObjects("private/${cognito-identity.amazonaws.com:sub}/*")
            ]
          })
        ]
      })
    );

    // add policy for an authenticated user to list Foundation Models from Bedrock
    frontendAuth.resources.authenticatedUserIamRole.attachInlinePolicy(
      new iam.Policy(this, 'authenticatedUserIamRolePolicy-bedrock-models', {
        statements: [
          new iam.PolicyStatement({
            actions: [
              "bedrock:ListFoundationModels"
            ],
            resources: ["*"]
          })
        ]
      })
    );

    frontendAuth.resources.authenticatedUserIamRole.attachInlinePolicy(
      new iam.Policy(this, 'authenticatedUserIamRolePolicy-ssm', {
        statements: [
          new iam.PolicyStatement({
            actions: [
              'ssm:GetParameter',
              'ssm:GetParameters',
              'ssm:GetParameterHistory',
              'ssm:GetParametersByPath'
            ],
            resources: [
              `arn:aws:ssm:${this.region}:${this.account}:parameter/${this.stackName}/default*`,
              `arn:aws:ssm:${this.region}:${this.account}:parameter/${this.stackName}/` + "${cognito-identity.amazonaws.com:sub}*",
            ]
      })
        ]
      })
    );


    // Create Inference Lambda function
    const lambdaInferenceFunction = new lambda.DockerImageFunction(this, 'lambdaInferenceFunction', {
      code: lambda.DockerImageCode.fromImageAsset('./lambda/inference', {
        cmd: ["index.handler"],
        file: 'Dockerfile',
      }),
      architecture: lambda.Architecture.X86_64,
      memorySize: 2048,
      timeout: Duration.seconds(300),
      environment: {
        s3BucketName: lanceDbVectorBucket.bucketName,
        region: this.region,
        stackName: this.stackName,
        LANGCHAIN_VERBOSE: 'true',
        USER_POOL_ID: frontendAuth.resources.userPool.userPoolId,
        IDENTITY_POOL_ID: frontendAuth.resources.cfnResources.cfnIdentityPool.ref
      }
    });

    // Grant necessary permissions to the Lambda function to invoke Bedrock
    lambdaInferenceFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
        'ssm:GetParameter',
      ],
      resources: ['*'],
    }));
    // Grant necessary permissions to the Lambda Processor function to invoke Bedrock
    lambdaDocumentProcessorFunction_Docker.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: ['*'],
    }));

    // Grant ManageConnection to Lambda Processor Function
    lambdaDocumentProcessorFunction_Docker.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'execute-api:ManageConnections',
      ],
      resources: ['*'],
    }));

    // Grant necessary permissions to the lambda function to get identity from Cognito idToken
    lambdaInferenceFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-identity:GetId',
        'cognito-identity:GetCredentialsForIdentity',
      ],
      resources: ['*'],
    }));

    lambdaInferenceFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:GetObject'],
      resources: [`${lanceDbVectorBucket.bucketArn}/*`, lanceDbVectorBucket.bucketArn],
    }));

    lambdaInferenceFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:ListBucket'],
      resources: [ lanceDbVectorBucket.bucketArn],
    }));

    // Create Lambda function URL
    const inferenceUrl = new lambda.FunctionUrl(this, 'FunctionUrl', {
      function: lambdaInferenceFunction,
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
      cors: {
        allowCredentials: true,
        allowedHeaders: ['x-amz-security-token', 'x-amz-date', 'x-amz-content-sha256', 'referer', 'content-type', 'accept', 'authorization'],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedOrigins: ['*'],
        maxAge: Duration.seconds(0),
      },
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
    });

    // add policy for an authenticated user to invoke the inference function via function url
    frontendAuth.resources.authenticatedUserIamRole.attachInlinePolicy(
      new iam.Policy(this, 'authenticatedUserIamRolePolicy-lambda-document-loader', {
        statements: [
          new iam.PolicyStatement({
            actions: [
              "lambda:InvokeFunctionUrl"
            ],
            resources: [lambdaInferenceFunction.functionArn]
          })
        ]
      })
    );

    // generate configuration file for the front-end
    const configFileBody = {
      inferenceURL: inferenceUrl.url,
      websocketURL: `wss://${webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${deployment.stageName}`,
      websocketStateTable: websocketStateTable.tableName,
      region: this.region,
      // this must be the document bucket becuase this configuration
      // is for the Amplify StorageManager component
      bucketName: documentsBucket.bucketName,
      auth: {
        user_pool_id: userPoolId,
        aws_region: this.region,
        user_pool_client_id:userPoolClientId,
        identity_pool_id: identityPoolId,
        standard_required_attributes: ["email"],
        username_attributes: ["email"],
        user_verification_types: ["email"],
        password_policy: {
          min_length: 8,
          require_numbers: true,
          require_lowercase: true,
          require_uppercase: true,
          require_symbols: true
        },
        unauthenticated_identities_enabled: true
      },
      version: "1",
      storage: {
        // this must be the document bucket again
        bucket_name: documentsBucket.bucketName,
        aws_region: this.region
      }
    };

    // deploy to front-end bucket under appconfig.json using the s3 deployment construct
    const exportAppConfig = s3Deploy.Source.jsonData('appconfig.json', configFileBody)

    const appPath = path.join(__dirname, "..", "resources", "ui");
    const buildPath = path.join(appPath, "dist");

    const asset = s3Deploy.Source.asset(appPath, {
      bundling: {
        image: DockerImage.fromRegistry(
          "public.ecr.aws/sam/build-nodejs18.x:latest"
        ),
        command: [
          "sh",
          "-c",
          [
            "npm --cache /tmp/.npm install",
            `npm --cache /tmp/.npm run build`,
            "cp -aur /asset-input/dist/* /asset-output/",
          ].join(" && "),
        ],
        local: {
          tryBundle(outputDir: string) {
            try {
              const options: ExecSyncOptionsWithBufferEncoding = {
                stdio: "inherit",
                env: {
                  ...process.env,
                },
              };

              execSync(`npm --silent --prefix "${appPath}" ci`, options);
              execSync(`npm --silent --prefix "${appPath}" run build`, options);
              Utils.copyDirRecursive(buildPath, outputDir);
            } catch (e) {
              console.error(e);
              return false;
            }
            return true;
          },
        },
      },
    });

    const frontendConfigDeployment = new s3Deploy.BucketDeployment(this, 'FrontEndConfigFile', {
      sources: [asset, exportAppConfig],
      destinationBucket: frontendBucket,
      prune: false,
      memoryLimit: 512
    });

    new CfnOutput(this, "WebDistributionName", {
      value: `https://${webDistribution.distributionDomainName}`,
    });

    new CfnOutput(this, "FrontendConfigS3Path", {
      value: `s3://${frontendBucket.bucketName}/appconfig.json`,
    });

  }

  private addLambdaPermission(id: string, func: lambda.Function, api: apigw.WebSocketApi, routeKey: string) {
    new lambda.CfnPermission(this, id, {
      action: 'lambda:InvokeFunction',
      principal: 'apigateway.amazonaws.com',
      functionName: func.functionName,
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${api.apiId}/*/${routeKey}`,
    });
  }
}
