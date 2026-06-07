import LegalLayout, { LEGAL_CONTACT_EMAIL } from './LegalLayout.jsx'

function TermsOfService() {
  return (
    <LegalLayout title="Terms of Service">
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your use of PantherWatch (the
        &ldquo;Service&rdquo;). By accessing or using the Service, you agree to these Terms. If you do not
        agree, please do not use the Service.
      </p>

      <section>
        <h2>1. About the Service</h2>
        <p>
          PantherWatch helps Georgia State University students search course availability, track specific
          sections (CRNs), and receive email notifications when seats or waitlist spots may open. PantherWatch
          is an independent project and is <strong>not affiliated with, endorsed by, or sponsored by Georgia
          State University</strong>. &ldquo;Georgia State University,&rdquo; &ldquo;GoSolar,&rdquo; &ldquo;Rate
          My Professors,&rdquo; and other names are the property of their respective owners.
        </p>
      </section>

      <section>
        <h2>2. Eligibility and accounts</h2>
        <p>
          You must be at least 13 years old to use the Service. You sign in using your Google account, and you
          are responsible for keeping that account secure and for all activity that occurs under your
          PantherWatch account. You agree to provide accurate information and to use the Service only for
          lawful purposes.
        </p>
      </section>

      <section>
        <h2>3. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service in a way that violates any law or the rules of Georgia State University.</li>
          <li>Attempt to disrupt, overload, scrape, reverse engineer, or gain unauthorized access to the Service or its systems.</li>
          <li>Use automated means to abuse, resell, or overwhelm the Service or its notifications.</li>
          <li>Interfere with other users&rsquo; use of the Service.</li>
        </ul>
      </section>

      <section>
        <h2>4. Course information and notifications</h2>
        <p>
          Course availability, grade-distribution, and instructor-rating information is gathered from
          third-party sources and may be <strong>delayed, incomplete, or inaccurate</strong>. Notifications are
          provided on a best-effort basis and may be late, missed, or undelivered for reasons outside our
          control. PantherWatch does <strong>not</strong> register you for classes and does
          <strong> not guarantee</strong> that a seat will be available or that you will be able to enroll.
          Always verify enrollment and availability directly in GoSolar. You are solely responsible for your
          registration decisions.
        </p>
      </section>

      <section>
        <h2>5. Availability and changes</h2>
        <p>
          We may modify, suspend, or discontinue any part of the Service at any time, with or without notice.
          We may also update these Terms; continued use of the Service after changes take effect constitutes
          acceptance of the revised Terms.
        </p>
      </section>

      <section>
        <h2>6. Termination</h2>
        <p>
          You may stop using the Service and delete your account at any time from the Settings page. We may
          suspend or terminate your access if you violate these Terms or misuse the Service.
        </p>
      </section>

      <section>
        <h2>7. Disclaimer of warranties</h2>
        <p>
          The Service is provided <strong>&ldquo;as is&rdquo; and &ldquo;as available,&rdquo;</strong> without
          warranties of any kind, whether express or implied, including but not limited to merchantability,
          fitness for a particular purpose, accuracy, and non-infringement. We do not warrant that the Service
          will be uninterrupted, timely, secure, or error-free.
        </p>
      </section>

      <section>
        <h2>8. Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, PantherWatch and its operators will not be liable for any
          indirect, incidental, special, consequential, or punitive damages, or for any loss arising from your
          use of (or inability to use) the Service &mdash; including missed registrations, lost seats, or
          missed or delayed notifications. The Service is provided free of charge.
        </p>
      </section>

      <section>
        <h2>9. Governing law</h2>
        <p>
          These Terms are governed by the laws of the State of Georgia, USA, without regard to its conflict-of-law
          principles.
        </p>
      </section>

      <section>
        <h2>10. Contact</h2>
        <p>
          Questions about these Terms? Email us at{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
        </p>
      </section>
    </LegalLayout>
  )
}

export default TermsOfService
