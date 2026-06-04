import type { Match, SweepstakeEntry, Team } from '../lib/types'
import { Flag } from './Flag'

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

export function MatchRow({
  match,
  teamBySlug,
  holders,
}: {
  match: Match
  teamBySlug: Map<string, Team>
  holders?: Map<string, SweepstakeEntry>
}) {
  const kickoff = new Date(match.kickoff)
  const side = (slug: string) => {
    const team = teamBySlug.get(slug)
    const holder = holders?.get(slug)
    return team ? (
      <>
        <Flag iso2={team.iso2} /> {team.name}
        {holder && <span className="holder match-holder">{holder.name}</span>}
      </>
    ) : (
      slug
    )
  }
  return (
    <li className={`match-row ${match.status}`}>
      <span className="match-home">{side(match.home)}</span>
      {match.status === 'finished' && match.score ? (
        <span className="match-score">
          {match.score.home}–{match.score.away}
          {match.shootout && (
            <small> ({match.shootout.home}–{match.shootout.away} pens)</small>
          )}
        </span>
      ) : (
        <span className="match-when">
          {dateFmt.format(kickoff)} <small>{timeFmt.format(kickoff)}</small>
        </span>
      )}
      <span className="match-away">{side(match.away)}</span>
    </li>
  )
}
