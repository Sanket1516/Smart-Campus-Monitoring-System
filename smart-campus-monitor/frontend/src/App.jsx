import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import RoleRoute from './components/RoleRoute';
import Login from './pages/Login';
const Scanner = lazy(() => import('./pages/Scanner'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const StudentLogs = lazy(() => import('./pages/StudentLogs'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Hostellers = lazy(() => import('./pages/Hostellers'));
const Settings = lazy(() => import('./pages/Settings'));
const Terminals = lazy(() => import('./pages/Terminals'));
const Enrollment = lazy(() => import('./pages/Enrollment'));
const AccessControl = lazy(() => import('./pages/AccessControl'));
const WardenPortal = lazy(() => import('./pages/WardenPortal'));
const StudentExitRequest = lazy(() => import('./pages/StudentExitRequest'));
const PublicLiveDashboard = lazy(() => import('./pages/PublicLiveDashboard'));
const StudentManagement = lazy(() => import('./pages/StudentManagement'));
const TerminalSync = lazy(() => import('./pages/TerminalSync'));
const Visitors = lazy(() => import('./pages/Visitors'));
const Platform = lazy(() => import('./pages/Platform'));
import { ROLES } from './utils/rolePermissions';

function PrivateRoute({ children }) {
  const { admin, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  return admin ? children : <Navigate to="/login" />;
}

/** Route chunks load on demand; this is shown while one downloads. */
function RouteLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-cyan-400" />
    </div>
  );
}

export default function App() {
  return (
    <>
      <Toaster position="top-right" />
      <Suspense fallback={<RouteLoader />}>
      <Routes>
        <Route path="/" element={<Platform />} />
        <Route path="/platform" element={<Platform />} />
        <Route path="/login" element={<Login />} />
        <Route path="/live" element={<PublicLiveDashboard />} />
        <Route path="/student/exit-request" element={<StudentExitRequest />} />
        <Route
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route path="dashboard" element={
            <RoleRoute path="/dashboard">
              <Dashboard />
            </RoleRoute>
          } />
          <Route path="scanner" element={
            <RoleRoute path="/scanner">
              <Scanner />
            </RoleRoute>
          } />
          <Route path="logs" element={
            <RoleRoute path="/logs">
              <StudentLogs />
            </RoleRoute>
          } />
          <Route path="analytics" element={
            <RoleRoute path="/analytics">
              <Analytics />
            </RoleRoute>
          } />
          <Route path="hostellers" element={
            <RoleRoute path="/hostellers">
              <Hostellers />
            </RoleRoute>
          } />
          <Route path="admin/students" element={
            <RoleRoute path="/admin/students" requiredRoles={[ROLES.ADMIN]}>
              <StudentManagement />
            </RoleRoute>
          } />
          <Route path="admin/enrollment" element={
            <RoleRoute path="/admin/enrollment" requiredRoles={[ROLES.ADMIN]}>
              <Enrollment />
            </RoleRoute>
          } />
          <Route path="admin/access-control" element={
            <RoleRoute path="/admin/access-control" requiredRoles={[ROLES.ADMIN]}>
              <AccessControl />
            </RoleRoute>
          } />
          <Route path="admin/warden-portal" element={
            <RoleRoute path="/admin/warden-portal" requiredRoles={[ROLES.ADMIN, ROLES.WARDEN]}>
              <WardenPortal />
            </RoleRoute>
          } />
          <Route path="admin/terminals" element={
            <RoleRoute path="/admin/terminals" requiredRoles={[ROLES.ADMIN]}>
              <Terminals />
            </RoleRoute>
          } />
          <Route path="admin/terminal-sync" element={
            <RoleRoute path="/admin/terminal-sync" requiredRoles={[ROLES.ADMIN]}>
              <TerminalSync />
            </RoleRoute>
          } />
          <Route path="visitors" element={
            <RoleRoute path="/visitors">
              <Visitors />
            </RoleRoute>
          } />
          <Route path="settings" element={<Navigate to="/admin/settings" replace />} />
          <Route path="admin/settings" element={
            <RoleRoute path="/admin/settings" requiredRoles={[ROLES.ADMIN]}>
              <Settings />
            </RoleRoute>
          } />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </>
  );
}
