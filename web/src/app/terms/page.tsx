import type { Metadata } from "next";
import { LEGAL_CONTACT_EMAIL, LegalLayout, LegalSection } from "@/components/shell/LegalLayout";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of PantherWatch.",
};

const SECTIONS = [
  { id: "about", title: "1. About the Service" },
  { id: "accounts", title: "2. Eligibility and accounts" },
  { id: "acceptable-use", title: "3. Acceptable use" },
  { id: "course-information", title: "4. Course information and notifications" },
  { id: "availability", title: "5. Availability and changes" },
  { id: "termination", title: "6. Termination" },
  { id: "warranties", title: "7. Disclaimer of warranties" },
  { id: "liability", title: "8. Limitation of liability" },
  { id: "law", title: "9. Governing law" },
  { id: "contact", title: "10. Contact" },
];

export default function TermsOfServicePage() {
  return (
    <LegalLayout
      title="Terms of Service"
      sections={SECTIONS}
      intro={
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your use of PantherWatch (the &ldquo;Service&rdquo;). By
          accessing or using the Service, you agree to these Terms. If you do not agree, please do not use the Service.
        </p>
      }
    >
      <LegalSection id="about" title="1. About the Service">
        <p>
          PantherWatch helps Georgia State University students search course availability, track specific sections
          (CRNs), plan a weekly schedule, and receive email notifications when seats or waitlist spots may open.
          PantherWatch is an independent project and is{" "}
          <strong>not affiliated with, endorsed by, or sponsored by Georgia State University</strong>. &ldquo;Georgia
          State University,&rdquo; &ldquo;GoSolar,&rdquo; &ldquo;Rate My Professors,&rdquo; and other names are the
          property of their respective owners.
        </p>
      </LegalSection>

      <LegalSection id="accounts" title="2. Eligibility and accounts">
        <p>
          You must be at least 13 years old to use the Service. You sign in with your Google account, and you are
          responsible for keeping that account secure and for all activity that occurs under your PantherWatch account.
          You agree to provide accurate information and to use the Service only for lawful purposes.
        </p>
      </LegalSection>

      <LegalSection id="acceptable-use" title="3. Acceptable use">
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service in a way that violates any law or the rules of Georgia State University.</li>
          <li>
            Attempt to disrupt, overload, scrape, reverse engineer, or gain unauthorized access to the Service or its
            systems.
          </li>
          <li>Use automated means to abuse, resell, or overwhelm the Service or its notifications.</li>
          <li>Interfere with other users&rsquo; use of the Service.</li>
        </ul>
      </LegalSection>

      <LegalSection id="course-information" title="4. Course information and notifications">
        <p>
          Course availability, grade-distribution, and instructor-rating information is gathered from third-party
          sources and may be <strong>delayed, incomplete, or inaccurate</strong>. Notifications are provided on a
          best-effort basis and may be late, missed, or undelivered for reasons outside our control. PantherWatch does{" "}
          <strong>not</strong> register you for classes and does <strong>not guarantee</strong> that a seat will be
          available or that you will be able to enroll. Always verify enrollment and availability directly in GoSolar.
          You are solely responsible for your registration decisions.
        </p>
      </LegalSection>

      <LegalSection id="availability" title="5. Availability and changes">
        <p>
          We may modify, suspend, or discontinue any part of the Service at any time, with or without notice. We may
          also update these Terms; continued use of the Service after changes take effect constitutes acceptance of the
          revised Terms.
        </p>
      </LegalSection>

      <LegalSection id="termination" title="6. Termination">
        <p>
          You may stop using the Service and delete your account at any time from the Settings page. We may suspend or
          terminate your access if you violate these Terms or misuse the Service.
        </p>
      </LegalSection>

      <LegalSection id="warranties" title="7. Disclaimer of warranties">
        <p>
          The Service is provided <strong>&ldquo;as is&rdquo; and &ldquo;as available,&rdquo;</strong> without warranties
          of any kind, whether express or implied, including but not limited to merchantability, fitness for a
          particular purpose, accuracy, and non-infringement. We do not warrant that the Service will be uninterrupted,
          timely, secure, or error-free.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="8. Limitation of liability">
        <p>
          To the fullest extent permitted by law, PantherWatch and its operators will not be liable for any indirect,
          incidental, special, consequential, or punitive damages, or for any loss arising from your use of (or
          inability to use) the Service &mdash; including missed registrations, lost seats, or missed or delayed
          notifications. The Service is provided free of charge.
        </p>
      </LegalSection>

      <LegalSection id="law" title="9. Governing law">
        <p>
          These Terms are governed by the laws of the State of Georgia, USA, without regard to its conflict-of-law
          principles.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="10. Contact">
        <p>
          Questions about these Terms? Email us at <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
