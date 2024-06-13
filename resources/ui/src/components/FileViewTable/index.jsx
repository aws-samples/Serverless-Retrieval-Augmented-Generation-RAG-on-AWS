import * as React from "react";
import { PropTypes } from 'prop-types';
import { useState, useEffect } from 'react';
import { useCollection } from '@cloudscape-design/collection-hooks';
import {
  Box,
  Button,
  CollectionPreferences,
  Header,
  Pagination,
  Table,
  TextFilter,
  SpaceBetween,
  Icon,
  Alert,
  Hotspot,
  FormField,
  Modal
} from '@cloudscape-design/components';
import { CustomStorageManager } from "../CustomStorageManager";
import { columnDefinitions, getMatchesCountText, paginationLabels, collectionPreferencesProps } from './table-config';

function EmptyState({ title, subtitle, action }) {
  return (
    <Box textAlign="center" color="inherit">
      <Box variant="strong" textAlign="center" color="inherit">
        {title}
      </Box>
      <Box variant="p" padding={{ bottom: 's' }} color="inherit">
        {subtitle}
      </Box>
      {action}
    </Box>
  );
}

EmptyState.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  action: PropTypes.node.isRequired,
};

export function FileViewTable({tableItems, loading, loader, download, deleteFiles, creds}) {
  const [modalVisible, setModalVisible] = useState(false);

  const [preferences, setPreferences] = useState({ pageSize: 10, visibleContent: ['file', 'last_modified', 'size'] });
  const { items, actions, filteredItemsCount, collectionProps, filterProps, paginationProps } = useCollection(
    tableItems,
    {
      filtering: {
        empty: (<EmptyState 
          title="No documents" 
          action={<Button onClick={() => loader()}>Refresh</Button>} 
        />),
        noMatch: (
          <EmptyState
            title="No matches"
            action={<Button onClick={() => actions.setFiltering('')}>Clear filter</Button>}
          />
        ),
      },
      pagination: { pageSize: preferences.pageSize },
      sorting: {},
      selection: {},
    }
  );
  const { selectedItems } = collectionProps;

  const [deleting, setDeleting] = useState(false);

  useEffect(() => {loader()}, [creds]);

  const closeModal = () => {
    setModalVisible(false);
    loader();
  }


  return (
    <div>  
      {modalVisible && <Modal
        onDismiss={() => setModalVisible(false)}
        visible={modalVisible}
        closeAriaLabel="Close modal"
        header="Upload file"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => closeModal()} variant="link">Cancel</Button>
              <Button onClick={() => closeModal()} variant="primary">Ok</Button>
            </SpaceBetween>
          </Box>
        }
      >
        <FormField
      >
        <CustomStorageManager
            acceptedFileTypes={['.pdf']}
            path={() => `private/${creds.identityId}/`}
            maxFileCount={1}
            maxFileSize={10000000}
            uploadedCallback={closeModal}
        />
      </FormField>
        
      </Modal>}
      {deleting && selectedItems.length > 0 && <Alert
      type="warning"
      statusIconAriaLabel="Warning"
      action={
      <SpaceBetween direction="horizontal" size="s">
        <Button onClick={() => {deleteFiles(selectedItems); setDeleting(false);}}>Delete File{selectedItems.length > 1 ? 's' : ''}</Button>
        <Button onClick={() => {setDeleting(false);}}>Cancel</Button>
        </SpaceBetween>
      }
      header={`Are you sure you wish to delete ${selectedItems.length} ${selectedItems.length > 1 ? 'files' : 'file'}?`}
    >
      {`${selectedItems.length > 1 ? 'These files' : 'This file'} will be permanently deleted.`}
    </Alert>}
    <Hotspot side="left" direction="bottom" hotspotId='knowledge-base-table'>
    <Table
      {...collectionProps}
      selectionType="single"
      loading={loading}
      header={
        <Header
          counter={selectedItems.length ? `(${selectedItems.length}/${tableItems && tableItems.length })` : `(${tableItems && tableItems.length})`}
          actions={
            <SpaceBetween              
              direction="horizontal"
              size="xs"
            >
              <Button iconName={"upload"} variant="normal" onClick={() => setModalVisible(true)}>Upload files</Button>
              <Hotspot hotspotId='knowledge-base-table-delete' side="left">
              
                <Button disabled={(deleting || loading || selectedItems.length === 0)} onClick={() => setDeleting(true)} >
                    <Icon name="remove"></Icon>
                </Button>
              </Hotspot>
              <Button disabled={loading} onClick={() => loader()} >
                <Icon name="refresh">
                </Icon>
              </Button>
            </SpaceBetween>
          }
        >
          Documents
        </Header>
      }
      columnDefinitions={columnDefinitions(download)}
      visibleColumns={preferences.visibleContent}
      items={items}
      loadingText='Loading documents'
      pagination={<Pagination {...paginationProps} ariaLabels={paginationLabels} />}
      filter={
        <TextFilter
          {...filterProps}
          countText={getMatchesCountText(filteredItemsCount)}
          filteringAriaLabel="Filter instances"
        />
      }
      preferences={
        <CollectionPreferences
          {...collectionPreferencesProps}
          preferences={preferences}
          onConfirm={({ detail }) => setPreferences(detail)}
        />
      }
      variant='compact'
    />
    </Hotspot>
    </div>
  );
}

FileViewTable.propTypes = {
  tableItems: PropTypes.arrayOf(PropTypes.shape({
    value: PropTypes.string,
    label: PropTypes.string,
  })),
  loading: PropTypes.bool.isRequired,
  loader: PropTypes.func.isRequired,
  download: PropTypes.func.isRequired,
  deleteFiles: PropTypes.func.isRequired,
  creds: PropTypes.object.isRequired
};