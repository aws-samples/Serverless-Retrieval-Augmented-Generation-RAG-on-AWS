#!/usr/bin/env node

type Regions = {
    [key: string]: { embedding: { model: string; size: number } };
};

import * as cdk from 'aws-cdk-lib';
import { ServerlessRagOnAws } from '../lib/serverless-rag-on-aws-stack';
import RegionalConfigFromFile from '../lib/llm-config.json'

const regionalConfigs: Regions = RegionalConfigFromFile;
const region = process.env.AWS_DEFAULT_REGION || "NONE";
const supportedRegions = Object.keys(regionalConfigs);

if (!supportedRegions.includes(region)) {
    console.error(`Region ${region} is not supported. Supported regions are ${supportedRegions.join(", ")}`);
    process.exit(1);
}

const {embedding} = regionalConfigs[region];

const app = new cdk.App();
new ServerlessRagOnAws(app, 'ServerlessRagOnAwsStack', {embedding});
