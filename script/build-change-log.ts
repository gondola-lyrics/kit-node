/**
 * Builds the changelog section of one release.
 *
 * Usage:
 *   node script/build-change-log.ts <version> [--dry-run]
 *   node script/build-change-log.ts <version> --extract
 *   node script/build-change-log.ts <version> --check-bump
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const ROOT = resolve(import.meta.dirname, '..')

const CHANGE_LOG_FILE = 'CHANGELOG.md'

/**
 * The repository ships a single package, so tags carry no target prefix.
 */
const TAG_PREFIX = 'v'

/**
 * Playground changes are demo-only and stay out of release notes, whatever their type.
 */
const EXCLUDED_SCOPES = new Set(['playground'])

const TYPE_TITLES = new Map([
  ['feat', 'Feature'],
  ['fix', 'Fix'],
  ['perf', 'Performance'],
  ['refactor', 'Refactor'],
  ['revert', 'Revert'],
  ['docs', 'Document'],
])

const SUBJECT_PATTERN = /^(?<kind>[a-z]+)(?:\((?<scope>[\w-]+)\))?: (?<message>.+)$/
const BREAKING_PATTERN = /^breaking:\s*(?<text>.+)$/i
const GITHUB_PATTERN = /github\.com[:/](?<owner>[^/]+)\/(?<name>[^/]+?)(?:\.git)?\/?$/
const RECORDED_PATTERN = /^## v(?<version>\S+) \(/
const SEMVER_PATTERN =
  /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+(?<build>[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

type VersionIdentifier = readonly [kind: number, value: number, text: string]

interface VersionKey {
  core: readonly [number, number, number]
  /** `null` marks a release, which sorts after every prerelease of the same core. */
  prerelease: readonly VersionIdentifier[] | null
}

interface Commit {
  full: string
  short: string
  kind: string
  scope: string | undefined
  message: string
  breaking: string[]
}

const SCRIPT_NAME = basename(process.argv[1] ?? 'script', '.ts')

/**
 * Reports why the script stopped and exits, so a caller never decides whether a failure was recoverable.
 */
// The explicit annotation is what lets the compiler treat a call as unreachable and narrow the code after it.
const fail: (reason: string) => never = (reason) => {
  console.error(`${SCRIPT_NAME}: ${reason}`)
  process.exit(1)
}

/**
 * Runs git in the repository root and returns its output.
 */
const git = (...args: string[]): string => {
  try {
    // stderr is captured rather than forwarded, so a failure surfaces once, in the message below.
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    return fail(`git ${args.join(' ')} failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Runs git and reports failure as `null`, for callers that tolerate a missing remote.
 */
const tryGit = (...args: string[]): string | null => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null
  }
}

const readFile = (relative: string): string | null => {
  const path = resolve(ROOT, relative)
  if (!existsSync(path)) {
    return null
  }
  return readFileSync(path, 'utf8')
}

const writeFile = (relative: string, content: string) => {
  writeFileSync(resolve(ROOT, relative), content, 'utf8')
}

const versionKey = (version: string): VersionKey => {
  const match = SEMVER_PATTERN.exec(version)
  if (match === null) {
    return fail(`not a semantic version: ${version}`)
  }
  const groups = match.groups ?? {}
  const prerelease = groups.prerelease
  const identifiers =
    prerelease === undefined
      ? null
      : prerelease.split('.').map((part): VersionIdentifier => {
          // Numeric identifiers rank below alphanumeric ones, as semver.org orders them.
          return /^\d+$/.test(part) ? [0, Number(part), ''] : [1, 0, part]
        })

  return {
    core: [Number(groups.major ?? 0), Number(groups.minor ?? 0), Number(groups.patch ?? 0)],
    prerelease: identifiers,
  }
}

const compareIdentifiers = (left: VersionIdentifier, right: VersionIdentifier): number => {
  if (left[0] !== right[0]) {
    return left[0] - right[0]
  }
  if (left[1] !== right[1]) {
    return left[1] - right[1]
  }
  if (left[2] === right[2]) {
    return 0
  }
  return left[2] < right[2] ? -1 : 1
}

const compareKeys = (left: VersionKey, right: VersionKey): number => {
  for (let index = 0; index < 3; index += 1) {
    const difference = (left.core[index] ?? 0) - (right.core[index] ?? 0)
    if (difference !== 0) {
      return difference
    }
  }

  if (left.prerelease === null && right.prerelease === null) {
    return 0
  }
  if (left.prerelease === null) {
    return 1
  }
  if (right.prerelease === null) {
    return -1
  }

  const length = Math.max(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index]
    const rightIdentifier = right.prerelease[index]
    // A shorter set of identifiers ranks lower once the shared prefix ties.
    if (leftIdentifier === undefined) {
      return -1
    }
    if (rightIdentifier === undefined) {
      return 1
    }
    const difference = compareIdentifiers(leftIdentifier, rightIdentifier)
    if (difference !== 0) {
      return difference
    }
  }

  return 0
}

const repoUrl = (): string | null => {
  const remote = tryGit('remote', 'get-url', 'origin')
  if (remote === null) {
    return null
  }
  const match = GITHUB_PATTERN.exec(remote.trim())
  const owner = match?.groups?.owner
  const name = match?.groups?.name
  if (owner === undefined || name === undefined) {
    return null
  }
  return `https://github.com/${owner}/${name}`
}

/**
 * Finds the newest tag below the version being built, which bounds the commits the section covers.
 */
const previousTag = (version: string): string | null => {
  const current = versionKey(version)
  const versions = git('tag', '--list', `${TAG_PREFIX}*`)
    .split(/\s+/)
    .filter((tag) => tag !== '')
    .map((tag) => tag.slice(TAG_PREFIX.length))
    .filter((found) => SEMVER_PATTERN.test(found) && compareKeys(versionKey(found), current) < 0)
  if (versions.length === 0) {
    return null
  }

  const latest = versions.reduce((best, found) => {
    return compareKeys(versionKey(found), versionKey(best)) > 0 ? found : best
  })
  return `${TAG_PREFIX}${latest}`
}

const collectCommits = (since: string | null): Commit[] => {
  const revision = since === null ? 'HEAD' : `${since}..HEAD`
  const output = git('log', revision, '--format=%H%x1f%h%x1f%s%x1f%b%x1e')
  const commits: Commit[] = []

  for (const raw of output.split('\x1e')) {
    const record = raw.replace(/^\n+|\n+$/g, '')
    if (record === '') {
      continue
    }

    const parts = record.split('\x1f')
    const full = parts[0] ?? ''
    const short = parts[1] ?? ''
    const subject = parts[2] ?? ''
    const body = parts.slice(3).join('\x1f')
    const match = SUBJECT_PATTERN.exec(subject)
    const kind = match?.groups?.kind
    const scope = match?.groups?.scope
    const message = match?.groups?.message
    if (kind === undefined || message === undefined) {
      continue
    }
    if (!TYPE_TITLES.has(kind)) {
      continue
    }
    if (scope !== undefined && EXCLUDED_SCOPES.has(scope)) {
      continue
    }

    const breaking = body.split(/\r?\n/).flatMap((line) => {
      const text = BREAKING_PATTERN.exec(line.trim())?.groups?.text?.trim()
      return text === undefined ? [] : [text]
    })

    commits.push({ full, short, kind, scope, message, breaking })
  }

  return commits
}

const formatCommit = (commit: Commit, url: string | null): string => {
  const link = url === null ? commit.short : `[${commit.short}](${url}/commit/${commit.full})`
  return `${commit.message} (${link})`
}

interface Entry {
  scope: string | undefined
  text: string
}

/**
 * Groups entries under their scope so related changes read together, and keeps unscoped ones as plain items.
 *
 * Scopes appear in the order they were first used, which keeps the newest work first like the log itself.
 */
const renderEntries = (entries: Entry[]): string[] => {
  const groups = new Map<string, string[]>()
  const plain: string[] = []

  for (const entry of entries) {
    if (entry.scope === undefined) {
      plain.push(`- ${entry.text}`)
      continue
    }
    const group = groups.get(entry.scope)
    if (group) {
      group.push(`  - ${entry.text}`)
    } else {
      groups.set(entry.scope, [`  - ${entry.text}`])
    }
  }

  return [...[...groups].flatMap(([scope, items]) => [`- ${scope}`, ...items]), ...plain]
}

const formatDay = (day: Date): string => {
  const year = String(day.getFullYear())
  const month = String(day.getMonth() + 1).padStart(2, '0')
  const date = String(day.getDate()).padStart(2, '0')
  return `${year}-${month}-${date}`
}

const buildSection = (version: string, commits: Commit[], url: string | null, day: Date): string => {
  const lines = [`## v${version} (${formatDay(day)})`]

  const breaking = commits.flatMap((commit) => commit.breaking.map((text) => ({ scope: commit.scope, text })))
  if (breaking.length > 0) {
    lines.push('', '### Breaking', '')
    lines.push(...renderEntries(breaking))
  }

  for (const [kind, title] of TYPE_TITLES) {
    const group = commits.filter((commit) => commit.kind === kind)
    if (group.length === 0) {
      continue
    }
    lines.push('', `### ${title}`, '')
    lines.push(...renderEntries(group.map((commit) => ({ scope: commit.scope, text: formatCommit(commit, url) }))))
  }

  if (breaking.length === 0 && commits.length === 0) {
    lines.push('', 'No notable changes.')
  }

  return `${lines.join('\n')}\n`
}

const extractSection = (text: string, version: string): string | null => {
  const lines = text.split(/\r?\n/)
  const heading = `## v${version} (`
  const start = lines.findIndex((line) => line.startsWith(heading))
  if (start === -1) {
    return null
  }

  const next = lines.findIndex((line, index) => index > start && line.startsWith('## v'))
  const end = next === -1 ? lines.length : next
  return `${lines
    .slice(start + 1, end)
    .join('\n')
    .trim()}\n`
}

/**
 * Reads the newest release heading, which is the one a new section has to come after.
 */
const newestRelease = (text: string): string | null => {
  for (const line of text.split(/\r?\n/)) {
    const version = RECORDED_PATTERN.exec(line)?.groups?.version
    if (version === undefined) {
      continue
    }
    if (!SEMVER_PATTERN.test(version)) {
      fail(`${CHANGE_LOG_FILE} records a heading that is not a semantic version: ${JSON.stringify(version)}`)
    }
    return version
  }
  return null
}

/**
 * A version that does not move forward would publish over a section already recorded.
 */
const checkBump = (version: string, existing: string | null) => {
  const previous = existing === null ? null : newestRelease(existing)
  if (previous === null) {
    return
  }
  if (compareKeys(versionKey(version), versionKey(previous)) <= 0) {
    fail(`${version} does not come after ${previous}, the newest release ${CHANGE_LOG_FILE} records`)
  }
}

const main = () => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      extract: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      'check-bump': { type: 'boolean', default: false },
    },
  })

  const version = positionals[0]
  if (version === undefined) {
    return fail('usage: build-change-log <version> [--dry-run | --extract | --check-bump]')
  }
  if ([values['dry-run'], values.extract, values['check-bump']].filter(Boolean).length > 1) {
    return fail('--dry-run, --extract and --check-bump are mutually exclusive')
  }
  versionKey(version)

  const existing = readFile(CHANGE_LOG_FILE)
  const recorded = existing === null ? null : extractSection(existing, version)

  if (values.extract) {
    // Returning through `fail` ends the branch outright, which is what narrows `recorded` below it.
    if (recorded === null) {
      return fail(`${CHANGE_LOG_FILE} has no section for v${version}`)
    }
    process.stdout.write(recorded)
    return
  }

  // A caller asks for this before writing anything of its own, so nothing is half done when the version turns out to be too small.
  if (values['check-bump']) {
    checkBump(version, existing)
    return
  }

  // Writing a version twice would leave two sections, and extraction only ever reaches the first.
  if (recorded !== null && !values['dry-run']) {
    return fail(`${CHANGE_LOG_FILE} already has a section for v${version}`)
  }
  // A dry run previews rather than gates, so it is held to neither of these.
  if (!values['dry-run']) {
    checkBump(version, existing)
  }

  const since = previousTag(version)
  const commits = collectCommits(since)
  const section = buildSection(version, commits, repoUrl(), new Date())

  if (values['dry-run']) {
    process.stdout.write(section)
    return
  }

  writeFile(CHANGE_LOG_FILE, existing === null ? section : `${section}\n${existing}`)
  console.log(`wrote ${CHANGE_LOG_FILE} for v${version}`)
}

main()
