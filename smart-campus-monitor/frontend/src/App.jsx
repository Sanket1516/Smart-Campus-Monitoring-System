import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
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
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="scanner" element={<Scanner />} />
          <Route path="logs" element={<StudentLogs />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="hostellers" element={<Hostellers />} />
          <Route path="admin/enrollment" element={<Enrollment />} />
          <Route path="admin/access-control" element={<AccessControl />} />
          <Route path="admin/terminals" element={<Terminals />} />
          <Route path="settings" element={<Navigate to="/admin/settings" replace />} />
          <Route path="admin/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </>
  );
}
