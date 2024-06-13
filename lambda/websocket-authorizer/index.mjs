// TODO: add allowed origins programmatically?
const allowedOrigins = [
    "https://localhost:3000",
    "http://localhost:3000",
    "https://localhost:5173",
    "http://localhost:5173",
    ... process.env['COMMA_SEPARATED_ORIGINS'].split(",")
];

import { CognitoJwtVerifier } from "aws-jwt-verify";

const UserPoolId = process.env.USER_POOL_ID;
const AppClientId = process.env.APP_CLIENT_ID;

export const handler = async function(event, context, callback) {
   console.log('Received event:', JSON.stringify(event, null, 2));

   try {
    const verifier = CognitoJwtVerifier.create({
      userPoolId: UserPoolId,
      tokenUse: "id",
      clientId: AppClientId,
    });

    const encodedToken = event.queryStringParameters.idToken;
    const payload = await verifier.verify(encodedToken);
    console.log("Token is valid. Payload:", payload);
  }catch(error) {
    console.log(error);
    return callback("Unauthorized");
  }

   // Retrieve request parameters from the Lambda function input:
   var headers = event.headers;
   var origin = headers.Origin
   
   console.log(origin)
       
   // Perform authorization to return the Allow policy for correct parameters and 
   // the 'Unauthorized' error, otherwise.
   var authResponse = {};
   var condition = {};
    condition.IpAddress = {};
    
   if ( allowedOrigins.includes( origin ) ) {
        return callback(null, generateAllow('me', event.methodArn));
    }  else {
        return callback("Unauthorized");
    }
}
    
// Helper function to generate an IAM policy
var generatePolicy = function(principalId, effect, resource) {
   // Required output:
   var authResponse = {};
    authResponse.principalId = principalId;
   if (effect && resource) {
       var policyDocument = {};
        policyDocument.Version = '2012-10-17'; // default version
       policyDocument.Statement = [];
       var statementOne = {};
        statementOne.Action = 'execute-api:Invoke'; // default action
       statementOne.Effect = effect;
        statementOne.Resource = resource;
        policyDocument.Statement[0] = statementOne;
        authResponse.policyDocument = policyDocument;
    }
   // Optional output with custom properties of the String, Number or Boolean type.
   authResponse.context = {
       "stringKey": "stringval",
       "numberKey": 123,
       "booleanKey": true
    };
   return authResponse;
}
    
var generateAllow = function(principalId, resource) {
   return generatePolicy(principalId, 'Allow', resource);
}
    
var generateDeny = function(principalId, resource) {
   return generatePolicy(principalId, 'Deny', resource);
}
