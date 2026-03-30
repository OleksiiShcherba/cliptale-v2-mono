import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

function App(): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <div style={{ background: '#0D0D14', minHeight: '100vh', color: '#F0F0FA' }}>
        <h1>ClipTale Editor</h1>
      </div>
    </QueryClientProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
