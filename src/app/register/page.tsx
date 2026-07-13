'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { GoogleDivider, GoogleSignInButton } from '@/components/google-signin';
import { ErrorBox } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<{ message?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termsAccepted) {
      setError({ message: 'Please accept the CricLive terms to create an account.' });
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await register(email, password, fullName, termsAccepted);
      router.push('/admin');
    } catch (err) {
      setError(err as { message?: string });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto mt-10 max-w-sm">
      <div className="card p-6">
        <h1 className="mb-1 text-xl font-black">Create your account</h1>
        <p className="mb-5 text-sm text-mut">Score matches, run tournaments, follow teams.</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Full name</label>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>

          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="rounded-lg border border-line bg-panel-2/70 p-4 text-xs text-mut">
            <p className="text-sm font-semibold text-ink">CricLive account terms</p>
            <ul className="mt-2 space-y-1.5">
              <li>Use CricLive for cricket scoring, tournaments, and team management.</li>
              <li>Keep your account secure and only submit information you are allowed to share.</li>
              <li>Do not abuse, scrape, or disrupt live scoring, notifications, or admin tools.</li>
              <li>CricLive may send essential account and service emails to your address.</li>
            </ul>
          </div>

          <label htmlFor="termsAccepted" className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-panel-2 px-3 py-3 text-sm text-mut">
            <input
              id="termsAccepted"
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-line text-grass focus:ring-grass"
              checked={termsAccepted}
              onChange={(e) => {
                const next = e.target.checked;
                setTermsAccepted(next);
                if (next) setError(null);
              }}
              required
            />
            <span>
              I agree to the CricLive terms above and understand that essential service emails may be sent to this
              address.
            </span>
          </label>

          <ErrorBox error={error} />
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating...' : 'Create account'}</button>
        </form>

        {termsAccepted ? (
          <>
            <GoogleDivider />
            <GoogleSignInButton onError={(m) => setError({ message: m })} />
          </>
        ) : process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
          <p className="mt-4 rounded-lg border border-dashed border-line px-4 py-3 text-center text-xs text-mut">
            Accept the terms above to continue with Google sign-in.
          </p>
        ) : null}

        <p className="mt-4 text-center text-sm text-mut">
          Already registered? <Link href="/login" className="text-grass hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
