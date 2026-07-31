const notificationService = require('../services/notificationService');

// Everything here is scoped to the signed-in account. The owner is taken from
// the token, never from the request, so there is no way to read or change
// somebody else's notifications.
const list = async (req, res, next) => {
  try {
    const unreadOnly = req.query.unread === 'true';
    const [notifications, unread] = await Promise.all([
      notificationService.listFor(req.user.id, { unreadOnly }),
      notificationService.countUnread(req.user.id),
    ]);

    res.json({ success: true, notifications, unread });
  } catch (err) {
    next(err);
  }
};

const markRead = async (req, res, next) => {
  try {
    const notification = await notificationService.markRead(req.user.id, req.params.id);
    if (!notification) return res.status(404).json({ message: 'Notification not found' });

    const unread = await notificationService.countUnread(req.user.id);
    res.json({ success: true, notification, unread });
  } catch (err) {
    next(err);
  }
};

const markAllRead = async (req, res, next) => {
  try {
    const updated = await notificationService.markAllRead(req.user.id);
    res.json({ success: true, updated, unread: 0 });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, markRead, markAllRead };
