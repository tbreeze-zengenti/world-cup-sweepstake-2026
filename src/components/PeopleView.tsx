import { useMemo } from 'react'
import type { TournamentData } from '../lib/types'
import { entrantStatuses, type EntrantStatus } from '../lib/sweepstake1'
import { rankConceded } from '../lib/sweepstake2'
import { rankDiscipline } from '../lib/sweepstake3'
import { personName } from '../lib/holders'
import { Flag } from './Flag'
import type { Fate } from '../lib/bracket'

const FATE_SHORT: Record<Fate, string> = {
  champion: '🏆 Champion',
  'runner-up': '🥈 Runner-up',
  finalist: 'Finalist',
  alive: 'In',
  limbo: 'Limbo',
  eliminated: 'Out',
}

export function PeopleView({ data }: { data: TournamentData }) {
  const { teams, matches, sweepstake } = data
  const statuses = useMemo(() => entrantStatuses(sweepstake, teams, matches), [sweepstake, teams, matches])
  const conceded = useMemo(() => rankConceded(teams, matches), [teams, matches])
  const discipline = useMemo(() => rankDiscipline(teams, matches), [teams, matches])

  const concededRank = new Map(conceded.rows.map((r, i) => [r.slug, { rank: i + 1, ...r }]))
  const disciplineRank = new Map(discipline.rows.map((r, i) => [r.slug, { rank: i + 1, ...r }]))

  const people = useMemo(() => {
    const byPerson = new Map<string, EntrantStatus[]>()
    for (const s of statuses) {
      const person = personName(s.entry.name)
      byPerson.set(person, [...(byPerson.get(person) ?? []), s])
    }
    return [...byPerson.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [statuses])

  return (
    <section>
      <ul className="people-list">
        {people.map(([person, entries]) => (
          <li key={person} className="card person-card">
            <h3>{person}</h3>
            {entries.map((s) => {
              const c = concededRank.get(s.team.slug)
              const d = disciplineRank.get(s.team.slug)
              return (
                <div key={s.entry.name} className={`person-team fate-${s.fate}`}>
                  <div className="person-team-head">
                    <Flag iso2={s.team.iso2} />
                    <span className="team-name">{s.team.name}</span>
                    <span className="group-tag">Group {s.team.group}</span>
                    <span className="fate">
                      {FATE_SHORT[s.fate]}
                      {s.prize ? ` £${s.prize}` : ''}
                    </span>
                  </div>
                  <div className="person-team-pots">
                    <span title="Pot 2: goals conceded in group stage">
                      Pot 2: {c?.conceded ?? 0} conceded{c?.leading ? ' — leading! 💰' : c && c.conceded > 0 ? ` (#${c.rank})` : ''}
                    </span>
                    <span title="Pot 3: disciplinary points in group stage">
                      Pot 3: {d?.points ?? 0} pts{d?.leading ? ' — leading! 💰' : d && d.points > 0 ? ` (#${d.rank})` : ''}
                    </span>
                  </div>
                </div>
              )
            })}
          </li>
        ))}
      </ul>
    </section>
  )
}
