import * as React from "react";
import { FileViewTable } from "../FileViewTable/index"
import { S3Client, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { useState, useEffect } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
    withAuthenticator,
  } from '@aws-amplify/ui-react';

import {
    Container,
} from '@cloudscape-design/components'

function Documents({ signOut, user, appConfig }) {
  const [remoteFiles, setRemoteFiles] = useState([]);
  const [remoteFilesLoading, setRemoteFilesLoading] = useState(false);
  const [creds, setCreds] = useState({});

  window.getAuthSession = fetchAuthSession;

  const getPresignedUrlAndRedirect = async objectKey => {

    const s3Client = new S3Client({
      region: appConfig.storage.aws_region,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      }
    });

    const command = new GetObjectCommand({
      Bucket: appConfig.storage.bucket_name,
      Key: objectKey,
    });

    try {
      const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // URL expires in 1 hour
      window.open(signedUrl, '_blank'); // Open in new tab
    } catch (error) {
      console.error('Error generating pre-signed URL', error);
    }
  };

  const deleteFiles = async (files) => {
    const file = files[0];
    const s3Client = new S3Client({
      region: appConfig.storage.aws_region,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      }
    });

    const command = new DeleteObjectCommand({
      Bucket: appConfig.storage.bucket_name,
      Key: file.Key,
    });

    await s3Client.send(command);
    await listObjects();
  }


  const listObjects = async () => {

    if (creds.accessKeyId){
      setRemoteFilesLoading(true);

      const s3Client = new S3Client({
        region: appConfig.storage.aws_region,
        credentials: {
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
          sessionToken: creds.sessionToken,
        }
      });
  
      const params = {
        Bucket: appConfig.storage.bucket_name,
        Prefix: `private/${creds.identityId}`,
      };
      const command = new ListObjectsV2Command(params);
      let response
      try {
        response = await s3Client.send(command);
      } catch (error) {
        console.warn("Error listing objects: ", error);
      }
  
      setRemoteFiles(response?.Contents || []);
      setRemoteFilesLoading(false);
  
      return response;
    }
  };

  // Getting STS credentials for user
  useEffect(() => {
    const getSession = async () => {
      try {
        const { credentials, identityId, tokens } = await fetchAuthSession();
        setCreds({
          ...credentials,
          ...tokens,
          identityId
        });
      } catch (error) {
        console.error("Error fetching session: ", error);
      }
    };
    getSession();
  }, [user]);

  return (
    <Container>
    <FileViewTable
        tableItems={remoteFiles}
        loading={remoteFilesLoading}
        loader={listObjects}
        download={getPresignedUrlAndRedirect}
        deleteFiles={deleteFiles}
        creds={creds}
    />
    </Container>
  );
}

export default withAuthenticator(Documents);
