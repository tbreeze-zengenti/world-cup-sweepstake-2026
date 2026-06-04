import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './assets/flags.css'
import './styles.css'
import App from './App'
import { loadCustomThemes, removeCustomTheme, saveCustomTheme, THEME_TOKENS, type CustomTheme } from './lib/themes'

// Themes that ship with the app. Each is seeded into localStorage once per
// version (tracked in 'seeded-theme-ids') so it can still be edited or removed
// like any other custom theme without reappearing on the next visit; bump the
// version to push an updated definition to everyone.
const SEEDED_THEMES: { version: number; theme: CustomTheme }[] = [
  {
    version: 2,
    theme: {
      id: 'scotland',
      name: 'Scotland',
      base: 'dark',
      colors: {
        bg: '#e76d03',
        'bg-raised': '#f07b13',
        'bg-inset': '#d06002',
        line: '#f5933c',
        text: '#ffffff',
        'text-dim': '#ffd9b3',
        accent: '#173e90',
        'on-accent': '#ffffff',
        gold: '#173e90',
        glow: '#173e90',
        'badge-provisional-bg': '#f5933c',
        'flag-ring': 'rgb(255 255 255 / 25%)',
      },
    },
  },
  {
    version: 2,
    theme: {
      id: 'brazil-1970',
      name: 'Brazil 1970',
      base: 'dark',
      colors: {
        bg: '#193375',
        'bg-raised': '#1e3c87',
        'bg-inset': '#162c64',
        line: '#2d4fa5',
        text: '#ffffff',
        'text-dim': '#a8bbe8',
        accent: '#ffdc02',
        'on-accent': '#193375',
        gold: '#ffdc02',
        glow: '#0c87d1',
        'badge-provisional-bg': '#2d4fa5',
        'flag-ring': 'rgb(255 255 255 / 20%)',
      },
    },
  },
]

function seedThemes() {
  const raw: unknown = JSON.parse(localStorage.getItem('seeded-theme-ids') ?? '{}')
  // migrate the original array-of-ids form to { id: version }
  const seeded: Record<string, number> = Array.isArray(raw)
    ? Object.fromEntries(raw.map((id: string) => [id, 1]))
    : ((raw ?? {}) as Record<string, number>)
  for (const { version, theme } of SEEDED_THEMES) {
    if ((seeded[theme.id] ?? 0) >= version) continue
    saveCustomTheme(theme)
    seeded[theme.id] = version
  }
  localStorage.setItem('seeded-theme-ids', JSON.stringify(seeded))
}
try {
  seedThemes()
} catch {
  // storage unavailable (private mode etc.) — themes just won't be seeded
}

// Console API for managing custom themes, e.g.
// sweepstakeThemes.save({ id: 'mexico', name: 'Estadio Azteca', base: 'dark', colors: { accent: '#0c8a43' } })
declare global {
  interface Window {
    sweepstakeThemes: {
      tokens: typeof THEME_TOKENS
      list: typeof loadCustomThemes
      save: typeof saveCustomTheme
      remove: typeof removeCustomTheme
    }
  }
}
window.sweepstakeThemes = {
  tokens: THEME_TOKENS,
  list: loadCustomThemes,
  save: saveCustomTheme,
  remove: removeCustomTheme,
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
