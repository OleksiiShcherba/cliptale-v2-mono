import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { App } from '@/App';

// ---------------------------------------------------------------------------
// Global CSS reset — applied programmatically so no separate CSS file is needed.
// Removes the browser default body margin (8px) and html overflow that cause a
// white border around the full-page editor layout.
// ---------------------------------------------------------------------------
const resetStyle = document.createElement('style');
resetStyle.textContent = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; overflow: hidden; }
  #root { width: 100vw; height: 100vh; }
`;
document.head.appendChild(resetStyle);

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
