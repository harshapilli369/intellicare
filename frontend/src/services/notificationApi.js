import api from './api';

// Every call is scoped to the signed-in account by the backend, so none of
// these takes a user.
export const listNotifications = () => api.get('/notifications').then((r) => r.data);

export const markNotificationRead = (id) =>
  api.patch(`/notifications/${id}/read`).then((r) => r.data);

export const markAllNotificationsRead = () =>
  api.patch('/notifications/read-all').then((r) => r.data);
