export const BUILTIN_THEMES = ['dark', 'light'] as const
export type BuiltinTheme = (typeof BUILTIN_THEMES)[number]

/** CSS custom properties a theme can override (without the `--` prefix). */
export const THEME_TOKENS = [
  'bg',
  'bg-raised',
  'bg-inset',
  'line',
  'text',
  'text-dim',
  'accent',
  'on-accent',
  'gold',
  'danger',
  'glow',
  'badge-provisional-bg',
  'flag-ring',
] as const
export type ThemeToken = (typeof THEME_TOKENS)[number]

export interface CustomTheme {
  id: string
  name: string
  /** Built-in theme supplying defaults for any token not overridden. */
  base: BuiltinTheme
  colors: Partial<Record<ThemeToken, string>>
}

const STORAGE_KEY = 'custom-themes'
export const THEMES_CHANGED_EVENT = 'custom-themes-changed'

const BUILTIN_META_COLORS: Record<BuiltinTheme, string> = { dark: '#0b1f3a', light: '#eef2f8' }

export function isBuiltinTheme(id: string): id is BuiltinTheme {
  return (BUILTIN_THEMES as readonly string[]).includes(id)
}

function isCustomTheme(value: unknown): value is CustomTheme {
  if (typeof value !== 'object' || value === null) return false
  const t = value as Record<string, unknown>
  return (
    typeof t.id === 'string' &&
    t.id.length > 0 &&
    !isBuiltinTheme(t.id) &&
    typeof t.name === 'string' &&
    t.name.length > 0 &&
    isBuiltinTheme(t.base as string) &&
    typeof t.colors === 'object' &&
    t.colors !== null
  )
}

export function loadCustomThemes(): CustomTheme[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isCustomTheme) : []
  } catch {
    return []
  }
}

function persist(themes: CustomTheme[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(themes))
  window.dispatchEvent(new Event(THEMES_CHANGED_EVENT))
}

/** Add a theme, or replace the existing one with the same id. */
export function saveCustomTheme(theme: CustomTheme) {
  if (!isCustomTheme(theme)) {
    throw new Error('Invalid theme: expected { id, name, base: "light" | "dark", colors: { bg, accent, … } }')
  }
  const themes = loadCustomThemes()
  const existing = themes.findIndex((t) => t.id === theme.id)
  if (existing >= 0) themes[existing] = theme
  else themes.push(theme)
  persist(themes)
}

export function removeCustomTheme(id: string) {
  persist(loadCustomThemes().filter((t) => t.id !== id))
}

/**
 * Apply a theme by id: built-ins rely purely on the stylesheet; custom themes
 * inherit their base via data-theme and override tokens with inline variables.
 * Returns the id actually applied (falls back to 'dark' for unknown ids).
 */
export function applyTheme(id: string, customThemes = loadCustomThemes()): string {
  const root = document.documentElement
  const custom = isBuiltinTheme(id) ? undefined : customThemes.find((t) => t.id === id)
  const builtin: BuiltinTheme = custom ? custom.base : isBuiltinTheme(id) ? id : 'dark'

  root.dataset.theme = builtin
  for (const token of THEME_TOKENS) {
    const value = custom?.colors[token]
    if (value) root.style.setProperty(`--${token}`, value)
    else root.style.removeProperty(`--${token}`)
  }
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', custom?.colors.bg ?? BUILTIN_META_COLORS[builtin])

  return custom ? custom.id : builtin
}
