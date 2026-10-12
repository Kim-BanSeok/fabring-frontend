import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { createAppStore } from './react/app/store.js';
import { createLiveApi } from './react/services/live-api.js';
import './prototype/styles/base.css';
import './prototype/pages/buyer.css';
import './prototype/pages/seller.css';
import './prototype/pages/admin.css';
import './prototype/pages/auth.css';
import './react/app/layout.css';
import './react/app/fabring.css';

const liveApi = createLiveApi({ baseUrl: import.meta.env.VITE_API_BASE_URL || '/api/v1' });
const store = createAppStore({ liveApi });
createRoot(document.getElementById('app')).render(<StrictMode><App store={store} /></StrictMode>);
