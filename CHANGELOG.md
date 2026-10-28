## v0.4.0 (2026-10-28)

### Feature

- transform-space
  - add missing space insertion helper ([b1789bf](https://github.com/gondola-lyrics/kit-node/commit/b1789bfbb416840125c740eb8d103eae931bd608))
- transform-background
  - add background line extraction helper ([25678b6](https://github.com/gondola-lyrics/kit-node/commit/25678b6ea21c3d76d6c8c626595ef34fdf84924d))
  - add background bracket stripping helper ([646aedc](https://github.com/gondola-lyrics/kit-node/commit/646aedcc2095c0f5e154f052fefe0f1e9ff4b2e3))
- transform-emphasis
  - add word emphasis derivation helper ([baf5e47](https://github.com/gondola-lyrics/kit-node/commit/baf5e47f723195a273b0f589c28d50f052c9b0a6))
- transform-instrumental
  - add instrumental line insertion helper ([21b5147](https://github.com/gondola-lyrics/kit-node/commit/21b5147cfc366a57f1ba14e3da97cb6f873db071))

### Fix

- transform-space
  - keep words intact when inserting spaces ([f7ab0ef](https://github.com/gondola-lyrics/kit-node/commit/f7ab0ef58f05a8f376d7414366d8250aca609d69))
- format-lrc
  - treat empty timed lines as instrumental breaks ([15c10d4](https://github.com/gondola-lyrics/kit-node/commit/15c10d47ad1d24c404a5ab316179b71fa38d9601))

### Document

- update support formats ([ae73460](https://github.com/gondola-lyrics/kit-node/commit/ae73460fda58a8ce6e25bf0b9f1eeba92afad680))

## v0.3.0 (2026-10-25)

### Feature

- format-ttml
  - add generator ([708be02](https://github.com/gondola-lyrics/kit-node/commit/708be02cab6bc7443d6ea13ac7d90ea3709ca7e3))

### Fix

- format-ttml
  - preserve inherited language tags and explicit clears ([42e7c5c](https://github.com/gondola-lyrics/kit-node/commit/42e7c5cb9a0855fc6168014e3c7098bec920e178))
  - preserve whitespace and cdata text ([19550aa](https://github.com/gondola-lyrics/kit-node/commit/19550aad5ed10fa5cec01bd9acca2a3521973269))
  - preserve background text and annotations ([005c05f](https://github.com/gondola-lyrics/kit-node/commit/005c05f8c99f9243150660e70523ccf47feb1d75))
  - preserve open ranges and ruby bounds ([1adf33f](https://github.com/gondola-lyrics/kit-node/commit/1adf33f68106477bfbcce69b18efa97eb8091fc3))
- utils
  - preserve supplementary characters in xml attributes ([98c1a3a](https://github.com/gondola-lyrics/kit-node/commit/98c1a3afc9ff66c8fbae7d4164fa82ada41f4033))

### Performance

- format-ttml
  - reduce allocations ([0c1ce78](https://github.com/gondola-lyrics/kit-node/commit/0c1ce78b0ab75c447c22b1e3447e80cfd99cdf26))

## v0.2.0 (2026-10-21)

### Feature

- format-ttml
  - add parser ([053e97f](https://github.com/gondola-lyrics/kit-node/commit/053e97f3f1912e03979c4925ce8bc52de9de2fd3))
- utils
  - support time values with offsets ([c5bacf3](https://github.com/gondola-lyrics/kit-node/commit/c5bacf3b76459fd6a0872bf7bce42f070eaa9ab0))
  - add xml writer ([4d48827](https://github.com/gondola-lyrics/kit-node/commit/4d48827d4ae1494649030631b43aaacd1d813044))
  - add xml reader ([d3aa9ac](https://github.com/gondola-lyrics/kit-node/commit/d3aa9acb73df6cfeff5bf8d5357d6666fc0af046))

### Refactor

- utils
  - extract time helpers ([ec6aa69](https://github.com/gondola-lyrics/kit-node/commit/ec6aa69a9469d0e5dfd2e8e8219a16fbff880a14))
  - split xml reader ([2bfa1ff](https://github.com/gondola-lyrics/kit-node/commit/2bfa1ff2460c1ebd3ccf32a52f25e90ea77f52e4))
- return canonical lyrics and diagnostics from parsers ([9033396](https://github.com/gondola-lyrics/kit-node/commit/9033396c759bba5ff34ee88486b0d15c266470ab))

## v0.1.0 (2026-10-20)

### Feature

- format-lrc
  - support parsing annotation tracks ([adecdc2](https://github.com/gondola-lyrics/kit-node/commit/adecdc236dc2c427f73a01f5ca6c5be4e439a62d))
  - add generator ([48cf3a2](https://github.com/gondola-lyrics/kit-node/commit/48cf3a25a1d0bf2643e816883fe3f36bd8cb5cfa))
  - support enhanced word timing ([cfa1196](https://github.com/gondola-lyrics/kit-node/commit/cfa1196846e79f2bc6c00c563d83a39d15fee11c))
  - add parser ([a6dd1b1](https://github.com/gondola-lyrics/kit-node/commit/a6dd1b1f71fcdaa5da5988f959dc70d3d184116c))
- common
  - add types ([dd044f7](https://github.com/gondola-lyrics/kit-node/commit/dd044f7a47cea622a530bac7e2391d24c6dd0f71))

### Fix

- format-lrc
  - split lone carriage returns ([a20d382](https://github.com/gondola-lyrics/kit-node/commit/a20d382f4b2e7b3694ab7727b37e0bfd3ca8b2fd))

### Refactor

- format-lrc
  - accept unknown source input ([1ab629b](https://github.com/gondola-lyrics/kit-node/commit/1ab629b4b1a10146c29f6676d75ddefa783093f6))
- make target format explicit in generate ([e163842](https://github.com/gondola-lyrics/kit-node/commit/e1638421d75f4b36a0b04f19ce2c5bd2d5b99879))
- flatten the root entry exports ([28be696](https://github.com/gondola-lyrics/kit-node/commit/28be6962d5fce7212e65cda73a8977bd5c53d3e5))
- move lyric format type into formats ([41ed016](https://github.com/gondola-lyrics/kit-node/commit/41ed016d9925ee880480ba5db56733866319d558))

### Document

- add readme ([646d813](https://github.com/gondola-lyrics/kit-node/commit/646d8133c76a6e26b61f794ea0e5082238e8bac5))
- simplify comments ([cf00859](https://github.com/gondola-lyrics/kit-node/commit/cf00859c52d1f5aade49321329140acf03f96cec))
