const mongoose = require('mongoose');

// Something the application wants a particular person to see next time they are
// in it. Addressed to the account rather than to a patient profile, so the same
// shape serves all three roles.
const notificationSchema = new mongoose.Schema(
  {
    userId: { type: Number, required: true },
    // What produced it, so the frontend can pick an icon or wording later
    // without parsing the message.
    kind: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: null },
    // Where the notification takes you when acted on, as an in-app path.
    link: { type: String, default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The list is always "mine, newest first", and the unread count filters on top
// of the same index.
notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
