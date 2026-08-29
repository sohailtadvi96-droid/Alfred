import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { RequireAuth } from '@/auth/RequireAuth';
import { LoginPage } from '@/auth/LoginPage';
import { ExpensesPage } from './ExpensesPage';
import { SecretsPage } from './SecretsPage';
import { WorkPage } from './WorkPage';
import { SettingsPage } from './SettingsPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/expenses" replace /> },
      { path: 'expenses', element: <ExpensesPage /> },
      { path: 'secrets', element: <SecretsPage /> },
      { path: 'work', element: <WorkPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
