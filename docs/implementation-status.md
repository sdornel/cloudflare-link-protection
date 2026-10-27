# Implementation and verification status

This file records the implementation while another contributor edits `SPEC.md`. It does not rewrite or claim ownership of that specification.

## Implemented

- Existing static build, automatic local/sample config selection, strict production checks, private-input boundaries, and JSON styling remain intact.
- Native/direct modes, per-link overrides, iOS experimental schemes, Android intents with direct fallback, manual assistance, and bounded automatic iOS page handoff.
- Shared renderer, explicit standalone neutral example refresh, schema/defaults/validation, and content-versioned modules.
- Optional age acknowledgment and local event telemetry, optional consent-gated GA4 reporting, and existing Cloudflare visit/performance integration.
- Node regressions, development-only browser tests, neutral screenshot generation, CI configuration, and updated guides.

## Specification coordination

The user's explicit instruction is native functionality without a dedicated Bouncy integration; service URLs can be ordinary links. The concurrently edited specification currently introduces a provider-specific mode and says implementation should stop. Those statements belong to the other instance's spec-only task and conflict with the user's instructions to this implementation session. This code retains `native` and `direct`, and application work resumed with explicit user authorization. The spec owner should reconcile these sections before release. No edits to `SPEC.md` were made by this implementation session.

## Verification limits

The Node suite passed 37 tests with one explicit environment-related skip. Public-source checks passed. The Node Git subprocess test skips in this sandbox; direct shell Git inspection remains possible. Browser package installation failed because registry DNS is blocked, and the preview server failed with `listen EPERM`. Consequently Playwright, browser screenshots, LCP/CLS, real-device app handoff, live Cloudflare headers/challenges, and a hosted demo have not been verified here.

Playwright is pinned as a development-only dependency. The lockfile graph was assembled from the published package/upstream tag because npm could not download it; the two upstream packages lack recorded integrity hashes. Run `npm install --package-lock-only` on a network-enabled host, review the integrity entries, then run the browser suite. The production build remains dependency-free.

Do not describe the site as production-device-verified until the manual checklist is completed. No conversion improvements, successful handoff rates, or live deployment are claimed.

## Recorded checks

The neutral build measured 29,482 first-party bytes across 8 files, or 10,540 bytes when each response is gzip-compressed separately. This is a size measurement, not an LCP/CLS result. The example snapshot matched the shared renderer, both configured output modes built, and direct Git checks confirmed real config/output remain ignored. An offline `npm ci --dry-run` accepted the pinned three-package development graph; it did not download or execute browser packages. The JSON schema was checked with a Draft 2020-12 validator against both sample and ignored local config.
