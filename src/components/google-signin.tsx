'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (resp: { credential: string }) => void }) => void;
          renderButton: (el: HTMLElement, options: Record<string, string>) => void;
        };
      };
    };
  }
}

/** "Sign in with Google" button. Renders nothing if NEXT_PUBLIC_GOOGLE_CLIENT_ID isn't configured. */
export function GoogleSignInButton({ onError }: { onError?: (message: string) => void }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const { loginWithGoogle } = useAuth();
  const elRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (!scriptReady || !clientId || !elRef.current || !window.google) return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (resp) => {
        try {
          await loginWithGoogle(resp.credential);
          window.location.href = '/';
        } catch (err) {
          onError?.((err as { message?: string }).message ?? 'Google sign-in failed');
        }
      },
    });
    window.google.accounts.id.renderButton(elRef.current, {
      theme: 'filled_black', size: 'large', width: '320', shape: 'pill',
    });
  }, [scriptReady, clientId, loginWithGoogle, onError]);

  if (!clientId) return null;

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setScriptReady(true)} />
      <div ref={elRef} className="flex justify-center" />
    </>
  );
}

/** "or" divider — only renders if Google sign-in is actually configured, so it never shows as an empty gap. */
export function GoogleDivider() {
  if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) return null;
  return (
    <div className="my-4 flex items-center gap-3 text-xs text-mut">
      <div className="h-px flex-1 bg-line" /> or <div className="h-px flex-1 bg-line" />
    </div>
  );
}
