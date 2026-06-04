import { useMemo } from 'react'
import type { TournamentData } from '../lib/types'
import { entrantStatuses, PRIZES } from '../lib/sweepstake1'
import { rankConceded } from '../lib/sweepstake2'
import { rankDiscipline } from '../lib/sweepstake3'
import { holdersByTeam } from '../lib/holders'
import { Flag } from './Flag'
import type { Fate } from '../lib/bracket'

const FATE_LABEL: Record<Fate, string> = {
  champion: '🏆 Champion',
  'runner-up': '🥈 Runner-up',
  finalist: 'In the final',
  alive: 'Still in it',
  limbo: '3rd — awaiting best-thirds',
  eliminated: 'Out',
}

function Badge({ final }: { final: boolean }) {
  return (
    <span className={`badge ${final ? 'badge-final' : 'badge-provisional'}`}>
      {final ? 'Final' : 'Provisional'}
    </span>
  )
}

export function PotsView({ data }: { data: TournamentData }) {
  const { teams, matches, sweepstake } = data
  const statuses = useMemo(() => entrantStatuses(sweepstake, teams, matches), [sweepstake, teams, matches])
  const conceded = useMemo(() => rankConceded(teams, matches), [teams, matches])
  const discipline = useMemo(() => rankDiscipline(teams, matches), [teams, matches])
  const holders = useMemo(() => holdersByTeam(sweepstake, teams), [sweepstake, teams])
  const teamBySlug = useMemo(() => new Map(teams.map((t) => [t.slug, t])), [teams])

  const started = matches.some((m) => m.status === 'finished')
  const tournamentDone = matches.find((m) => m.stage === 'final')?.status === 'finished'
  const aliveCount = statuses.filter((s) => ['alive', 'finalist', 'limbo'].includes(s.fate)).length

  const share = (winners: string[]) =>
    winners.length <= 1 ? `£${PRIZES.pot2}` : `£${PRIZES.pot2} split ${winners.length} ways (£${(PRIZES.pot2 / winners.length).toFixed(2)} each)`

  const potTable = (
    rows: { slug: string; leading: boolean; cells: (string | number)[] }[],
    headers: string[],
  ) => (
    <table className="standings">
      <thead>
        <tr>
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
              <td className="col-team">
                <Flag iso2={team.iso2} />
                <span className="team-name" data-team={team.slug}>{team.name}</span>
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
    <section className="pots">
      <article className="card">
        <h3>
          Pot 1 — The big one <span className="pot-money">£{PRIZES.pot1Champion} / £{PRIZES.pot1RunnerUp}</span>
          <Badge final={tournamentDone} />
        </h3>
        <p className="rules-note">
          £3 of each entry. Tournament winner takes £{PRIZES.pot1Champion}, runner-up £{PRIZES.pot1RunnerUp}.
        </p>
        {started ? (
          <>
            <p className="pot-summary">{aliveCount} of 48 teams still in it.</p>
            <ul className="entrant-list">
              {statuses
                .filter((s) => s.fate !== 'alive' || tournamentDone)
                .slice(0, tournamentDone ? undefined : 16)
                .map((s) => (
                  <li key={s.entry.name} className={`fate-${s.fate}`}>
                    <Flag iso2={s.team.iso2} />
                    <span className="team-name" data-team={s.team.slug}>{s.team.name}</span>
                    <span className="holder">{s.entry.name}</span>
                    <span className="fate">
                      {FATE_LABEL[s.fate]}
                      {s.prize ? ` — £${s.prize}` : ''}
                    </span>
                  </li>
                ))}
            </ul>
            {!tournamentDone && (
              <p className="rules-note">Showing knocked-out and qualified teams — see Groups & Knockout for the rest.</p>
            )}
          </>
        ) : (
          <p className="pot-summary">Starts after the first matches on 11 June.</p>
        )}
      </article>

      <article className="card">
        <h3>
          Pot 2 — Leakiest defence <span className="pot-money">£{PRIZES.pot2}</span>
          <Badge final={conceded.final} />
        </h3>
        <p className="rules-note">
          £1 of each entry. Most goals <strong>conceded in the group stage</strong> wins. Tied? Fewest
          goals scored takes it; still tied, the pot is split.
        </p>
        {started ? (
          <>
            {conceded.winners.length > 0 && (
              <p className="pot-summary">
                {conceded.final ? 'Winner' : 'Currently leading'}:{' '}
                {conceded.winners.map((w) => teamBySlug.get(w)!.name).join(' & ')} — {share(conceded.winners)}
              </p>
            )}
            {potTable(
              conceded.rows.slice(0, 10).map((r) => ({
                slug: r.slug,
                leading: r.leading,
                cells: [r.played, r.conceded, r.scored],
              })),
              ['P', 'Conceded', 'Scored'],
            )}
          </>
        ) : (
          <p className="pot-summary">Starts after the first matches on 11 June.</p>
        )}
      </article>

      <article className="card">
        <h3>
          Pot 3 — Dirtiest team <span className="pot-money">£{PRIZES.pot3}</span>
          <Badge final={discipline.final} />
        </h3>
        <p className="rules-note">
          £1 of each entry. Worst disciplinary record in the <strong>group stage</strong>: 1 pt per
          yellow, 3 per red, 4 for a second-yellow send-off. Tied? Most reds, then fewest goals
          scored; still tied, the pot is split.
        </p>
        {started ? (
          <>
            {discipline.winners.length > 0 && (
              <p className="pot-summary">
                {discipline.final ? 'Winner' : 'Currently leading'}:{' '}
                {discipline.winners.map((w) => teamBySlug.get(w)!.name).join(' & ')} — {share(discipline.winners)}
              </p>
            )}
            {discipline.missingCards.length > 0 && (
              <p className="warning">
                ⚠ Cards not yet recorded for {discipline.missingCards.length} finished{' '}
                {discipline.missingCards.length === 1 ? 'match' : 'matches'}.
              </p>
            )}
            {potTable(
              discipline.rows
                .filter((r) => r.points > 0)
                .slice(0, 10)
                .map((r) => ({
                  slug: r.slug,
                  leading: r.leading,
                  cells: [r.yellow, r.red, r.secondYellow, r.points],
                })),
              ['🟨', '🟥', '🟨🟥', 'Pts'],
            )}
          </>
        ) : (
          <p className="pot-summary">Starts after the first matches on 11 June.</p>
        )}
      </article>
    </section>
  )
}
