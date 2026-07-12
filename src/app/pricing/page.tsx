'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { Org } from '@/lib/types';
import { ErrorBox, Spinner } from '@/components/ui';

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function PricingPage() {
  const { user } = useAuth();
  const { data: plans, loading } = useApi<any[]>('/plans');
  const { data: orgs } = useApi<Org[]>(user ? '/orgs' : null);
  const [orgId, setOrgId] = useState('');
  const activeOrg = orgId || orgs?.[0]?.id || '';
  const { data: sub, reload: reloadSub } = useApi<any>(activeOrg ? `/orgs/${activeOrg}/subscription` : null, [activeOrg]);
  const [error, setError] = useState<{ message?: string } | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [confirmPlan, setConfirmPlan] = useState<any | null>(null);

  const choose = async (plan: any) => {
    setBusyPlan(plan.id); setError(null);
    try {
      await api(`/orgs/${activeOrg}/subscription`, { method: 'POST', body: { plan_id: plan.id } });
      await reloadSub();
      setConfirmPlan(null);
    } catch (err) { setError(err as { message?: string }); }
    finally { setBusyPlan(null); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-black tracking-tight">Simple pricing for every league</h1>
        <p className="mt-2 text-sm text-mut">Start free. Upgrade when your league grows. Cancel anytime.</p>
      </div>

      {user && orgs && orgs.length > 0 && (
        <div className="card mx-auto flex max-w-lg flex-wrap items-center gap-3 p-4">
          <span className="text-xs font-bold uppercase text-mut">Billing for</span>
          <select className="input max-w-56" value={activeOrg} onChange={(e) => setOrgId(e.target.value)}>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          {sub && (
            <span className="ml-auto text-xs text-mut">
              Current: <b className="text-grass">{sub.plan_name}</b> ({sub.status})
              {sub.current_period_end && <> · renews {new Date(sub.current_period_end).toLocaleDateString()}</>}
            </span>
          )}
        </div>
      )}
      <ErrorBox error={error} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans?.map((pl, idx) => {
          const isCurrent = sub?.plan_slug === pl.slug;
          const featured = idx === 1;
          return (
            <div key={pl.id} className={`card flex flex-col p-5 ${featured ? 'border-grass shadow-lg shadow-grass/10' : ''} ${isCurrent ? 'ring-1 ring-grass' : ''}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black">{pl.name}</h3>
                {isCurrent && <span className="rounded-full bg-grass/15 px-2 py-0.5 text-[10px] font-bold uppercase text-grass">Current</span>}
                {!isCurrent && featured && <span className="rounded-full bg-grass/15 px-2 py-0.5 text-[10px] font-bold uppercase text-grass">Popular</span>}
              </div>
              <div className="mt-1">
                <span className="score-digits text-3xl font-black">${(pl.price_cents / 100).toFixed(0)}</span>
                <span className="text-sm text-mut">/{pl.billing_interval === 'year' ? 'yr' : 'mo'}</span>
              </div>
              {pl.trial_days > 0 && <p className="text-xs text-grass">{pl.trial_days}-day free trial</p>}
              <p className="mt-2 min-h-8 text-xs text-mut">{pl.description}</p>
              <ul className="mt-3 flex-1 space-y-1.5 text-xs">
                {Object.entries(pl.features ?? {}).map(([k, v]) => (
                  <li key={k} className={`flex items-center gap-1.5 ${v === false ? 'text-mut/50 line-through' : 'text-mut'}`}>
                    <span className={v === false ? 'text-mut/50' : 'text-grass'}>{v === false ? '✕' : '✓'}</span>
                    {label(k, v)}
                  </li>
                ))}
              </ul>
              {!user ? (
                <Link href={`/register`} className={`mt-4 w-full ${featured ? 'btn-primary' : 'btn-ghost'}`}>
                  {pl.price_cents === 0 ? 'Start free' : 'Start trial'}
                </Link>
              ) : !activeOrg ? (
                <Link href="/admin" className="btn-ghost mt-4 w-full">Create an organization first</Link>
              ) : isCurrent ? (
                <button className="btn-ghost mt-4 w-full" disabled>Your plan</button>
              ) : (
                <button className={`mt-4 w-full ${featured ? 'btn-primary' : 'btn-ghost'}`}
                  disabled={!!busyPlan}
                  onClick={() => setConfirmPlan(pl)}>
                  {busyPlan === pl.id ? 'Switching…' : pl.price_cents === 0 ? 'Downgrade to Free' : `Switch to ${pl.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {confirmPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-sm p-5">
            <h3 className="font-bold">Switch to {confirmPlan.name}?</h3>
            <p className="mt-2 text-sm text-mut">
              {confirmPlan.price_cents === 0
                ? 'Your organization moves to the Free plan immediately. Features over the free limits will be locked.'
                : `Your ${confirmPlan.trial_days > 0 ? `${confirmPlan.trial_days}-day trial starts` : 'plan changes'} immediately. Payment collection will be enabled when the payment gateway goes live.`}
            </p>
            <div className="mt-4 flex gap-2">
              <button className="btn-primary flex-1" disabled={!!busyPlan} onClick={() => choose(confirmPlan)}>Confirm</button>
              <button className="btn-ghost flex-1" onClick={() => setConfirmPlan(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <p className="text-center text-xs text-mut">
        Need more? <Link href="/contact" className="text-grass hover:underline">Talk to us</Link> about enterprise plans.
      </p>
    </div>
  );
}

function label(key: string, value: unknown): string {
  const name = key.replace(/^max_/, '').replace(/_/g, ' ');
  if (value === null) return `Unlimited ${name}`;
  if (typeof value === 'number') return `${value} ${name}`;
  return name;
}
