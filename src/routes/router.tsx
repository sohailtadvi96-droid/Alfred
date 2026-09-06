import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { RequireAuth } from '@/auth/RequireAuth';
import { LoginPage } from '@/auth/LoginPage';
import { ExpensesPage } from './ExpensesPage';
import { TransactionsPage } from './TransactionsPage';
import { PeoplePage } from './PeoplePage';
import { ReviewPage } from './ReviewPage';
import { SecretsPage } from './SecretsPage';
import { WorkPage } from './WorkPage';
import { DesignPage } from './DesignPage';
import { DesignDiscoverPage } from './DesignDiscoverPage';
import { DesignBoardPage } from './DesignBoardPage';
import { ProjectDetailPage } from './ProjectDetailPage';
import { OfficeDayPage } from './OfficeDayPage';
import { InvoicesPage } from './InvoicesPage';
import { InvoiceViewPage } from './InvoiceViewPage';
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
      { path: 'expenses/transactions', element: <TransactionsPage /> },
      { path: 'expenses/people', element: <PeoplePage /> },
      { path: 'expenses/review', element: <ReviewPage /> },
      { path: 'secrets', element: <SecretsPage /> },
      { path: 'design', element: <DesignPage /> },
      { path: 'design/discover', element: <DesignDiscoverPage /> },
      { path: 'design/:boardId', element: <DesignBoardPage /> },
      { path: 'work', element: <WorkPage /> },
      { path: 'work/day/:date', element: <OfficeDayPage /> },
      { path: 'work/invoices', element: <InvoicesPage /> },
      { path: 'work/invoices/:invoiceId', element: <InvoiceViewPage /> },
      { path: 'work/:projectId', element: <ProjectDetailPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
