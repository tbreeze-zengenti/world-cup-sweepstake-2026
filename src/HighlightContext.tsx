import { createContext, useContext, type ReactNode } from 'react'

const HighlightContext = createContext<Set<string>>(new Set())

export const HighlightProvider = HighlightContext.Provider
export const useHighlight = () => useContext(HighlightContext)

/** Team name span shared by every view — marks itself when its team is highlighted. */
export function TeamName({ slug, children }: { slug: string; children: ReactNode }) {
  const highlighted = useHighlight()
  return (
    <span className="team-name" data-team={slug} data-hl={highlighted.has(slug) ? '' : undefined}>
      {children}
    </span>
  )
}
