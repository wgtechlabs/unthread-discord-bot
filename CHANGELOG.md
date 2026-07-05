# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]


## [1.1.4] - 2026-05-21

### Changed

- improve ticket creation UX with in-place status embed (#123)
- align Node.js support policy (#122)
- upload image attachments from forum post to ticket
- use named bun stage for reliable COPY reference
- bump pg to 8.21.0 and @types/node to 25.9.0
- add unit and integration test suites for utils
- update defaults test assertions
- add type-check step and fix build badge workflow ref
- add release summary step to release workflow
- fix env var cleanup using delete instead of undefined
- add integration tests for deployment lifecycle
- migrate toolchain to Bun and Biome with CI overhaul (#118)
- add Node.js 26 support and make it default
- improve error logging for command deployment failures
- align attachment support with webhook server and telegram bot (#116)
- refresh README and setup guides

### Removed

- delete devcontainer configuration

### Security

- upgrade to Alpine 3.23, remove corepack, add healthcheck

## [1.1.3] - 2026-04-06

### Changed

- add pnpm install step to lifecycle scripts integration tests
- enhance npm lifecycle scripts integration tests
- downgrade Node.js version and specify pnpm version
- add container and release build flow actions (#113)
- update packages to fix known vulnerabilities (#114)
- add Node 24 integration tests for Discord API and TLS validation (#111)
- optimize GitHub Actions workflows and remove redundancies
- update container build action
- add snyk rules instructions

### Fixed

- ensure consistent Node 24 and Alpine 3.22 versions across all workflows
- update comment to reflect Alpine 3.22 version
- apply Dockerfile security improvements to address CVEs

