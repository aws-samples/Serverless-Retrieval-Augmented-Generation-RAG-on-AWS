import os
import lancedb
import boto3
import urllib.parse
import hashlib
from boto3.dynamodb.conditions import Key
from langchain.embeddings import BedrockEmbeddings
from langchain.text_splitter import CharacterTextSplitter
from langchain.document_loaders import PyPDFLoader as PDFLoader
from langchain.vectorstores import LanceDB

import pyarrow as pa
import json

# Set up environment variables
aws_region = os.environ.get('AWS_REGION', 'us-west-2')
WEBSOCKET_ENDPOINT = os.environ.get('WEBSOCKET_ENDPOINT').replace('wss://', 'https://')
WEBSOCKET_STATE_TABLE = os.environ.get('DYNAMODB_WEBSOCKET_STATE_TABLE')
SQS_QUEUE_URL = os.environ.get('SQS_QUEUE_URL')
DOCUMENT_REGISTRY_TABLE = os.environ.get('DYNAMODB_DOCUMENT_REGISTRY_TABLE')
MD5_BY_S3_PATH_INDEX = os.environ.get('DYNAMODB_MD5_BY_S3_PATH_INDEX')
LANCEDB_BUCKET = os.environ.get('LANCEDB_BUCKET')
EMBEDDING_MODEL = os.environ.get('EMBEDDING_MODEL')
EMBEDDING_SIZE = int(os.environ.get('EMBEDDING_SIZE'))


# Initialize AWS clients
dynamodb = boto3.client('dynamodb')
dynamodb_resource = boto3.resource('dynamodb')
s3_client = boto3.client('s3', region_name=aws_region)
api_client = boto3.client('apigatewaymanagementapi', endpoint_url=WEBSOCKET_ENDPOINT)
sqs_client = boto3.client('sqs')

# Initialize langchain objects
embeddings = BedrockEmbeddings(region_name=aws_region, model_id=EMBEDDING_MODEL)
splitter = CharacterTextSplitter(chunk_size=1000, chunk_overlap=200)

def download_object(bucket_name, object_key, download_path):
    try:
        s3_client.download_file(bucket_name, object_key, download_path)
        print(f"File downloaded to {download_path}")
    except boto3.exceptions.S3DownloadError as e:
        print(f"Error downloading object: {e}")
        raise

def create_directory_from_object_key(object_key):
    local_dir_path = os.path.join('/tmp', os.path.dirname(object_key))
    os.makedirs(local_dir_path, exist_ok=True)
    print(f"Directory created at: {local_dir_path}")
    return local_dir_path
    
def send_message(type, message, connection_id, level):
    data = {
        'source': "ingest-lambda",
        'type': type,
        'message': message,
        'connectionId': connection_id,
        'level': level
    }
    params = {
        'ConnectionId': connection_id,
        'Data': json.dumps(data).encode()
    }

    response = api_client.post_to_connection(**params)
    return response

def get_connection_id_from_user(cognito_sub):

    cognito_sub = cognito_sub.replace('%3A', ':')
    
    # Fetch the item from DynamoDB table using GetItem
    response = dynamodb.get_item(
        TableName=WEBSOCKET_STATE_TABLE,
        Key={
            'userId': {
                'S': cognito_sub
            }
        }
    )
    
    # Check if item exists
    if 'Item' not in response:
        raise Exception(f"Item not found for user {cognito_sub}")
    
    connection_id = response['Item']['ConnectionId']['S']

    return connection_id

def get_cognito_sub_from_s3_key(s3_key):
    # expecting 'private/cognito_sub/file.pdf'
    cognito_sub = s3_key.split('/')[1]
    return cognito_sub

def calculate_md5(file_path, username):
    """Calculate the MD5 hash of a file and the owner cognito_sub"""
    hash_md5 = hashlib.md5()
    hash_md5.update(username.encode('utf-8'))
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

def store_file_info(md5_hash, cognito_sub, s3_path, table_name):
    """Store the MD5 hash, cognito_sub, and full S3 path in DynamoDB."""
    table = dynamodb_resource.Table(table_name)
    
    response = table.put_item(
        Item={
            'md5': md5_hash,
            'user': cognito_sub,
            's3_path': s3_path
        }
    )
    return response

def delete_file_info(md5_hash, s3_path, table_name):
    """Delete the file info from DynamoDB based on the MD5 hash and cognito_sub."""
    print("from delete_file_info using md5_hash")
    print(md5_hash)

    table = dynamodb_resource.Table(table_name)
    
    response = table.delete_item(
        Key={
            'md5': f"{md5_hash}",
            's3_path': f"{s3_path}"
        }
    )
    return response

def is_file_processed(md5_hash, s3_path, table_name):
    """Check if the MD5 hash and S3 path already exist in DynamoDB."""
    table = dynamodb_resource.Table(table_name)

    response = table.query(
        KeyConditionExpression=Key('md5').eq(md5_hash)
    )
    
    items = response.get('Items', [])

    print(f"Items: {items}")

    return len(items) > 0

def get_md5_by_s3_path(s3_path, table_name, index):
    """Get the MD5 hash by the S3 path using the GSI."""

    table = dynamodb_resource.Table(table_name)
    response = table.query(
        IndexName=index,
        KeyConditionExpression=Key('s3_path').eq(s3_path)
    )

    print(f"Response: {response}")
    
    items = response.get('Items', [])
    if items:
        print(f"first item {items[0]}")
        return items[0]['md5']
    else:
        return None

def single_lambda_handler_create(record):
    print("single_lambda_handler_create :: record")
    print(record)

    # Extract bucket name and object key from the record
    bucket_name = record['s3']['bucket']['name']
    object_key = record['s3']['object']['key']
    cognito_sub = get_cognito_sub_from_s3_key(object_key)
    full_s3_path = f"s3://{bucket_name}/{object_key}"

    print(f"cognito_sub: {cognito_sub}")

    object_key = urllib.parse.unquote_plus(object_key)
    local_dir_path = create_directory_from_object_key(object_key)
    local_file_path = os.path.join(local_dir_path, os.path.basename(object_key))

        # get connection id for user
    try:
        connection_id = get_connection_id_from_user(cognito_sub)
        print(f"Connection ID: {connection_id} for user {cognito_sub}")
    except Exception as e:
        print(f"Error getting connection ID for user {cognito_sub}: {e}, user {cognito_sub} is flying blind")
        connection_id = None

    print(f"Object key: {object_key}")
    print(f"Local file path: {local_file_path}")
    print(f"Local directory path: {local_dir_path}")

    try:
        download_object(bucket_name, object_key, local_file_path)
    except Exception as e:
        print(f"Error downloading object: {e}")
        if connection_id:
            send_message("message", f"Error injesting object: {object_key}", connection_id, "error")
        return {
            'statusCode': 500,
            'body': 'Failed to download object',
            'type': 'create',
            'document': object_key
        }
    md5_hash = calculate_md5(local_file_path, cognito_sub)
    print(f"MD5 hash: {md5_hash}")
    
    # send message to user <ingestion started>
    try:
        if connection_id:
            send_message(
                "message", 
                f"Started ingesting {'/'.join(object_key.split('/')[2:])}", 
                connection_id, 
                "info"
            )
    except Exception as e:
        # can't remember why this is needed :(
        print(f"Error splitting object_key into just the file name: {e}")
        if connection_id:
            send_message(
                "message", 
                f"Started ingesting {object_key}", 
                connection_id, 
                "info"
            )

    # check if file has been processed already 
    # collision if md5(user+file)
    try:
        if is_file_processed(md5_hash, object_key, DOCUMENT_REGISTRY_TABLE):
            print(f"File {object_key} has already been processed for user {cognito_sub}")
            if connection_id:
                send_message("message", f"{object_key} has already been processed", connection_id, "info")
            return {
                'statusCode': 200,
                'body': 'File already processed',
                'type': 'create',
                'document': object_key
            }
        else:
            print(f"File {object_key} has not been processed yet")
    except Exception as e:
        print(f"Error checking if file {object_key} has been processed: {e}")
        if connection_id:
            send_message("message", f"Error checking if file {object_key} has been processed", connection_id, "error")
        return {
            'statusCode': 500,
            'body': 'Failed to check if file has been processed',
            'type': 'create',
            'document': object_key
        }

    # store file info in DynamoDB
    try:
        store_file_info(md5_hash, cognito_sub, f"s3://{bucket_name}/{object_key}", DOCUMENT_REGISTRY_TABLE)
    except Exception as e:
        print(f"Error storing file info in DynamoDB: {e}")
        if connection_id:
            send_message("message", f"Failed to ingest {'/'.join(object_key.split('/')[2:])}", connection_id, "error")
        return {
            'statusCode': 500,
            'body': 'Failed to store file info in DynamoDB',
            'type': 'create',
            'document': object_key
        }

    # Initialize PDFLoader and load documents
    loader = PDFLoader(local_file_path)
    docs = loader.load()
    docs = splitter.split_documents(docs)

    lance_table = cognito_sub.replace('%3A', ':')
    print(f"attempting to store vectors in {lance_table}")

    # Define the directory where embeddings will be stored
    db_path = f"s3://{LANCEDB_BUCKET}/embeddings/{lance_table}"
    db, table = None, None

    schema = pa.schema(
        [
            pa.field("vector", pa.list_(pa.float32(), EMBEDDING_SIZE)),
            pa.field("text", pa.string()),
            pa.field("id", pa.string()),
            pa.field("source", pa.string()),
            pa.field("page", pa.string())
        ]
    )

    # Connect to LanceDB and create or open table
    try:
        db = lancedb.connect(db_path)
        table = db.create_table(lance_table, schema=schema)
    except Exception as e:
        print(f"Table already exists, opening it: {e}")
        table = db.open_table(lance_table)

    try:
        LanceDB.from_documents(docs, embeddings, connection=table)
    except Exception as e:
        print(f"Error with LanceDB: {e}")
        if connection_id:
            send_message("message", f"Failed to ingest {'/'.join(object_key.split('/')[2:])}", connection_id, "error")

        try:
            delete_file_info(md5_hash, full_s3_path, DOCUMENT_REGISTRY_TABLE)
        except Exception as e:
            print(f"Error deleting file info from DynamoDB: {e}")
            if connection_id:
                send_message("message", f"Failed to ingest {'/'.join(object_key.split('/')[2:])}", connection_id, "error")
            return {
                'statusCode': 500,
                'body': 'Failed to ingest file and deleting info from DynamoDB!',
                'type': 'create',
                'document': object_key
            }

        try:
            if connection_id:
                send_message("message", f"Failed to ingest {'/'.join(object_key.split('/')[2:])}", connection_id, "error")
        except Exception as e:
            print(f"Error splitting object_key into just the file name: {e}")
            if connection_id:
                send_message(
                    "message", 
                    f"Failed to ingest {object_key}", 
                    connection_id, 
                    "error"
                )
        return {
            'statusCode': 500,
            'body': 'Some document failed to process',
            'document': object_key,
            'type': 'create',
            'error': e
        }
    try:
        if connection_id:
            send_message(
                "message", 
                f"Finished ingesting {'/'.join(object_key.split('/')[2:])}", 
                connection_id, 
                "success"
            )
    except Exception as e:
        print(f"Error splitting object_key into just the file name: {e}")
        if connection_id:
            send_message(
                "message", 
                f"Finished ingesting {object_key}", 
                connection_id, 
                "success"
            )
    return {
        'statusCode': 200,
        'body': 'Documents processed and embeddings stored successfully.',
        'document': object_key,
        'type': 'create'
    }

def single_lambda_handler_delete(record):
    print(record)

    # Extract bucket name and object key from the record
    bucket_name = record['s3']['bucket']['name']
    object_key = urllib.parse.unquote_plus(record['s3']['object']['key']).replace('%3A', ':')
    cognito_sub = get_cognito_sub_from_s3_key(object_key)
    s3_full_path = f"s3://{bucket_name}/{object_key}"
    filename = os.path.basename(object_key)

    print(f"s3_full_path {s3_full_path}")

    try:
        connection_id = get_connection_id_from_user(cognito_sub)
        print(f"Connection ID: {connection_id} for user {cognito_sub}")
    except Exception as e:
        print(f"Error getting connection ID for user {cognito_sub}: {e}, user is flying blind")
        connection_id = None

    lance_table = cognito_sub.replace('%3A', ':')

    md5_hash = get_md5_by_s3_path(
        s3_full_path, DOCUMENT_REGISTRY_TABLE, MD5_BY_S3_PATH_INDEX
    )

    print("HERE IS THE MD5 *************************************************")
    print(f"retrieved md5 {md5_hash}")

    if md5_hash is None:
        print(f"File {s3_full_path} has already been deleted from vector db")
        if connection_id:
            send_message("message", f"File {filename} successfuly deleted from vector db", connection_id, "info")
        return {
            'statusCode': 200,
            'body': 'File has already been delete from vector db',
            'type': 'delete',
            'document': object_key
        }

    print(f"attempting to delete vectors from {lance_table} for user {cognito_sub}")

    # Define the directory where embeddings will be stored
    db_path = f"s3://{LANCEDB_BUCKET}/embeddings/{lance_table}"

    source_name = f"/tmp/{object_key}"
    # Connect to LanceDB and create or open table
    try:
        db = lancedb.connect(db_path)
        table = db.open_table(lance_table)
    except Exception as e:
        print(f"Error opening LanceDB Table: {e}")
        send_message("message", f"Failed to delete {filename}", connection_id, "error")

    try:
        table.delete("source = '{}'".format(source_name))
    except Exception as e:
        print(f"Error deleting the source ON VECTOR DATABASE: {source_name}", e)
        send_message("message", f"Failed to delete {filename}", connection_id, "error")
        return {
            'statusCode': 500,
            'body': 'Failed to delete the documents',
            'document': source_name,
            'type': 'delete',
            'error': e
        }

    try:
        print(f"attempting to delete from DDB : {md5_hash} {s3_full_path}")
        delete_file_info(md5_hash, s3_full_path,  DOCUMENT_REGISTRY_TABLE)
        send_message("message", f"Finished deleting {filename}", connection_id, "success")
        print(f"Finished deleting {object_key} with hash {md5_hash}")
    except Exception as e:
        print(f"Error deleting file info from DynamoDB: {e}")
        send_message("message", f"Failed to delete {filename}", connection_id, "error")
        return {
            'statusCode': 500,
            'body': 'Failed to delete the documents',
            'document': source_name,
            'type': 'delete',
            'error': e
        }

    return {
        'statusCode': 200,
        'body': 'Documents deleted successfully.',
        'document': source_name,
        'object_key': object_key,
        'bucket': bucket_name,
        'type': 'delete'
    }

def lambda_handler(event, context):
    '''
    processing all messages from the batch from the queue
    each message on the queue could include multiple S3 events of type
    - create
    - delete

    if the processing of an s3 event fails, the message whole message fails 
    and must not be deleted from the queue.
    ingestion idempotency and deletion is handled via an md5 registry on dynamodb

    unhandled s3 events should always be zero, becuase we are filtering for 
    create or delete events. As of now, we'll ignore unhandled events.
    '''

    successes = []
    failures = []
    unhandled = []

    print(event)
    print(os.environ)

    for record in event['Records']:
        message_id = record['messageId']
        receipt_handle = record['receiptHandle']
        body = record['body']

        local_successes = []
        local_failures = []
        local_unhandled = []
        
        # Print out the message details
        print(f"Message ID: {message_id}")
        print(f"Receipt Handle: {receipt_handle}")
        print(f"Body: {body}")
        
        # Parse the S3 event from the body
        s3_event = json.loads(body)
        
        for s3_record in s3_event['Records']:
            
            event_name = s3_record['eventName']
            s3_bucket = s3_record['s3']['bucket']['name']
            s3_object_key = s3_record['s3']['object']['key']

            print("RECEIVING S3 OBJECT KEY")
            print(s3_object_key)
            
            if event_name.startswith("ObjectCreated"):
                print(f"Object created in bucket {s3_bucket}: {s3_object_key}")
                # Process object creation event
                response = single_lambda_handler_create(s3_record)
                if response['statusCode'] == 200:
                    local_successes.append({
                        "s3_record": s3_record,
                        "response": response
                    })
                elif response['statusCode'] == 500:
                    local_failures.append({
                        "s3_record": s3_record,
                        "response": response
                    })
                else:
                    local_unhandled.append({
                        "s3_record": s3_record,
                        "response": response
                    })

            elif event_name.startswith("ObjectRemoved"):
                print(f"Object deleted from bucket {s3_bucket}: {s3_object_key}")
                # Process object deletion event
                response = single_lambda_handler_delete(s3_record)
                if response['statusCode'] == 200:
                    local_successes.append({
                        "s3_record": s3_record,
                        "response": response
                    })
                elif response['statusCode'] == 500:
                    local_failures.append({
                        "s3_record": s3_record,
                        "response": response
                    })
                else:
                    local_unhandled.append({
                        "s3_record": s3_record,
                        "response": response
                    })
                
            else:
                local_unhandled.append(s3_record)
    
        print(local_successes)
        print(local_failures)
        print(local_unhandled)
        
        if len(local_failures) == 0:
            successes.append({
                "message_id": message_id,
                "receipt_handle": receipt_handle,
                "body": body,
                "s3_event": s3_event,
                "local_successes": local_successes,
                "local_failures": local_failures,
                "local_unhandled": local_unhandled
            })
    
    # Delete the successful message from the queue
    print(successes)
    for success in successes:
        print("GLOBAL SUCCESS")
        print(success)
        print(f"Deleting message with receipt handle {success['receipt_handle']}")
        try:
            sqs_client.delete_message(
                QueueUrl=SQS_QUEUE_URL,
                ReceiptHandle=success['receipt_handle']
            )
        except Exception as e:
            print(f"Error deleting message from queue: {e}")

    status = {
        'success': successes,
        'failures': failures,
        'unhandled': unhandled
    }

    print(status)

    return status