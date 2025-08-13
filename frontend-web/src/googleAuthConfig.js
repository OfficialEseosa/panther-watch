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
        // Decode the JWT token to get user info
        try {
          const token = response.credential;
          const payload = JSON.parse(atob(token.split('.')[1]));
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
          reject(error);
        }
      },
      auto_select: false,
    });

    // Trigger the sign-in prompt
    window.google.accounts.id.prompt();
  });
};
