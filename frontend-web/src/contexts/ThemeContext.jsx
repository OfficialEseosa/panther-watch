import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(undefined);

const STORAGE_KEY = 'pantherwatch.theme';

const getPreferredTheme = () => {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  return mediaQuery.matches ? 'dark' : 'light';
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getPreferredTheme);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const root = window.document.documentElement;
    root.classList.toggle('theme-dark', theme === 'dark');
    window.localStorage.setItem(STORAGE_KEY, theme);

    return undefined;
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event) => {
      setTheme(event.matches ? 'dark' : 'light');
    };

    if (!window.localStorage.getItem(STORAGE_KEY)) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    return undefined;
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
