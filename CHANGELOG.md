# [1.22.0](https://github.com/gdamalis/idc-redentor-web/compare/v1.21.1...v1.22.0) (2026-06-29)

### Features

- **ICR-44:** email newly published blog posts and sermons to subscribers (locale-aware) ([#72](https://github.com/gdamalis/idc-redentor-web/issues/72)) ([ddc0d3b](https://github.com/gdamalis/idc-redentor-web/commit/ddc0d3ba8d35beaf61178bd133a76e30e57ec90f))

## [1.21.1](https://github.com/gdamalis/idc-redentor-web/compare/v1.21.0...v1.21.1) (2026-06-29)

### Bug Fixes

- **ICR-47:** localize SubscribeBanner feedback messages (error states) ([#70](https://github.com/gdamalis/idc-redentor-web/issues/70)) ([02dc5fc](https://github.com/gdamalis/idc-redentor-web/commit/02dc5fc678c94fc3be43ab3c10a17fc41441c01b))

# [1.21.0](https://github.com/gdamalis/idc-redentor-web/compare/v1.20.3...v1.21.0) (2026-06-29)

### Features

- **ICR-29:** add reusable subscriber broadcast email service ([#69](https://github.com/gdamalis/idc-redentor-web/issues/69)) ([70612f3](https://github.com/gdamalis/idc-redentor-web/commit/70612f3295e3214505ba8ab4d3d2a94bbcb6929a))

## [1.20.3](https://github.com/gdamalis/idc-redentor-web/compare/v1.20.2...v1.20.3) (2026-06-28)

### Bug Fixes

- **ICR-39:** translate remaining hardcoded blog UI strings (i18n) ([#68](https://github.com/gdamalis/idc-redentor-web/issues/68)) ([26eb2cb](https://github.com/gdamalis/idc-redentor-web/commit/26eb2cbec3c1c0890de6897e2d9b63f7cf6810e7))

## [1.20.2](https://github.com/gdamalis/idc-redentor-web/compare/v1.20.1...v1.20.2) (2026-06-28)

## [1.20.1](https://github.com/gdamalis/idc-redentor-web/compare/v1.20.0...v1.20.1) (2026-06-27)

### Bug Fixes

- validate slug/locale inputs (GraphQL injection + open redirect) ([#64](https://github.com/gdamalis/idc-redentor-web/issues/64)) ([7f0a9b9](https://github.com/gdamalis/idc-redentor-web/commit/7f0a9b98d7fa4b278e8ceacd9b85d381fdf0a8b5))

# [1.20.0](https://github.com/gdamalis/idc-redentor-web/compare/v1.19.0...v1.20.0) (2026-06-27)

### Features

- **predica:** per-preacher voice-coach learning loop feeding the writer ([#63](https://github.com/gdamalis/idc-redentor-web/issues/63)) ([190fbce](https://github.com/gdamalis/idc-redentor-web/commit/190fbcee0e5273d84c913c8ed0bd57950f76d9ad))

# [1.19.0](https://github.com/gdamalis/idc-redentor-web/compare/v1.18.0...v1.19.0) (2026-06-27)

### Features

- **predica:** date-prefix artifact folders (YYYY-MM-DD_slug), decoupled from public slug ([#62](https://github.com/gdamalis/idc-redentor-web/issues/62)) ([4397c81](https://github.com/gdamalis/idc-redentor-web/commit/4397c819ef595b0dcd6caec56942f8f63a70a59b))

# [1.18.0](https://github.com/gdamalis/idc-redentor-web/compare/v1.17.0...v1.18.0) (2026-06-27)

### Features

- **predica:** re-run idempotency — Gate 0 detect, update-in-place, transcript reuse, guarded cleanup ([#61](https://github.com/gdamalis/idc-redentor-web/issues/61)) ([41e5f2b](https://github.com/gdamalis/idc-redentor-web/commit/41e5f2b98614caaf839ae97086e897dc7134fbd9))

# [1.17.0](https://github.com/gdamalis/idc-redentor-web/compare/v1.16.0...v1.17.0) (2026-06-27)

### Features

- **predica:** reuse identical bibleVerse entries via derived internalName + CMA upsert ([#60](https://github.com/gdamalis/idc-redentor-web/issues/60)) ([b906e57](https://github.com/gdamalis/idc-redentor-web/commit/b906e57655e421783050adf2cd81fe7ca0944836))

# [1.16.0](https://github.com/gdamalis/idc-redentor-web/compare/v1.15.1...v1.16.0) (2026-06-26)

### Features

- **ICR-84:** generate a branded AI featured image for each sermon in /predica ([#58](https://github.com/gdamalis/idc-redentor-web/issues/58)) ([81d5907](https://github.com/gdamalis/idc-redentor-web/commit/81d5907ba3e71e7cd98926a025a1664abb4cb121))

## [1.15.1](https://github.com/gdamalis/idc-redentor-web/compare/v1.15.0...v1.15.1) (2026-06-26)

### Bug Fixes

- draft sermon preview — featured-image 500 + /predicas archive query complexity ([#56](https://github.com/gdamalis/idc-redentor-web/issues/56)) ([cf237a2](https://github.com/gdamalis/idc-redentor-web/commit/cf237a2e6a12084f79a5a06f591ad12d5e58bc50))

# [1.15.0](https://github.com/gdamalis/idc-redentor-web/compare/v1.14.1...v1.15.0) (2026-06-26)

### Features

- **ICR-83:** Contentful workflow v2 — entry-sync, /predica → production, drift detector ([#55](https://github.com/gdamalis/idc-redentor-web/issues/55)) ([6ab25a6](https://github.com/gdamalis/idc-redentor-web/commit/6ab25a69ce59897e8867ec8cd92d3449c8930cc8))

## [1.14.1](https://github.com/gdamalis/idc-redentor-web/compare/v1.14.0...v1.14.1) (2026-06-26)

### Bug Fixes

- **sermons:** white PDF bg, full-month post date, NVI scripture version ([#57](https://github.com/gdamalis/idc-redentor-web/issues/57)) ([cd081e5](https://github.com/gdamalis/idc-redentor-web/commit/cd081e50f63a26d801df915f3a9a2021197577d9))

# [1.14.0](https://github.com/gdamalis/idc-redentor-web/compare/v1.13.0...v1.14.0) (2026-06-25)

### Features

- **ICR-81:** /predica harness — transcribe → bilingual draft → PDF → WhatsApp ([#52](https://github.com/gdamalis/idc-redentor-web/issues/52)) ([f282598](https://github.com/gdamalis/idc-redentor-web/commit/f282598711445cb5982cecd33041b33c13b6dde0))

# [1.13.0](https://github.com/gdamalis/idc-redentor-web/compare/v1.12.2...v1.13.0) (2026-06-25)

### Features

- **ICR-79:** /predicas bilingual sermon section — audio player, likes, PDF link, SEO ([#47](https://github.com/gdamalis/idc-redentor-web/issues/47)) ([f1c0b26](https://github.com/gdamalis/idc-redentor-web/commit/f1c0b2694932f52f0e85a4fcb370f16f9faace40))
- **ICR-80:** bilingual branded sermon PDF generator (HTML→Playwright print) ([#49](https://github.com/gdamalis/idc-redentor-web/issues/49)) ([828d3df](https://github.com/gdamalis/idc-redentor-web/commit/828d3df69c9bc23ddd03af0e3c003e8bc4a26ab5))

## [1.12.2](https://github.com/gdamalis/idc-redentor-web/compare/v1.12.1...v1.12.2) (2026-06-24)

## [1.12.1](https://github.com/gdamalis/idc-redentor-web/compare/v1.12.0...v1.12.1) (2026-06-24)

### Bug Fixes

- **ICR-49:** localize contact-form heading and submit feedback messages ([#45](https://github.com/gdamalis/idc-redentor-web/issues/45)) ([287a063](https://github.com/gdamalis/idc-redentor-web/commit/287a063473e9d0ecaee1f6b8785ea201f8acf037))

# [1.12.0](https://github.com/gdamalis/idc-redentor-web/compare/v1.11.3...v1.12.0) (2026-06-24)

### Features

- **harness:** automate full ticket lifecycle — staging QA, /merge, post-PR review loop ([#44](https://github.com/gdamalis/idc-redentor-web/issues/44)) ([c133aca](https://github.com/gdamalis/idc-redentor-web/commit/c133acace1e751e28993a3ace1472fa7c41bec40))

## [1.11.3](https://github.com/gdamalis/idc-redentor-web/compare/v1.11.2...v1.11.3) (2026-06-23)

## [1.11.2](https://github.com/gdamalis/idc-redentor-web/compare/v1.11.1...v1.11.2) (2026-06-23)

### Bug Fixes

- **harness:** repair broken graphify refresh and make its use consistent ([#42](https://github.com/gdamalis/idc-redentor-web/issues/42)) ([f97c8ab](https://github.com/gdamalis/idc-redentor-web/commit/f97c8ab121ba3b920d893e2889033e400ff8ec98))

## [1.11.1](https://github.com/gdamalis/idc-redentor-web/compare/v1.11.0...v1.11.1) (2026-06-23)

# [1.11.0](https://github.com/gdamalis/idc-redentor-web/compare/v1.10.0...v1.11.0) (2026-06-22)

### Features

- **ICR-harness:** add Claude Code agent harness + docs ([#39](https://github.com/gdamalis/idc-redentor-web/issues/39)) ([8b76413](https://github.com/gdamalis/idc-redentor-web/commit/8b76413eefc1a9cbac8f0f5f24f432ad2a40124a))

# [1.10.0](https://github.com/gdamalis/idc-redentor-web/compare/v1.9.0...v1.10.0) (2026-02-16)

### Features

- enhance creed section and management with new types and rich text options ([c00dd39](https://github.com/gdamalis/idc-redentor-web/commit/c00dd39e9f255330659dbc6983afe3b31c12b514))

# [1.9.0](https://github.com/gdamalis/idc-redentor-web/compare/v1.8.2...v1.9.0) (2026-02-12)

### Bug Fixes

- optimize client and adapter initialization to avoid connecting to DB during build ([005c19f](https://github.com/gdamalis/idc-redentor-web/commit/005c19f24893887ccb65b2c1958a484b7b9fad1e))
- update button styles for improved user interaction ([c2ce26e](https://github.com/gdamalis/idc-redentor-web/commit/c2ce26e1a5ab62e8c7323f46d3edbe54cf75630d))

### Features

- **ICR-36:** integrate like functionality for Blog posts ([992d38f](https://github.com/gdamalis/idc-redentor-web/commit/992d38f0bec50b11eb8ef3374eb8bce5f76265ce))
- **ICR-38:** add post share actions ([72e4ec7](https://github.com/gdamalis/idc-redentor-web/commit/72e4ec7dbc9a49f612531962df49c2503411ab44))

## [1.8.2](https://github.com/gdamalis/idc-redentor-web/compare/v1.8.1...v1.8.2) (2026-02-10)

### Bug Fixes

- **Footer:** update logo dimensions for improved display ([79acd7c](https://github.com/gdamalis/idc-redentor-web/commit/79acd7c3d0dbdbfc13162017449b5d36681051cb))

## [1.8.1](https://github.com/gdamalis/idc-redentor-web/compare/v1.8.0...v1.8.1) (2026-02-09)

### Bug Fixes

- **Navbar:** update logo dimensions for improved display ([bbe25d3](https://github.com/gdamalis/idc-redentor-web/commit/bbe25d35804359f54a1be2bf0b94fafbae95a6ca))

# [1.8.0](https://github.com/gdamalis/idc-redentor-web/compare/v1.7.1...v1.8.0) (2026-02-09)

### Bug Fixes

- moved the consent script integration ([8ac3e89](https://github.com/gdamalis/idc-redentor-web/commit/8ac3e890ff119a14a36b042667d7addbd1aa2a9e))

### Features

- **ICR-20:** implement SEO metadata handling and sitemap generation ([3957c3a](https://github.com/gdamalis/idc-redentor-web/commit/3957c3abb59f62c48786cd14dc7a7cf5d4dabe5d))

## [1.7.1](https://github.com/gdamalis/idc-redentor-web/compare/v1.7.0...v1.7.1) (2026-02-08)

### Bug Fixes

- update Content Security Policy in security headers ([d05d5e4](https://github.com/gdamalis/idc-redentor-web/commit/d05d5e433462ffb31b1a7272bb7a0f63c582f2c9))

# [1.7.0](https://github.com/gdamalis/idc-redentor-web/compare/v1.6.0...v1.7.0) (2026-02-08)

### Features

- **ICR-51:** implement analytics and consent management ([0ce13e9](https://github.com/gdamalis/idc-redentor-web/commit/0ce13e962ffc283c45bf690646bbca29a556c7cf))

# [1.6.0](https://github.com/gdamalis/idc-redentor-web/compare/v1.5.1...v1.6.0) (2026-02-07)

### Features

- integrate SubscribeBanner component, adjusted worship times and enhance layout structure ([aaef1d1](https://github.com/gdamalis/idc-redentor-web/commit/aaef1d17ce1324580bef60942189e5e3885d02c7))

## [1.5.1](https://github.com/gdamalis/idc-redentor-web/compare/v1.5.0...v1.5.1) (2025-12-01)

### Bug Fixes

- add @semantic-release/npm plugin and update version to 1.5.0 ([cfd8306](https://github.com/gdamalis/idc-redentor-web/commit/cfd8306be65a46412631a68be80bcb9127d90d4c))

# [1.5.0](https://github.com/gdamalis/idc-redentor-web/compare/v1.4.0...v1.5.0) (2025-12-01)

### Features

- target version 1.5.0 ([f138393](https://github.com/gdamalis/idc-redentor-web/commit/f1383936c1ac12c2f4a6a6f63fafbd8dacfecd1f))

# [1.4.0](https://github.com/gdamalis/idc-redentor-web/compare/v1.3.0...v1.4.0) (2025-12-01)

### Features

- **ICR-47:** add category and keyword to blog post page ([#33](https://github.com/gdamalis/idc-redentor-web/issues/33)) ([0c832e1](https://github.com/gdamalis/idc-redentor-web/commit/0c832e1679751f1a2fe42c9fc8ac7b055baab994))

# [1.3.0](https://github.com/gdamalis/idc-redentor-web/compare/v1.2.0...v1.3.0) (2025-12-01)

### Bug Fixes

- resolved release issue ([c776992](https://github.com/gdamalis/idc-redentor-web/commit/c7769926955dc879a8f79022787b82b9d73c7515))
- unexpected refreshed when changing language ([7946bf4](https://github.com/gdamalis/idc-redentor-web/commit/7946bf4b82b1a6c89308cf758fe37f1237934eab))

### Features

- enhance OurMissionSection with additional fields and improved rendering ([d7b2b07](https://github.com/gdamalis/idc-redentor-web/commit/d7b2b07acb73fd2b336480d11418d6eb3afe5d7e))

# Changelog

## [1.3.0](https://github.com/gdamalis/idc-redentor-web/compare/v1.2.0...v1.3.0) (2025-12-01)

### Features

- enhance OurMissionSection with additional fields and improved rendering ([d7b2b07](https://github.com/gdamalis/idc-redentor-web/commit/d7b2b07acb73fd2b336480d11418d6eb3afe5d7e))
- **ICR-14:** Redesign UI ([#31](https://github.com/gdamalis/idc-redentor-web/issues/31)) ([3c998c8](https://github.com/gdamalis/idc-redentor-web/commit/3c998c877501c62adc3f5a0b3f044dc09f23899e))

## CHANGELOG

The changelog is automatically updated using
[semantic-release](https://github.com/semantic-release/semantic-release).
