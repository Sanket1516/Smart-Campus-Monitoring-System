import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import RoleRoute from './components/RoleRoute';
import Login from './pages/Login';
import Scanner from './pages/Scanner';
import Dashboard from './pages/Dashboard';
import StudentLogs from './pages/StudentLogs';
import Analytics from './pages/Analytics';
import Hostellers from './pages/Hostellers';
import Settings from './pages/Settings';
import Terminals from './pages/Terminals';
import Enrollment from './pages/Enrollment';
import AccessControl from './pages/AccessControl';
import WardenPortal from './pages/WardenPortal';
import StudentExitRequest from './pages/StudentExitRequest';
import PublicLiveDashboard from './pages/PublicLiveDashboard';
import { ROLES } from './utils/rolePermissions';

function PrivateRoute({ children }) {
  const { admin, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  return admin ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/live" element={<PublicLiveDashboard />} />
        <Route path="/student/exit-request" element={<StudentExitRequest />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" />} />
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
          <Route path="settings" element={<Navigate to="/admin/settings" replace />} />
          <Route path="admin/settings" element={
            <RoleRoute path="/admin/settings" requiredRoles={[ROLES.ADMIN]}>
              <Settings />
            </RoleRoute>
          } />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </>
  );
}
