'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ErrorBox } from '@/components/ui';
import { GoogleDivider, GoogleSignInButton } from '@/components/google-signin';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ message?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await register(email, password, fullName);
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
            <input className="input" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <ErrorBox error={error} />
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        </form>
        <GoogleDivider />
        <GoogleSignInButton onError={(m) => setError({ message: m })} />
        <p className="mt-4 text-center text-sm text-mut">
          Already registered? <Link href="/login" className="text-grass hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
