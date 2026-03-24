// app/beta-terms/page.tsx
// Static beta programme terms page — linked from signup form and footer

export const metadata = {
  title: 'Beta Programme Terms — SafeMinutes',
  description: 'SafeMinutes Early Access Beta Programme terms and conditions.',
};

export default function BetaTermsPage() {
  return (
    <div style={{ fontFamily: "'Instrument Sans', system-ui, sans-serif", background: '#F5F2EE', color: '#231F1B', minHeight: '100vh' }}>
      {/* Header */}
      <header style={{ background: '#1C1A18', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '58px', maxWidth: '1100px', margin: '0 auto' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
              <rect x="2"  y="2" width="4" height="4" rx="0.5" fill="#C4973A"/>
              <rect x="8"  y="2" width="4" height="4" rx="0.5" fill="#C4973A"/>
              <rect x="14" y="2" width="4" height="4" rx="0.5" fill="#C4973A"/>
              <rect x="20" y="2" width="4" height="4" rx="0.5" fill="#C4973A"/>
              <rect x="2" y="6" width="22" height="2" fill="#C4973A"/>
              <rect x="2" y="8" width="22" height="16" fill="none" stroke="#C4973A" strokeWidth="2"/>
              <path d="M10 24 L10 18 Q14 13.5 18 18 L18 24" stroke="#C4973A" strokeWidth="1.5" fill="none"/>
              <rect x="5"  y="12" width="4" height="4" stroke="#C4973A" strokeWidth="1.2" fill="none"/>
              <rect x="17" y="12" width="4" height="4" stroke="#C4973A" strokeWidth="1.2" fill="none"/>
            </svg>
            <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.18)', margin: '0 2px' }} />
            <span style={{ fontFamily: "'Instrument Sans', system-ui, sans-serif", fontSize: '0.92rem', fontWeight: 600, color: '#fff', letterSpacing: '0.09em', textTransform: 'uppercase' as const }}>SafeMinutes</span>
          </a>
          <a href="/" style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>&larr; Back</a>
        </div>
      </header>

      {/* Content */}
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '64px 48px 96px' }}>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#8B1A1A', marginBottom: '16px' }}>
          <span style={{ width: '16px', height: '2px', background: '#8B1A1A', display: 'inline-block' }} />
          Early Access
        </div>

        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '2.4rem', fontWeight: 600, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#231F1B', marginBottom: '12px' }}>
          Beta Programme Terms
        </h1>
        <p style={{ fontFamily: "'Crimson Pro', Georgia, serif", fontSize: '0.92rem', color: '#96908A', marginBottom: '40px', paddingBottom: '28px', borderBottom: '1px solid #E0DAD2' }}>
          SafeMinutes Early Access Beta &mdash; Effective from March 2026<br/>
          Issued by Passhai Technologies Private Limited, India
        </p>

        {/* Intro box */}
        <div style={{ background: '#FDFCFB', border: '1px solid #E0DAD2', borderLeft: '3px solid #8B1A1A', borderRadius: '0 8px 8px 0', padding: '18px 22px', marginBottom: '40px' }}>
          <p style={{ fontFamily: "'Crimson Pro', Georgia, serif", fontSize: '1rem', color: '#5C5750', lineHeight: 1.7, margin: 0 }}>
            SafeMinutes is currently in early access beta. By creating an account you are joining a programme designed to help us build the right product with real users. Please read these terms before signing up &mdash; they explain what you are getting, what we ask of you, and how your data is handled during this period.
          </p>
        </div>

        {[
          {
            title: '1. What the Beta Programme is',
            body: `The SafeMinutes Early Access Beta is a pre-launch programme that gives individuals and organisations access to the SafeMinutes platform before it is commercially available. The purpose is to test the product with real board governance use cases, gather feedback, and improve the platform ahead of general release.\n\nAccess is free during the beta period. We may introduce paid plans when the product exits beta, at which point you will be given advance notice and the option to continue on a paid plan or export your data.`,
          },
          {
            title: '2. Who can participate',
            body: `The beta programme is open to directors, company secretaries, chartered accountants, and other professionals involved in the governance of Indian private limited companies registered under the Companies Act 2013.\n\nBy registering, you confirm that you are at least 18 years of age and have the authority to accept these terms on behalf of yourself and, where applicable, the company or companies whose governance records you manage on the platform.`,
          },
          {
            title: '3. What you get during beta',
            items: [
              'Full access to the SafeMinutes platform at no charge for the duration of the beta period',
              'The ability to run board meetings, generate minutes and attendance registers, and store documents in the Vault',
              'Direct access to the SafeMinutes team for support and feedback',
              'Early input into features and the product roadmap',
              '30 days advance notice before any transition to paid plans',
              'The ability to export all your data at any time, in machine-readable format',
            ],
          },
          {
            title: '4. What we ask of you',
            items: [
              'Use the platform genuinely — for real board meetings and governance records, not synthetic or test data',
              'Share feedback when something does not work as expected, via the feedback link in the product or by emailing hello@safeminutes.com',
              'Do not share your login credentials with others outside your board or team',
              'Let us know if you are planning to use SafeMinutes for a high-stakes or time-sensitive governance event so we can make sure we are there to support you',
            ],
          },
          {
            title: '5. Beta limitations and service availability',
            body: `SafeMinutes is provided during beta on an as-is, as-available basis. We do not offer any service level agreement or uptime guarantee during the beta period. The platform may be unavailable for maintenance, updates, or unplanned outages.\n\nWe may reset or migrate data as part of the transition from beta to production. If we need to do so, we will give you at least 14 days advance notice and provide a full data export before any reset occurs.`,
            highlight: 'While we take every precaution to maintain your data, we recommend that you maintain your own copies of any documents that have legal significance — signed minutes, resolutions, and compliance filings — outside the platform during the beta period.',
          },
          {
            title: '6. Your data',
            body: `All data you enter into SafeMinutes is yours. We do not sell, share, or use your board data for any purpose other than providing the platform to you.\n\nData is stored on servers located in India (Google Cloud, asia-south1 region). We apply industry-standard encryption in transit and at rest.\n\nWe may use anonymised, aggregated usage data (such as feature adoption rates and session counts) to improve the product. This data cannot be used to identify you or your company.\n\nYou can request a full export of your data at any time by emailing hello@safeminutes.com. We will respond within 5 business days.`,
          },
          {
            title: '7. Intellectual property',
            body: `The SafeMinutes platform, including its software, templates, and design, is the intellectual property of Passhai Technologies Private Limited. Your use of the platform does not give you any ownership rights in the platform itself.\n\nAll content you create on the platform — your meeting minutes, agendas, resolutions, and documents — remains your intellectual property. We claim no rights over the content you create.`,
          },
          {
            title: '8. Acceptable use',
            body: 'You agree not to use SafeMinutes to:',
            items: [
              'Create false or misleading governance records',
              'Conduct any activity that is unlawful under Indian law',
              'Attempt to gain unauthorised access to other accounts or the underlying systems',
              'Reverse engineer, copy, or redistribute any part of the platform',
              'Use the platform on behalf of a company without the authorisation of that company',
            ],
            bodyAfter: 'We reserve the right to suspend or terminate accounts that violate these terms, with immediate effect where necessary to prevent harm.',
          },
          {
            title: '9. Termination',
            body: `You may close your account at any time by emailing hello@safeminutes.com. We will delete your account and data within 30 days of your request, subject to any legal obligation to retain records.\n\nWe may close beta accounts with 30 days notice, or immediately in the case of a violation of these terms. In all cases where we initiate closure, we will provide a full data export before the account is deleted.`,
          },
          {
            title: '10. Limitation of liability',
            body: `To the fullest extent permitted by law, Passhai Technologies Private Limited is not liable for any indirect, incidental, or consequential damages arising from your use of the platform during the beta period, including any loss of data or business interruption.\n\nOur total liability to you for any claim arising under these terms is limited to the amount you have paid us in the 12 months prior to the claim. Since the beta is free, this means our liability is nil for claims arising during the free beta period.`,
          },
          {
            title: '11. Changes to these terms',
            body: `We may update these terms as the product and programme evolve. We will notify you by email at least 14 days before any material changes take effect. Continued use of the platform after that date constitutes acceptance of the updated terms.`,
          },
          {
            title: '12. Governing law',
            body: `These terms are governed by the laws of India. Any disputes arising under these terms shall be subject to the exclusive jurisdiction of the courts of Delhi, India.`,
          },
          {
            title: '13. Contact',
            body: `For any questions about these terms or the beta programme, contact us at:\nhello@safeminutes.com\nPasshai Technologies Private Limited, India`,
          },
        ].map((section: any) => (
          <div key={section.title} style={{ marginBottom: '32px' }}>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.2rem', fontWeight: 600, color: '#231F1B', marginBottom: '12px', letterSpacing: '-0.01em' }}>
              {section.title}
            </h2>
            {section.body && section.body.split('\n\n').map((para: string, i: number) => (
              <p key={i} style={{ fontFamily: "'Crimson Pro', Georgia, serif", fontSize: '1rem', color: '#5C5750', lineHeight: 1.75, marginBottom: '12px' }}>
                {para}
              </p>
            ))}
            {section.highlight && (
              <div style={{ background: 'rgba(139,26,26,0.05)', border: '1px solid rgba(139,26,26,0.12)', borderRadius: '6px', padding: '14px 18px', margin: '14px 0' }}>
                <p style={{ fontFamily: "'Crimson Pro', Georgia, serif", fontSize: '0.95rem', color: '#5C5750', lineHeight: 1.7, margin: 0 }}>
                  <strong style={{ color: '#231F1B' }}>Note:</strong> {section.highlight}
                </p>
              </div>
            )}
            {section.items && (
              <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>
                {section.items.map((item: string, i: number) => (
                  <li key={i} style={{ fontFamily: "'Crimson Pro', Georgia, serif", fontSize: '1rem', color: '#5C5750', lineHeight: 1.75, marginBottom: '6px' }}>
                    {item}
                  </li>
                ))}
              </ul>
            )}
            {section.bodyAfter && (
              <p style={{ fontFamily: "'Crimson Pro', Georgia, serif", fontSize: '1rem', color: '#5C5750', lineHeight: 1.75, marginBottom: '12px' }}>
                {section.bodyAfter}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <footer style={{ background: '#1C1A18', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '28px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '1100px', margin: '0 auto' }}>
          <span style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.25)' }}>
            SafeMinutes Beta Terms &mdash; Passhai Technologies Private Limited &mdash; Last updated March 2026
          </span>
          <a href="/" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)', textDecoration: 'none' }}>Back to site</a>
        </div>
      </footer>
    </div>
  );
}
