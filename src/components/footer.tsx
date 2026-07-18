import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-line bg-pitch">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-6 text-sm text-mut sm:flex-row sm:justify-between">
        <span>&copy; {new Date().getFullYear()} CricLive</span>
        <Link href="/privacy" className="font-semibold text-mut hover:text-ink">
          Privacy Policy
        </Link>
      </div>
    </footer>
  );
}
