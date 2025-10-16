import { authService } from '../../config/authService.js'
import { useTheme } from '../../hooks/useTheme.js'
import Icon from '../../components/Icon'
import pantherLogo from '../../assets/panther.png'
import './Home.css'

function Home() {
  const { theme, toggleTheme } = useTheme()

  const handleLogin = async () => {
    try {
      await authService.signInWithGoogle()
    } catch (e) {
      console.error('Login failed', e)
    }
  }

  return (
    <div className="home">
      <header className="home-header">
        <div className="container header-container">
          <div className="brand">
            <img src={pantherLogo} alt="PantherWatch" className="brand-logo" />
            <span className="brand-name">PantherWatch</span>
          </div>
          <div className="header-actions">
            <button className="btn btn-login" onClick={handleLogin}>Login</button>
          </div>
        </div>
      </header>

      <button
        type="button"
        className="floating-theme-toggle"
        aria-label="Toggle theme"
        onClick={toggleTheme}
        title={`Switch to  mode`}
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={20} aria-hidden />
      </button>

      <main className="home-main">
        <section className="hero-section">
          <div className="container hero">
            <div className="hero-copy">
              <h1>Track seats. Enroll faster.</h1>
              <p>
                PantherWatch monitors Georgia State course availability in real time  search by term and
                subject, track specific CRNs, and get ready to grab seats the moment they open.
              </p>
              <div className="hero-actions">
                <button className="btn btn-primary btn-lg" onClick={handleLogin}>Get Started</button>
              </div>
              <div className="hero-highlights">
                <div className="highlight">
                  <Icon name="search" size={18} aria-hidden /> Fast, focused search
                </div>
                <div className="highlight">
                  <Icon name="bookmark" size={18} aria-hidden /> Track CRNs easily
                </div>
                <div className="highlight">
                  <Icon name="analytics" size={18} aria-hidden /> Clear, helpful insights
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="features container section">
          <article className="feature">
            <div className="feature-icon"><Icon name="search" size={22} aria-hidden /></div>
            <h3>Powerful search</h3>
            <p>Filter by term, subject, and course details  see live seat counts as you browse.</p>
          </article>
          <article className="feature">
            <div className="feature-icon"><Icon name="bookmark" size={22} aria-hidden /></div>
            <h3>Track classes</h3>
            <p>Save CRNs to your watchlist and keep tabs on openings without refreshing.</p>
          </article>
          <article className="feature">
            <div className="feature-icon"><Icon name="calendar" size={22} aria-hidden /></div>
            <h3>Stay organized</h3>
            <p>Clean dashboard keeps your tracked list and next steps front and center.</p>
          </article>
          <article className="feature">
            <div className="feature-icon"><Icon name="users" size={22} aria-hidden /></div>
            <h3>Built for students</h3>
            <p>Simple, fast, and reliable  designed around how Panthers search and register.</p>
          </article>
        </section>
      </main>

      <footer className="home-footer container">
        <p> {new Date().getFullYear()} PantherWatch. Not affiliated with Georgia State University.</p>
      </footer>
    </div>
  )
}

export default Home
