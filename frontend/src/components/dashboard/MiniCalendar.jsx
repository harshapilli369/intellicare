const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const monthName = (year, month) =>
  new Date(year, month - 1, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });

// A month grid with a mark under each day that has something booked. Takes the
// busy days as numbers rather than appointments, since that is all it draws.
//
// Passing `onSelectDay` turns it into a picker: days become buttons, the chosen
// one is filled, and anything before today is refused.
const MiniCalendar = ({
  year,
  month,
  busyDays = [],
  onPrevious,
  onNext,
  selectedDay = null,
  onSelectDay = null,
  title = 'Calendar',
}) => {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const today = new Date();
  const isThisMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  // A day already gone cannot be booked, so the picker refuses it.
  const isPast = (day) => {
    const candidate = new Date(year, month - 1, day);
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return candidate < startOfToday;
  };

  return (
    <section className="card">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-slate-700">{monthName(year, month)}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrevious}
            aria-label="Previous month"
            className="rounded px-2 py-1 text-slate-500 transition hover:bg-slate-100"
          >
            &lsaquo;
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Next month"
            className="rounded px-2 py-1 text-slate-500 transition hover:bg-slate-100"
          >
            &rsaquo;
          </button>
        </div>
      </div>

      <div className="mt-3 border-t border-slate-200 pt-4">
        <div className="grid grid-cols-7 gap-y-3 text-center">
          {DAY_LABELS.map((label) => (
            <div key={label} className="text-[11px] font-medium tracking-wide text-slate-500">
              {label}
            </div>
          ))}

          {cells.map((day, index) => (
            <div key={day ?? `blank-${index}`} className="flex flex-col items-center gap-1">
              {day &&
                (onSelectDay ? (
                  <button
                    type="button"
                    onClick={() => onSelectDay(day)}
                    disabled={isPast(day)}
                    className={`h-8 w-8 rounded-lg text-sm transition ${
                      day === selectedDay
                        ? 'bg-slate-900 font-semibold text-white'
                        : 'text-slate-800 hover:bg-slate-100 disabled:text-slate-300 disabled:hover:bg-transparent'
                    }`}
                  >
                    {day}
                  </button>
                ) : (
                  <span
                    className={`text-sm ${
                      isThisMonth && day === today.getDate()
                        ? 'font-bold text-brand'
                        : 'text-slate-800'
                    }`}
                  >
                    {day}
                  </span>
                ))}
              {day && !onSelectDay && (
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    busyDays.includes(day) ? 'bg-red-500' : 'bg-transparent'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default MiniCalendar;
