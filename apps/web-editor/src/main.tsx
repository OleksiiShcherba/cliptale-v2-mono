import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AssetBrowserPanel } from '@/features/asset-manager/components/AssetBrowserPanel';

// Hardcoded project ID for development until the project creation flow is implemented.
const DEV_PROJECT_ID = 'dev-project-001';

const queryClient = new QueryClient();

function App(): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <div
        style={{
          background: '#0D0D14',
          minHeight: '100vh',
          color: '#F0F0FA',
          fontFamily: 'Inter, sans-serif',
          display: 'flex',
        }}
      >
        <AssetBrowserPanel projectId={DEV_PROJECT_ID} />
      </div>
    </QueryClientProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
