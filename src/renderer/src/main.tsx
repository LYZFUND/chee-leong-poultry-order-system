import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './context/AuthContext';
import { ZoomProvider } from './context/ZoomContext';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <ZoomProvider>
          <App />
        </ZoomProvider>
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
);
