import { basename, resolve } from 'node:path'

/**
 * Matches a full semantic version, per semver.org.
 */
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

/**
 * The package directory, which is the repository root here since this package is not nested.
 */
export const PACKAGE_ROOT = resolve(import.meta.dirname, '..')

/**
 * The repository root, kept separate from `PACKAGE_ROOT` so the scripts read the same in both layouts.
 */
export const REPO_ROOT = PACKAGE_ROOT

export const MANIFEST = resolve(PACKAGE_ROOT, 'package.json')

const SCRIPT_NAME = basename(process.argv[1] ?? 'script', '.ts')

/**
 * Reports why a script stopped and exits, so a caller never has to decide whether the failure was recoverable.
 */
export const fail = (reason: string): never => {
  console.error(`${SCRIPT_NAME}: ${reason}`)
  process.exit(1)
}

/**
 * Reports whether a version is a semantic version.
 */
export const isSemanticVersion = (version: string): boolean => {
  return SEMVER_PATTERN.test(version)
}
