import type { SweepstakeEntry, Team } from '../lib/types'
import { Flag } from './Flag'
import { TeamName } from '../HighlightContext'

export function TeamLabel({
  team,
  holder,
  muted,
}: {
  team: Team
  holder?: SweepstakeEntry
  muted?: boolean
}) {
  return (
    <span className={`team-label${muted ? ' muted' : ''}`}>
      <Flag iso2={team.iso2} />
      <TeamName slug={team.slug}>{team.name}</TeamName>
      {holder && <span className="holder">{holder.name}</span>}
    </span>
  )
}
