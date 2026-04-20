import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { App } from '@/App';
import { AuthProvider } from '@/features/auth/components/AuthProvider';
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute';
import { LoginPage } from '@/features/auth/components/LoginPage';
import { RegisterPage } from '@/features/auth/components/RegisterPage';
import { ForgotPasswordPage } from '@/features/auth/components/ForgotPasswordPage';
import { ResetPasswordPage } from '@/features/auth/components/ResetPasswordPage';
import { GenerateWizardPage } from '@/features/generate-wizard/components/GenerateWizardPage';
import { GenerateRoadMapPlaceholder } from '@/features/generate-wizard/components/GenerateRoadMapPlaceholder';
import { HomePage } from '@/features/home/components/HomePage';
import { TrashPanel } from '@/features/trash/TrashPanel';

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

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <HomePage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/editor',
    element: (
      <ProtectedRoute>
        <App />
      </ProtectedRoute>
    ),
  },
  {
    path: '/generate',
    element: (
      <ProtectedRoute>
        <GenerateWizardPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/generate/road-map',
    element: (
      <ProtectedRoute>
        <GenerateRoadMapPlaceholder />
      </ProtectedRoute>
    ),
  },
  {
    path: '/trash',
    element: (
      <ProtectedRoute>
        <TrashPanel />
      </ProtectedRoute>
    ),
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
