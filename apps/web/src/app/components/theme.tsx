'use client';

import { useEffect, useState } from 'react';

const KEY = 'comercial_ops_theme';

export function setThemePref(theme: 'light' | 'dark') {
  window.localStorage.setItem(KEY, theme);
  document.documentElement.setAttribute('data-theme', theme);
  window.dispatchEvent(new CustomEvent('comercial_ops_theme', { detail: theme }));
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  setThemePref(current === 'dark' ? 'light' : 'dark');
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = window.localStorage.getItem(KEY);
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored);
      return;
    }
    const system = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    setTheme(system ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const onChange = (e: Event) => {
      const t = (e as CustomEvent<string>).detail;
      if (t === 'light' || t === 'dark') setTheme(t);
    };
    window.addEventListener('comercial_ops_theme', onChange);
    return () => window.removeEventListener('comercial_ops_theme', onChange);
  }, []);

  return <>{children}</>;
}