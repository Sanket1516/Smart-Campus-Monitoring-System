import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  HiOutlineViewGrid,
  HiOutlineCamera,
  HiOutlineClipboardList,
  HiOutlineChartBar,
  HiOutlineUserGroup,
  HiOutlineCog,
  HiOutlineLogout,
  HiOutlineMenu,
  HiOutlineX,
} from 'react-icons/hi';
import { useState } from 'react';

const navItems = [
  { to: '/dashboard', icon: HiOutlineViewGrid, label: 'Dashboard' },
  { to: '/scanner', icon: HiOutlineCamera, label: 'Gate Scanner' },
  { to: '/logs', icon: HiOutlineClipboardList, label: 'Entry Logs' },
  { to: '/analytics', icon: HiOutlineChartBar, label: 'Analytics' },
  { to: '/hostellers', icon: HiOutlineUserGroup, label: 'Hostellers' },
  { to: '/settings', icon: HiOutlineCog, label: 'Settings' },
];

export default function Layout() {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
      isActive
        ? 'bg-primary-700 text-white'
        : 'text-gray-300 hover:bg-primary-700/50 hover:text-white'
    }`;

  const sidebar = (
    <div className="flex flex-col h-full bg-primary-900 text-white">
      {/* Brand */}
      <div className="p-6 border-b border-primary-700">
        <h1 className="text-xl font-bold">Smart Campus</h1>
        <p className="text-primary-300 text-sm">Entry Monitor</p>
      </div>

      {/* Nav links */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={linkClass}
            onClick={() => setSidebarOpen(false)}
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User info */}
      <div className="p-4 border-t border-primary-700">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">{admin?.name}</p>
            <p className="text-primary-300 text-xs capitalize">{admin?.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg hover:bg-primary-700 transition-colors"
            title="Logout"
          >
            <HiOutlineLogout className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-64 flex-shrink-0">{sidebar}</aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative w-64 h-full z-10">{sidebar}</aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4 md:px-6">
          <button
            className="md:hidden p-1"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? (
              <HiOutlineX className="w-6 h-6" />
            ) : (
              <HiOutlineMenu className="w-6 h-6" />
            )}
          </button>
          <h2 className="text-lg font-semibold text-gray-800">
            Smart Campus Entry Monitoring System
          </h2>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
