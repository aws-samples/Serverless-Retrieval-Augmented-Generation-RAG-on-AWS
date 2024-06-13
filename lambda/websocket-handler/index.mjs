// Import the necessary AWS SDK clients and commands for JavaScript v3
import { 
    ApiGatewayManagementApiClient, 
    PostToConnectionCommand 
  } from "@aws-sdk/client-apigatewaymanagementapi"
  
  const {WEBSOCKET_ENDPOINT} = process.env
  
  // Initialize the ApiGatewayManagementApiClient
  const apiClient = new ApiGatewayManagementApiClient({
    endpoint: WEBSOCKET_ENDPOINT
  })

  const MESSAGE_TYPES = {
    connection: "connection",
    message: "message",
    default: "default"
  }
  
  export const handler = async (event) => {
      console.log(event)
  
      const route = event.requestContext.routeKey
      const connectionId = event.requestContext.connectionId
  
      switch (route) {
          case '$connect':
              console.log('Connection occurred', connectionId)
              break;
          case '$disconnect':
              console.log('Disconnection occurred', connectionId)
              break;
          case 'message':
              console.log('Received message:', event.body)
              await sendMessage(MESSAGE_TYPES.message, event.body, connectionId)
              break;
          case 'whoami':
              console.log('Received whoami:', event.body)
              await sendMessage(MESSAGE_TYPES.connection, connectionId, connectionId)
              break;
          default:
              console.log('Received unknown route:', route)
              await sendMessage(MESSAGE_TYPES.default, "default route hit", connectionId)
      }
  
      return {
        statusCode: 200
      }
  }

const sendMessage = async (type, message, connectionId) => {
    const data = { source:"websocket-lambda",type, message, connectionId }
    const params = {
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(data))
    }
  
    // Use the PostToConnectionCommand to send a message to the connection
    const command = new PostToConnectionCommand(params)
    return apiClient.send(command)
  
};
  