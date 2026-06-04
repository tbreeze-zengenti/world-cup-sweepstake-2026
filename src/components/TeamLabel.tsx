import type { SweepstakeEntry, Team } from '../lib/types'
import { Flag } from './Flag'

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
      <span className="team-name">{team.name}</span>
      {holder && <span className="holder">{holder.name}</span>}
    </span>
  )
}
