// Google OAuth configuration
export const googleConfig = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  redirectUri: window.location.origin, // Will be localhost:5173 in dev
};

// Google OAuth helper functions
export const initializeGoogleAuth = () => {
  return new Promise((resolve) => {
    if (window.google) {
      window.google.accounts.id.initialize({
        client_id: googleConfig.clientId,
        callback: () => {}, // Will be set per login attempt
        auto_select: false,
        cancel_on_tap_outside: false,
      });
      resolve(true);
    } else {
      // Wait for Google script to load
      const checkGoogle = setInterval(() => {
        if (window.google) {
          clearInterval(checkGoogle);
          window.google.accounts.id.initialize({
            client_id: googleConfig.clientId,
            callback: () => {}, // Will be set per login attempt
            auto_select: false,
            cancel_on_tap_outside: false,
          });
          resolve(true);
        }
      }, 100);
    }
  });
};

export const signInWithGoogle = () => {
  return new Promise((resolve, reject) => {
    if (!window.google) {
      reject(new Error('Google Identity Services not loaded'));
      return;
    }

    window.google.accounts.id.initialize({
      client_id: googleConfig.clientId,
      callback: (response) => {
        // Basic JWT token validation and parsing
        try {
          const token = response.credential;
          
          // Basic token structure validation
          if (!token || typeof token !== 'string') {
            throw new Error('Invalid token format');
          }
          
          const parts = token.split('.');
          if (parts.length !== 3) {
            throw new Error('Invalid JWT structure');
          }
          
          // Decode payload (Note: In production, you should verify the token signature on your backend)
          const payload = JSON.parse(atob(parts[1]));
          
          // Basic payload validation
          if (!payload.email || !payload.name) {
            throw new Error('Invalid token payload');
          }
          
          // TODO: For production, verify token signature with Google's public keys on your backend
          
          resolve({
            token,
            user: {
              email: payload.email,
              name: payload.name,
              picture: payload.picture,
              emailVerified: payload.email_verified,
            }
          });
        } catch (error) {
          console.error('Token validation failed:', error);
          reject(new Error('Token validation failed: ' + error.message));
        }
      },
      auto_select: false,
    });

    // Trigger the sign-in prompt
    window.google.accounts.id.prompt();
  });
};
