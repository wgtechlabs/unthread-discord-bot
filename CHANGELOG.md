# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]


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

