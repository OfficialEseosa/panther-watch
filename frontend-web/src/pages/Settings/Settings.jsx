import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { useTheme } from '../../hooks/useTheme.js';
import { authService } from '../../config/authService.js';
import { buildApiUrl } from '../../config';
import Icon from '../../components/Icon';
import './Settings.css';

function Settings() {
  const navigate = useNavigate();
  const { userInfo } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleBack = () => {
    navigate(-1);
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
      navigate('/', { replace: true });
      window.location.reload();
    } catch (error) {
      console.error('Logout failed:', error);
      window.location.reload();
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const session = await authService.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(buildApiUrl('/users/me'), {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete account');
      }

      await authService.logout();
      navigate('/', { replace: true });
      window.location.reload();
    } catch (error) {
      console.error('Failed to delete account:', error);
      alert('Failed to delete account. Please try again or contact support.');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const isDark = theme === 'dark';
  const themeLabel = isDark ? 'Dark mode' : 'Light mode';
  const themeDescription = isDark
    ? 'Dark theme is currently active'
    : 'Light theme is currently active';

  return (
    <div className="settings-page">
      <div className="settings-container">
        <div className="settings-header">
          <button type="button" className="back-button" onClick={handleBack}>
            <Icon name="chevronDown" size={20} className="back-icon" aria-hidden />
            Back
          </button>
          <h1 className="settings-title">Settings</h1>
          <p className="settings-description">
            Manage your account preferences, appearance, and personal information.
          </p>
        </div>

        <div className="settings-content">
          {/* Profile Section */}
          <section className="settings-section">
            <div className="section-header">
              <Icon name="users" size={20} aria-hidden />
              <h2 className="section-title">Profile</h2>
            </div>
            <div className="settings-card">
              <div className="profile-display">
                <div className="profile-avatar">
                  {userInfo?.picture ? (
                    <img src={userInfo.picture} alt={userInfo.name} className="avatar-img" />
                  ) : (
                    <div className="avatar-placeholder">
                      {userInfo?.name?.charAt(0).toUpperCase() || '?'}
                    </div>
                  )}
                </div>
                <div className="profile-details">
                  <div className="profile-name">{userInfo?.name}</div>
                  <div className="profile-email">{userInfo?.email}</div>
                </div>
              </div>
            </div>
          </section>

          {/* Appearance Section */}
          <section className="settings-section">
            <div className="section-header">
              <Icon name={isDark ? 'moon' : 'sun'} size={20} aria-hidden />
              <h2 className="section-title">Appearance</h2>
            </div>
            <div className="settings-card">
              <div className="setting-item">
                <div className="setting-info">
                  <div className="setting-label">{themeLabel}</div>
                  <div className="setting-description">{themeDescription}</div>
                </div>
                <button
                  type="button"
                  className={`toggle-switch ${isDark ? 'active' : ''}`}
                  onClick={toggleTheme}
                  aria-label="Toggle dark mode"
                >
                  <span className="toggle-slider"></span>
                </button>
              </div>
            </div>
          </section>

          {/* Contact Section */}
          <section className="settings-section">
            <div className="section-header">
              <Icon name="phone" size={20} aria-hidden />
              <h2 className="section-title">Contact Information</h2>
            </div>
            <div className="settings-card">
              <div className="setting-item">
                <div className="setting-info">
                  <label htmlFor="phone-number" className="setting-label">
                    Phone Number
                  </label>
                  <div className="setting-description">
                    Get SMS notifications for class availability
                  </div>
                </div>
                <div className="input-with-badge">
                  <input
                    id="phone-number"
                    type="tel"
                    className="setting-input"
                    placeholder="+1 (555) 000-0000"
                    disabled
                  />
                  <span className="coming-soon-badge">Coming Soon</span>
                </div>
              </div>
            </div>
          </section>

          {/* Account Actions Section */}
          <section className="settings-section">
            <div className="section-header">
              <Icon name="shieldOff" size={20} aria-hidden />
              <h2 className="section-title">Account Actions</h2>
            </div>
            <div className="settings-card">
              <button type="button" className="action-button action-logout" onClick={handleLogout}>
                <Icon name="logout" size={20} aria-hidden />
                <div className="action-info">
                  <div className="action-label">Sign Out</div>
                  <div className="action-description">Sign out of your account</div>
                </div>
              </button>

              <div className="action-divider"></div>

              <button
                type="button"
                className="action-button action-delete"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Icon name="trash" size={20} aria-hidden />
                <div className="action-info">
                  <div className="action-label">Delete Account</div>
                  <div className="action-description">
                    Permanently delete your account and all data
                  </div>
                </div>
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <Icon name="alertTriangle" size={28} className="modal-icon" />
              <h3 className="modal-title">Delete Account</h3>
            </div>
            <p className="modal-text">
              Are you sure you want to delete your account? This action cannot be undone. All your
              watched classes, preferences, and account data will be permanently deleted.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-button modal-cancel"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-button modal-confirm"
                onClick={handleDeleteAccount}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <span className="spinner"></span>
                    Deleting...
                  </>
                ) : (
                  'Delete Account'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
