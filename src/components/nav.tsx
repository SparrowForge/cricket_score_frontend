'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

export function Nav() {
  const { user, loading, logout } = useAuth();
  const path = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-pitch/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-lg font-black tracking-tight">
          <span>🏏</span>
          <span>Cric<span className="text-grass">Live</span></span>
        </Link>
        <nav className="flex items-center gap-0.5 overflow-x-auto">
          {links.filter((l) => !l.authed || user).map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-semibold ${
                (l.exact ? path === l.href : path.startsWith(l.href))
                  ? 'bg-panel-2 text-ink' : 'text-mut hover:text-ink'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {loading ? null : user ? (
            <>
              <NotificationsBell />
              <span className="hidden text-sm text-mut lg:inline">{user.full_name}</span>
              <button onClick={logout} className="btn-ghost !py-1.5">Sign out</button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost !py-1.5">Sign in</Link>
              <Link href="/register" className="btn-primary !py-1.5">Get started</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
