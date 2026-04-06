import { Link } from "react-router-dom"
import pantherLogo from '../../assets/panther.png'
import './TermsOfService.css'

function TermsOfService() {
  return (
    <div className="policy-page">
      <header className="home-header">
        <div className="container header-container">
          <Link to="/" className="brand" aria-label="PantherWatch home">
            <img src={pantherLogo} alt="PantherWatch" className="brand-logo" />
            <span className="brand-name">PantherWatch</span>
          </Link>
        </div>
      </header>

      <main className="policy-main container">
        <article className="policy-content">
          <h1>Terms of Service</h1>
          <p className="policy-updated">Last updated: {new Date().toLocaleDateString()}</p>

          <section className="policy-section">
            <h2>Agreement to Terms</h2>
            <p>
              By accessing or using PantherWatch, you agree to these Terms. If you do not agree,
              do not use the service.
            </p>
          </section>

          <section className="policy-section">
            <h2>Service Description</h2>
            <p>
              PantherWatch provides tools to search for courses, track CRNs, and view related
              information to help students plan and register. PantherWatch is not affiliated with
              Georgia State University and does not guarantee course availability or enrollment.
            </p>
          </section>

          <section className="policy-section">
            <h2>Acceptable Use</h2>
            <ul>
              <li>Do not misuse the service, attempt to bypass limits, or disrupt others.</li>
              <li>Do not use PantherWatch for unlawful purposes.</li>
              <li>Respect rate limits and any guidance provided by the maintainers.</li>
            </ul>
          </section>

          <section className="policy-section">
            <h2>Accounts</h2>
            <p>
              You are responsible for activity under your account. Keep your credentials secure and
              sign out when using shared devices.
            </p>
          </section>

          <section className="policy-section">
            <h2>Privacy</h2>
            <p>
              Your use of PantherWatch is also governed by our <Link to="/privacy">Privacy Policy</Link>.
            </p>
          </section>

          <section className="policy-section">
            <h2>Disclaimers</h2>
            <p>
              PantherWatch is provided on an “as is” and “as available” basis without warranties of any
              kind. We do not warrant that the service will be uninterrupted, error-free, or that data
              will always be accurate or current.
            </p>
          </section>

          <section className="policy-section">
            <h2>Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, PantherWatch and its maintainers shall not be
              liable for any indirect, incidental, special, consequential, or punitive damages, or any
              loss of data, use, or other intangible losses, resulting from your use of the service.
            </p>
          </section>

          <section className="policy-section">
            <h2>Changes to the Service and Terms</h2>
            <p>
              We may update or modify PantherWatch and these Terms from time to time. Changes take
              effect when posted. Your continued use signifies acceptance.
            </p>
          </section>

          <section className="policy-section">
            <h2>Contact</h2>
            <p>
              Questions about these Terms? Please reach out to the maintainers via the project’s
              support channels.
            </p>
          </section>

          <div className="policy-footer-links">
            <Link to="/privacy" className="policy-link">Privacy Policy</Link>
            <span className="separator" aria-hidden>•</span>
            <Link to="/" className="policy-link">Back to Home</Link>
          </div>
        </article>
      </main>
    </div>
  )
}

export default TermsOfService
