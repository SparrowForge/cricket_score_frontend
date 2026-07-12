'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { ErrorBox } from '@/components/ui';

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get('email') ?? '';
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<{ message?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError({ message: 'Passwords do not match' });
      return;
    }
    setBusy(true); setError(null);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { email, token, new_password: password } });
      setDone(true);
    } catch (err) {
      setError(err as { message?: string });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto mt-10 max-w-sm">
      <div className="card p-6">
        <h1 className="mb-1 text-xl font-black">Reset your password</h1>
        {!email || !token ? (
          <p className="text-sm text-mut">This reset link is invalid. Please request a new one from the login page.</p>
        ) : done ? (
          <div className="space-y-4">
            <p className="text-sm text-mut">Your password has been reset.</p>
            <Link href="/login" className="btn-primary block w-full text-center">Sign in</Link>
          </div>
        ) : (
          <>
            <p className="mb-5 text-sm text-mut">Choose a new password for {email}.</p>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="label">New password</label>
                <input
                  className="input" type="password" minLength={8} value={password}
                  onChange={(e) => setPassword(e.target.value)} required
                />
              </div>
              <div>
                <label className="label">Confirm password</label>
                <input
                  className="input" type="password" minLength={8} value={confirm}
                  onChange={(e) => setConfirm(e.target.value)} required
                />
              </div>
              <ErrorBox error={error} />
              <button className="btn-primary w-full" disabled={busy}>{busy ? 'Resetting…' : 'Reset password'}</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
