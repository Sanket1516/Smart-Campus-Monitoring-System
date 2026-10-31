import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  HiOutlineViewGrid,
  HiOutlineCamera,
  HiOutlineClipboardList,
  HiOutlineShieldExclamation,
  HiOutlineChartBar,
  HiOutlineUserGroup,
  HiOutlineCog,
  HiOutlineDesktopComputer,
  HiOutlineFingerPrint,
  HiOutlineLogout,
  HiOutlineMenu,
  HiOutlineX,
  HiOutlineMoon,
  HiOutlineSun,
  HiOutlineUsers,
  HiOutlineStatusOnline,
  HiOutlineGlobe,
  HiOutlineIdentification,
  HiOutlineHome,
  HiOutlineSearch,
  HiOutlineExternalLink,
} from 'react-icons/hi';
import { useAuth } from '../context/AuthContext';
import AlertBell from './AlertBell';
import LiveScanTicker from './LiveScanTicker';
import { useSocket } from '../context/SocketContext';
import { getFilteredNavItems } from '../utils/rolePermissions';
import { getPublicBrandingApi, getStudentsApi, getTerminalStatusApi } from '../services/api';

/** Navigation grouped by operational domain; filtered by the user's role. */
const NAV_GROUPS = [
  {
    label: 'Command',
    items: [
      { to: '/dashboard', icon: HiOutlineViewGrid, label: 'Overview' },
      { to: '/live', icon: HiOutlineGlobe, label: 'Live Monitoring', external: true },
      { to: '/scanner', icon: HiOutlineCamera, label: 'Gate Scanner' },
      { to: '/logs', icon: HiOutlineClipboardList, label: 'Entry & Exit Logs' },
      { to: '/visitors', icon: HiOutlineIdentification, label: 'Visitors' },
    ],
  },
  {
    label: 'Identity',
    items: [
      { to: '/admin/students', icon: HiOutlineUsers, label: 'Student Management' },
      { to: '/admin/enrollment', icon: HiOutlineFingerPrint, label: 'Enrollment & Sync' },
    ],
  },
  {
    label: 'Safety',
    items: [
      { to: '/hostellers', icon: HiOutlineHome, label: 'Hosteller Monitoring' },
      { to: '/admin/warden-portal', icon: HiOutlineUserGroup, label: 'Warden Portal' },
      { to: '/admin/access-control', icon: HiOutlineShieldExclamation, label: 'Access Control' },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { to: '/admin/terminals', icon: HiOutlineDesktopComputer, label: 'Terminal Management' },
      { to: '/admin/terminal-sync', icon: HiOutlineStatusOnline, label: 'Terminal Sync' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { to: '/analytics', icon: HiOutlineChartBar, label: 'Analytics' },
      { to: '/admin/settings', icon: HiOutlineCog, label: 'Settings' },
    ],
  },
];

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="hidden text-right leading-tight xl:block" aria-live="off">
      <div className="font-mono text-sm tabular-nums text-white">
        {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
      </div>
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-400">
        {now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
      </div>
    </div>
  );
}

/** Real terminal connectivity from /api/terminals/status; refreshed on socket events. */
function TerminalIndicator() {
  const { socket } = useSocket();
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const load = useCallback(async () => {
    try {
      const res = await getTerminalStatusApi();
      const list = Array.isArray(res.data) ? res.data : res.data?.terminals || [];
      setState({ online: list.filter((t) => t.isOnline).length, total: list.length });
    } catch (_error) {
      setState({ error: true });
    }
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (!socket) return undefined;
    socket.on('terminal:online', load);
    socket.on('terminal:offline', load);
    return () => {
      socket.off('terminal:online', load);
      socket.off('terminal:offline', load);
    };
  }, [socket, load]);
  if (!state) return null;
  const allUp = !state.error && state.total > 0 && state.online === state.total;
  const tone = state.error ? 'chip-off' : allUp ? 'chip-ok' : state.online ? 'chip-warn' : 'chip-bad';
  return (
    <button type="button" onClick={() => navigate('/admin/terminals')} className={`${tone} hidden py-1 md:inline-flex`} title="Terminal connectivity">
      <span className={`h-1.5 w-1.5 rounded-full ${allUp ? 'animate-pulse bg-emerald-400' : 'bg-current'}`} />
      {state.error ? 'Terminals: n/a' : `Terminals ${state.online}/${state.total}`}
    </button>
  );
}

/** Global search: students by name or SAP ID (the same API the directory uses). */
function GlobalSearch({ role }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await getStudentsApi({ search: query.trim(), limit: 6 });
        setResults(res.data.students || []);
        setOpen(true);
      } catch (_error) {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        boxRef.current?.querySelector('input')?.focus();
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (student) => {
    setOpen(false);
    setQuery('');
    if (role === 'admin') navigate(`/admin/students?search=${encodeURIComponent(student.sapId)}`);
    else navigate(`/logs?search=${encodeURIComponent(student.sapId)}`);
  };

  return (
    <div ref={boxRef} className="relative hidden w-full max-w-sm md:block">
      <HiOutlineSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search student or SAP ID"
        aria-label="Search students by name or SAP ID"
        className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2 pl-9 pr-14 text-sm text-white placeholder:text-ink-400 focus:border-cyan-400/50 focus:outline-none"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-white/10 px-1.5 font-mono text-[10px] text-ink-400">⌘K</kbd>
      {open && results.length > 0 && (
        <ul className="panel absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden p-1" role="listbox">
          {results.map((student) => (
            <li key={student._id}>
              <button
                type="button"
                onMouseDown={() => go(student)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-white/5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-white">{student.name}</span>
                  <span className="font-mono text-[11px] text-ink-400">{student.sapId}</span>
                </span>
                <span className={student.accessStatus === 'blocked' ? 'chip-bad' : 'chip-ok'}>
                  {student.accessStatus === 'blocked' ? 'Blocked' : student.studentType === 'hosteller' ? 'Hosteller' : 'Day scholar'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Layout() {
  const { admin, logout } = useAuth();
  const { connected, socketError } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [campusName, setCampusName] = useState('');
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem('smart-campus-theme') !== 'light';
  });

  const groups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({ ...group, items: getFilteredNavItems(group.items, admin?.role) })).filter(
        (group) => group.items.length
      ),
    [admin?.role]
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    window.localStorage.setItem('smart-campus-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    getPublicBrandingApi()
      .then((res) => setCampusName(res.data.collegeName || ''))
      .catch(() => setCampusName(''));
  }, []);

  useEffect(() => setSidebarOpen(false), [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const linkClass = ({ isActive }) =>
    `group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors ${
      isActive ? 'bg-white/[0.07] text-white' : 'text-ink-300 hover:bg-white/[0.04] hover:text-white'
    }`;

  const sidebar = (
    <div className="flex h-full flex-col border-r border-white/5 bg-ink-950/95 text-white">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-400/10">
          <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_12px_#22d3ee]" />
        </span>
        <div className="leading-tight">
          <div className="font-display text-base font-semibold tracking-tight">Sentinel</div>
          <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-400">Campus security</div>
        </div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Console">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="mb-1.5 px-3 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-500">{group.label}</div>
            <div className="space-y-0.5">
              {group.items.map((item) =>
                item.external ? (
                  <a key={item.to} href={item.to} target="_blank" rel="noreferrer" className={linkClass({ isActive: false })}>
                    <item.icon className="h-[18px] w-[18px] shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    <HiOutlineExternalLink className="h-3.5 w-3.5 opacity-50" />
                  </a>
                ) : (
                  <NavLink key={item.to} to={item.to} className={linkClass}>
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-cyan-400" />}
                        <item.icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-cyan-300' : ''}`} />
                        {item.label}
                      </>
                    )}
                  </NavLink>
                )
              )}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/5 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-cyan-500 font-display text-sm font-semibold">
            {(admin?.name || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{admin?.name}</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-400">{admin?.role}</p>
          </div>
          <button onClick={handleLogout} className="rounded-lg p-2 text-ink-300 hover:bg-white/5 hover:text-white" title="Log out" aria-label="Log out">
            <HiOutlineLogout className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 text-gray-900 dark:bg-ink-900 dark:text-ink-100">
      <aside className="hidden w-64 flex-shrink-0 lg:block">{sidebar}</aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative z-10 h-full w-72 animate-fade-in">{sidebar}</aside>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-white/5 bg-ink-900/80 px-4 py-3 backdrop-blur-xl md:px-6">
          <button
            className="rounded-lg p-1.5 text-ink-200 hover:bg-white/5 lg:hidden"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
          >
            {sidebarOpen ? <HiOutlineX className="h-6 w-6" /> : <HiOutlineMenu className="h-6 w-6" />}
          </button>
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">Campus</div>
            <div className="truncate font-display text-sm font-semibold text-white md:text-base">{campusName || 'Smart Campus'}</div>
          </div>
          <div className="mx-auto w-full max-w-sm px-2">
            <GlobalSearch role={admin?.role} />
          </div>
          <div className="ml-auto flex items-center gap-2 md:gap-3">
            <Clock />
            <TerminalIndicator />
            <span
              className={`${connected ? 'chip-ok' : 'chip-warn'} hidden py-1 sm:inline-flex`}
              title={!connected && socketError ? socketError : 'Real-time event stream'}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {connected ? 'Live' : 'Reconnecting'}
            </span>
            <AlertBell />
            <button
              type="button"
              onClick={() => setDarkMode((current) => !current)}
              className="rounded-lg p-2 text-ink-300 hover:bg-white/5 hover:text-white"
              title={darkMode ? 'Light theme' : 'Command-centre (dark) theme'}
              aria-label="Toggle theme"
            >
              {darkMode ? <HiOutlineSun className="h-5 w-5" /> : <HiOutlineMoon className="h-5 w-5" />}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-gray-50 p-4 dark:bg-ink-900 md:p-6 xl:p-8">
          <div key={location.pathname} className="page-enter mx-auto max-w-[1600px]">
            <Suspense
              fallback={
                <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading">
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-cyan-400" />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </main>
        <LiveScanTicker />
      </div>
    </div>
  );
}
