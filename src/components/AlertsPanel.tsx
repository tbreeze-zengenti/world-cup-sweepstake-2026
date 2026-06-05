import { useEffect, useMemo, useRef, useState } from 'react'
import { personOptions } from '../lib/highlight'
import type { FollowTarget } from '../lib/push'
import type { SweepstakeEntry } from '../lib/types'
import { usePushNotifications } from '../usePushNotifications'

const FILTER_THRESHOLD = 15

const sameTarget = (a: FollowTarget, b: FollowTarget): boolean =>
  a.kind === 'all'
    ? b.kind === 'all'
    : b.kind === 'people' &&
      a.names.length === b.names.length &&
      a.names.every((n) => b.names.includes(n))

/**
 * Masthead "🔔 Alerts" pill + opt-in panel. The codebase's first popover —
 * justified because a multi-select of people plus permission/install states
 * can't be a native <select>; everything inside it stays native (button
 * radiogroup, checkboxes, text input).
 */
export function AlertsPanel({ sweepstake }: { sweepstake: SweepstakeEntry[] }) {
  const { state, subscribe, update, unsubscribe } = usePushNotifications()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<'all' | 'people'>('all')
  const [names, setNames] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const people = useMemo(() => personOptions(sweepstake), [sweepstake])

  // Close on Esc / outside click; return focus to the trigger.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>('button, input')?.focus()
  }, [open])

  if (state.kind === 'unsupported') return null

  const openPanel = () => {
    if (state.kind === 'subscribed') {
      setKind(state.target.kind)
      setNames(state.target.kind === 'people' ? state.target.names : [])
    }
    setFilter('')
    setOpen(true)
  }

  const draft: FollowTarget = kind === 'all' ? { kind: 'all' } : { kind: 'people', names }
  const draftValid = kind === 'all' || names.length > 0
  const busy = state.kind === 'busy'
  const subscribed = state.kind === 'subscribed'
  const dirty = subscribed && !sameTarget(draft, state.target)
  const denied = state.kind === 'idle' && state.permission === 'denied'

  const toggleName = (name: string) =>
    setNames((cur) => (cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]))

  const visible = filter
    ? people.filter((p) => p.toLowerCase().includes(filter.toLowerCase()))
    : people

  const toggleClass = subscribed
    ? 'alerts-toggle is-on'
    : denied
      ? 'alerts-toggle is-blocked'
      : 'alerts-toggle'

  return (
    <div className="alerts" ref={rootRef}>
      <button
        ref={toggleRef}
        className={toggleClass}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={denied ? 'Alerts blocked — tap for help' : 'Match alerts'}
        onClick={() => (open ? setOpen(false) : openPanel())}
      >
        🔔 Alerts
      </button>
      {open && (
        <>
          <div className="alerts-scrim" aria-hidden onClick={() => setOpen(false)} />
          <div
            className="alerts-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="alerts-title"
            ref={panelRef}
          >
            <h2 id="alerts-title">
              🔔 Match alerts
              <button className="alerts-close" aria-label="Close" onClick={() => setOpen(false)}>
                ✕
              </button>
            </h2>
            <p className="alerts-sub">
              Get a push when a followed team kicks off — and the final score when it finishes.
            </p>

            {state.kind === 'ios-needs-install' ? (
              <div className="alerts-install">
                <p>On iPhone &amp; iPad, add this site to your Home Screen first:</p>
                <ol>
                  <li>Tap the Share button</li>
                  <li>Choose “Add to Home Screen”</li>
                  <li>Open it from there and come back here</li>
                </ol>
              </div>
            ) : denied ? (
              <p className="alerts-banner is-warning">
                Alerts are blocked for this site. To turn them back on, allow notifications in your
                browser’s site settings, then reload.
              </p>
            ) : (
              <>
                <div className="alerts-audience" role="radiogroup" aria-label="Who to follow">
                  <button
                    role="radio"
                    aria-checked={kind === 'all'}
                    className={kind === 'all' ? 'active' : ''}
                    disabled={busy}
                    onClick={() => setKind('all')}
                  >
                    Everyone
                  </button>
                  <button
                    role="radio"
                    aria-checked={kind === 'people'}
                    className={kind === 'people' ? 'active' : ''}
                    disabled={busy}
                    onClick={() => setKind('people')}
                  >
                    Selected people
                  </button>
                </div>

                {kind === 'people' && (
                  <>
                    {people.length > FILTER_THRESHOLD && (
                      <input
                        className="alerts-filter"
                        type="text"
                        placeholder="🔍 Filter names…"
                        aria-label="Filter names"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      />
                    )}
                    <div className="alerts-names">
                      {visible.map((p) => (
                        <label key={p}>
                          <input
                            type="checkbox"
                            checked={names.includes(p)}
                            disabled={busy}
                            onChange={() => toggleName(p)}
                          />
                          <span>{p}</span>
                        </label>
                      ))}
                    </div>
                    <p className="alerts-count" aria-live="polite">
                      {names.length} selected
                      {names.length > 0 && (
                        <button className="link-btn" onClick={() => setNames([])}>
                          Clear
                        </button>
                      )}
                    </p>
                  </>
                )}

                {state.kind === 'error' && (
                  <p className="alerts-banner is-warning">{state.message}</p>
                )}
                {subscribed && !dirty && (
                  <p className="alerts-banner">Alerts are on for this device.</p>
                )}
                {subscribed && dirty && (
                  <p className="alerts-banner">You’ve changed your selection — update to save.</p>
                )}

                {subscribed ? (
                  <>
                    {dirty && (
                      <button
                        className="alerts-cta"
                        disabled={busy || !draftValid}
                        onClick={() => update(draft)}
                      >
                        {busy ? 'Working…' : 'Update'}
                      </button>
                    )}
                    <button className="link-btn alerts-stop" disabled={busy} onClick={unsubscribe}>
                      Stop alerts
                    </button>
                  </>
                ) : (
                  <button
                    className="alerts-cta"
                    disabled={busy || !draftValid}
                    onClick={() => subscribe(draft)}
                  >
                    {busy ? 'Working…' : 'Turn on alerts'}
                  </button>
                )}
              </>
            )}

            <p className="alerts-note">
              Alerts apply to this device. We store your push subscription only to send these match
              alerts.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
