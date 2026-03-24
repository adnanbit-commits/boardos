// app/privacy/page.tsx
export const metadata = {
  title: 'Privacy Policy — SafeMinutes',
  description: 'How SafeMinutes collects, uses, and protects your data.',
};

function CastleLogo({ size = 22, color = '#C4973A' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect x="2"  y="2" width="4" height="4" rx="0.5" fill={color}/>
      <rect x="8"  y="2" width="4" height="4" rx="0.5" fill={color}/>
      <rect x="14" y="2" width="4" height="4" rx="0.5" fill={color}/>
      <rect x="20" y="2" width="4" height="4" rx="0.5" fill={color}/>
      <rect x="2" y="6" width="22" height="2" fill={color}/>
      <rect x="2" y="8" width="22" height="16" fill="none" stroke={color} strokeWidth="2"/>
      <path d="M10 24 L10 18 Q14 13.5 18 18 L18 24" stroke={color} strokeWidth="1.5" fill="none"/>
      <rect x="5"  y="12" width="4" height="4" stroke={color} strokeWidth="1.2" fill="none"/>
      <rect x="17" y="12" width="4" height="4" stroke={color} strokeWidth="1.2" fill="none"/>
    </svg>
  );
}

const sections = [
  {
    title: 'What we collect',
    body: `When you create an account, we collect your name, email address, and the password you choose (stored as a bcrypt hash — we never see the plaintext). If you use Google sign-in, we receive your name and email from Google and store nothing else from that flow.

When you use the platform, we collect the data you enter: company details, director information, meeting records, agenda items, resolutions, votes, and uploaded documents. This is your data. It exists to produce the governance records your company needs.

We collect standard server logs — IP addresses, request timestamps, and HTTP status codes — for security monitoring and debugging. These are retained for 30 days and then deleted.`,
  },
  {
    title: 'How we use it',
    body: `Your data is used exclusively to operate SafeMinutes. Specifically: to authenticate you, to show you your company's meetings and resolutions, to generate minutes PDFs and attendance registers, and to send notifications you have triggered (meeting invites, vote requests, draft minutes circulation).

We do not use your data to train machine learning models. We do not sell your data. We do not share it with third parties except the infrastructure providers listed below, who process it only on our instructions.`,
  },
  {
    title: 'Where it is stored',
    body: `All data is stored in India. Our database runs on Google Cloud SQL in the asia-south1 region (Mumbai). File uploads — documents, PDFs, compliance forms — are stored in Google Cloud Storage in asia-south1 with server-side AES-256 encryption at rest.

Signed minutes and certified copies are stored with an additional object-level retention hold, meaning they cannot be deleted by any application code path. This is a deliberate design choice to preserve the statutory record.

Email delivery uses Resend (resend.com), which processes email addresses and message content to send notifications. Resend operates under standard data processing agreements.`,
  },
  {
    title: 'Retention',
    body: `Account data is retained for as long as your account is active. If you close your account, your personal data (name, email, password hash) is deleted within 30 days.

Company governance records — meetings, resolutions, minutes, and audit logs — are retained for 8 financial years from the date of the meeting, consistent with the Companies Act 2013 requirement for preservation of statutory records. If you delete a company workspace, we retain the governance records for this period before deletion.

Signed and locked documents are subject to the GCS object-level retention hold described above and cannot be deleted before the retention period expires, regardless of account status.`,
  },
  {
    title: 'Your rights',
    body: `You can export all your company data at any time from the Archive section of your workspace. The export includes meeting records, resolutions, vote tallies, minutes content, and audit logs in a portable format.

You can request deletion of your personal account data by emailing hello@safeminutes.com. We will complete the deletion within 30 days. Note that governance records associated with your company workspace will be retained for the statutory period described above, as these are not personal data — they belong to the company record.

You can correct your profile information (name, email) from your account settings at any time.`,
  },
  {
    title: 'Security',
    body: `Passwords are hashed with bcrypt at cost factor 12. All data in transit is encrypted with TLS 1.2 or higher. All data at rest is encrypted with AES-256. Access to production infrastructure is restricted to authorised personnel only, with audit logging on all access.

We use JWT tokens for session management with a 7-day expiry. Google OAuth is available as an alternative to password authentication.

If you discover a security vulnerability, please email hello@safeminutes.com. We will respond within 48 hours.`,
  },
  {
    title: 'Cookies',
    body: `SafeMinutes uses a single session cookie for the Google OAuth flow only. This cookie has a 10-minute lifetime and is used solely to maintain OAuth state during the sign-in handshake. It is not used for tracking or analytics.

We do not use any third-party analytics or advertising cookies. We do not use Google Analytics, Mixpanel, or any equivalent service.`,
  },
  {
    title: 'Changes to this policy',
    body: `If we make material changes to this policy, we will notify you by email at least 14 days before the changes take effect. The date at the top of this page reflects when the policy was last updated. Continued use of SafeMinutes after the effective date constitutes acceptance of the updated policy.`,
  },
  {
    title: 'Contact',
    body: `For any privacy-related questions, to exercise your data rights, or to report a concern, contact us at hello@safeminutes.com.

SafeMinutes is operated by Passhai Technologies Private Limited, registered in India.`,
  },
];

export default function PrivacyPage() {
  const C = {
    charcoal: '#1C1A18', charcoalBdr: 'rgba(255,255,255,0.07)',
    stone: '#F5F2EE', rule: '#E0DAD2', crimson: '#8B1A1A',
    ink: '#231F1B', inkMid: '#5C5750', inkMute: '#96908A', white: '#FDFCFB',
  };

  return (
    <div style={{ fontFamily: "'Instrument Sans', system-ui, sans-serif", background: C.stone, color: C.ink, minHeight: '100vh' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Instrument+Sans:wght@400;500;600&family=Crimson+Pro:ital,wght@0,300;0,400;1,300;1,400&display=swap');*{box-sizing:border-box}`}</style>

      {/* Header */}
      <header style={{ background: C.charcoal, borderBottom: `1px solid ${C.charcoalBdr}`, padding: '0 52px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '58px', maxWidth: '820px', margin: '0 auto' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <CastleLogo />
            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.15)', margin: '0 2px' }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff', letterSpacing: '0.09em', textTransform: 'uppercase' }}>SafeMinutes</span>
          </a>
          <a href="/" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.38)', textDecoration: 'none' }}>← Back to home</a>
        </div>
      </header>

      {/* Content */}
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '64px 48px 96px' }}>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.crimson, marginBottom: '14px' }}>
          <span style={{ width: '16px', height: '2px', background: C.crimson, display: 'inline-block' }} />
          Legal
        </div>

        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '2.2rem', fontWeight: 600, lineHeight: 1.12, letterSpacing: '-0.02em', color: C.ink, marginBottom: '10px' }}>
          Privacy Policy
        </h1>
        <p style={{ fontFamily: "'Crimson Pro', Georgia, serif", fontSize: '15px', color: C.inkMute, marginBottom: '48px' }}>
          Last updated: March 2026 &middot; Passhai Technologies Private Limited
        </p>

        <p style={{ fontFamily: "'Crimson Pro', Georgia, serif", fontSize: '17px', lineHeight: 1.75, color: C.inkMid, marginBottom: '48px', paddingBottom: '32px', borderBottom: `1px solid ${C.rule}` }}>
          SafeMinutes is built for company governance, not for data collection. This policy explains exactly what we collect, why we collect it, where it is stored, and what rights you have over it. We have written it to be readable, not to bury important things in legal language.
        </p>

        {sections.map((s, i) => (
          <div key={i} style={{ marginBottom: '40px', paddingBottom: '40px', borderBottom: i < sections.length - 1 ? `1px solid ${C.rule}` : 'none' }}>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.25rem', fontWeight: 600, color: C.ink, marginBottom: '14px', lineHeight: 1.2 }}>
              {s.title}
            </h2>
            {s.body.split('\n\n').map((para, j) => (
              <p key={j} style={{ fontFamily: "'Crimson Pro', Georgia, serif", fontSize: '16px', lineHeight: 1.75, color: C.inkMid, margin: '0 0 14px' }}>
                {para}
              </p>
            ))}
          </div>
        ))}

      </div>

      {/* Footer */}
      <footer style={{ background: C.charcoal, borderTop: `1px solid ${C.charcoalBdr}`, padding: '24px 52px' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>© 2026 Passhai Technologies Private Limited</span>
          <div style={{ display: 'flex', gap: '20px' }}>
            {[['Beta Terms', '/beta-terms'], ['Privacy', '/privacy'], ['Contact', 'mailto:hello@safeminutes.com']].map(([label, href]) => (
              <a key={label} href={href} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', textDecoration: 'none' }}>{label}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
