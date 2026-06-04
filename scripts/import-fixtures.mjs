#!/usr/bin/env node
/**
 * One-off import: converts the openfootball public-domain World Cup 2026
 * fixture list into data/teams.json and data/matches.json.
 *
 * Usage: npm run import-fixtures
 *
 * Re-running OVERWRITES both files — never re-run after results have been
 * entered into data/matches.json.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const SOURCE_URL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json'
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dataDir = path.join(root, 'data')

// openfootball name → sweepstake name (where they differ)
const NAME_MAP = {
  'Bosnia & Herzegovina': 'Bosnia and Herzegovina',
  'Czech Republic': 'Czechia',
  'DR Congo': 'Congo DR',
  Iran: 'IR Iran',
  'Ivory Coast': "Côte d'Ivoire",
  Turkey: 'Türkiye',
}

// Curated flag codes (flag-icons css classes). England/Scotland use
// GB subdivision codes. NOTE: sweepstake.json has :flag-al: for Algeria,
// which is Albania's Slack code — Algeria is "dz".
const ISO2 = {
  Algeria: 'dz',
  Argentina: 'ar',
  Australia: 'au',
  Austria: 'at',
  Belgium: 'be',
  'Bosnia and Herzegovina': 'ba',
  Brazil: 'br',
  Canada: 'ca',
  'Cape Verde': 'cv',
  Colombia: 'co',
  'Congo DR': 'cd',
  "Côte d'Ivoire": 'ci',
  Croatia: 'hr',
  Curaçao: 'cw',
  Czechia: 'cz',
  Ecuador: 'ec',
  Egypt: 'eg',
  England: 'gb-eng',
  France: 'fr',
  Germany: 'de',
  Ghana: 'gh',
  Haiti: 'ht',
  'IR Iran': 'ir',
  Iraq: 'iq',
  Japan: 'jp',
  Jordan: 'jo',
  Mexico: 'mx',
  Morocco: 'ma',
  Netherlands: 'nl',
  'New Zealand': 'nz',
  Norway: 'no',
  Panama: 'pa',
  Paraguay: 'py',
  Portugal: 'pt',
  Qatar: 'qa',
  'Saudi Arabia': 'sa',
  Scotland: 'gb-sct',
  Senegal: 'sn',
  'South Africa': 'za',
  'South Korea': 'kr',
  Spain: 'es',
  Sweden: 'se',
  Switzerland: 'ch',
  Tunisia: 'tn',
  Türkiye: 'tr',
  USA: 'us',
  Uruguay: 'uy',
  Uzbekistan: 'uz',
}

const slugify = (name) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

// "13:00 UTC-6" + "2026-06-11" → "2026-06-11T13:00:00-06:00"
const toIso = (date, time) => {
  const m = /^(\d{2}:\d{2}) UTC([+-]\d+)(?::(\d{2}))?$/.exec(time)
  if (!m) throw new Error(`Unparseable time: ${time}`)
  const offsetH = String(Math.abs(Number(m[2]))).padStart(2, '0')
  const sign = m[2].startsWith('-') ? '-' : '+'
  return `${date}T${m[1]}:00${sign}${offsetH}:${m[3] ?? '00'}`
}

const ROUND_TO_STAGE = {
  'Round of 32': 'r32',
  'Round of 16': 'r16',
  'Quarter-final': 'qf',
  'Semi-final': 'sf',
  'Match for third place': 'third',
  Final: 'final',
}

async function loadSource() {
  const cached = '/tmp/openfootball-wc2026.json'
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8'))
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
  return res.json()
}

const source = await loadSource()
const sweepstake = JSON.parse(
  readFileSync(path.join(dataDir, 'sweepstake.json'), 'utf8'),
)

// --- teams.json ---------------------------------------------------------
const teamGroups = new Map() // sweepstake name → group letter
for (const m of source.matches) {
  if (!m.group) continue
  for (const raw of [m.team1, m.team2]) {
    const name = NAME_MAP[raw] ?? raw
    teamGroups.set(name, m.group.replace('Group ', ''))
  }
}

const sweepstakeTeams = new Set(sweepstake.map((e) => e.team))
const fixtureTeams = new Set(teamGroups.keys())
for (const t of sweepstakeTeams) {
  if (!fixtureTeams.has(t)) throw new Error(`Sweepstake team not in fixtures: ${t}`)
}
for (const t of fixtureTeams) {
  if (!sweepstakeTeams.has(t)) throw new Error(`Fixture team not in sweepstake: ${t}`)
  if (!ISO2[t]) throw new Error(`Missing iso2 for: ${t}`)
}

const teams = [...teamGroups.entries()]
  .map(([name, group]) => ({ slug: slugify(name), name, iso2: ISO2[name], group }))
  .sort((a, b) => (a.group === b.group ? a.name.localeCompare(b.name) : a.group.localeCompare(b.group)))

const slugByName = new Map(teams.map((t) => [t.name, t.slug]))

// --- matches.json -------------------------------------------------------
// Keep openfootball knockout placeholders verbatim: "1A", "2B",
// "3A/B/C/D/F" (best third from those groups), "W73"/"L101" (match refs).
const toSide = (raw) => slugByName.get(NAME_MAP[raw] ?? raw) ?? raw

const groupMatches = source.matches
  .filter((m) => m.group)
  .sort((a, b) => toIso(a.date, a.time).localeCompare(toIso(b.date, b.time)) || a.group.localeCompare(b.group))
const knockoutMatches = source.matches.filter((m) => !m.group)

// FIFA numbering: group matches 1–72 chronologically, knockout carries
// its own num (73–102); third place = 103, final = 104.
let seq = 0
const matches = [
  ...groupMatches.map((m) => ({
    id: `m${++seq}`,
    stage: 'group',
    group: m.group.replace('Group ', ''),
    kickoff: toIso(m.date, m.time),
    venue: m.ground,
    home: toSide(m.team1),
    away: toSide(m.team2),
    status: 'scheduled',
  })),
  ...knockoutMatches.map((m) => {
    const stage = ROUND_TO_STAGE[m.round]
    if (!stage) throw new Error(`Unknown round: ${m.round}`)
    const num = m.num ?? (stage === 'third' ? 103 : 104)
    return {
      id: `m${num}`,
      stage,
      kickoff: toIso(m.date, m.time),
      venue: m.ground,
      home: toSide(m.team1),
      away: toSide(m.team2),
      status: 'scheduled',
    }
  }),
]

if (matches.length !== 104) throw new Error(`Expected 104 matches, got ${matches.length}`)
if (new Set(matches.map((m) => m.id)).size !== 104) throw new Error('Duplicate match ids')

writeFileSync(path.join(dataDir, 'teams.json'), JSON.stringify(teams, null, 2) + '\n')
writeFileSync(path.join(dataDir, 'matches.json'), JSON.stringify(matches, null, 2) + '\n')
console.log(`Wrote ${teams.length} teams and ${matches.length} matches.`)
