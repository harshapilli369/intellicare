import { useEffect, useState } from 'react';

// Returns `value` only once it has stopped changing for `delay` milliseconds.
// The patient search uses this so a request goes out per pause in typing rather
// than per keystroke.
const useDebouncedValue = (value, delay = 300) => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
};

export default useDebouncedValue;
