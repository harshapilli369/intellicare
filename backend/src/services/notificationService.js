const Notification = require('../models/mongodb/Notification');

const shape = (notification) => ({
  id: notification._id,
  kind: notification.kind,
  title: notification.title,
  body: notification.body,
  link: notification.link,
  read: Boolean(notification.readAt),
  createdAt: notification.createdAt,
});

const notify = async ({ userId, kind, title, body = null, link = null }) => {
  if (!userId) return null;
  return Notification.create({ userId, kind, title, body, link });
};

const listFor = async (userId, { unreadOnly = false, limit = 50 } = {}) => {
  const where = { userId };
  if (unreadOnly) where.readAt = null;

  const notifications = await Notification.find(where).sort({ createdAt: -1 }).limit(limit);
  return notifications.map(shape);
};

const countUnread = (userId) => Notification.countDocuments({ userId, readAt: null });

// Marking read is idempotent, and scoped to the owner: an id belonging to
// somebody else simply matches nothing rather than reporting what exists.
const markRead = async (userId, id) => {
  const notification = await Notification.findOne({ _id: id, userId });
  if (!notification) return null;

  if (!notification.readAt) {
    notification.readAt = new Date();
    await notification.save();
  }
  return shape(notification);
};

const markAllRead = async (userId) => {
  const { modifiedCount } = await Notification.updateMany(
    { userId, readAt: null },
    { $set: { readAt: new Date() } }
  );
  return modifiedCount;
};

module.exports = { notify, listFor, countUnread, markRead, markAllRead, shape };
