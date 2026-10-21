import { Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import AdminDashboardPage from '../../features/dashboard/pages/AdminDashboardPage';
import WardenDashboardPage from '../../features/dashboard/pages/WardenDashboardPage';
import StaffAttendancePage from '../../features/attendance/pages/StaffAttendancePage';
import StudentDirectoryPage from '../../features/students/pages/StudentDirectoryPage';
import StudentProfilePage from '../../features/students/pages/StudentProfilePage';
import StudentFormPage from '../../features/students/pages/StudentFormPage';
import NotFoundPage from './NotFoundPage';
import { routePaths } from './routePaths';
import AuthLayout from '../../layouts/AuthLayout';
import LoginPage from '../../features/auth/pages/LoginPage';
import PasswordRecoveryPage from '../../features/auth/pages/PasswordRecoveryPage';
import ResetPasswordPage from '../../features/auth/pages/ResetPasswordPage';
import ProtectedRoute from './ProtectedRoute';
import PublicOnlyRoute from './PublicOnlyRoute';
import RoleGuard from './RoleGuard';
import useAuth from '../../features/auth/hooks/useAuth';
import { dashboardForRole } from '../../config/roles';
const StudentSetupPage = lazy(
  () => import('../../features/auth/pages/StudentSetupPage'),
);
const StudentHomePage = lazy(
  () => import('../../features/student-portal/pages/StudentHomePage'),
);

const AnnouncementsPage = lazy(
  () => import('../../features/announcements/pages/AnnouncementsPage'),
);
const NotificationsPage = lazy(
  () => import('../../features/notifications/pages/NotificationsPage'),
);
const ReportsPage = lazy(
  () => import('../../features/reports/pages/ReportsPage'),
);

const StudentImportPage = lazy(
  () => import('../../features/students/pages/StudentImportPage'),
);
const InventoryPage = lazy(
  () => import('../../features/inventory/pages/InventoryPage'),
);
const LeaveListPage = lazy(
  () => import('../../features/leave/pages/LeaveListPage'),
);
const LeaveDetailPage = lazy(
  () => import('../../features/leave/pages/LeaveDetailPage'),
);
const LateAccessListPage = lazy(
  () => import('../../features/late-access/pages/LateAccessListPage'),
);
const LateAccessDetailPage = lazy(
  () => import('../../features/late-access/pages/LateAccessDetailPage'),
);

const ComplaintListPage = lazy(
  () => import('../../features/complaints/pages/ComplaintListPage'),
);
const ComplaintDetailPage = lazy(
  () => import('../../features/complaints/pages/ComplaintDetailPage'),
);

function DashboardRedirect() {
  const { account } = useAuth();
  return (
    <Navigate
      to={account ? dashboardForRole(account.role) : routePaths.login}
      replace
    />
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route
        path={routePaths.home}
        element={<Navigate to={routePaths.studentLogin} replace />}
      />
      <Route
        path="/student/login"
        element={<Navigate to={routePaths.studentLogin} replace />}
      />
      <Route element={<AuthLayout />}>
        <Route element={<PublicOnlyRoute />}>
          <Route path={routePaths.login} element={<LoginPage />} />
          <Route
            path={routePaths.studentLogin}
            element={<LoginPage student />}
          />
        </Route>
        <Route
          path={routePaths.studentForgotPassword}
          element={<PasswordRecoveryPage student />}
        />
        <Route
          path={routePaths.studentResetPassword}
          element={<ResetPasswordPage />}
        />
        <Route element={<ProtectedRoute portal="student" allowSetup />}>
          <Route
            path={routePaths.studentSetup}
            element={
              <Suspense fallback={<p role="status">Loading account setup…</p>}>
                <StudentSetupPage />
              </Suspense>
            }
          />
        </Route>
        <Route
          path={routePaths.forgotPassword}
          element={<PasswordRecoveryPage />}
        />
        <Route
          path={routePaths.resetPassword}
          element={<ResetPasswordPage />}
        />
      </Route>
      <Route element={<ProtectedRoute portal="student" />}>
        {(
          [
            [routePaths.ownStudentProfile, 'profile'],
            [routePaths.ownStudentAccommodation, 'accommodation'],
            [routePaths.ownStudentQR, 'qr'],
            [routePaths.ownStudentAttendance, 'attendance'],
            [routePaths.ownAnnouncements, 'announcements'],
            [routePaths.ownNotifications, 'notifications'],
            [
              `${routePaths.ownAnnouncements}/:announcementID`,
              'announcement-detail',
            ],
            [routePaths.ownComplaints, 'complaints'],
            [routePaths.ownComplaintNew, 'complaint-new'],
            [`${routePaths.ownComplaints}/:complaintID`, 'complaint-detail'],
            [routePaths.ownLeaves, 'leaves'],
            [routePaths.ownLeaveNew, 'leave-new'],
            [`${routePaths.ownLeaves}/:leaveID`, 'leave-detail'],
            [routePaths.ownLateAccess, 'access'],
            [routePaths.ownLateAccessNew, 'access-new'],
            [`${routePaths.ownLateAccess}/:lateAccessID`, 'access-detail'],
          ] as const
        ).map(([path, view]) => (
          <Route
            key={path}
            path={path}
            element={
              <Suspense fallback={<p role="status">Loading student page…</p>}>
                <StudentHomePage view={view} />
              </Suspense>
            }
          />
        ))}
        <Route
          path={routePaths.studentHome}
          element={
            <Suspense fallback={<p role="status">Loading student portal…</p>}>
              <StudentHomePage />
            </Suspense>
          }
        />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path={routePaths.dashboard} element={<DashboardLayout />}>
          <Route index element={<DashboardRedirect />} />
          {(['attendance', 'daily', 'leaves', 'complaints'] as const).map(
            (kind) => (
              <Route
                key={kind}
                path={kind === 'attendance' ? 'reports' : `reports/${kind}`}
                element={
                  <Suspense fallback={<p role="status">Loading reports...</p>}>
                    <ReportsPage kind={kind} />
                  </Suspense>
                }
              />
            ),
          )}
          <Route path="attendance" element={<StaffAttendancePage />} />
          <Route
            path="attendance/incidents"
            element={<StaffAttendancePage view="incidents" />}
          />
          <Route
            path="attendance/incidents/:incidentID"
            element={<StaffAttendancePage view="incident" />}
          />
          <Route
            path="notifications"
            element={
              <Suspense fallback={<p role="status">Loading inbox...</p>}>
                <NotificationsPage />
              </Suspense>
            }
          />
          {(['list', 'new', 'detail'] as const).map((view) => (
            <Route
              key={view}
              path={
                view === 'list'
                  ? 'announcements'
                  : view === 'new'
                    ? 'announcements/new'
                    : 'announcements/:announcementID'
              }
              element={
                <Suspense
                  fallback={<p role="status">Loading announcements...</p>}
                >
                  <AnnouncementsPage view={view} />
                </Suspense>
              }
            />
          ))}
          <Route
            path="complaints"
            element={
              <Suspense fallback={<p role="status">Loading complaints…</p>}>
                <ComplaintListPage />
              </Suspense>
            }
          />
          <Route
            path="complaints/:complaintID"
            element={
              <Suspense fallback={<p role="status">Loading complaint…</p>}>
                <ComplaintDetailPage />
              </Suspense>
            }
          />
          <Route
            path="late-access-requests"
            element={
              <Suspense
                fallback={<p role="status">Loading access requests…</p>}
              >
                <LateAccessListPage />
              </Suspense>
            }
          />
          <Route
            path="late-access-requests/:lateAccessID"
            element={
              <Suspense fallback={<p role="status">Loading access request…</p>}>
                <LateAccessDetailPage />
              </Suspense>
            }
          />
          <Route
            path="leaves"
            element={
              <Suspense fallback={<p role="status">Loading leave requests…</p>}>
                <LeaveListPage />
              </Suspense>
            }
          />
          <Route
            path="leaves/:leaveID"
            element={
              <Suspense fallback={<p role="status">Loading leave request…</p>}>
                <LeaveDetailPage />
              </Suspense>
            }
          />
          <Route
            path="inventory"
            element={
              <Suspense fallback={<p role="status">Loading inventory…</p>}>
                <InventoryPage />
              </Suspense>
            }
          />
          <Route path="students" element={<StudentDirectoryPage />} />
          <Route path="students/new" element={<StudentFormPage creating />} />
          <Route
            path="students/:studentID/edit"
            element={<StudentFormPage />}
          />
          <Route path="students/:studentID" element={<StudentProfilePage />} />
          <Route element={<RoleGuard role="admin" />}>
            <Route
              path="students/import"
              element={
                <Suspense
                  fallback={<p role="status">Loading student import…</p>}
                >
                  <StudentImportPage />
                </Suspense>
              }
            />
            <Route path="admin" element={<AdminDashboardPage />} />
          </Route>
          <Route element={<RoleGuard role="warden" />}>
            <Route path="warden" element={<WardenDashboardPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
