import { useNavigate, Link } from 'react-router-dom'
import { useTheme } from '../../hooks/useTheme.js'
import Icon from '../../components/Icon'
import pantherLogo from '../../assets/panther.png'
import './Legal.css'

// Shared chrome for the standalone legal pages (Privacy Policy, Terms of Service).
// Public and login-free so they can be linked from the footer and used as the
// Google OAuth consent screen's privacy/terms URLs.
export const LEGAL_LAST_UPDATED = 'June 7, 2026'
export const LEGAL_CONTACT_EMAIL = 'raphaelomorose@gmail.com'

function LegalLayout({ title, children }) {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="legal-page">
      <header className="legal-header">
        <div className="legal-header-inner">
          <Link to="/" className="legal-brand">
            <img src={pantherLogo} alt="PantherWatch" className="legal-brand-logo" />
            <span className="legal-brand-name">PantherWatch</span>
          </Link>
          <button
            type="button"
            className="legal-theme-toggle"
            aria-label="Toggle theme"
            onClick={toggleTheme}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} aria-hidden />
          </button>
        </div>
      </header>

      <main className="legal-main">
        <button type="button" className="legal-back" onClick={() => navigate(-1)}>
          <Icon name="chevronDown" size={16} style={{ transform: 'rotate(90deg)' }} aria-hidden />
          Back
        </button>

        <h1 className="legal-title">{title}</h1>
        <p className="legal-updated">Last updated: {LEGAL_LAST_UPDATED}</p>

        <div className="legal-content">{children}</div>

        <nav className="legal-cross-links" aria-label="Legal documents">
          <Link to="/privacy">Privacy Policy</Link>
          <span aria-hidden>·</span>
          <Link to="/terms">Terms of Service</Link>
        </nav>
      </main>

      <footer className="legal-footer">
        <p>© {new Date().getFullYear()} PantherWatch. Not affiliated with Georgia State University.</p>
      </footer>
    </div>
  )
}

export default LegalLayout
