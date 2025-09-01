function EmailForm({ 
  subject, 
  message, 
  onSubjectChange, 
  onMessageChange, 
  onSubmit, 
  onCancel, 
  sending, 
  error, 
  success 
}) {
  return (
    <form onSubmit={onSubmit} className="email-form">
      <div className="form-group">
        <label htmlFor="subject">Subject:</label>
        <input
          type="text"
          id="subject"
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          placeholder="Enter email subject..."
          disabled={sending}
        />
      </div>

      <div className="form-group">
        <label htmlFor="message">Message:</label>
        <textarea
          id="message"
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          placeholder="Enter your message..."
          rows="10"
          disabled={sending}
        />
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <div className="form-actions">
        <button
          type="button"
          className="cancel-btn"
          onClick={onCancel}
          disabled={sending}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="send-btn"
          disabled={sending}
        >
          {sending ? (
            <>
              <span className="spinner-small"></span>
              Sending...
            </>
          ) : (
            'Send Email'
          )}
        </button>
      </div>
    </form>
  )
}

export default EmailForm
