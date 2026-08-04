// How an appointment time is written wherever a person will read it - a
// reminder email, a notification in the bell. Seconds are noise on a diary
// entry, and a bare `toLocaleString` includes them.
const formatWhen = (value) =>
  new Date(value).toLocaleString('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

module.exports = { formatWhen };
