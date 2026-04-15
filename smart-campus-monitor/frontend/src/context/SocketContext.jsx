import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getAlertsApi, markAlertsReadApi } from '../services/api';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

const LIVE_EVENT_TYPES = new Set([
  'scan:live',
  'scan:blocked',
  'scan:unauthorized',
  'scan:warden_required',
]);

const deriveSocketUrl = () => {
  const configured = import.meta.env.VITE_SOCKET_URL;
  if (configured) return configured;

  const apiUrl = import.meta.env.VITE_API_URL;
  if (!apiUrl || apiUrl.startsWith('/')) return undefined;

  return apiUrl.replace(/\/api\/?$/, '');
};

const buildTickerItem = (eventName, payload) => {
  const time = payload?.time
    ? new Date(payload.time).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      });

  if (eventName === 'scan:live') {
    return `${payload.studentName || 'Student'} - ${(payload.type || 'scan').toUpperCase()} - ${
      payload.gateName || 'Gate'
    } T${payload.terminalNumber ?? '-'} - ${time}`;
  }

  if (eventName === 'scan:blocked') {
    return `${payload.studentName || 'Student'} - BLOCKED - ${payload.gateName || 'Gate'} T${
      payload.terminalNumber ?? '-'
    } - ${time}`;
  }

  if (eventName === 'scan:unauthorized') {
    return `Unknown - UNAUTHORIZED - ${payload.gateName || 'Gate'} T${
      payload.terminalNumber ?? '-'
    } - ${time}`;
  }

  return `${payload.studentName || 'Student'} - WARDEN REQUIRED - ${payload.gateName || 'Gate'} - ${time}`;
};

export const useSocket = () => useContext(SocketContext);

export function SocketProvider({ children }) {
  const { admin } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [socketError, setSocketError] = useState('');
  const [liveTickerItems, setLiveTickerItems] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  const refreshAlerts = async () => {
    if (!admin) {
      setAlerts([]);
      setUnreadAlerts(0);
      return { alerts: [], unreadCount: 0 };
    }

    try {
      const res = await getAlertsApi({ limit: 10 });
      setAlerts(res.data.alerts || []);
      setUnreadAlerts(res.data.unreadCount || 0);
      return {
        alerts: res.data.alerts || [],
        unreadCount: res.data.unreadCount || 0,
      };
    } catch (_error) {
      // Keep the shell resilient even if alerts are unavailable.
      return { alerts: [], unreadCount: 0 };
    }
  };

  useEffect(() => {
    refreshAlerts();
  }, [admin]);

  useEffect(() => {
    if (!admin) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      setSocketError('');
      return undefined;
    }

    const token = localStorage.getItem('token');
    const socket = io(deriveSocketUrl(), {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      auth: token ? { token } : {},
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setSocketError('');
      if (admin.role === 'warden' && admin.id) {
        socket.emit('warden:join', admin.id);
      }
    });

    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (error) => {
      const message = error?.message || 'Unknown socket connection error';
      console.error('Socket connect_error:', message, error);
      setSocketError(message);
      setConnected(false);
    });
    socket.on('error', (error) => {
      const message = error?.message || 'Unknown socket runtime error';
      console.error('Socket error:', message, error);
      setSocketError(message);
    });

    const eventNames = [
      'scan:live',
      'scan:blocked',
      'scan:unauthorized',
      'scan:warden_required',
      'terminal:offline',
      'terminal:online',
      'warden:new_request',
      'warden:late_return',
      'hostel:warden_changed',
      'unknown:terminal',
      'settings:updated',
    ];

    const handlers = Object.fromEntries(
      eventNames.map((eventName) => [
        eventName,
        (payload) => {
          if (LIVE_EVENT_TYPES.has(eventName)) {
            setLiveTickerItems((current) => [
              { id: `${eventName}-${Date.now()}-${Math.random()}`, text: buildTickerItem(eventName, payload) },
              ...current,
            ].slice(0, 5));
          }
        },
      ])
    );

    eventNames.forEach((eventName) => socket.on(eventName, handlers[eventName]));

    return () => {
      eventNames.forEach((eventName) => socket.off(eventName, handlers[eventName]));
      socket.off('connect_error');
      socket.off('error');
      socket.disconnect();
    };
  }, [admin]);

  const markAlertsRead = async (alertIds = []) => {
    if (!admin) return;

    try {
      const res = await markAlertsReadApi(alertIds);
      setUnreadAlerts(res.data.unreadCount || 0);
      setAlerts((current) =>
        current.map((alert) =>
          !alertIds.length || alertIds.includes(alert._id)
            ? { ...alert, readBy: [...(alert.readBy || []), admin.id] }
            : alert
        )
      );
    } catch (_error) {
      // keep UI responsive even if read sync fails
    }
  };

  const value = useMemo(
    () => ({
      socket: socketRef.current,
      connected,
      socketError,
      liveTickerItems,
      alerts,
      unreadAlerts,
      refreshAlerts,
      markAlertsRead,
    }),
    [connected, socketError, liveTickerItems, alerts, unreadAlerts]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
