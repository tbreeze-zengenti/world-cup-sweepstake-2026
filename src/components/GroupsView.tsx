import { useMemo, useState } from 'react'
import type { TournamentData } from '../lib/types'
import { computeStandings } from '../lib/standings'
import { rankThirdPlace } from '../lib/thirdPlace'
import { rankDiscipline } from '../lib/sweepstake3'
import { holdersByTeam } from '../lib/holders'
import { Flag } from './Flag'
import { MatchRow } from './MatchRow'

export function GroupsView({ data }: { data: TournamentData }) {
  const { teams, matches, sweepstake } = data
  const standings = useMemo(() => computeStandings(teams, matches), [teams, matches])
  const thirds = useMemo(() => rankThirdPlace(standings), [standings])
  const discipline = useMemo(() => rankDiscipline(teams, matches), [teams, matches])
  const cardsBySlug = useMemo(() => new Map(discipline.rows.map((r) => [r.slug, r])), [discipline])
  const holders = useMemo(() => holdersByTeam(sweepstake, teams), [sweepstake, teams])
  const teamBySlug = useMemo(() => new Map(teams.map((t) => [t.slug, t])), [teams])
  const [openFixtures, setOpenFixtures] = useState<string | null>(null)

  const anyGroupComplete = standings.some((g) => g.complete)

  return (
    <section>
      <div className="group-grid">
        {standings.map((g) => {
          const groupMatches = matches.filter((m) => m.stage === 'group' && m.group === g.group)
          const open = openFixtures === g.group
          return (
            <article key={g.group} className="card group-card">
              <h3>
                Group {g.group}
                {g.complete && <span className="badge badge-final">Complete</span>}
              </h3>
              <table className="standings">
                <thead>
                  <tr>
                    <th className="col-team">Team</th>
                    <th>P</th>
                    <th className="col-wide">W</th>
                    <th className="col-wide">D</th>
                    <th className="col-wide">L</th>
                    <th className="col-wide">GF</th>
                    <th className="col-wide">GA</th>
                    <th>GD</th>
                    <th>Pts</th>
                    <th title="Pot 3 — card points (1 per yellow, 3 per red, 4 per second yellow)">🟨</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r, i) => {
                    const team = teamBySlug.get(r.slug)!
                    const out = g.complete && (i === 3 || (i === 2 && thirds.final && !thirds.rows.find((t) => t.slug === r.slug)?.qualifies))
                    const cards = cardsBySlug.get(r.slug)
                    return (
                      <tr key={r.slug} className={out ? 'row-out' : i < 2 && g.complete ? 'row-through' : ''}>
                        <td className="col-team">
                          <Flag iso2={team.iso2} />
                          <span className="team-stack">
                            <span className="team-name">{team.name}</span>
                            <span className="holder">{holders.get(r.slug)?.name}</span>
                          </span>
                        </td>
                        <td>{r.played}</td>
                        <td className="col-wide">{r.won}</td>
                        <td className="col-wide">{r.drawn}</td>
                        <td className="col-wide">{r.lost}</td>
                        <td className="col-wide">{r.gf}</td>
                        <td className="col-wide">{r.ga}</td>
                        <td>{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                        <td className="col-pts">{r.pts}</td>
                        <td
                          className={`col-cards${cards?.leading ? ' col-cards-leading' : ''}`}
                          title={cards ? `${cards.yellow}🟨 ${cards.red}🟥 ${cards.secondYellow}🟨🟥` : undefined}
                        >
                          {cards?.points ?? 0}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <button className="link-btn" onClick={() => setOpenFixtures(open ? null : g.group)}>
                {open ? 'Hide fixtures' : 'Fixtures & results'}
              </button>
              {open && (
                <ul className="match-list">
                  {groupMatches.map((m) => (
                    <MatchRow key={m.id} match={m} teamBySlug={teamBySlug} />
                  ))}
                </ul>
              )}
            </article>
          )
        })}
      </div>

      {anyGroupComplete && (
        <article className="card thirds-card">
          <h3>
            Best third-placed teams
            <span className={`badge ${thirds.final ? 'badge-final' : 'badge-provisional'}`}>
              {thirds.final ? 'Final' : 'Provisional'}
            </span>
          </h3>
          <p className="rules-note">Top 8 advance to the Round of 32.</p>
          <table className="standings">
            <thead>
              <tr>
                <th>#</th>
                <th className="col-team">Team</th>
                <th>Grp</th>
                <th>Pts</th>
                <th>GD</th>
                <th>GF</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {thirds.rows.map((r, i) => {
                const team = teamBySlug.get(r.slug)!
                return (
                  <tr key={r.slug} className={thirds.final && !r.qualifies ? 'row-out' : ''}>
                    <td>{i + 1}</td>
                    <td className="col-team">
                      <Flag iso2={team.iso2} />
                      <span className="team-stack">
                        <span className="team-name">{team.name}</span>
                        <span className="holder">{holders.get(r.slug)?.name}</span>
                      </span>
                    </td>
                    <td>{r.group}</td>
                    <td className="col-pts">{r.pts}</td>
                    <td>{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                    <td>{r.gf}</td>
                    <td>{r.qualifies ? '✓' : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </article>
      )}
    </section>
  )
}
