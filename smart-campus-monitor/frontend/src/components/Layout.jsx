import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  HiOutlineViewGrid,
  HiOutlineCamera,
  HiOutlineClipboardList,
  HiOutlineShieldExclamation,
  HiOutlineChartBar,
  HiOutlineUserGroup,
  HiOutlineCog,
  HiOutlineDesktopComputer,
  HiOutlineBadgeCheck,
  HiOutlineLogout,
  HiOutlineMenu,
  HiOutlineX,
  HiOutlineMoon,
  HiOutlineSun,
} from 'react-icons/hi';
import { useEffect, useState } from 'react';
import AlertBell from './AlertBell';
import LiveScanTicker from './LiveScanTicker';
import { useSocket } from '../context/SocketContext';

const navItems = [
  { to: '/dashboard', icon: HiOutlineViewGrid, label: 'Dashboard' },
  { to: '/scanner', icon: HiOutlineCamera, label: 'Gate Scanner' },
  { to: '/logs', icon: HiOutlineClipboardList, label: 'Entry Logs' },
  { to: '/analytics', icon: HiOutlineChartBar, label: 'Analytics' },
  { to: '/hostellers', icon: HiOutlineUserGroup, label: 'Hostellers' },
  { to: '/admin/enrollment', icon: HiOutlineBadgeCheck, label: 'Enrollment' },
  { to: '/admin/access-control', icon: HiOutlineShieldExclamation, label: 'Access Control' },
  { to: '/admin/terminals', icon: HiOutlineDesktopComputer, label: 'Terminals' },
  { to: '/admin/settings', icon: HiOutlineCog, label: 'Settings' },
];

export default function Layout() {
  const { admin, logout } = useAuth();
  const { connected } = useSocket();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    const savedTheme = window.localStorage.getItem('smart-campus-theme');
    if (savedTheme) return savedTheme === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    window.localStorage.setItem('smart-campus-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

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
    <div className="flex h-screen overflow-hidden bg-gray-50 text-gray-900 dark:bg-slate-950 dark:text-slate-100">
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
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4 md:px-6 dark:bg-slate-900 dark:border-slate-800">
          <button
            className="md:hidden p-1 text-gray-700 dark:text-slate-200"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? (
              <HiOutlineX className="w-6 h-6" />
            ) : (
              <HiOutlineMenu className="w-6 h-6" />
            )}
          </button>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-100">
            Smart Campus Entry Monitoring System
          </h2>
          <div className="ml-auto flex items-center gap-3">
            <span
              className={`hidden rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide md:inline-flex ${
                connected
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
              }`}
            >
              {connected ? 'Socket Online' : 'Socket Offline'}
            </span>
            <AlertBell />
            <button
              type="button"
              onClick={() => setDarkMode((current) => !current)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? (
                <HiOutlineSun className="w-5 h-5" />
              ) : (
                <HiOutlineMoon className="w-5 h-5" />
              )}
              {darkMode ? 'Light Mode' : 'Dark Mode'}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50 dark:bg-slate-950">
          <Outlet />
        </main>
        <LiveScanTicker />
      </div>
    </div>
  );
}
