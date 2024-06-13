// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import React from 'react';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';

const items = [
  { text: 'Dashboard', href: '/index.html' },
];

export default function Breadcrumbs() {
  return <BreadcrumbGroup items={items} />;
}
