import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { ProtectedRoute, RequireCompany, RoleRoute } from '@/routes/guards';
import { AppShell } from '@/components/layout/AppShell';

// Auth pages
import { SignIn } from '@/pages/auth/SignIn';
import { CreateCompany } from '@/pages/auth/CreateCompany';
import { ForgotPassword } from '@/pages/auth/ForgotPassword';
import { ResetPassword } from '@/pages/auth/ResetPassword';
import { AcceptInvitation } from '@/pages/auth/AcceptInvitation';

// Owner pages
import { OwnerDashboardPage } from '@/pages/owner/OwnerDashboardPage';
import { EmployeesPage } from '@/pages/owner/EmployeesPage';
import { JobSitesPage } from '@/pages/owner/JobSitesPage';
import { JobSiteDetailPage } from '@/pages/owner/JobSiteDetailPage';
import { TimeEntriesPage } from '@/pages/owner/TimeEntriesPage';
import { TimesheetsPage } from '@/pages/owner/TimesheetsPage';
import { MaterialsPage } from '@/pages/owner/MaterialsPage';
import { ReportsPage } from '@/pages/owner/ReportsPage';
import { AuditPage } from '@/pages/owner/AuditPage';
import { SettingsPage } from '@/pages/owner/SettingsPage';
import { OwnerProfilePage } from '@/pages/owner/OwnerProfilePage';

// Employee pages
import { EmployeeDashboardPage } from '@/pages/employee/EmployeeDashboardPage';
import { MyTimeEntriesPage } from '@/pages/employee/MyTimeEntriesPage';
import { MyTimesheetsPage } from '@/pages/employee/MyTimesheetsPage';
import { EmployeeJobSitesPage } from '@/pages/employee/EmployeeJobSitesPage';
import { EmployeeProfilePage } from '@/pages/employee/EmployeeProfilePage';
import { CalendarPage } from '@/pages/employee/CalendarPage';
import { ChatPage } from '@/pages/shared/ChatPage';
import { LiveHoursPage } from '@/pages/owner/LiveHoursPage';
import { AnalysisPage } from '@/pages/owner/AnalysisPage';
import { EmployeeStatsPage } from '@/pages/employee/EmployeeStatsPage';
import { EmployeeMaterialsPage } from '@/pages/employee/EmployeeMaterialsPage';
import { EmployeeDetailPage } from '@/pages/owner/EmployeeDetailPage';

function HomeRedirect() {
  const { role } = useAuth();
  if (role === 'owner') return <Navigate to="/app" replace />;
  return <Navigate to="/me" replace />;
}

const router = createBrowserRouter([
  // Public / auth routes
  { path: '/signin', element: <SignIn /> },
  { path: '/create-company', element: <CreateCompany /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/reset-password', element: <ResetPassword /> },
  { path: '/accept-invitation', element: <AcceptInvitation /> },

  // Authenticated routes
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <RequireCompany />,
        children: [
          // Root → role-based redirect
          { path: '/', element: <HomeRedirect /> },

          // Owner workspace (/app/*)
          {
            path: '/app',
            element: <RoleRoute role="owner" />,
            children: [
              {
                element: <AppShell />,
                children: [
                  { index: true, element: <OwnerDashboardPage /> },
                  { path: 'employees', element: <EmployeesPage /> },
                  { path: 'employees/:id', element: <EmployeeDetailPage /> },
                  { path: 'job-sites', element: <JobSitesPage /> },
                  { path: 'job-sites/:id', element: <JobSiteDetailPage /> },
                  { path: 'time-entries', element: <TimeEntriesPage /> },
                  { path: 'timesheets', element: <TimesheetsPage /> },
                  { path: 'materials', element: <MaterialsPage /> },
                  { path: 'reports', element: <ReportsPage /> },
                  { path: 'audit', element: <AuditPage /> },
                  { path: 'live-hours', element: <LiveHoursPage /> },
                  { path: 'analysis', element: <AnalysisPage /> },
                  { path: 'chat', element: <ChatPage /> },
                  { path: 'settings', element: <SettingsPage /> },
                  { path: 'profile', element: <OwnerProfilePage /> },
                ],
              },
            ],
          },

          // Employee workspace (/me/*)
          {
            path: '/me',
            element: <RoleRoute role="employee" />,
            children: [
              {
                element: <AppShell />,
                children: [
                  { index: true, element: <EmployeeDashboardPage /> },
                  { path: 'time-entries', element: <MyTimeEntriesPage /> },
                  { path: 'timesheets', element: <MyTimesheetsPage /> },
                  { path: 'calendar', element: <CalendarPage /> },
                  { path: 'job-sites', element: <EmployeeJobSitesPage /> },
                  { path: 'chat', element: <ChatPage /> },
                  { path: 'materials', element: <EmployeeMaterialsPage /> },
                  { path: 'stats', element: <EmployeeStatsPage /> },
                  { path: 'profile', element: <EmployeeProfilePage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  // Catch-all
  { path: '*', element: <Navigate to="/" replace /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
