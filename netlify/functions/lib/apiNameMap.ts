/** Same slugify as scripts/import-fixtures.mjs — keep the two in sync. */
export const slugify = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * Provider team name → our slug, for names where slugify alone is wrong.
 * Covers football-data.org spellings plus common variants; calibrated
 * against real responses — the poller logs any name that fails to resolve,
 * so missing aliases surface before/on match day.
 */
const API_NAME_TO_SLUG: Record<string, string> = {
  'Bosnia & Herzegovina': 'bosnia-and-herzegovina',
  'Bosnia-Herzegovina': 'bosnia-and-herzegovina', // football-data.org spelling
  'Bosnia-H.': 'bosnia-and-herzegovina',
  'Cape Verde Islands': 'cape-verde',
  'Czech Republic': 'czechia',
  'DR Congo': 'congo-dr',
  Iran: 'ir-iran',
  'Ivory Coast': 'cote-divoire',
  'Korea Republic': 'south-korea',
  Turkey: 'turkiye',
  'United States': 'usa',
  'United States of America': 'usa',
}

/** Resolve an API-Football team name to a known slug, or undefined. */
export function apiTeamToSlug(
  apiName: string,
  validSlugs: ReadonlySet<string>,
): string | undefined {
  const slug = API_NAME_TO_SLUG[apiName] ?? slugify(apiName)
  return validSlugs.has(slug) ? slug : undefined
}
