# Full Stack Serverless Retrieval Augmented Generation Application on AWS
## Architecture

![Overall architecture diagram](./assets/architecture.png)

To learn more about this architecture, please refer to [this article](https://bit.ly/community-serverless-rag).

## Demo
![Application Demo](./assets/fsrag-demo.gif)

## Prerequisites

- NodeJS >= v18.18.2
- Docker
- AWS Cloud Development Kit (CDK) cli >= 2.142.1

## Installation

```sh
nvm use # makes use of node 18
npm install
```

### Deploy

* For greater access to LLMs (at the time of writing), deploy the stack in the `us-west-2` region.

```sh
cdk deploy
```

You should have a list of outputs in your console, similar to the following

```bash
Outputs:
LanceDbRagStack.FrontendConfigS3Path = s3://lancedbragstack-frontendbucketxxxxx-xxxx/appconfig.json
LanceDbRagStack.WebDistributionName = https://dxxxxxxxxxx.cloudfront.net
LanceDbRagStack.allowUnauthenticatedIdentities = true
LanceDbRagStack.authRegion = us-west-2
LanceDbRagStack.identityPoolId = us-west-2:xxxxxxxxxxxxxx
LanceDbRagStack.passwordPolicyMinLength = 8
LanceDbRagStack.passwordPolicyRequirements = ["REQUIRES_NUMBERS","REQUIRES_LOWERCASE","REQUIRES_UPPERCASE","REQUIRES_SYMBOLS"]
LanceDbRagStack.signupAttributes = ["email"]
LanceDbRagStack.userPoolId = us-west-2_xxxxxxxxxx
LanceDbRagStack.usernameAttributes = ["email"]
LanceDbRagStack.verificationMechanisms = ["email"]
LanceDbRagStack.webClientId = xxxxxxxxxxxxx
Stack ARN:
arn:aws:cloudformation:us-west-2:ACCOUNT_NUMBER:stack/LanceDbRagStack/XXXXXXXXXXXXXXXXXXXX
```

### Test
You'll find the URL of your application as the stack output named `LanceDbRagStack.WebDistributionName`.  
It looks something like `https://dxxxxxxxxxxx.cloudfront.net`

## Running locally

You can run this vite react app locally following these steps.

### 1. Deploy infrastructure to AWS

Follow [instructions above](#installation) to deploy the cdk app.

### 2. Obtain environment configuration

Run the script 
```bash
./fetch-frontend-config.sh LanceDbRagStack
```

This will copy the file `appconfig.json` into `./resources/ui/public/` from the bucket where the front-end is hosted.  
This is all public information that the front-end application uses to interact with the backend.  
You can modify it to point it to an alternative backend stack for development purposes.

Alternatively, run the following command and replace the placeholders with values taken from the stack's output

```bash
aws s3 cp ${LanceDbRagStack.FrontendConfigS3Path} ./resources/ui/public/
```

#### Example Configuration File
```json
{
    "inferenceURL": "https://xxxxxxxxxxxxx.lambda-url.us-west-2.on.aws/",
    "websocketURL": "wss://xxxxxxxxxx.execute-api.us-west-2.amazonaws.com/Prod",
    "websocketStateTable": "LanceDbRagStack-websocketStateTable-xxxxxxxx",
    "region": "us-west-2",
    "bucketName": "lancedbragstack-documentsbucket-xxxxxxxxx",
    "auth": {
        "user_pool_id": "us-west-2_XXXXXXXXXX",
        "aws_region": "us-west-2",
        "user_pool_client_id": "XXXXXXXXXX",
        "identity_pool_id": "us-west-2:XXXXX-XXXX-XXXXXX",
        "standard_required_attributes": [
            "email"
        ],
        "username_attributes": [
            "email"
        ],
        "user_verification_types": [
            "email"
        ],
        "password_policy": {
            "min_length": 8,
            "require_numbers": true,
            "require_lowercase": true,
            "require_uppercase": true,
            "require_symbols": true
        },
        "unauthenticated_identities_enabled": true
    },
    "version": "1",
    "storage": {
        "bucket_name": "lancedbragstack-documentsbucket-XXXXXXXXXXX",
        "aws_region": "us-west-2"
    }
}
```

### 3. Run local dev server

```sh
cd resources/ui
npm run dev
```

## Authors

**Giuseppe Battista** is a Senior Solutions Architect at Amazon Web Services. He leads soultions architecture for Early Stage Startups in UK and Ireland. He hosts the Twitch Show "Let's Build a Startup" on [twitch.tv/aws](https://bit.ly/basup-twitch) and he's head of Unicorn's Den accelerator.   
Follow Giuseppe on [LinkedIn](https://bit.ly/43l7eEb)  

**Kevin Shaffer-Morrison** is a Senior Solutions Architect at Amazon Web Services. He's helped hundreds of startups get off the ground quickly and up into the cloud. Kevin focuses on helping the earliest stage of founders with code samples and Twitch live streams.  
Follow Kevin on [LinkedIn](https://www.linkedin.com/in/kshaffermorrison)

**Anthony Bernabeu** is a Senior IoT Prototyping Architect at Amazon Web Services. He builds, jointly with customers, the most exciting and innovative IoT and Generative Ai prototypes on AWS.  
Follow Anthony on [LinkedIn](https://bit.ly/4ehuyrg)
