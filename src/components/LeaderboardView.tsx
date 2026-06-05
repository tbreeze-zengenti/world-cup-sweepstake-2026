import { useMemo } from 'react'
import type { TournamentData } from '../lib/types'
import { PRIZES } from '../lib/sweepstake1'
import { rankConceded } from '../lib/sweepstake2'
import { rankDiscipline } from '../lib/sweepstake3'
import { holdersByTeam } from '../lib/holders'
import { Flag } from './Flag'
import { TeamName } from '../HighlightContext'

/** competition ranking: tied rows share a rank, next rank skips (1, 1, 3 …) */
function withRanks<T>(rows: T[], key: (r: T) => string): (T & { rank: number })[] {
  let rank = 0
  let prevKey: string | undefined
  return rows.map((r, i) => {
    const k = key(r)
    if (k !== prevKey) {
      rank = i + 1
      prevKey = k
    }
    return { ...r, rank }
  })
}

export function LeaderboardView({ data }: { data: TournamentData }) {
  const { teams, matches, sweepstake } = data
  const conceded = useMemo(() => rankConceded(teams, matches), [teams, matches])
  const discipline = useMemo(() => rankDiscipline(teams, matches), [teams, matches])
  const holders = useMemo(() => holdersByTeam(sweepstake, teams), [sweepstake, teams])
  const teamBySlug = useMemo(() => new Map(teams.map((t) => [t.slug, t])), [teams])

  const started = matches.some((m) => m.status === 'finished')

  const concededRows = withRanks(conceded.rows, (r) => `${r.conceded}:${r.scored}`)
  const disciplineRows = withRanks(
    discipline.rows,
    (r) => `${r.points}:${r.red + r.secondYellow}:${r.scored}`,
  )

  const table = (
    rows: { slug: string; rank: number; leading: boolean; cells: (string | number)[] }[],
    headers: string[],
  ) => (
    <table className="standings">
      <thead>
        <tr>
          <th>#</th>
          <th className="col-team">Team</th>
          {headers.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const team = teamBySlug.get(r.slug)!
          return (
            <tr key={r.slug} className={r.leading ? 'row-leading' : ''}>
              <td>{r.rank}</td>
              <td className="col-team">
                <Flag iso2={team.iso2} />
                <TeamName slug={team.slug}>{team.name}</TeamName>
                <span className="holder">{holders.get(r.slug)?.name}</span>
              </td>
              {r.cells.map((c, i) => (
                <td key={i}>{c}</td>
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )

  return (
    <section className="leaderboards">
      <article className="card">
        <h3>
          Pot 2 — Leakiest defence <span className="pot-money">£{PRIZES.pot2}</span>
        </h3>
        <p className="rules-note">
          Most goals conceded in the group stage. Tiebreak: fewest goals scored, then split.
          {!started && ' Everyone starts level — first matches 11 June.'}
        </p>
        {table(
          concededRows.map((r) => ({
            slug: r.slug,
            rank: r.rank,
            leading: r.leading,
            cells: [r.played, r.conceded, r.scored],
          })),
          ['P', 'Conceded', 'Scored'],
        )}
      </article>

      <article className="card">
        <h3>
          Pot 3 — Dirtiest team <span className="pot-money">£{PRIZES.pot3}</span>
        </h3>
        <p className="rules-note">
          1 pt per yellow, 3 per red, 4 per second-yellow send-off, group stage only. Tiebreak: most
          reds, then fewest goals scored, then split.
          {!started && ' Everyone starts level — first matches 11 June.'}
        </p>
        {discipline.missingCards.length > 0 && (
          <p className="warning">
            ⚠ Cards not yet recorded for {discipline.missingCards.length} finished{' '}
            {discipline.missingCards.length === 1 ? 'match' : 'matches'}.
          </p>
        )}
        {table(
          disciplineRows.map((r) => ({
            slug: r.slug,
            rank: r.rank,
            leading: r.leading,
            cells: [r.yellow, r.red, r.secondYellow, r.points],
          })),
          ['🟨', '🟥', '🟨🟥', 'Pts'],
        )}
      </article>
    </section>
  )
}
