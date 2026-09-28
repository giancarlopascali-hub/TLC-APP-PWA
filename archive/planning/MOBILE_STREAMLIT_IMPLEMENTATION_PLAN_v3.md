# AQ-TLC Mobile Streamlit Implementation Plan — v3

**Document type:** Critical review of v2 and revised implementation plan
**Prepared:** 26 September 2026
**Primary implementation repository:** `C:\Users\Giancarlo\Desktop\Antigravity work files\TLC App PWA`
**Desktop reference repository:** `C:\Users\Giancarlo\Desktop\Antigravity work files\AQ-TLC-streamlit`
**Status:** Planning only; this document does not authorize code, deployment, Git, or cloud-account changes

## 1. Executive decision

The direction in v2 is sound: preserve the desktop application, refactor the mobile application, migrate mobile to the desktop application's Streamlit custom-component pattern, then align functionality and address high-priority defects.

However, v2 is not safe to execute as written. It introduces several assumptions that could cause numerical inconsistency, an avoidable production outage, or loss of rollback options. This v3 plan corrects those issues and changes the release order so that:

1. The existing desktop application remains the protected reference and is not redeployed or redesigned as part of the mobile migration.
2. The mobile application is modularized behind a transport boundary before Flask is replaced.
3. Peak-area semantics are specified and tested before the current `area: 10` placeholder is replaced.
4. The Streamlit mobile build is deployed to a preview app before production `main` is changed.
5. The legacy Hugging Face deployment and its files remain available until the Streamlit cutover is accepted.
6. Shared desktop fixes are released separately, one narrowly scoped issue at a time, after the mobile release is stable.

The target mobile product is a **phone-first Streamlit web application**. It must not be described as a fully installable or offline PWA unless those capabilities are demonstrated from the final top-level Streamlit URL on physical devices.

## 2. Critical review of v2

### 2.1 Strengths retained from v2

The following parts of v2 should be kept:

- The desktop three-column workflow and browser-scoped lifecycle are explicit non-negotiable constraints.
- The mobile landing view, bottom toolbar, tabs, camera path, and touch gestures remain mobile-specific.
- The desktop Streamlit custom-component architecture is the correct deployment reference.
- Request correlation, input validation, bounded memory, safe report rendering, and physical-device testing are correctly identified as important.
- The bandwidth control should not be copied to mobile while its analytical meaning is unresolved.
- The plan distinguishes the two repositories and gives the mobile app its own Streamlit entry point.

### 2.2 Material corrections required

| Finding in v2 | Severity | Why it is a problem | v3 correction |
|---|---:|---|---|
| The proposed JavaScript area calculation is described as equivalent to the desktop Python calculation. | Critical | The backend integrates a **0–100 normalized, reversed profile** over SciPy peak bases, while the proposed client function uses the returned, non-normalized profile and visible bounds. The same trapezoid formula does not make the results equivalent. | Define one peak schema and one analysis signal first. Preserve separate integration and display bounds, return or deterministically derive the normalized O→F signal, and require Python/JavaScript parity tests. |
| v2 says the legacy `hf` remote is decommissioned. | High | It still exists locally and the `sync_to_hf.yml` workflow still pushes `main` to Hugging Face. | Treat Hugging Face as the current rollback deployment until Streamlit production acceptance. Disable it only during the controlled cutover. |
| v2 deletes the Hugging Face workflow and Dockerfile before Streamlit acceptance. | High | This removes a working deployment path and weakens rollback before the replacement is proven. | Retain legacy assets through preview and production observation. Archive or delete later in a separate cleanup change. |
| Both apps are presented as new deployments. | High | The desktop app is already deployed and satisfactory. Recreating or changing its cloud registration is unnecessary risk. | Record and verify the existing desktop deployment only. Create a new cloud app only for mobile and optional preview deployments. |
| Direct merge/push to `main` is treated as the quality gate. | High | Streamlit watches the production branch. A push can reach production before CI completes, and v2's workflow does not by itself block a bad merge. | Use protected branches, required pull-request checks, a preview deployment, approval of the exact commit, then merge that commit to `main`. |
| “Zero-downtime,” a fixed 1 GB memory limit, fixed 5–10 second detection, fixed 60–90 second deployment, and assumed custom URLs are stated as facts. | Medium | Community Cloud limits and timing vary; custom subdomains may be unavailable; apps also sleep after inactivity. | Treat URLs, timings, resources, and cold-start behavior as measured deployment facts. Record them in the runbook after deployment. |
| Python is specified as “3.11 or 3.12.” | Medium | A reproducible deployment needs one selected and tested version. Python cannot be changed in place on an existing Community Cloud app. | Record the desktop version, select one mobile version, test it locally and in preview, and pin tested direct dependencies. |
| The desktop `.streamlit/config.toml` is copied as a production template. | High | Community Cloud overrides some settings, including XSRF protection. Disabling CORS/XSRF locally should not be copied without evidence. | Start mobile with the smallest config, retain security defaults, and add only settings demonstrated to be necessary. |
| The request protocol has a useful envelope but only one global “latest request” concept. | High | Crop and profile actions can overlap; a global latest ID can incorrectly discard a valid response of a different action. Streamlit reruns can also replay response state. | Track latest IDs per action, coalesce expensive profile requests, define duplicate/replay behavior, and use typed errors and protocol versioning. |
| CI is claimed to guarantee broken code is never deployed. | High | The proposed CI lacks JavaScript, browser, protocol, and deployed-preview tests. CI after a push to `main` cannot prevent Streamlit from observing that push. | Make CI a required pre-merge gate and add Python, JavaScript, contract, browser, and component-startup jobs. Production smoke tests remain a separate gate. |
| Golden outputs are created only by running the desktop app. | High | That proves parity with current behavior, not scientific correctness, and can preserve existing defects. | Maintain two suites: synthetic correctness fixtures with independently calculated expectations, and representative-image regression fixtures from the desktop reference. |
| The module list is treated as the objective. | Medium | Splitting by filename can create circular dependencies without improving maintainability. | Define dependency directions and public interfaces first; module count is secondary. Pure calculation modules must not import DOM or transport code. |
| HTML escaping is the main XSS fix. | Medium | Escaping can be missed, and the current apps use interpolated `innerHTML` and inline handlers. Exported HTML is a separate sink. | Prefer DOM creation plus `textContent` for live UI; use a single audited serializer for report HTML; sanitize filenames separately. |
| `git revert HEAD` is the rollback procedure. | High | `HEAD` may not be the release, may be a merge commit, and may contain unrelated work. | Tag the exact tested commit, record the previous good commit, and revert the release pull request or explicit release commits through a reviewed rollback change. |
| Moving origins is assumed to preserve mobile recovery. | High | `localStorage` is origin-scoped. Data saved under the Hugging Face URL will not automatically appear under the new Streamlit URL. | Add explicit project export/import, retain the old app during a migration window, and communicate the storage boundary. |
| Camera and “Add to Home Screen” behavior are assumed. | High | The component is iframe-hosted and browser policies differ. A manifest inside the component does not establish a top-level installable PWA. | Make camera, file input, storage, orientation, and home-screen behavior early physical-device gates. Always retain gallery upload fallback. |
| Resource protection is limited to image dimensions and cache entry count. | Medium | Base64 payload size, decompression bombs, lane counts, non-finite geometry, concurrent work, and byte size also affect risk. | Validate encoded and decoded size, MIME/type, pixel count, geometry, parameter ranges, lane/peak counts, cache bytes, and concurrency. |

## 3. Verified baseline and assumptions

These facts were observed locally on 26 September 2026. They must be re-recorded at implementation start because commit IDs and cloud settings can change.

### 3.1 Mobile repository

- Branch and commit: `main` at `a20872f`, tracking `origin/main`.
- Additional remote: `hf` still points to `realgcp/TLC-APP-PWA`.
- `.github/workflows/sync_to_hf.yml` still force-pushes the production branch to Hugging Face.
- The working tree contains untracked review/plan Markdown documents; therefore a blanket statement that it is clean is inaccurate.
- The live client calls only `/generate_profiles` and `/detect/crop`; the other detection endpoints are not used by the current UI.
- `app.js` is a monolith and stores the project under local key `tlc_project`, including the base64 image.
- Manual peak creation assigns `area: 10`; peak and boundary movement do not correctly maintain a common area convention.
- Camera and gallery buttons programmatically click hidden inputs. The camera input uses `capture="camera"`.
- Root-level Flask static serving, the Hugging Face workflow, Dockerfile, service worker, manifest, and README describe the legacy deployment.

### 3.2 Desktop repository

- Branch and commit: `main` at `6fec31d`, tracking `origin/main`.
- The working tree was clean when reviewed.
- `streamlit_app.py` declares a bidirectional component, routes `crop` and `generate_profiles`, stores a pending response, and reruns.
- Requests have IDs, but Python responses do not echo them; `_lastReqId` in the JavaScript client is therefore not enforcing response order.
- `tlc_backend.py` has an entry-count-bounded cache, not an unbounded cache, but it is not byte-bounded.
- Automatic peak area uses a normalized profile and wider detection bases, while the returned `lb`/`rb` are visual threshold bounds. Manual editing in `profiles.js` integrates the displayed raw profile and visible bounds. This is a shared numerical-consistency issue.
- The bandwidth value is sent by the frontend but not used by the backend.
- Desktop browser-session lifetime is intentional and must remain unchanged.

## 4. Scope and guardrails

### 4.1 In scope

- Refactor the mobile frontend into maintainable modules without changing its established phone workflow.
- Replace the mobile Flask transport with a Streamlit custom-component host.
- Preserve mobile local recovery within the new Streamlit origin and provide explicit export/import across origins.
- Align approved desktop capabilities into touch-appropriate mobile controls.
- Fix confirmed correctness, reliability, security, and resource issues, beginning with high-priority defects.
- Add tests, deployment documentation, preview validation, rollback, and release evidence.

### 4.2 Desktop non-goals

- No redesign of the desktop layout or navigation.
- No change to the desktop browser-session lifecycle.
- No server-side project persistence or account system.
- No broad desktop refactor to mirror the mobile directory structure.
- No bundled “shared improvements” release. Each desktop patch requires its own issue, test evidence, preview, approval, and rollback.

### 4.3 Mobile non-goals for the first release

- No claim of offline analysis.
- No claim of full installable-PWA compliance unless verified at the top-level production URL.
- No migration of unused Flask detection endpoints.
- No bandwidth UI until the model and terminology are approved.
- No shared npm/Python package extraction across repositories during the initial migration.

## 5. Target architecture

### 5.1 Runtime model

```text
Phone browser
  -> Streamlit page
    -> mobile custom-component iframe
      -> mobile state, canvas, gestures, local recovery, reports
      -> versioned request envelope
    -> streamlit_app.py allowlisted router
      -> tlc_backend.py pure crop/profile functions
      -> versioned response envelope
    -> iframe applies only the matching, current response
```

Streamlit session state is transport state only. It must not become the authoritative project store. The active project remains in JavaScript memory, with optional versioned local recovery and explicit project export/import.

### 5.2 Recommended mobile structure

```text
TLC App PWA/
├── streamlit_app.py
├── tlc_backend.py
├── requirements.txt
├── .streamlit/config.toml
├── frontend/
│   ├── index.html
│   ├── index.css
│   ├── app.js
│   ├── guide.html
│   ├── assets/
│   └── modules/
│       ├── state.js
│       ├── constants.js
│       ├── analysis.js
│       ├── coords.js
│       ├── render.js
│       ├── interactions.js
│       ├── profiles.js
│       ├── calibration.js
│       ├── workspace.js
│       ├── storage.js
│       ├── reports.js
│       ├── ui.js
│       ├── api.js
│       ├── transport_flask.js       # temporary migration adapter
│       ├── transport_streamlit.js
│       └── init.js
├── tests/
│   ├── python/
│   ├── javascript/
│   ├── contract/
│   ├── browser/
│   └── fixtures/
└── docs/
    ├── protocol.md
    ├── numerical-contract.md
    ├── deployment-runbook.md
    └── known-limitations.md
```

This is a responsibility map, not a requirement to maximize file count. Closely related modules may be combined if their public interface remains small and testable.

### 5.3 Dependency rules

1. `analysis.js`, `calibration.js`, and `coords.js` are pure and may not import DOM, canvas, storage, or transport code.
2. `transport_flask.js` and `transport_streamlit.js` implement the same `request(action, payload)` interface.
3. UI modules may call the API facade but may not call `fetch` or `postMessage` directly.
4. Storage serializes a versioned project DTO; it does not serialize DOM objects or transient pointer state.
5. Rendering reads state but does not mutate analytical results.
6. User-supplied values are inserted into the live DOM with `textContent` or element properties, not interpolated into executable HTML.

## 6. Numerical contract — required before implementation

This is the highest-priority correction to v2.

### 6.1 Canonical conventions

- **Profile direction:** index `0` is origin and the final index is solvent front in the analytical profile supplied to peak logic.
- **Area signal:** a baseline-corrected, smoothed, 0–100 normalized signal in origin-to-front order.
- **Area units:** normalized-intensity × sample-index units, labelled as arbitrary area units unless a physical calibration defines otherwise.
- **Rf:** calculated from the documented origin/front geometry, clamped or rejected according to the same rule in Python and JavaScript.
- **Integration:** trapezoidal integration of `max(signal - endpoint_baseline, 0)` over inclusive integration bounds.
- **Display precision:** rounding is presentation-only. Stored/calculated values retain full practical precision.

### 6.2 Peak schema

Automatic and manual peaks must use one schema:

```json
{
  "idx": 142,
  "rf": 0.45,
  "height": 78.2,
  "area": 1240.5,
  "integration_lb": 130,
  "integration_rb": 155,
  "display_lb": 134,
  "display_rb": 150,
  "manual": false,
  "type": "N"
}
```

`integration_lb`/`integration_rb` define the reported area. `display_lb`/`display_rb` may represent a narrower visual band such as the threshold or FWHM range. They must never be silently substituted for one another. If the product chooses a single editable boundary pair, the displayed shading and reported area must use that same pair.

The backend should return the normalized analytical profile or sufficient explicit scale metadata so that client-side edits reproduce backend integration exactly. The selected approach must be documented in `docs/numerical-contract.md`.

### 6.3 Correctness tests

Tests must cover:

- flat, triangular, plateau, asymmetric, overlapping, and edge peaks;
- zero-width and reversed bounds;
- non-finite values and empty profiles;
- automatic and manual peaks on the same signal;
- apex movement and left/right boundary movement;
- Python versus JavaScript area equality within an agreed tolerance;
- Rf at origin, midpoint, front, and outside the accepted range;
- degenerate calibration inputs, duplicate standard values, zero area, and insufficient MW standards.

Representative plate images are regression tests. Synthetic arrays with independently known answers are correctness tests. Both are required.

## 7. Component protocol

### 7.1 Versioned envelopes

Request:

```json
{
  "protocol_version": 1,
  "request_id": "profiles-000108",
  "action": "generate_profiles",
  "payload": {}
}
```

Success response:

```json
{
  "protocol_version": 1,
  "request_id": "profiles-000108",
  "action": "generate_profiles_result",
  "ok": true,
  "result": {},
  "error": null
}
```

Error response:

```json
{
  "protocol_version": 1,
  "request_id": "profiles-000108",
  "action": "generate_profiles_result",
  "ok": false,
  "result": null,
  "error": {
    "code": "INVALID_IMAGE",
    "message": "The selected image could not be decoded.",
    "retryable": false
  }
}
```

### 7.2 Ordering and rerun rules

- Maintain `latestRequestIdByAction`, not one global latest ID.
- Coalesce rapid `generate_profiles` setting changes; only the newest queued request needs execution.
- Do not allow a crop response to invalidate a profile response or vice versa.
- Deduplicate the same request ID in Python.
- Echo every accepted request ID, including errors and unknown-action responses.
- Clear or acknowledge delivered responses so Streamlit reruns do not replay them as new work.
- Show timeout, offline, validation, and server errors in a nonmodal mobile status region with retry where safe.
- Validate inbound `postMessage` source and message shape while retaining compatibility with Streamlit's required component protocol.

### 7.3 Initial action allowlist

- `crop`
- `generate_profiles`

No legacy detection route is migrated until an approved user-facing feature needs it.

## 8. Phased implementation roadmap

### Phase 0 — baselines, product decisions, and safety controls

**Objective:** make the work reversible and remove assumptions before refactoring.

Tasks:

1. Re-record local commit IDs, remotes, status, deployed URLs, Streamlit coordinates, Python version, dependency versions, and known-good smoke results.
2. Create the mobile implementation branch from the verified baseline, suggested name `codex/mobile-streamlit-v3`.
3. Tag or otherwise record the current working Flask/Hugging Face release without altering it.
4. Confirm whether the Hugging Face URL is public and whether the root catch-all exposes repository files. If it does, issue a minimal legacy security patch or restrict the deployment immediately; do not wait for the full migration.
5. Enable or confirm GitHub branch protection: pull request required, required checks, no force pushes to `main`, and explicit approval before production merge.
6. Record the existing desktop deployment. Do not recreate it.
7. Define the numerical contract in Section 6 and obtain product/scientific approval for any result-changing choice.
8. Build synthetic correctness fixtures and representative-image regression fixtures. Remove metadata or use non-sensitive images.
9. Decide supported phone/browser versions and obtain at least one physical iPhone and one physical Android device for testing.
10. Decide and document the mobile capability claims:
    - required: phone layout, touch, camera/gallery, HTTPS, project recovery on the same origin;
    - conditional: home-screen shortcut and standalone display behavior;
    - excluded unless proven: offline analysis and full PWA installability.
11. Define the cross-origin project migration approach: project export/import is required before the legacy origin is retired.
12. Record a privacy statement for image processing, local recovery, report downloads, and Streamlit hosting.

Exit gate:

- Numerical contract approved.
- Test fixtures available.
- Desktop and mobile baselines reproducible.
- Preview/release/rollback route recorded.
- PWA and data-migration claims are unambiguous.

### Phase 1 — modular mobile application, still served by Flask

**Objective:** refactor behavior behind stable interfaces without changing cloud transport.

Tasks:

1. Move the mobile shell and assets into `frontend/` while keeping the Flask app runnable.
2. Establish module dependency rules and split in vertical increments: state/storage, canvas coordinates/rendering, interactions, profiles/calibration, reports/UI, then API transport.
3. Introduce the API facade and temporary Flask adapter. UI code must stop calling `fetch` directly.
4. Consolidate active CSS and remove inline styles only where regression coverage exists.
5. Replace inline event handlers and user-string interpolation with registered listeners and safe DOM construction.
6. Implement versioned project storage with:
   - migration from `tlc_project`;
   - quota/corruption handling;
   - no transient gesture state;
   - explicit export/import file;
   - clear/reset behavior.
7. Implement the approved numerical contract. Remove `area: 10`, recalculate after apex/boundary edits, and update dependent percentages/calibrations atomically.
8. Preserve upload, direct camera intent, crop, rotation, origin/front lines, marks, lane creation, peak editing, undo, tables, and reports.
9. Add status/progress UI without modal alerts for routine backend failures.
10. Keep legacy server endpoints only as needed for the two active actions; do not expand their scope.

Exit gate:

- Existing mobile workflows pass on Flask at supported phone viewports.
- No direct transport calls exist outside adapters.
- Old saved projects either migrate safely or fail with a clear recovery path.
- Python/JavaScript numerical tests pass.
- Manual and automatic area units are comparable under the approved contract.

### Phase 2 — Streamlit host and transport migration

**Objective:** replace Flask transport without changing the approved mobile UI.

Tasks:

1. Create `tlc_backend.py` from the verified desktop crop/profile logic, then adapt it to the approved numerical contract rather than blindly copying code.
2. Add validation before expensive decoding or allocation:
   - encoded byte limit;
   - accepted image types;
   - decoded pixel and dimension limits;
   - decompression-bomb handling;
   - finite, bounded lane geometry;
   - bounded lane/peak counts;
   - bounded numerical parameters.
3. Use a byte-bounded cache with explicit eviction; measure memory under repeated unique images.
4. Create `streamlit_app.py` with one component instance, an allowlisted action router, request deduplication, versioned responses, and narrow exception handling.
5. Add early component readiness and buffered render handling based on the working desktop pattern.
6. Implement the Streamlit transport adapter and action-scoped correlation rules.
7. Use direct, user-activated `<label for>` or visible file inputs for gallery and camera capture; retain a gallery fallback.
8. Handle `100dvh`, safe-area insets, orientation changes, visual viewport changes, and virtual-keyboard resizing without nested-scroll traps.
9. Start with minimal `.streamlit/config.toml`. Do not copy disabled security settings unless a documented test proves they are required.
10. Select one Python version and pin tested top-level dependency versions. Generate an auditable lock/constraints result if practical.
11. Keep Flask/Hugging Face files and deployment operational during this phase.

Exit gate:

- `streamlit run streamlit_app.py` works from a clean environment.
- Component startup, crop, profile generation, errors, duplicates, and stale responses pass contract tests.
- Streamlit reruns do not erase the active component project.
- Local phone emulation passes before cloud preview.

### Phase 3 — mobile Streamlit preview and device proof

**Objective:** prove the cloud/iframe behavior before production merge.

Tasks:

1. Deploy the implementation branch to a separate Streamlit preview app. Do not reuse the desktop production app or the future mobile production URL.
2. Record the actual preview URL, Python version, resource limits shown in the workspace, build logs, cold-start behavior, and deployed commit SHA.
3. Test on physical iOS Safari and Android Chrome:
   - camera and gallery selection;
   - permission denial and retry;
   - portrait/landscape rotation;
   - touch, pinch, drag, and boundary handles;
   - virtual keyboard and text fields;
   - report download/print;
   - same-origin local recovery after reload and app wake;
   - project export/import;
   - slow, interrupted, and restored networks.
4. Verify what “Add to Home Screen” actually produces. Update the guide with observed behavior, not PWA assumptions.
5. Measure representative payload size, backend latency, browser memory, server memory trend, and repeated-request behavior. Set budgets from the baseline rather than inventing fixed times.
6. Run accessibility checks for touch-target size, focus order, labels, contrast, zoom, and status announcements.

Exit gate:

- Both physical-device suites pass or have explicitly accepted limitations.
- No stale response overwrites current results.
- Storage survives expected reloads on the Streamlit origin.
- Performance and memory remain within observed cloud limits.
- Preview commit is approved for feature alignment.

### Phase 4 — desktop capability alignment into mobile

**Objective:** port behavior, not desktop layout, in independently testable slices.

| Slice | Capability | Mobile treatment | Acceptance evidence |
|---|---|---|---|
| A | Invert and RGB channel projection presets | Compact settings sheet; use scientifically accurate terminology. | Same fixture and parameters produce equivalent backend arrays within tolerance. |
| A | Peak controls and numerical tables | Touch-sized controls; canonical peak schema; immediate dependent recalculation. | Synthetic and representative fixtures pass; no NaN/Infinity reaches UI. |
| B | Origin/front guidance and snapping | Port geometry/tolerance behavior with mobile visual/haptic cue where supported. | Gesture tests at multiple viewport sizes; no accidental lane movement. |
| B | Lane setup and rotation behavior | Preserve bottom toolbar and canvas workflow. | Desktop/mobile geometry comparison fixtures pass. |
| C | Relative quantitation | Align formulas, validation, labels, and rounding. | Cross-app result comparison and zero-area tests pass. |
| C | Area calibration | Align standard/analyte rules and degenerate-fit handling. | Known calibration fixtures and error states pass. |
| C | MW calibration | Align log-MW method, minimum standards, extrapolation policy, and report output. | Known standards produce expected regression/interpolation results. |
| D | Reports and exports | Mobile-safe download/print, safe HTML, parameter provenance, app/version identifiers. | iOS/Android export checks and injection tests pass. |
| Deferred | Wavelength bandwidth | Do not expose until a model, label, expected behavior, and tests are approved. | Explicitly listed in known limitations. |

Each slice includes state, UI, backend parameters, tests, report fields, guide changes, and a review checkpoint. A feature is not “aligned” merely because a similarly named control exists.

Exit gate:

- Approved parity matrix has no unexplained gaps.
- Mobile remains usable at the narrowest supported viewport.
- Reported numerical results match the approved contract and desktop reference within defined tolerances.

### Phase 5 — mobile production release and controlled cutover

**Objective:** release the exact tested mobile commit without sacrificing recovery.

Tasks:

1. Freeze the approved preview commit and rerun all required checks.
2. Review the complete pull request; require CI and device evidence before merge.
3. Create the mobile production Community Cloud app from `origin/main` only when the repository contains the approved entry point.
4. Reserve or record the actual mobile URL; do not assume `aq-tlc-mobile.streamlit.app` is available.
5. Confirm production is serving the approved commit and run the production smoke suite.
6. Retain the Hugging Face app for an agreed observation/migration window so users can export old origin-scoped projects.
7. Publish known limitations and storage-migration instructions.
8. Monitor build failures, startup errors, backend exceptions, latency, memory trend, and user-visible failures.
9. After acceptance, disable the Hugging Face sync workflow in a separate pull request. Removing the local `hf` remote is optional local housekeeping, not a deployment requirement.
10. Archive or remove Docker/Hugging Face assets only after the rollback window closes and a legacy tag remains available.

Exit gate:

- Production smoke tests pass on desktop, iOS, and Android.
- Project export/import path is documented and verified.
- Previous known-good code and legacy deployment remain recoverable during the observation window.
- Production URL, deployment coordinates, owner, and rollback instructions are recorded.

### Phase 6 — shared high-priority improvements, separate releases

**Objective:** improve both apps without turning the mobile migration into a desktop rewrite.

Priority order:

1. **P0 numerical consistency:** apply the approved peak schema and area contract to desktop in a narrow, result-reviewed patch. Show any expected numerical deltas before release.
2. **P1 bridge reliability:** echo request IDs, correlate per action, coalesce rapid profile updates, and prevent replay in both apps.
3. **P1 rendering/export safety:** replace unsafe user-string HTML interpolation, centralize report serialization, sanitize filenames, and add injection fixtures.
4. **P1 resource/input safety:** encoded/decoded limits, finite geometry checks, bounded concurrency, byte-bounded cache, and non-sensitive error messages.
5. **P2 spectral terminology and bandwidth:** rename the current RGB weighting accurately; implement bandwidth only after scientific definition or remove the nonfunctional control.
6. **P2 dependency/configuration hygiene:** pin tested versions, remove only proven-unused dependencies, retain secure defaults, and add dependency/secret scanning.

Desktop release rules:

- one issue and one focused pull request per change category;
- no layout or session-lifecycle changes;
- desktop regression suite and preview required;
- before/after numerical comparison for result-affecting work;
- exact rollback commit recorded;
- mobile and desktop releases need not occur simultaneously.

## 9. Test and quality strategy

### 9.1 Automated checks required before mobile merge

- Python formatting/lint and unit tests.
- JavaScript lint and unit tests in a real JS test runner.
- Python/JavaScript numerical conformance tests using the same fixture JSON.
- Protocol tests for success, validation error, backend error, unknown action, duplicate ID, stale response, and action overlap.
- Streamlit component startup smoke test.
- Browser tests at representative phone viewports for the non-camera workflow.
- Dependency and secret scanning.
- Static checks that required component assets exist and no UI module bypasses the transport facade.

### 9.2 Manual release matrix

| Area | Minimum coverage |
|---|---|
| iOS | Physical iPhone, current supported Safari, portrait/landscape, camera/gallery, keyboard, reload/recovery, export. |
| Android | Physical Android phone, current supported Chrome, portrait/landscape, camera/gallery, reload/recovery, export. |
| Desktop sanity | Chrome and one additional supported browser opening the mobile URL at wide and narrow widths. |
| Network | Normal, slow, interrupted request, reconnect, sleeping-app wake. |
| Images | Small, large-but-allowed, rotated, bright-on-dark, dark-on-light, flat, dense/overlapping, malformed, and over-limit. |
| State | Fresh, legacy local project, corrupt local project, quota failure, export/import, new/reset/undo. |

### 9.3 CI and deployment relationship

CI does not make a direct push to the production branch safe. The repository must require CI before merge. Streamlit production observes `main` only after the approved pull request lands. Deployed-preview tests and production smoke tests remain necessary because local and CI tests do not reproduce every iframe, browser-permission, or cloud-resource behavior.

## 10. Deployment facts and configuration policy

The deployment runbook should rely on current official behavior, not fixed marketing assumptions:

- Community Cloud deploys from GitHub repository, branch, and entrypoint coordinates and normally reflects repository updates automatically.
- Dependency changes trigger dependency reinstallation and can take longer than code-only updates.
- Python version is selected during app creation and should be treated as a release setting.
- Custom subdomains are optional and subject to availability.
- Resource limits can change and should be read from workspace settings; do not hard-code 1 GB as the design limit.
- Inactive Community Cloud apps can sleep, so cold-start testing is part of acceptance.
- Some cloud settings override repository configuration; do not depend on disabling XSRF protection.

Current primary references:

- [Deploy an app on Streamlit Community Cloud](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/deploy)
- [Manage a Community Cloud app](https://docs.streamlit.io/deploy/streamlit-community-cloud/manage-your-app)
- [Community Cloud status and limitations](https://docs.streamlit.io/deploy/streamlit-community-cloud/status)
- [Managing app dependencies](https://docs.streamlit.io/deploy/concepts/dependencies)

The desktop production app should only be inspected and documented during the mobile deployment phases. It should not be recreated, renamed, or moved.

## 11. Rollback plan

Before release, record:

- exact candidate commit and release tag;
- previous known-good commit/tag;
- schema versions readable by each release;
- deployed repository/branch/entrypoint coordinates;
- owner able to access Streamlit logs and GitHub settings;
- smoke-test evidence and rollback decision owner.

Rollback triggers include:

- mobile component does not load reliably;
- camera and gallery are unavailable on a supported phone;
- stale responses overwrite newer analysis;
- numerical fixtures fail or production results differ unexpectedly;
- saved projects are corrupted or cannot be recovered;
- repeated resource exhaustion or unacceptable latency;
- report export exposes unsafe content or fails on supported devices.

Rollback method:

1. Stop further merges.
2. Revert the specific release pull request or explicit release commits through a reviewed rollback change; do not blindly revert `HEAD` and do not rewrite production history.
3. Confirm Community Cloud serves the restored known-good commit.
4. Run the smoke suite.
5. Keep the legacy deployment available during the agreed migration window.
6. Document the incident and add a regression test before retrying.

## 12. Risk register

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| Manual and automatic areas remain incomparable | Medium / Critical | Approved signal/bounds schema; cross-language synthetic tests; result review. |
| Refactor changes gestures or geometry | Medium / High | Flask-first modularization, viewport browser tests, physical-device gates. |
| Iframe blocks or alters camera behavior | Medium / High | Direct input activation, early cloud spike, gallery fallback. |
| Old local projects disappear after origin change | High / High | Export/import, retained legacy URL, migration instructions. |
| Streamlit reruns replay or reorder work | Medium / High | Versioned envelopes, action-scoped IDs, deduplication, coalescing, contract tests. |
| Large base64 images exhaust browser/server memory | Medium / High | Pre-decode byte limits, pixel limits, downscaling policy, byte-bounded cache, measurement. |
| Mobile parity overcrowds the interface | High / Medium | Settings sheet and tabs; port behavior rather than desktop layout; per-slice usability gate. |
| “PWA” wording overpromises install/offline support | High / Medium | Capability test and accurate known-limitations language. |
| Desktop regression from shared fixes | Low / High | Separate focused releases, preview, numerical deltas, unchanged lifecycle/layout. |
| Cloud behavior or limits change | Medium / Medium | Pin dependencies, record deployment settings, use official docs and workspace values, smoke after updates. |
| Sensitive plate images are handled unexpectedly | Medium / High | Privacy disclosure, no logging of image payloads, sanitized fixtures, local export controls. |

## 13. Indicative effort and checkpoints

These are planning ranges for one experienced implementer with access to representative plates and physical phones. Formal scientific validation is additional.

| Phase | Indicative effort | Review checkpoint |
|---|---:|---|
| Phase 0 — contracts and baselines | 2–4 working days | Numerical/PWA/storage decisions approved. |
| Phase 1 — Flask-first modularization | 5–8 working days | Mobile behavior parity and numerical tests approved. |
| Phase 2 — Streamlit transport | 3–6 working days | Local component and protocol approved. |
| Phase 3 — preview/device proof | 2–4 working days | Physical-device and cloud evidence approved. |
| Phase 4 — capability alignment | 5–10 working days | Slice-by-slice parity approved. |
| Phase 5 — release/cutover | 2–4 working days | Production and rollback evidence approved. |
| Phase 6 — shared fixes | 4–10 working days | Separate approvals per desktop patch. |

Expected range: approximately **23–46 working days**, excluding formal method validation, device procurement, review delays, and observation windows. Numerical correctness, project migration, camera proof, request correlation, and rollback should not be removed to shorten the schedule.

## 14. Deliverables

1. Approved numerical and protocol specifications.
2. Modular mobile frontend with explicit dependency boundaries.
3. Mobile `streamlit_app.py` and validated `tlc_backend.py`.
4. Versioned project storage plus export/import migration.
5. Unit, conformance, contract, browser, and regression tests.
6. Physical-device acceptance record.
7. Mobile/desktop feature-alignment matrix with deliberate deferrals.
8. Streamlit preview and production deployment runbook.
9. Rollback record and previous known-good release reference.
10. Updated README, mobile guide, privacy note, and known limitations.
11. Separate narrow desktop patches for approved shared defects only.
12. Legacy Hugging Face retirement change after the observation window.

## 15. Definition of done

### Mobile maintainability

- [ ] No monolithic UI file owns state, gestures, analysis, storage, transport, and reports together.
- [ ] Pure calculation and geometry modules are DOM/transport independent.
- [ ] Flask and Streamlit adapters satisfy the same API interface during migration.
- [ ] Storage schema is versioned, recoverable, and exportable.

### Numerical correctness

- [ ] Signal direction, normalization, bounds, baseline, area units, and rounding are documented.
- [ ] Manual add/apex move/boundary move recalculate area and dependent values.
- [ ] Automatic and manual areas use comparable units.
- [ ] Python and JavaScript results pass synthetic conformance tests.
- [ ] Representative images pass regression tolerances.

### Streamlit reliability

- [ ] Local and preview Streamlit builds start without component timeout.
- [ ] Requests and all responses include protocol version and request ID.
- [ ] Latest responses are tracked per action; stale responses cannot overwrite state.
- [ ] Reruns do not erase the active project or replay completed work.
- [ ] Input and memory limits are measured and enforced.

### Mobile experience

- [ ] Landing, bottom toolbar, tabs, camera/gallery, gestures, crop, lanes, profiles, tables, calibration, and reports remain phone-appropriate.
- [ ] Physical iOS and Android acceptance passes.
- [ ] Orientation, virtual keyboard, safe areas, and accessibility checks pass.
- [ ] Home-screen/offline claims match verified behavior.

### Desktop protection

- [ ] Desktop layout and browser-session lifecycle remain unchanged.
- [ ] Mobile migration requires no desktop production redeployment.
- [ ] Each later desktop fix is isolated, previewed, regression-tested, and independently reversible.

### Release and operations

- [ ] Required checks protect `main` before merge.
- [ ] Production serves the exact approved commit.
- [ ] Actual URL, Python version, limits, and coordinates are recorded.
- [ ] Old-origin project migration is documented and tested.
- [ ] Rollback is rehearsed without history rewriting.
- [ ] Hugging Face retirement occurs only after acceptance and the agreed observation window.

## 16. Recommended first implementation increment

The first increment should complete Phase 0 and the smallest part of Phase 1:

1. approve the numerical and protocol contracts;
2. add synthetic fixtures and current-behavior regression fixtures;
3. establish the transport facade with the Flask adapter;
4. extract only the pure analysis and storage code;
5. replace `area: 10` using the approved signal and bounds convention;
6. verify the existing mobile app still works through Flask.

No Streamlit deployment, Hugging Face removal, desktop change, or `main` merge should occur in that increment. It creates a tested foundation for the later transport migration while keeping every operational path recoverable.
