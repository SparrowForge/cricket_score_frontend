'use client';

import Link from 'next/link';
import { useApi } from '@/lib/hooks';
import { Spinner } from '@/components/ui';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function BillingPanel({ orgId }: { orgId: string }) {
  const { data: sub, loading } = useApi<any>(`/orgs/${orgId}/subscription`);
  const { data: ent } = useApi<Record<string, any>>(`/orgs/${orgId}/subscription/entitlements`);

  if (loading) return <Spinner />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-5">
        <div className="text-xs font-bold uppercase tracking-wide text-mut">Current plan</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-black">{sub?.plan_name ?? 'Free'}</span>
          {sub?.status && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
              sub.status === 'active' ? 'bg-grass/15 text-grass'
              : sub.status === 'trialing' ? 'bg-gold/15 text-gold' : 'bg-cherry/15 text-cherry'}`}>
              {sub.status}
            </span>
          )}
        </div>
        {sub && (
          <p className="mt-1 text-xs text-mut">
            ${(sub.price_cents / 100).toFixed(0)}/{sub.billing_interval === 'year' ? 'yr' : 'mo'}
            {sub.current_period_end && <> · current period ends {new Date(sub.current_period_end).toLocaleDateString()}</>}
            {sub.cancel_at_period_end && <> · <span className="text-gold">cancels at period end</span></>}
          </p>
        )}
        <Link href="/pricing" className="btn-primary mt-4 inline-flex">Change plan</Link>
      </div>

      <div className="card p-5">
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-mut">What your plan includes</div>
        <ul className="space-y-1.5 text-sm">
          {Object.entries(ent ?? {}).map(([k, v]) => (
            <li key={k} className={`flex items-center gap-2 ${v === false ? 'text-mut/50 line-through' : ''}`}>
              <span className={v === false ? 'text-mut/50' : 'text-grass'}>{v === false ? '✕' : '✓'}</span>
              <span className="capitalize">{k.replace(/^max_/, '').replace(/_/g, ' ')}</span>
              {typeof v === 'number' && <b className="score-digits ml-auto">{v}</b>}
              {v === null && <b className="ml-auto text-grass">Unlimited</b>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
