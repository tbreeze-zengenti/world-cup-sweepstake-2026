import { useEffect, useRef, useState } from 'react'
import { useTournament } from './useTournament'
import { GroupsView } from './components/GroupsView'
import { KnockoutView } from './components/KnockoutView'
import { PotsView } from './components/PotsView'
import { PeopleView } from './components/PeopleView'
import { applyTheme, isBuiltinTheme, loadCustomThemes, THEMES_CHANGED_EVENT, type CustomTheme } from './lib/themes'

type View = 'groups' | 'knockout' | 'pots' | 'people'

function getInitialTheme(): string {
  const stored = localStorage.getItem('theme')
  if (stored && (isBuiltinTheme(stored) || loadCustomThemes().some((t) => t.id === stored))) return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme)
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>(loadCustomThemes)

  useEffect(() => {
    const refresh = () => setCustomThemes(loadCustomThemes())
    window.addEventListener(THEMES_CHANGED_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(THEMES_CHANGED_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  useEffect(() => {
    const applied = applyTheme(theme, customThemes)
    if (applied !== theme) setTheme(applied) // selected custom theme was removed
    else localStorage.setItem('theme', theme)
  }, [theme, customThemes])

  return { theme, setTheme, customThemes }
}

function ThemePicker({
  theme,
  setTheme,
  customThemes,
}: {
  theme: string
  setTheme: (id: string) => void
  customThemes: CustomTheme[]
}) {
  if (customThemes.length === 0) {
    const next = theme === 'dark' ? 'light' : 'dark'
    return (
      <button
        className="theme-toggle"
        onClick={() => setTheme(next)}
        aria-label={`Switch to ${next} mode`}
        title={`Switch to ${next} mode`}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
    )
  }
  return (
    <select className="theme-select" value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="Theme">
      <option value="dark">🌙 Dark</option>
      <option value="light">☀️ Light</option>
      {customThemes.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  )
}

const VIEWS: { id: View; label: string }[] = [
  { id: 'groups', label: 'Groups' },
  { id: 'knockout', label: 'Knockout' },
  { id: 'pots', label: 'Pots' },
  { id: 'people', label: 'People' },
]

function ViewTabs({ view, setView }: { view: View; setView: (v: View) => void }) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)

  // the sentinel sits just above the sticky nav: once it scrolls out of the
  // viewport the nav is pinned, and only then does it get a backdrop
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting))
    if (sentinelRef.current) observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <div ref={sentinelRef} className="tabs-sentinel" aria-hidden />
      <nav className={stuck ? 'view-tabs is-stuck' : 'view-tabs'} aria-label="Section">
        {VIEWS.map((v) => (
          <button key={v.id} className={view === v.id ? 'active' : ''} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </nav>
    </>
  )
}

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' })

function Countdown({ to }: { to: Date }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const diff = to.getTime() - now
  if (diff <= 0) return <>Kick-off! 🎉</>

  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor(diff / 3_600_000) % 24
  const minutes = Math.floor(diff / 60_000) % 60
  const seconds = Math.floor(diff / 1_000) % 60
  return (
    <>
      Kick-off in {days}d {hours}h {minutes}m {seconds}s 🎉
    </>
  )
}

export default function App() {
  const { data, error, retry } = useTournament()
  const [view, setView] = useState<View>('groups')
  const { theme, setTheme, customThemes } = useTheme()

  if (error && !data) {
    return (
      <div className="app-state">
        <p>Couldn’t load tournament data.</p>
        <p className="rules-note">{error}</p>
        <button onClick={retry}>Try again</button>
      </div>
    )
  }
  if (!data) return <div className="app-state">Loading…</div>

  const finished = data.matches.filter((m) => m.status === 'finished')
  const firstKickoff = new Date(
    data.matches.reduce((min, m) => (m.kickoff < min ? m.kickoff : min), data.matches[0].kickoff),
  )
  const notStarted = finished.length === 0 && Date.now() < firstKickoff.getTime()
  const lastResult = finished.length
    ? finished.reduce((max, m) => (m.kickoff > max ? m.kickoff : max), finished[0].kickoff)
    : undefined

  return (
    <div className="app">
      <header className="masthead">
        <ThemePicker theme={theme} setTheme={setTheme} customThemes={customThemes} />
        <h1>
          <span className="masthead-kicker">World Cup 2026</span>
          Office Sweepstake
        </h1>
        <p className="freshness">
          {notStarted ? (
            <Countdown to={firstKickoff} />
          ) : lastResult ? (
            `Results entered up to ${dateFmt.format(new Date(lastResult))} · refreshes automatically`
          ) : (
            'Awaiting first results'
          )}
        </p>
      </header>

      <ViewTabs view={view} setView={setView} />

      <main>
        {view === 'groups' && <GroupsView data={data} />}
        {view === 'knockout' && <KnockoutView data={data} />}
        {view === 'pots' && <PotsView data={data} />}
        {view === 'people' && <PeopleView data={data} />}
      </main>

      <footer className="footer">
        48 teams · 40 players · £240 in the pots · updated by your friendly organiser
      </footer>
    </div>
  )
}
