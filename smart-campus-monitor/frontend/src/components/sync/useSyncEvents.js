import { useEffect, useRef } from 'react';
import { useSocket } from '../../context/SocketContext';

const SYNC_EVENTS = ['sync:command', 'sync:student', 'sync:terminal', 'sync:alert', 'sync:reconcile', 'terminal:online', 'terminal:offline'];

/** Calls `onEvent` (debounced) whenever a sync-related socket event arrives. */
export default function useSyncEvents(onEvent, delayMs = 800) {
  const { socket } = useSocket();
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!socket) return undefined;
    let timer = null;
    const listener = (eventName) => (payload) => {
      clearTimeout(timer);
      timer = setTimeout(() => handlerRef.current?.(eventName, payload), delayMs);
    };
    const bound = SYNC_EVENTS.map((name) => [name, listener(name)]);
    bound.forEach(([name, fn]) => socket.on(name, fn));
    return () => {
      clearTimeout(timer);
      bound.forEach(([name, fn]) => socket.off(name, fn));
    };
  }, [socket, delayMs]);
}
