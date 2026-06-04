import { useEffect, useState } from 'react'
import { useTournament } from './useTournament'
import { GroupsView } from './components/GroupsView'
import { KnockoutView } from './components/KnockoutView'
import { PotsView } from './components/PotsView'
import { PeopleView } from './components/PeopleView'

type View = 'groups' | 'knockout' | 'pots' | 'people'
type Theme = 'light' | 'dark'

const THEME_COLORS: Record<Theme, string> = { dark: '#0b1f3a', light: '#eef2f8' }

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
  }, [theme])
  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  return { theme, toggle }
}

const VIEWS: { id: View; label: string }[] = [
  { id: 'groups', label: 'Groups' },
  { id: 'knockout', label: 'Knockout' },
  { id: 'pots', label: 'Pots' },
  { id: 'people', label: 'People' },
]

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
  const { theme, toggle } = useTheme()

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
        <button
          className="theme-toggle"
          onClick={toggle}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
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

      <nav className="view-tabs" aria-label="Section">
        {VIEWS.map((v) => (
          <button key={v.id} className={view === v.id ? 'active' : ''} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </nav>

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
