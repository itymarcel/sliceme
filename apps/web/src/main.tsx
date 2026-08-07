import React from 'react';
import ReactDOM from 'react-dom/client';

import { SlicerWorkspace } from './features/slicer/SlicerWorkspace';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><SlicerWorkspace /></React.StrictMode>);
