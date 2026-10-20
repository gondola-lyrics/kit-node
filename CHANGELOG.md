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
