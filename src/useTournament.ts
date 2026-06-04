import { useEffect, useState } from 'react'
import type { TournamentData } from './lib/types'

const REFRESH_MS = 5 * 60 * 1000

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return res.json()
}

async function fetchAll(): Promise<TournamentData> {
  const [teams, matches, sweepstake] = await Promise.all([
    fetchJson<TournamentData['teams']>('/teams.json'),
    fetchJson<TournamentData['matches']>('/matches.json'),
    fetchJson<TournamentData['sweepstake']>('/sweepstake.json'),
  ])
  return { teams, matches, sweepstake }
}

/**
 * Loads the three data files and silently refetches every 5 minutes while
 * the tab is visible, so an open phone picks up newly deployed results.
 */
export function useTournament(): { data?: TournamentData; error?: string; retry: () => void } {
  const [data, setData] = useState<TournamentData>()
  const [error, setError] = useState<string>()
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = (showError: boolean) =>
      fetchAll()
        .then((d) => !cancelled && (setData(d), setError(undefined)))
        .catch((e) => {
          if (!cancelled && showError) setError(String(e))
        })

    load(true)
    const tick = () => document.visibilityState === 'visible' && load(false)
    const interval = setInterval(tick, REFRESH_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [attempt])

  return { data, error, retry: () => setAttempt((n) => n + 1) }
}
