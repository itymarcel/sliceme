import React from 'react';
import ReactDOM from 'react-dom/client';

import { SlicerWorkspace } from './features/slicer/SlicerWorkspace';
import { UsageAdminPage } from './features/slicer/components/UsageAdminPage';
import './styles.css';

const page = window.location.pathname === '/admin/usage' ? <UsageAdminPage /> : <SlicerWorkspace />;
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{page}</React.StrictMode>);
