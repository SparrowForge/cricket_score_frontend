'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { ErrorBox, Modal } from '@/components/ui';
import { GoogleDivider, GoogleSignInButton } from '@/components/google-signin';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ message?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await login(email, password);
      router.push('/');
    } catch (err) {
      setError(err as { message?: string });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto mt-10 max-w-sm">
      <div className="card p-6">
        <h1 className="mb-1 text-xl font-black">Welcome back</h1>
        <p className="mb-5 text-sm text-mut">Sign in to score and manage matches.</p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <ErrorBox error={error} />
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <GoogleDivider />
        <GoogleSignInButton onError={(m) => setError({ message: m })} />
        <p className="mt-3 text-center text-sm">
          <button type="button" onClick={() => setForgotOpen(true)} className="text-grass hover:underline">
            Forgot password?
          </button>
        </p>
        <p className="mt-4 text-center text-sm text-mut">
          No account? <Link href="/register" className="text-grass hover:underline">Create one</Link>
        </p>
      </div>
      {forgotOpen && <ForgotPasswordModal initialEmail={email} onClose={() => setForgotOpen(false)} />}
    </div>
  );
}

function ForgotPasswordModal({ initialEmail, onClose }: { initialEmail: string; onClose: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<{ message?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email } });
      setSent(true);
    } catch (err) {
      setError(err as { message?: string });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Reset your password" onClose={onClose}>
      {sent ? (
        <div className="space-y-4">
          <p className="text-sm text-mut">
            If an account exists for <strong>{email}</strong>, a password reset link has been sent. Check your inbox.
          </p>
          <button className="btn-primary w-full" onClick={onClose}>Done</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              className="input" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} required autoFocus
            />
          </div>
          <ErrorBox error={error} />
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
            <button type="button" className="btn-ghost flex-1" disabled={busy} onClick={onClose}>Cancel</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
