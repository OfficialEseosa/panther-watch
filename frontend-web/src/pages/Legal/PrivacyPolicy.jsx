import LegalLayout, { LEGAL_CONTACT_EMAIL } from './LegalLayout.jsx'

function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy">
      <p>
        This Privacy Policy explains how PantherWatch (&ldquo;PantherWatch,&rdquo; &ldquo;we,&rdquo;
        &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses, and protects your information when you
        use our website and services (the &ldquo;Service&rdquo;). PantherWatch is an independent project
        and is <strong>not affiliated with, endorsed by, or sponsored by Georgia State University</strong>.
        By using the Service, you agree to this Policy.
      </p>

      <section>
        <h2>Information we collect</h2>
        <p>We collect only what we need to run the Service:</p>
        <ul>
          <li>
            <strong>Account information from Google.</strong> When you sign in with Google, we receive your
            name, email address, profile picture, and Google account identifier. We do not receive or store
            your Google password.
          </li>
          <li>
            <strong>Tracked classes and schedules.</strong> The courses you choose to track (such as CRN,
            term, subject, course number, and instructor) and any schedule information you create.
          </li>
          <li>
            <strong>Email activity.</strong> Records of notification emails we send you (for example,
            delivery and timing), so we can avoid duplicate or failed messages.
          </li>
          <li>
            <strong>Technical and usage data.</strong> Basic information such as your browser type, device,
            and anonymized, aggregated usage and performance metrics collected through our hosting and
            analytics providers.
          </li>
        </ul>
      </section>

      <section>
        <h2>How we use your information</h2>
        <ul>
          <li>To authenticate you and maintain your account.</li>
          <li>To let you track courses and notify you by email when seats or waitlist spots open.</li>
          <li>To send service messages such as a welcome email or account-deletion confirmation.</li>
          <li>To operate, secure, debug, and improve the Service.</li>
        </ul>
        <p>
          We do <strong>not</strong> sell your personal information, and we do not use it for third-party
          advertising.
        </p>
      </section>

      <section>
        <h2>Course and instructor data</h2>
        <p>
          PantherWatch displays publicly available course-availability data sourced from Georgia State
          University&rsquo;s GoSolar registration system, along with historical grade-distribution
          information and instructor ratings sourced from third parties such as Rate My Professors. This
          information is provided for convenience, may be delayed or inaccurate, and is owned by its
          respective providers. It is not personal information about you.
        </p>
      </section>

      <section>
        <h2>How we share information</h2>
        <p>We share information only with service providers that help us run PantherWatch:</p>
        <ul>
          <li><strong>Google</strong> &mdash; for sign-in (authentication).</li>
          <li><strong>Resend</strong> &mdash; to deliver notification and account emails.</li>
          <li><strong>Our hosting and analytics providers</strong> &mdash; to host the application and database and to measure performance.</li>
        </ul>
        <p>
          We may also disclose information if required by law, or to protect the rights, safety, and
          security of PantherWatch and its users.
        </p>
      </section>

      <section>
        <h2>Data retention</h2>
        <p>
          We keep your account information for as long as your account is active. Tracked classes are tied
          to an academic term and are automatically removed after the term ends (generally about two months
          after the term begins). You can delete a tracked class at any time, and you can delete your entire
          account from the Settings page &mdash; doing so removes your profile and tracked classes from our
          database.
        </p>
      </section>

      <section>
        <h2>Your choices and rights</h2>
        <ul>
          <li><strong>Access &amp; update.</strong> Your profile reflects the information from your Google account.</li>
          <li><strong>Delete.</strong> You can remove tracked classes individually or delete your account entirely from Settings.</li>
          <li><strong>Email.</strong> Notification emails relate to courses you chose to track; stop tracking a course to stop its emails, or delete your account to stop all emails.</li>
        </ul>
        <p>
          Depending on where you live, you may have additional rights over your personal data. To make a
          request, contact us at the email below.
        </p>
      </section>

      <section>
        <h2>Cookies and local storage</h2>
        <p>
          We store a sign-in token in your browser&rsquo;s local storage to keep you logged in, and we use a
          short-lived cookie during the Google sign-in process to protect against cross-site request forgery.
          We do not use advertising or cross-site tracking cookies.
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          We take reasonable measures to protect your information, including encrypted connections (HTTPS) and
          signed authentication tokens. However, no method of transmission or storage is completely secure, and
          we cannot guarantee absolute security.
        </p>
      </section>

      <section>
        <h2>Children&rsquo;s privacy</h2>
        <p>
          The Service is intended for college students and is not directed to children under 13. We do not
          knowingly collect personal information from children under 13.
        </p>
      </section>

      <section>
        <h2>Changes to this Policy</h2>
        <p>
          We may update this Policy from time to time. When we do, we will revise the &ldquo;Last updated&rdquo;
          date above. Significant changes may be communicated through the Service.
        </p>
      </section>

      <section>
        <h2>Contact us</h2>
        <p>
          Questions about this Policy or your data? Email us at{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
        </p>
      </section>
    </LegalLayout>
  )
}

export default PrivacyPolicy
