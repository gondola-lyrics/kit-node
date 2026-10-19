import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

import { MANIFEST, fail, isSemanticVersion } from './utils'

const main = () => {
  const { positionals } = parseArgs({ allowPositionals: true })
  const version = positionals[0]
  if (version === undefined) {
    return fail('usage: bump-version <version>')
  }
  if (!isSemanticVersion(version)) {
    return fail(`${JSON.stringify(version)} is not a semantic version`)
  }
  if (version === '0.0.0') {
    return fail('0.0.0 is the placeholder, not a release version')
  }

  const text = readFileSync(MANIFEST, 'utf8')
  if (JSON.parse(text).version === version) {
    return fail(`package.json is already ${version}`)
  }

  // Only the version field is rewritten, so formatting elsewhere in the manifest survives untouched.
  writeFileSync(MANIFEST, text.replace(/("version":\s*)"[^"]*"/, `$1"${version}"`))
  console.log(`package.json: ${version}`)
}

main()
