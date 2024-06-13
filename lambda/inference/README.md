# AWS Lambda Function for Querying with Bedrock Models

This AWS Lambda function processes queries using Amazon Bedrock models, integrates with LanceDB for vector storage, and retrieves the identity ID from AWS Cognito. It supports streaming responses in different formats.

## Table of Contents

- [AWS Lambda Function for Querying with Bedrock Models](#aws-lambda-function-for-querying-with-bedrock-models)
  - [Table of Contents](#table-of-contents)
  - [Environment Variables](#environment-variables)
  - [Usage](#usage)
  - [Sample Events](#sample-events)

## Environment Variables

The Lambda function requires the following environment variables to be set:

- `s3BucketName`: The S3 bucket name where LanceDB embeddings are stored.
- `region`: The AWS region for your services.
- `IDENTITY_POOL_ID`: The Cognito Identity Pool ID.
- `USER_POOL_ID`: The Cognito User Pool ID.

## Usage

Invoke the Lambda function via Lambda Function URL. Ensure that the request includes the necessary ID token.

### Example Request

```json
{
    "idToken": "your-id-token",
    "query": "What models are available in Amazon Bedrock?",
    "model": "anthropic.claude-instant-v1",
    "streamingFormat": "fetch-event-source"
}
```

## Sample Events

### Sample Event 1

```json
{
    "query": "What models are available in Amazon Bedrock?"
}
```

### Sample Event 2

```json
{
    "query": "What models are available in Amazon Bedrock?",
    "model": "anthropic.claude-instant-v1"
}
```

### Sample Event 3

```json
{
    "query": "What models are available in Amazon Bedrock?",
    "model": "anthropic.claude-v2",
    "streamingFormat": "fetch-event-source"
}
```
