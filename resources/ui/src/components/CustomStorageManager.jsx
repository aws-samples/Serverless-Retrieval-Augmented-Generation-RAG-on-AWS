import { PropTypes } from 'prop-types';
import {
  Flex,
  Text,
  Divider,
  Loader,
} from '@aws-amplify/ui-react';
import { StorageManager } from '@aws-amplify/ui-react-storage';

import React from 'react';

import {
    Button,
  } from '@cloudscape-design/components';

export const CustomStorageManager = ({acceptedFileTypes, path, maxFileCount, maxFileSize, uploadedCallback}) => {
  return (
    <StorageManager
      acceptedFileTypes={acceptedFileTypes}
      path={path}
      maxFileCount={maxFileCount}
      maxFileSize={maxFileSize}
      components={{
        Container({ children }) {
          return <Flex direction="column" width="100%" alignContent="center" justifyContent="center">{children}</Flex>;
        },
        // DropZone({ children, displayText, inDropZone, ...rest }) {
        //   return (
        //     <Flex
        //       alignItems="center"
        //       direction="column"
        //       padding="medium"
        //       backgroundColor={inDropZone ? 'primary.10' : ''}
        //       maxHeight="40vh"
        //       {...rest}
        //     >
        //       <Text>Drop files here</Text>
        //       <Divider size="small" label="or" maxWidth="10rem" />
        //       {children}
        //     </Flex>
        //   );
        // },
        FilePicker({ onClick }) {
          return (
            <Button onClick={onClick}>
              Browse Files
            </Button>
          );
        },
        FileList({ files, onCancelUpload, onDeleteUpload }) {
          return (
            <>
              {files.map(({ file, key, progress, id, status, uploadTask }) => (
                <Flex
                  key={key}
                  direction="column"
                  justifyContent="center"
                  alignItems="center"
                  padding="large"
                >
                  {progress < 100 ? (
                    <Loader
                      size="large"
                      variation="linear"
                      percentage={progress}
                      isDeterminate={true}
                      isPercentageTextHidden={false}
                    />
                  ) : uploadedCallback ? uploadedCallback() : null}
                 </Flex>
              ))}
              </>
          );
        },
      }}
    />
  );
};
