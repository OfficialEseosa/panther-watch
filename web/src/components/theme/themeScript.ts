import { STORAGE_KEYS } from "@/lib/ui/storage";

/**
 * Pre-paint theme script (spec.md §1.2.4), inlined as the first child of <head> by
 * app/layout.tsx. It must stay tiny and synchronous: it sets data-theme before the first paint,
 * so there is no theme flash. Kept out of ThemeProvider.tsx because a "use client" module can't
 * export plain values to server components.
 */
export const THEME_INIT_SCRIPT = `(function(){var d=document.documentElement,t;try{t=localStorage.getItem('${STORAGE_KEYS.theme}')}catch(e){}if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}d.dataset.theme=t})()`;
