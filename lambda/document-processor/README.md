# Document Processor Function - Serverless Retrieval Augmented Generation on AWS

#### Overview
This Lambda function processes S3 events to either create or delete document embeddings in LanceDB, ensuring idempotent operations through DynamoDB. It handles two main operations based on the S3 event type: document ingestion (create) and document deletion (delete).

#### Environment Variables
- **AWS_REGION**: The AWS region where the resources are located.
- **WEBSOCKET_ENDPOINT**: The endpoint for WebSocket communication.
- **DYNAMODB_WEBSOCKET_STATE_TABLE**: The DynamoDB table storing WebSocket connection states.
- **SQS_QUEUE_URL**: The SQS queue URL for message processing.
- **DYNAMODB_DOCUMENT_REGISTRY_TABLE**: The DynamoDB table storing document metadata.
- **DYNAMODB_MD5_BY_S3_PATH_INDEX**: The name of the Global Secondary Index (GSI) for querying by S3 path.
- **LANCEDB_BUCKET**: The S3 bucket where LanceDB embeddings are stored.

#### Functionality
The Lambda function comprises several helper functions and two main handlers (`single_lambda_handler_create` and `single_lambda_handler_delete`) to process the events.

#### Helper Functions
1. **`download_object(bucket_name, object_key, download_path)`**: Downloads an object from S3 to the local file system.
2. **`create_directory_from_object_key(object_key)`**: Creates a local directory based on the S3 object key structure.
3. **`send_message(type, message, connection_id, level)`**: Sends a message to a WebSocket connection.
4. **`get_connection_id_from_user(cognito_sub)`**: Retrieves the WebSocket connection ID for a user from DynamoDB.
5. **`get_cognito_sub_from_s3_key(s3_key)`**: Extracts the `cognito_sub` (user identifier) from the S3 key.
6. **`calculate_md5(file_path, username)`**: Calculates the MD5 hash of a file content with the `cognito_sub` prepended.
7. **`store_file_info(md5_hash, cognito_sub, s3_path, table)`**: Stores document metadata (MD5 hash, user, S3 path) in DynamoDB.
8. **`delete_file_info(md5_hash, table)`**: Deletes document metadata from DynamoDB based on the MD5 hash.
9. **`is_file_processed(md5_hash, s3_path, table)`**: Checks if a file has already been processed by querying DynamoDB.
10. **`get_md5_by_s3_path(s3_path, table, index)`**: Retrieves the MD5 hash by querying DynamoDB with the S3 path.

#### Main Handlers
##### `single_lambda_handler_create(record)`
- **Purpose**: Handles S3 object creation events.
- **Steps**:
  1. Extracts bucket name and object key from the event record.
  2. Downloads the file from S3 to the local file system.
  3. Calculates the MD5 hash of the file with the `cognito_sub` prepended.
  4. Retrieves the WebSocket connection ID for the user.
  5. Sends a WebSocket message to notify the user about the start of ingestion.
  6. Checks if the file has already been processed by querying DynamoDB.
  7. If not processed, stores the document metadata in DynamoDB.
  8. Loads and splits the PDF document into chunks.
  9. Connects to LanceDB and stores the document embeddings.
  10. Sends a WebSocket message to notify the user about the completion of ingestion.

##### `single_lambda_handler_delete(record)`
- **Purpose**: Handles S3 object deletion events.
- **Steps**:
  1. Extracts bucket name and object key from the event record.
  2. Retrieves the WebSocket connection ID for the user.
  3. Retrieves the MD5 hash of the document by querying DynamoDB with the S3 path.
  4. Connects to LanceDB and deletes the embeddings associated with the document.
  5. Deletes the document metadata from DynamoDB.
  6. Sends a WebSocket message to notify the user about the completion of deletion.

#### Entry Point
The `lambda_handler(event, context)` function is the entry point for the Lambda function. It iterates over the event records and dispatches each record to the appropriate handler (`single_lambda_handler_create` or `single_lambda_handler_delete`) based on the event type.

#### Error Handling
The function includes error handling to manage failures at various stages, ensuring that appropriate messages are sent to the user and metadata is correctly updated or rolled back in DynamoDB.

### Example Usage
```python
# Triggered by an S3 event, processes the event as described above
def lambda_handler(event, context):
    for record in event['Records']:
        if record['eventName'].startswith('ObjectCreated:'):
            single_lambda_handler_create(record)
        elif record['eventName'].startswith('ObjectRemoved:'):
            single_lambda_handler_delete(record)
```

### Summary
This Lambda function ensures idempotent processing of S3 events by using DynamoDB to track processed files and LanceDB to store and manage document embeddings. It provides real-time feedback to users via WebSocket messages, and it handles both document ingestion and deletion events robustly.