## v0.6.0 (2026-11-07)

### Features

- **format-kwrc:** add parser ([7c91062](https://github.com/gondola-lyrics/kit-node/commit/7c91062749bf52bb171776329bd70ed9af168c3e))
- **transform-credit:** support matching unknown metadata ([0865f41](https://github.com/gondola-lyrics/kit-node/commit/0865f4104210e8be6b24131925df4b13f64ef388))
- **format-yrc:** add parser ([3cc0aa1](https://github.com/gondola-lyrics/kit-node/commit/3cc0aa150447b3ff952d5ef1c0117d33edd82058))
- **format-lrc:** expose source positions ([a10a213](https://github.com/gondola-lyrics/kit-node/commit/a10a21314d4baa16978011050d7928911c16eef0))
- **format-krc:** add lrc fallback for detection and parsing ([fd01079](https://github.com/gondola-lyrics/kit-node/commit/fd010791978f8bf7992da0b80d592dc97c8907c4))
- **format-krc:** add parser ([d4f2c47](https://github.com/gondola-lyrics/kit-node/commit/d4f2c47854d31c52c20d66a9fb51d3c73a0001ad))
- **utils:** add base64 decoder ([3306a1f](https://github.com/gondola-lyrics/kit-node/commit/3306a1fd0040dd04d4f10fad876dcd6a5a0411ae))

### Fixes

- **transform-credit:** remove entire source lines ([6221c7a](https://github.com/gondola-lyrics/kit-node/commit/6221c7a535093c9839e5a833c0e5edf856d70a4f))
- **format-krc:** skip placeholder translation slots ([102aec8](https://github.com/gondola-lyrics/kit-node/commit/102aec8341b737654ae16f58d07f1b363e1cd7b8))

### Refactoring

- **format-qrc:** extract placeholder text check helper ([2982317](https://github.com/gondola-lyrics/kit-node/commit/298231740a1b0ab54cde7cbda256f5487cc43b5f))
- **format-qrc:** export ruby helpers ([db4ec34](https://github.com/gondola-lyrics/kit-node/commit/db4ec3477af1c7a214b47357aab2caeff61d3a9b))
- **format-lrc:** merge reader into parser ([4a2bcbd](https://github.com/gondola-lyrics/kit-node/commit/4a2bcbd40a77c2628307a0145cb08a620ba03b65))
- **format-lrc:** extract reusable word tag scanner ([16e746d](https://github.com/gondola-lyrics/kit-node/commit/16e746d086411a9d171cd8531b3ad323775f43d3))

## v0.5.0 (2026-11-03)

### Features

- **format-lrc:** add word-level romanization support ([1998a61](https://github.com/gondola-lyrics/kit-node/commit/1998a618726fb725a69cfa454570db7f356fa220))
- **format-qrc:** add ruby parsing support ([e3a2e79](https://github.com/gondola-lyrics/kit-node/commit/e3a2e794f5af035bfc0c053e737c2df7c277beec))
- **format-qrc:** add parser ([e72615f](https://github.com/gondola-lyrics/kit-node/commit/e72615fb89b72e6fe4a1fe500615bf5d6febbe91))
- **transform-filter:** add first-line song info removal ([03fd28a](https://github.com/gondola-lyrics/kit-node/commit/03fd28ac2b2f0e79f1eb535e7da4d057201f9ea0))
- **transform-filter:** add non-lyric line removal helper ([0666ab6](https://github.com/gondola-lyrics/kit-node/commit/0666ab6ad87f55db77e105ef56e8c5c0975191f4))
- **transform-agent:** add agent extraction helper ([58bea8d](https://github.com/gondola-lyrics/kit-node/commit/58bea8d3d84b046af542eaff62cd5bcfa0b33a34))
- **transform-credit:** add credit extraction helper ([7d04f1e](https://github.com/gondola-lyrics/kit-node/commit/7d04f1ee892d290c1596341ec93c6b7723c4c745))
- add fallback for word-level romanization ([f8a1605](https://github.com/gondola-lyrics/kit-node/commit/f8a1605b0d611410648ee60ad3780fda6f494f7c))

### Fixes

- **transform-credit:** remove source lines containing ruby ([93f3167](https://github.com/gondola-lyrics/kit-node/commit/93f31678c2058a50f2da9489056346434c4d7c4d))
- **format-lrc:** preserve overlapping word timing ([ccc19f2](https://github.com/gondola-lyrics/kit-node/commit/ccc19f2c4e7cfa1cb9774b52bc1e6d2d6f186f9a))

### Refactoring

- **format-qrc:** reuse lrc reader ([2eec478](https://github.com/gondola-lyrics/kit-node/commit/2eec47872bada4945b172a18c236cfb2d06a14b6))
- **format-lrc:** extract reader ([fd9cc39](https://github.com/gondola-lyrics/kit-node/commit/fd9cc39e237cd31584f7f2ae0cb376503086405a))
- simplify conditional logic ([a0851c1](https://github.com/gondola-lyrics/kit-node/commit/a0851c1a1d901404e37f228af01c36d161542c29))

## v0.4.0 (2026-10-28)

### Features

- **transform-space:** add missing space insertion helper ([b1789bf](https://github.com/gondola-lyrics/kit-node/commit/b1789bfbb416840125c740eb8d103eae931bd608))
- **transform-background:** add background line extraction helper ([25678b6](https://github.com/gondola-lyrics/kit-node/commit/25678b6ea21c3d76d6c8c626595ef34fdf84924d))
- **transform-background:** add background bracket stripping helper ([646aedc](https://github.com/gondola-lyrics/kit-node/commit/646aedcc2095c0f5e154f052fefe0f1e9ff4b2e3))
- **transform-emphasis:** add word emphasis derivation helper ([baf5e47](https://github.com/gondola-lyrics/kit-node/commit/baf5e47f723195a273b0f589c28d50f052c9b0a6))
- **transform-instrumental:** add instrumental line insertion helper ([21b5147](https://github.com/gondola-lyrics/kit-node/commit/21b5147cfc366a57f1ba14e3da97cb6f873db071))

### Fixes

- **transform-space:** keep words intact when inserting spaces ([f7ab0ef](https://github.com/gondola-lyrics/kit-node/commit/f7ab0ef58f05a8f376d7414366d8250aca609d69))
- **format-lrc:** treat empty timed lines as instrumental breaks ([15c10d4](https://github.com/gondola-lyrics/kit-node/commit/15c10d47ad1d24c404a5ab316179b71fa38d9601))

### Documentation

- update support formats ([ae73460](https://github.com/gondola-lyrics/kit-node/commit/ae73460fda58a8ce6e25bf0b9f1eeba92afad680))

## v0.3.0 (2026-10-25)

### Features

- **format-ttml:** add generator ([708be02](https://github.com/gondola-lyrics/kit-node/commit/708be02cab6bc7443d6ea13ac7d90ea3709ca7e3))

### Fixes

- **format-ttml:** preserve inherited language tags and explicit clears ([42e7c5c](https://github.com/gondola-lyrics/kit-node/commit/42e7c5cb9a0855fc6168014e3c7098bec920e178))
- **format-ttml:** preserve whitespace and cdata text ([19550aa](https://github.com/gondola-lyrics/kit-node/commit/19550aad5ed10fa5cec01bd9acca2a3521973269))
- **format-ttml:** preserve background text and annotations ([005c05f](https://github.com/gondola-lyrics/kit-node/commit/005c05f8c99f9243150660e70523ccf47feb1d75))
- **format-ttml:** preserve open ranges and ruby bounds ([1adf33f](https://github.com/gondola-lyrics/kit-node/commit/1adf33f68106477bfbcce69b18efa97eb8091fc3))
- **utils:** preserve supplementary characters in xml attributes ([98c1a3a](https://github.com/gondola-lyrics/kit-node/commit/98c1a3afc9ff66c8fbae7d4164fa82ada41f4033))

### Performance

- **format-ttml:** reduce allocations ([0c1ce78](https://github.com/gondola-lyrics/kit-node/commit/0c1ce78b0ab75c447c22b1e3447e80cfd99cdf26))

## v0.2.0 (2026-10-21)

### Features

- **format-ttml:** add parser ([053e97f](https://github.com/gondola-lyrics/kit-node/commit/053e97f3f1912e03979c4925ce8bc52de9de2fd3))
- **utils:** support time values with offsets ([c5bacf3](https://github.com/gondola-lyrics/kit-node/commit/c5bacf3b76459fd6a0872bf7bce42f070eaa9ab0))
- **utils:** add xml writer ([4d48827](https://github.com/gondola-lyrics/kit-node/commit/4d48827d4ae1494649030631b43aaacd1d813044))
- **utils:** add xml reader ([d3aa9ac](https://github.com/gondola-lyrics/kit-node/commit/d3aa9acb73df6cfeff5bf8d5357d6666fc0af046))

### Refactoring

- **utils:** extract time helpers ([ec6aa69](https://github.com/gondola-lyrics/kit-node/commit/ec6aa69a9469d0e5dfd2e8e8219a16fbff880a14))
- **utils:** split xml reader ([2bfa1ff](https://github.com/gondola-lyrics/kit-node/commit/2bfa1ff2460c1ebd3ccf32a52f25e90ea77f52e4))
- return canonical lyrics and diagnostics from parsers ([9033396](https://github.com/gondola-lyrics/kit-node/commit/9033396c759bba5ff34ee88486b0d15c266470ab))

## v0.1.0 (2026-10-20)

### Features

- **format-lrc:** support parsing annotation tracks ([adecdc2](https://github.com/gondola-lyrics/kit-node/commit/adecdc236dc2c427f73a01f5ca6c5be4e439a62d))
- **format-lrc:** add generator ([48cf3a2](https://github.com/gondola-lyrics/kit-node/commit/48cf3a25a1d0bf2643e816883fe3f36bd8cb5cfa))
- **format-lrc:** support enhanced word timing ([cfa1196](https://github.com/gondola-lyrics/kit-node/commit/cfa1196846e79f2bc6c00c563d83a39d15fee11c))
- **format-lrc:** add parser ([a6dd1b1](https://github.com/gondola-lyrics/kit-node/commit/a6dd1b1f71fcdaa5da5988f959dc70d3d184116c))
- **common:** add types ([dd044f7](https://github.com/gondola-lyrics/kit-node/commit/dd044f7a47cea622a530bac7e2391d24c6dd0f71))

### Fixes

- **format-lrc:** split lone carriage returns ([a20d382](https://github.com/gondola-lyrics/kit-node/commit/a20d382f4b2e7b3694ab7727b37e0bfd3ca8b2fd))

### Refactoring

- **format-lrc:** accept unknown source input ([1ab629b](https://github.com/gondola-lyrics/kit-node/commit/1ab629b4b1a10146c29f6676d75ddefa783093f6))
- make target format explicit in generate ([e163842](https://github.com/gondola-lyrics/kit-node/commit/e1638421d75f4b36a0b04f19ce2c5bd2d5b99879))
- flatten the root entry exports ([28be696](https://github.com/gondola-lyrics/kit-node/commit/28be6962d5fce7212e65cda73a8977bd5c53d3e5))
- move lyric format type into formats ([41ed016](https://github.com/gondola-lyrics/kit-node/commit/41ed016d9925ee880480ba5db56733866319d558))

### Documentation

- add readme ([646d813](https://github.com/gondola-lyrics/kit-node/commit/646d8133c76a6e26b61f794ea0e5082238e8bac5))
- simplify comments ([cf00859](https://github.com/gondola-lyrics/kit-node/commit/cf00859c52d1f5aade49321329140acf03f96cec))
