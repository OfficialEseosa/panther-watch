import { useState } from 'react'
import EmailTemplates from './EmailTemplates'
import EmailForm from './EmailForm'
import { adminService } from '../../../config/adminService'
import './EmailComposer.css'

function EmailComposer({ user, onCancel, onEmailSent }) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!subject.trim() || !message.trim()) {
      setError('Please fill in both subject and message fields.')
      return
    }

    setSending(true)
    setError('')
    setSuccess('')

    try {
      const response = await adminService.sendCustomEmail(user.email, subject, message)
      
      if (response.success) {
        setSuccess('Email sent successfully!')
        setTimeout(() => {
          onEmailSent()
        }, 1500)
      } else {
        setError(response.message || 'Failed to send email')
      }
    } catch (error) {
      setError('Failed to send email. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const applyTemplate = (template) => {
    setSubject(template.subject)
    setMessage(template.message)
  }

  return (
    <div className="email-composer-overlay">
      <div className="email-composer">
        <div className="composer-header">
          <h3>📧 Compose Email</h3>
          <button className="close-btn" onClick={onCancel}>×</button>
        </div>

        <div className="recipient-info">
          <div className="recipient-avatar">
            {user?.picture ? (
              <img src={user.picture} alt={user.name || user.email} />
            ) : (
              <div className="avatar-placeholder">
                {(user?.name || user?.email).charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="recipient-details">
            <h4>{user?.name || user?.email?.split('@')[0]}</h4>
            <p>{user?.email}</p>
          </div>
        </div>

        <EmailTemplates user={user} onApplyTemplate={applyTemplate} />

        <EmailForm
          subject={subject}
          message={message}
          onSubjectChange={setSubject}
          onMessageChange={setMessage}
          onSubmit={handleSubmit}
          onCancel={onCancel}
          sending={sending}
          error={error}
          success={success}
        />
      </div>
    </div>
  )
}

export default EmailComposer
