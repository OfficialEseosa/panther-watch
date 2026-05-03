import { authService } from '../../config/authService.js'
import Icon from '../../components/Icon'
import './Home.css'

/* Inline Google SVG (avoids icon library dependency) */
const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path
      d="M21.35 11.1H12v3.83h5.36c-.5 2.4-2.5 3.78-5.36 3.78a5.7 5.7 0 0 1 0-11.4 5.45 5.45 0 0 1 3.65 1.4l2.84-2.85A9.5 9.5 0 0 0 12 3a9 9 0 1 0 0 18c5.2 0 9-3.7 9-9 0-.6-.07-1.2-.15-1.9z"
      fill="currentColor"
    />
  </svg>
)

function Home() {
  const handleLogin = async () => {
    try {
      await authService.signInWithGoogle()
    } catch (e) {
      console.error('Login failed', e)
    }
  }

  return (
    <div className="pw-login">
      {/* ── Left ── */}
      <div className="pw-login-left">
        <div className="pw-login-brand">
          <div className="pw-login-brand-mark" />
          <span className="pw-login-brand-name">PantherWatch</span>
        </div>

        <div className="pw-login-content">
          <div className="pw-login-eyebrow">// Course monitor for Georgia State</div>

          <h1>
            Get the seat<br />
            <em>before someone else does.</em>
          </h1>

          <p>
            PantherWatch monitors GoSOLAR and emails you the moment a tracked section opens.
            Built by Panthers, for Panthers.
          </p>

          <div className="pw-signin-card">
            <h3>Sign in to continue</h3>
            <p>Use your GSU Google account to start watching classes.</p>

            <button type="button" className="pw-google-btn" onClick={handleLogin}>
              <GoogleIcon />
              Continue with Google
            </button>

            <div className="pw-signin-foot">
              By continuing you agree to PantherWatch's terms of use.
            </div>
          </div>
        </div>

        <div className="pw-login-meta">
          <span>v3.0.0 · Atlanta, GA</span>
          <span>Not affiliated with GSU</span>
        </div>
      </div>

      {/* ── Right (preview) ── */}
      <div className="pw-login-right">
        <div className="pw-preview-stack">
          <div className="pw-preview-card">
            <div>
              <div className="pw-preview-row">
                <span className="pw-preview-code">CSC 4350</span>
                <span className="pw-preview-title">Software Engineering</span>
              </div>
              <div className="pw-preview-meta">CRN 10421 · MWF 11:00 AM · Dr. Patel</div>
            </div>
            <div className="pw-preview-seats green">
              <Icon name="check" size={12} aria-hidden /> 4 / 40
            </div>
          </div>

          <div className="pw-preview-card">
            <div>
              <div className="pw-preview-row">
                <span className="pw-preview-code">MATH 2420</span>
                <span className="pw-preview-title">Discrete Mathematics</span>
              </div>
              <div className="pw-preview-meta">CRN 12044 · MWF 9:30 AM · Dr. Chen</div>
            </div>
            <div className="pw-preview-seats amber">1 / 40</div>
          </div>

          <div className="pw-preview-card">
            <div>
              <div className="pw-preview-row">
                <span className="pw-preview-code">ECON 2105</span>
                <span className="pw-preview-title">Macroeconomics</span>
              </div>
              <div className="pw-preview-meta">CRN 13455 · TR 9:30 AM · Dr. Adeyemo</div>
            </div>
            <div className="pw-preview-seats red">Closed</div>
          </div>

          <div className="pw-preview-card">
            <div>
              <div className="pw-preview-row">
                <span className="pw-preview-code">PSYC 1101</span>
                <span className="pw-preview-title">Intro to Psychology</span>
              </div>
              <div className="pw-preview-meta">CRN 13302 · MWF 10:00 AM · Dr. Howard</div>
            </div>
            <div className="pw-preview-seats green">23 / 145</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Home
