import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — CricLive',
  description: 'How CricLive collects, uses, and protects your data across our web and mobile apps.',
};

const sections = [
  {
    title: '1. Information We Collect',
    body: (
      <>
        <p className="mb-2">When you use CricLive on the web or through our mobile app, we collect:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <b>Account information</b> — your name, email address, and a password (stored only as a
            secure hash). If you sign in with Google, we receive your name, email, and profile
            picture from Google and never see your Google password.
          </li>
          <li>
            <b>Cricket content you create</b> — organizations, teams, venues, tournaments, match
            schedules, and ball-by-ball scoring data you enter while using the platform.
          </li>
          <li>
            <b>Player profiles</b> — names, playing roles, and optionally photos, date of birth,
            country, height, and biography that organization admins add for players.
          </li>
          <li>
            <b>Uploaded images</b> — team logos and player photos you choose to upload.
          </li>
          <li>
            <b>Device information</b> — if you enable push notifications in the mobile app, we store
            a device token so we can deliver match updates to your device.
          </li>
        </ul>
      </>
    ),
  },
  {
    title: '2. How We Use Your Information',
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>To create and secure your account and keep you signed in.</li>
        <li>To run the core product: live scoring, match centers, statistics, and leaderboards.</li>
        <li>To send push notifications about matches you follow (only if you opt in).</li>
        <li>To enforce role-based permissions inside organizations you belong to.</li>
        <li>To fix bugs, prevent abuse, and improve the service.</li>
      </ul>
    ),
  },
  {
    title: '3. What We Do NOT Do',
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>We do not sell your personal data to anyone.</li>
        <li>We do not show third-party advertising.</li>
        <li>We do not use your data for purposes unrelated to running CricLive.</li>
      </ul>
    ),
  },
  {
    title: '4. Public Content',
    body: (
      <p>
        CricLive is a live-scoring platform, so some content is public by design: match scores,
        commentary, tournament tables, player statistics, leaderboards, and player profile
        information (including photos) added by organization admins are visible to anyone viewing a
        match or player page. If you are a player and want your profile removed or corrected,
        contact your organization admin or email us directly.
      </p>
    ),
  },
  {
    title: '5. Third-Party Services',
    body: (
      <>
        <p className="mb-2">We rely on a small set of processors to run the service:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <b>Google Sign-In</b> — optional authentication (governed by Google&apos;s privacy
            policy).
          </li>
          <li>
            <b>Firebase Cloud Messaging</b> — delivery of push notifications on mobile.
          </li>
          <li>
            <b>Cloud hosting &amp; database providers</b> — our API, database, and uploaded images
            are hosted with reputable cloud providers who process data on our behalf.
          </li>
        </ul>
      </>
    ),
  },
  {
    title: '6. Data Security',
    body: (
      <p>
        All traffic between your device and our servers is encrypted with HTTPS. Passwords are
        stored using industry-standard hashing, and session tokens are short-lived and rotated
        automatically. On mobile, tokens are kept in the operating system&apos;s secure storage.
      </p>
    ),
  },
  {
    title: '7. Data Retention & Deletion',
    body: (
      <p>
        We keep your data for as long as your account is active. You can request deletion of your
        account and associated personal data at any time by emailing us. Match and scoring records
        may be retained in anonymized form to keep historical tournament results consistent.
      </p>
    ),
  },
  {
    title: "8. Children's Privacy",
    body: (
      <p>
        CricLive is not directed at children under 13, and we do not knowingly collect personal
        information from them. Player profiles for junior cricketers should be created and managed
        by a responsible club administrator with appropriate consent.
      </p>
    ),
  },
  {
    title: '9. Changes to This Policy',
    body: (
      <p>
        If we make material changes to this policy, we will update this page and revise the
        effective date below. Continued use of CricLive after changes means you accept the updated
        policy.
      </p>
    ),
  },
  {
    title: '10. Contact Us',
    body: (
      <p>
        Questions, corrections, or deletion requests:{' '}
        <a href="mailto:najmuzzaman@sprwforge.com" className="text-grass hover:underline">
          najmuzzaman@sprwforge.com
        </a>
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-black tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-mut">
          How CricLive handles your data on the web and in our mobile apps.
        </p>
      </div>

      <div className="space-y-6">
        {sections.map((s) => (
          <section key={s.title} className="card p-5">
            <h2 className="mb-2 text-lg font-black">{s.title}</h2>
            <div className="text-sm leading-relaxed text-mut">{s.body}</div>
          </section>
        ))}
      </div>

      <p className="text-center text-xs text-mut">
        Effective date: July 18, 2026 ·{' '}
        <Link href="/" className="text-grass hover:underline">
          Back to CricLive
        </Link>
      </p>
    </div>
  );
}
