// Microsoft Authentication Library configuration
export const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID,
    // Allow both personal and organizational Microsoft accounts
    authority: "https://login.microsoftonline.com/common",
    redirectUri: window.location.origin, // Will be localhost:5173 in dev, pantherwatch.app in prod
  },
  cache: {
    cacheLocation: "sessionStorage", // This configures where your cache will be stored
    storeAuthStateInCookie: false, // Set this to "true" if you are having issues on IE11 or Edge
  }
};

// Add scopes here for Microsoft Graph API if needed
export const loginRequest = {
  scopes: ["User.Read"], // Basic profile info
  // Optional: Add domain hint to suggest GSU login
  domainHint: "gsu.edu"
};
