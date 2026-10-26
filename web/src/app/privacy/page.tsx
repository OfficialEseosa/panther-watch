import type { Metadata } from "next";
import { LEGAL_CONTACT_EMAIL, LegalLayout, LegalSection } from "@/components/shell/LegalLayout";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How PantherWatch collects, uses and protects your information.",
};

const SECTIONS = [
  { id: "information-we-collect", title: "Information we collect" },
  { id: "how-we-use", title: "How we use your information" },
  { id: "course-data", title: "Course and instructor data" },
  { id: "sharing", title: "How we share information" },
  { id: "retention", title: "Data retention" },
  { id: "choices", title: "Your choices and rights" },
  { id: "cookies", title: "Cookies and local storage" },
  { id: "security", title: "Security" },
  { id: "children", title: "Children’s privacy" },
  { id: "changes", title: "Changes to this Policy" },
  { id: "contact", title: "Contact us" },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      sections={SECTIONS}
      intro={
        <p>
          This Privacy Policy explains how PantherWatch (&ldquo;PantherWatch,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
          &ldquo;our&rdquo;) collects, uses, and protects your information when you use our website and services (the
          &ldquo;Service&rdquo;). PantherWatch is an independent project and is{" "}
          <strong>not affiliated with, endorsed by, or sponsored by Georgia State University</strong>. By using the
          Service, you agree to this Policy.
        </p>
      }
    >
      <LegalSection id="information-we-collect" title="Information we collect">
        <p>We collect only what we need to run the Service:</p>
        <ul>
          <li>
            <strong>Account information from Google.</strong> When you sign in with Google, we receive and store your
            name, email address, profile picture link, and Google account identifier. We never receive or store your
            Google password.
          </li>
          <li>
            <strong>Tracked classes.</strong> The sections you choose to watch: CRN, term, subject, course number,
            course title and instructor, plus when we last notified you about each one.
          </li>
          <li>
            <strong>Schedules.</strong> The sections you add to the schedule builder for each term, and the colors you
            pick for them.
          </li>
          <li>
            <strong>Email activity.</strong> Records of the emails we send you (recipient address, subject, type and
            time), so we can avoid duplicate or failed messages and stay within sending limits.
          </li>
          <li>
            <strong>Technical and usage data.</strong> Basic information such as your browser type and device, and
            aggregated usage and performance metrics collected by our hosting provider.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="how-we-use" title="How we use your information">
        <ul>
          <li>To sign you in and maintain your account.</li>
          <li>To let you track sections and email you when seats or waitlist spots open.</li>
          <li>To save your schedule so it&rsquo;s the same on every device you sign in on.</li>
          <li>To send service messages, such as a welcome email or an account-deletion confirmation.</li>
          <li>To operate, secure, debug, and improve the Service.</li>
        </ul>
        <p>
          We do <strong>not</strong> sell your personal information, and we do not use it for third-party advertising.
        </p>
      </LegalSection>

      <LegalSection id="course-data" title="Course and instructor data">
        <p>
          PantherWatch displays publicly available course-availability data from Georgia State University&rsquo;s
          GoSolar registration system, along with historical grade-distribution information and instructor ratings from
          third parties such as Rate My Professors. This information is provided for convenience, may be delayed or
          inaccurate, and is owned by its respective providers. It is not personal information about you.
        </p>
      </LegalSection>

      <LegalSection id="sharing" title="How we share information">
        <p>We share information only with service providers that help us run PantherWatch:</p>
        <ul>
          <li>
            <strong>Google</strong> &mdash; for sign-in. Google tells us who you are; we don&rsquo;t share your
            PantherWatch data back with Google.
          </li>
          <li>
            <strong>Resend</strong> &mdash; to deliver seat alerts and account emails.
          </li>
          <li>
            <strong>Our hosting and database providers</strong> &mdash; to run the application, store its data, and
            measure performance.
          </li>
        </ul>
        <p>
          We may also disclose information if required by law, or to protect the rights, safety, and security of
          PantherWatch and its users.
        </p>
      </LegalSection>

      <LegalSection id="retention" title="Data retention">
        <p>
          We keep your account information for as long as your account is active. Tracked classes are tied to an
          academic term and are removed automatically after the term&rsquo;s tracking period ends (generally about two
          months after the term begins). You can stop tracking a class at any time.
        </p>
        <p>
          You can delete your account from the Settings page. Doing so removes your profile, tracked classes and
          schedules from our database. Delivery records of emails we already sent are kept without a link to your
          account, so we can troubleshoot delivery.
        </p>
      </LegalSection>

      <LegalSection id="choices" title="Your choices and rights">
        <ul>
          <li>
            <strong>Access and update.</strong> Your profile reflects your Google account and is refreshed each time you
            sign in.
          </li>
          <li>
            <strong>Delete.</strong> Remove tracked classes or schedule entries individually, or delete your entire
            account from Settings.
          </li>
          <li>
            <strong>Email.</strong> Seat alerts relate to sections you chose to track. Stop tracking a section to stop
            its emails, or delete your account to stop all emails.
          </li>
        </ul>
        <p>
          Depending on where you live, you may have additional rights over your personal data. To make a request,
          contact us at the email below.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="Cookies and local storage">
        <p>
          When you sign in, we set one session cookie that keeps you signed in for up to 30 days. It is{" "}
          <strong>HttpOnly</strong> (scripts on the page can&rsquo;t read it) and sent only over HTTPS. Signing out
          deletes it. During Google sign-in we also set a short-lived cookie that protects against cross-site request
          forgery.
        </p>
        <p>
          We keep a few preferences in your browser&rsquo;s local storage, such as your theme and the announcements
          you&rsquo;ve dismissed. They stay on your device. We do not use advertising or cross-site tracking cookies.
        </p>
      </LegalSection>

      <LegalSection id="security" title="Security">
        <p>
          We take reasonable measures to protect your information, including encrypted connections (HTTPS), signed
          session tokens in HttpOnly cookies, and checks that every request for your data comes from your own signed-in
          session. However, no method of transmission or storage is completely secure, and we cannot guarantee absolute
          security.
        </p>
      </LegalSection>

      <LegalSection id="children" title={"Children’s privacy"}>
        <p>
          The Service is intended for college students and is not directed to children under 13. We do not knowingly
          collect personal information from children under 13.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes to this Policy">
        <p>
          We may update this Policy from time to time. When we do, we will revise the &ldquo;Last updated&rdquo; date
          above. Significant changes may be communicated through the Service.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Contact us">
        <p>
          Questions about this Policy or your data? Email us at{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
