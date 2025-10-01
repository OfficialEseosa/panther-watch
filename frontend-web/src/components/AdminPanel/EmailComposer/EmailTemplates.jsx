function EmailTemplates({ user, onApplyTemplate }) {
  const emailTemplates = [
    {
      name: 'Welcome message',
      subject: 'Welcome to PantherWatch!',
      message: `Hi ${user?.name || user?.email?.split('@')[0]},\n\nWelcome to PantherWatch! We're excited to help you track your GSU classes and get notified when spots open up.\n\nIf you have any questions or need assistance, feel free to reach out.\n\nBest regards,\nThe PantherWatch Team`
    },
    {
      name: 'System maintenance',
      subject: 'Scheduled maintenance notice',
      message: `Hi ${user?.name || user?.email?.split('@')[0]},\n\nWe wanted to let you know that PantherWatch will be undergoing scheduled maintenance on [DATE] from [TIME] to [TIME].\n\nDuring this time, you may experience brief interruptions in service. We apologize for any inconvenience.\n\nThank you for your patience,\nThe PantherWatch Team`
    },
    {
      name: 'Feature update',
      subject: 'New features available!',
      message: `Hi ${user?.name || user?.email?.split('@')[0]},\n\nWe've just released some exciting new features to enhance your PantherWatch experience!\n\n- [Feature 1]\n- [Feature 2]\n- [Feature 3]\n\nLog in to your account to check them out!\n\nBest regards,\nThe PantherWatch Team`
    }
  ]

  return (
    <div className="email-templates">
      <h4>Quick templates</h4>
      <div className="template-buttons">
        {emailTemplates.map((template) => (
          <button
            key={template.name}
            type="button"
            className="template-btn"
            onClick={() => onApplyTemplate(template)}
          >
            {template.name}
          </button>
        ))}
      </div>
    </div>
  )
}

export default EmailTemplates
