#!/bin/bash

# Check if stack name is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <stack-name>"
    exit 1
fi

STACK_NAME=$1

# Retrieve the FrontendConfigS3Path output value from the stack
FRONTEND_CONFIG_S3_PATH=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='FrontendConfigS3Path'].OutputValue" \
    --output text)

# Check if the output was found
if [ -z "$FRONTEND_CONFIG_S3_PATH" ]; then
    echo "Error: FrontendConfigS3Path not found in stack outputs"
    exit 1
fi

# Copy the S3 object to the local file
aws s3 cp "$FRONTEND_CONFIG_S3_PATH" "resources/ui/public/appconfig.json"

# Check if the copy was successful
if [ $? -eq 0 ]; then
    echo "File copied successfully to resources/ui/public/appconfig.json"
else
    echo "Error: Failed to copy the file"
    exit 1
fi
