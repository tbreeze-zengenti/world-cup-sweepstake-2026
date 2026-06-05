import { useMemo, useState } from 'react'
import type { Match, Stage, TournamentData } from '../lib/types'
import { buildContext, resolveSide, matchWinner } from '../lib/bracket'
import { holdersByTeam } from '../lib/holders'
import { Flag } from './Flag'
import { TeamName } from '../HighlightContext'

const ROUNDS: { stage: Stage; title: string }[] = [
  { stage: 'r32', title: 'Round of 32' },
  { stage: 'r16', title: 'Round of 16' },
  { stage: 'qf', title: 'Quarter-finals' },
  { stage: 'sf', title: 'Semi-finals' },
  { stage: 'final', title: 'Final' },
]

const num = (m: Match) => Number(m.id.slice(1))
const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })

export function KnockoutView({ data }: { data: TournamentData }) {
  const { teams, matches, sweepstake } = data
  const ctx = useMemo(() => buildContext(teams, matches), [teams, matches])
  const holders = useMemo(() => holdersByTeam(sweepstake, teams), [sweepstake, teams])
  const teamBySlug = useMemo(() => new Map(teams.map((t) => [t.slug, t])), [teams])
  const [activeRound, setActiveRound] = useState<Stage>('r32')

  const third = matches.find((m) => m.stage === 'third')

  /** Bracket position of each knockout match within its round, derived by
   *  walking "W##" refs back from the final so paired matches sit adjacent
   *  on desktop (matches stay in match-number order in the DOM for mobile). */
  const bracketPos = useMemo(() => {
    const byId = new Map(matches.map((m) => [m.id, m]))
    const pos = new Map<string, number>()
    let round = matches.filter((m) => m.stage === 'final')
    round.forEach((m, i) => pos.set(m.id, i))
    for (let i = ROUNDS.length - 2; i >= 0; i--) {
      const stage = ROUNDS[i].stage
      const inStage = matches.filter((m) => m.stage === stage)
      const feeders = round
        .flatMap((m) => [m.home, m.away])
        .map((side) => {
          const ref = /^W(\d+)$/.exec(side)
          return ref ? byId.get(`m${Number(ref[1])}`) : undefined
        })
        .filter((m): m is Match => !!m && m.stage === stage)
      round = feeders.length === inStage.length ? feeders : inStage.sort((a, b) => num(a) - num(b))
      round.forEach((m, j) => pos.set(m.id, j))
    }
    return pos
  }, [matches])

  const renderSide = (m: Match, raw: 'home' | 'away') => {
    const side = resolveSide(m[raw], ctx)
    const team = side.slug ? teamBySlug.get(side.slug) : undefined
    const winner = m.status === 'finished' ? matchWinner(m, ctx) : undefined
    const isWinner = !!team && winner === team.slug
    const isLoser = m.status === 'finished' && !!team && !!winner && winner !== team.slug
    return (
      <div className={`ko-side${isWinner ? ' ko-winner' : ''}${isLoser ? ' ko-loser' : ''}`}>
        {team ? (
          <>
            <Flag iso2={team.iso2} />
            <TeamName slug={team.slug}>{team.name}</TeamName>
            <span className="holder">{holders.get(team.slug)?.name}</span>
          </>
        ) : (
          <span className="ko-tbd">{side.label}</span>
        )}
        <span className="ko-score">
          {m.status !== 'scheduled' && m.score ? m.score[raw] : ''}
          {m.shootout && <small> ({m.shootout[raw]})</small>}
        </span>
      </div>
    )
  }

  const renderMatch = (m: Match) => (
    <div key={m.id} className="ko-match">
      <div className="ko-meta">
        M{num(m)} · {dateFmt.format(new Date(m.kickoff))}
        {m.stage === 'third' && ' · Third place (no effect on Pot 1)'}
      </div>
      {renderSide(m, 'home')}
      {renderSide(m, 'away')}
    </div>
  )

  return (
    <section>
      <nav className="round-tabs" aria-label="Knockout round">
        {ROUNDS.map((r) => (
          <button
            key={r.stage}
            className={activeRound === r.stage ? 'active' : ''}
            onClick={() => setActiveRound(r.stage)}
          >
            {r.title}
          </button>
        ))}
      </nav>
      <div className="bracket">
        <div className="bracket-headers">
          {ROUNDS.map((r) => (
            <h3 key={r.stage}>{r.title}</h3>
          ))}
        </div>
        {ROUNDS.map((r) => (
          <div key={r.stage} className={`round${activeRound === r.stage ? ' round-active' : ''}`}>
            {matches
              .filter((m) => m.stage === r.stage)
              .sort((a, b) => num(a) - num(b))
              .map((m) => {
                const p = bracketPos.get(m.id) ?? 0
                return (
                  <div
                    key={m.id}
                    className={`ko-slot ${p % 2 === 0 ? 'ko-slot-top' : 'ko-slot-bottom'}`}
                    style={{ order: p }}
                  >
                    {renderMatch(m)}
                  </div>
                )
              })}
            {r.stage === 'final' && third && (
              <div className="third-place">{renderMatch(third)}</div>
            )}
          </div>
        ))}
      </div>
      <p className="rules-note">
        “Best 3rd” slots are pinned by the organiser once FIFA confirms the bracket allocation after
        the group stage.
      </p>
    </section>
  )
}
