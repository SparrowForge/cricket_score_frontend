'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { NotificationsBell } from './notifications-bell';

const links = [
  { href: '/', label: 'Home', exact: true },
  { href: '/matches', label: 'Live Scores' },
  { href: '/tournaments', label: 'Tournaments' },
  { href: '/players', label: 'Players' },
  { href: '/news', label: 'News' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/admin', label: 'Manage', authed: true },
];

function ThemeToggle() {
  // Lazy init reads the same source as the layout's inline script, so React
  // state always matches the DOM (no hydration mismatch).
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  });

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('criclive_theme', next);
    } catch {
      /* private mode */
    }
  };

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-base hover:bg-panel-2"
    >
      <span suppressHydrationWarning>{theme === 'dark' ? '\u2600\ufe0f' : '\ud83c\udf19'}</span>
    </button>
  );
}

export function Nav() {
  const { user, loading, logout } = useAuth();
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu on navigation.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMenuOpen(false);
  }, [path]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const visible = links.filter((l) => !l.authed || user);
  const isActive = (l: (typeof links)[number]) => (l.exact ? path === l.href : path.startsWith(l.href));

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-pitch/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        {/* Hamburger - only on small screens */}
        <button
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line text-ink md:hidden"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
        </button>

        <Link href="/" aria-label="CricLive home" className="flex shrink-0 items-center">
          <Image
            src="/brand/logo.png"
            alt="CricLive"
            width={667}
            height={532}
            priority
            sizes="(min-width: 768px) 70px, 60px"
            className="h-12 w-auto md:h-14"
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-0.5 md:flex">
          {visible.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-semibold ${
                isActive(l) ? 'bg-panel-2 text-ink' : 'text-mut hover:text-ink'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ThemeToggle />
          {loading ? null : user ? (
            <>
              <NotificationsBell />
              <span className="hidden text-sm text-mut lg:inline">{user.full_name}</span>
              <button onClick={logout} className="btn-ghost !py-1.5">
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost hidden !py-1.5 sm:inline-flex">
                Sign in
              </Link>
              <Link href="/register" className="btn-primary !py-1.5">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile menu drawer */}
      {menuOpen && (
        <nav className="border-t border-line bg-pitch px-4 py-2 md:hidden">
          {visible.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`block rounded-lg px-3 py-2.5 text-sm font-semibold ${
                isActive(l) ? 'bg-panel-2 text-ink' : 'text-mut'
              }`}
            >
              {l.label}
            </Link>
          ))}
          {!loading && !user && (
            <Link href="/login" className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-mut sm:hidden">
              Sign in
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}

