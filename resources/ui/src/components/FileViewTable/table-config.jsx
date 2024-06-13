import { Link } from '@cloudscape-design/components';
import React from 'react';

export function getMatchesCountText(count) {
  return count === 1 ? `1 match` : `${count} matches`;
}

function formatDate(date) {
  const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'long' });
  const timeFormatter = new Intl.DateTimeFormat('en-US', { timeStyle: 'short', hour12: false });
  return `${dateFormatter.format(date)}, ${timeFormatter.format(date)}`;
}

function createLabelFunction(columnName) {
  return ({ sorted, descending }) => {
    const sortState = sorted ? `sorted ${descending ? 'descending' : 'ascending'}` : 'not sorted';
    return `${columnName}, ${sortState}.`;
  };
}

export const columnDefinitions = download =>  [
    {
        id: "file",
        header: "File Name",
        cell: item => (
          <Link onFollow={() => download(item.Key)} >{item.Key.split("/").slice(-1)[0] || "-"}</Link>
        ),
        sortingField: "file",
        isRowHeader: true
      },
      {
        id: "last_modified",
        header: "Last Modified",
        cell: item => item.LastModified.toLocaleString() || "-",
        sortingField: "last_modified"
      },
      {
        id: "size",
        header: "Size",
        cell: item => `${Math.floor(item.Size / 1024)} KB` || "-"
      }
];

export const paginationLabels = {
  nextPageLabel: 'Next page',
  pageLabel: pageNumber => `Go to page ${pageNumber}`,
  previousPageLabel: 'Previous page',
};

const pageSizePreference = {
  title: 'Select page size',
  options: [
    { value: 10, label: '10 resources' },
    { value: 20, label: '20 resources' },
  ],
};

const visibleContentPreference = {
  title: 'Select visible content',
  options: [
    {
      label: 'Main properties',
      options: columnDefinitions().map(({ id, header }) => ({ id, label: header, editable: id !== 'id' })),
    },
  ],
};

export const collectionPreferencesProps = {
  pageSizePreference,
  visibleContentPreference,
  cancelLabel: 'Cancel',
  confirmLabel: 'Confirm',
  title: 'Preferences',
};
