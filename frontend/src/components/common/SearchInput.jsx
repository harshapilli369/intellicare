// The wide search field that sits across the top of the directory and dashboard
// screens, with the magnifier inside the field on the right.
const SearchInput = ({ value, onChange, placeholder = 'Search' }) => (
  <div className="relative">
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="w-full rounded-xl border border-slate-300 bg-white py-3.5 pl-5 pr-12 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand"
    />
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" strokeLinecap="round" />
    </svg>
  </div>
);

export default SearchInput;
