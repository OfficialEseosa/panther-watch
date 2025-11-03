import { Link } from "react-router-dom"
import pantherLogo from '../../assets/panther.png'
import './PrivacyPolicy.css'

function PrivacyPolicy() {
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
          <h1>Privacy Policy</h1>
          <p className="policy-updated">Last updated: {new Date().toLocaleDateString()}</p>

          <section className="policy-section">
            <h2>Overview</h2>
            <p>
              PantherWatch helps students monitor Georgia State University course availability. This
              Privacy Policy explains what information we collect, how we use it, and the choices you
              have. PantherWatch is an independent, student-focused project and is not affiliated with
              Georgia State University.
            </p>
          </section>

          <section className="policy-section">
            <h2>Information We Collect</h2>
            <ul>
              <li>
                Account information: When you sign in (e.g., with Google), we may receive your
                name, email address, and profile image from the identity provider.
              </li>
              <li>
                App data you provide: Tracked classes/CRNs, search inputs, term selections,
                and related preferences used to provide the service.
              </li>
              <li>
                Technical information: Basic device and usage data (such as browser type, timestamps,
                and interactions) to keep the service reliable and secure.
              </li>
              <li>
                Cookies/local storage: Used to maintain your session, theme preferences, and to
                improve your experience.
              </li>
            </ul>
          </section>

          <section className="policy-section">
            <h2>How We Use Information</h2>
            <ul>
              <li>Provide core features like tracking classes and building schedules.</li>
              <li>Maintain, improve, and secure PantherWatch.</li>
              <li>Communicate important updates (e.g., service announcements).</li>
              <li>Comply with legal obligations when required.</li>
            </ul>
          </section>

          <section className="policy-section">
            <h2>Data Sharing</h2>
            <p>
              We do not sell your personal information. We may share data with service providers
              who help us operate PantherWatch (for example, authentication or hosting), and only as
              necessary for them to provide their services. We may also share information if required
              by law or to protect the rights, safety, or integrity of the service.
            </p>
          </section>

          <section className="policy-section">
            <h2>Retention</h2>
            <p>
              We retain information for as long as needed to operate PantherWatch and for legitimate
              business or legal purposes. You may request deletion of your account data subject to
              applicable limitations.
            </p>
          </section>

          <section className="policy-section">
            <h2>Your Choices</h2>
            <ul>
              <li>You can manage tracked classes and preferences in the app.</li>
              <li>You can sign out at any time to end your session.</li>
              <li>
                You can request access, correction, or deletion of your information where applicable.
              </li>
            </ul>
          </section>

          <section className="policy-section">
            <h2>Contact</h2>
            <p>
              Questions about this policy or your data? Please reach out to the maintainers via the
              project’s support channels.
            </p>
          </section>

          <div className="policy-footer-links">
            <Link to="/terms" className="policy-link">Terms of Service</Link>
            <span className="separator" aria-hidden>•</span>
            <Link to="/" className="policy-link">Back to Home</Link>
          </div>
        </article>
      </main>
    </div>
  )
}

export default PrivacyPolicy
