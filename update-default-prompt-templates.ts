import * as AWS from 'aws-sdk';
import * as yaml from 'js-yaml';
import * as fs from 'fs';

// AWS configuration, change these values to match your environment
const AWS_PROFILE = 'default';
const AWS_REGION = process.env.AWS_REGION || 'us-west-2';

// Load the YAML file
const data: Record<string, string> = yaml.load(fs.readFileSync('./lib/prompt-templates.yml', 'utf8')) as Record<string, string>;

// Load credentials from the profile.
const credentials = new AWS.SharedIniFileCredentials({profile: AWS_PROFILE});
AWS.config.credentials = credentials;

// Create an SSM client
const ssm = new AWS.SSM({ region: AWS_REGION });

// Iterate over the data and create/update the SSM parameters
for (const [key, value] of Object.entries(data)) {
  const params: AWS.SSM.PutParameterRequest = {
    Name: key,
    Value: value,
    Type: 'String',
    Overwrite: true
  };

  ssm.putParameter(params, (err, putData) => {
    if (err) {
      console.log(err, err.stack);  // an error occurred
    } else {
      // successful response, now get the parameter to log the ARN
      const getParams: AWS.SSM.GetParameterRequest = {
        Name: params.Name,
        WithDecryption: false
      };
  
      ssm.getParameter(getParams, (err, getData) => {
        if (err) {
          console.log(err, err.stack);  // an error occurred
        } else {
          if (getData.Parameter) {
            console.log(getData.Parameter.ARN);  // log the ARN
          }
        }
      });
    }
  });
}