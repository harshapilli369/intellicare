import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/notificationApi';

// Reminders are raised by a job rather than by anything the user did, so the
// count is re-read periodically instead of only on load.
const POLL_MS = 60_000;

const relativeTime = (value) => {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

const NotificationBell = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await listNotifications();
      setNotifications(data.notifications);
      setUnread(data.unread);
    } catch {
      // A failure here should never interrupt the page the user is on.
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Clicking anywhere else closes the panel.
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const openNotification = async (notification) => {
    if (!notification.read) {
      const { unread: remaining } = await markNotificationRead(notification.id);
      setNotifications((current) =>
        current.map((item) => (item.id === notification.id ? { ...item, read: true } : item))
      );
      setUnread(remaining);
    }
    if (notification.link) {
      setOpen(false);
      navigate(notification.link);
    }
  };

  const readAll = async () => {
    await markAllNotificationsRead();
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    setUnread(0);
  };

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[1.25rem] rounded-full bg-brand px-1 text-xs font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={readAll} className="text-xs text-brand hover:underline">
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">Nothing yet.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(notification)}
                    className={`w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${
                      notification.read ? 'bg-white' : 'bg-brand-50/40'
                    }`}
                  >
                    <p className="text-sm font-medium text-slate-900">{notification.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {relativeTime(notification.createdAt)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
