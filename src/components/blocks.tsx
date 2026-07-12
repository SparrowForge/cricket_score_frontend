'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { ErrorBox } from './ui';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface CmsBlock { id: string; type: string; props: Record<string, any> }

/** Marketing-site block renderer. Unknown block types render nothing (forward compatible). */
export function BlockRenderer({ blocks }: { blocks: CmsBlock[] }) {
  return (
    <div className="space-y-12">
      {blocks.map((b) => {
        const C = REGISTRY[b.type];
        return C ? <C key={b.id} {...(b.props ?? {})} /> : null;
      })}
    </div>
  );
}

// ---------------- blocks ----------------

function Hero(p: any) {
  return (
    <section className="py-10 text-center sm:py-16">
      <h1 className="mx-auto max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-5xl">
        {p.heading}
      </h1>
      {p.subheading && <p className="mx-auto mt-4 max-w-xl text-base text-mut">{p.subheading}</p>}
      <div className="mt-7 flex justify-center gap-3">
        {p.cta && <Link href={p.cta.href ?? '/register'} className="btn-primary !px-6 !py-3 text-base">{p.cta.label}</Link>}
        {p.secondary_cta && <Link href={p.secondary_cta.href ?? '/matches'} className="btn-ghost !px-6 !py-3 text-base">{p.secondary_cta.label}</Link>}
      </div>
    </section>
  );
}

const ICONS: Record<string, string> = {
  radio: '📡', settings: '⚙️', 'bar-chart': '📊', trophy: '🏆', users: '👥', zap: '⚡', shield: '🛡️', globe: '🌍',
};

function FeatureGrid(p: any) {
  const items: any[] = p.items ?? [];
  return (
    <section className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-${Math.min(p.columns ?? 3, 4)}`}>
      {items.map((it, i) => (
        <div key={i} className="card p-5">
          <div className="text-2xl">{ICONS[it.icon] ?? '🏏'}</div>
          <h3 className="mt-2 font-bold">{it.title}</h3>
          <p className="mt-1 text-sm text-mut">{it.body}</p>
        </div>
      ))}
    </section>
  );
}

export function PricingTable(p: any) {
  const { data: plans } = useApi<any[]>('/plans');
  const wanted: string[] | undefined = p.plan_slugs;
  const shown = (plans ?? []).filter((pl) => !wanted || wanted.includes(pl.slug));
  const featured = shown.length > 2 ? shown[Math.min(1, shown.length - 1)].slug : null;

  return (
    <section>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((pl) => (
          <div key={pl.id} className={`card flex flex-col p-5 ${pl.slug === featured ? 'border-grass shadow-lg shadow-grass/10' : ''}`}>
            {pl.slug === featured && <span className="mb-2 self-start rounded-full bg-grass/15 px-2 py-0.5 text-[10px] font-bold uppercase text-grass">Popular</span>}
            <h3 className="text-lg font-black">{pl.name}</h3>
            <div className="mt-1">
              <span className="score-digits text-3xl font-black">${(pl.price_cents / 100).toFixed(0)}</span>
              <span className="text-sm text-mut">/{pl.billing_interval === 'year' ? 'yr' : 'mo'}</span>
            </div>
            {pl.trial_days > 0 && <p className="text-xs text-grass">{pl.trial_days}-day free trial</p>}
            <p className="mt-2 text-xs text-mut">{pl.description}</p>
            <ul className="mt-3 flex-1 space-y-1.5 text-xs">
              {Object.entries(pl.features ?? {}).map(([k, v]) => (
                <li key={k} className={`flex items-center gap-1.5 ${v === false ? 'text-mut/50 line-through' : 'text-mut'}`}>
                  <span className={v === false ? 'text-mut/50' : 'text-grass'}>{v === false ? '✕' : '✓'}</span>
                  {featureLabel(k, v)}
                </li>
              ))}
            </ul>
            <Link href={`/pricing?plan=${pl.slug}`} className={`mt-4 w-full ${pl.slug === featured ? 'btn-primary' : 'btn-ghost'}`}>
              {pl.price_cents === 0 ? 'Start free' : 'Choose plan'}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

function featureLabel(key: string, value: unknown): string {
  const name = key.replace(/^max_/, '').replace(/_/g, ' ');
  if (value === null) return `Unlimited ${name}`;
  if (typeof value === 'number') return `${value} ${name}`;
  return name;
}

function CtaBanner(p: any) {
  return (
    <section className="card border-grass/40 bg-gradient-to-r from-grass/15 to-transparent p-8 text-center">
      <h2 className="text-xl font-black sm:text-2xl">{p.heading}</h2>
      {p.cta && <Link href={p.cta.href ?? '/register'} className="btn-primary mt-4 !px-6">{p.cta.label}</Link>}
    </section>
  );
}

function Faq(p: any) {
  const items: any[] = p.items ?? [];
  return (
    <section className="mx-auto max-w-2xl space-y-2">
      {items.map((it, i) => (
        <details key={i} className="card group p-4">
          <summary className="cursor-pointer font-semibold">{it.q ?? it.question}</summary>
          <p className="mt-2 text-sm text-mut">{it.a ?? it.answer}</p>
        </details>
      ))}
    </section>
  );
}

function RichText(p: any) {
  return (
    <section className="prose-invert mx-auto max-w-2xl text-sm leading-relaxed text-mut">
      {typeof p.text === 'string' ? p.text.split('\n\n').map((para: string, i: number) => <p key={i} className="mb-4">{para}</p>) : null}
    </section>
  );
}

function ContactForm(p: any) {
  const kinds: string[] = p.kinds ?? ['contact'];
  const [form, setForm] = useState({ kind: kinds[0], name: '', email: '', organization: '', message: '' });
  const [done, setDone] = useState(false);
  const [error, setError] = useState<{ message?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api('/contact', { method: 'POST', body: form });
      setDone(true);
    } catch (err) { setError(err as { message?: string }); }
    finally { setBusy(false); }
  };

  if (done) {
    return <section className="card mx-auto max-w-md p-8 text-center">
      <p className="text-lg font-bold text-grass">Thanks — we&apos;ll get back to you soon! 🏏</p>
    </section>;
  }
  return (
    <section className="card mx-auto max-w-md p-6">
      <form onSubmit={submit} className="space-y-3">
        {kinds.length > 1 && (
          <div className="flex gap-2">
            {kinds.map((k) => (
              <button key={k} type="button" onClick={() => setForm({ ...form, kind: k })}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold ${form.kind === k ? 'border-grass text-grass' : 'border-line text-mut'}`}>
                {k === 'demo_request' ? 'Request a demo' : 'Contact us'}
              </button>
            ))}
          </div>
        )}
        <div><label className="label">Name</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
        <div><label className="label">Email</label>
          <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
        <div><label className="label">Organization (optional)</label>
          <input className="input" value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} /></div>
        <div><label className="label">Message</label>
          <textarea className="input min-h-24" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
        <ErrorBox error={error} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
      </form>
    </section>
  );
}

const REGISTRY: Record<string, (props: any) => React.ReactNode> = {
  hero: Hero,
  feature_grid: FeatureGrid,
  pricing_table: PricingTable,
  cta_banner: CtaBanner,
  faq: Faq,
  rich_text: RichText,
  contact_form: ContactForm,
};
