const PATHS = {
  grid: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="16.5" rx="2.2" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 5.5a3.2 3.2 0 0 1 0 5.8M21 20a6 6 0 0 0-4.4-5.8" />
    </>
  ),
  ticket: (
    <>
      <path d="M4 7.5h16v3.2a2 2 0 0 0 0 2.6v3.2H4v-3.2a2 2 0 0 0 0-2.6z" />
      <path d="M13.5 7.5v9" strokeDasharray="2 2.4" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3 3 8l9 5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </>
  ),
  door: (
    <>
      <path d="M4 21h16M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21" />
      <circle cx="14.5" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 2.5v3M12 18.5v3M4.4 4.4l2.1 2.1M17.5 17.5l2.1 2.1M2.5 12h3M18.5 12h3M4.4 19.6l2.1-2.1M17.5 6.5l2.1-2.1" />
    </>
  ),
  pulse: <path d="M3 12h3.5l2-6 4 12 2-6H21" />,
  building: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1.6" />
      <path d="M8.5 7.5h.01M15.5 7.5h.01M8.5 11.5h.01M15.5 11.5h.01M8.5 15.5h.01M15.5 15.5h.01" strokeWidth="2.2" />
      <path d="M10 21v-3h4v3" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.2" />
      <path d="M7 9.5l3 2.8-3 2.8M13 15.2h4" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  logout: (
    <>
      <path d="M15 12H3M7.5 8 3.5 12l4 4" />
      <path d="M11.5 4H18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6.5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 13.5A8 8 0 0 1 10.5 4a7 7 0 1 0 9.5 9.5Z" />,
}

export function NavIcon({ name, size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name] || PATHS.grid}
    </svg>
  )
}

export default NavIcon
