# AQ-TLC Mobile Streamlit Implementation Plan — Final

**Status:** Authoritative implementation plan; supersedes v1, v2, v3, and v4
**Prepared:** 27 September 2026
**Primary implementation repository:** `C:\Users\Giancarlo\Desktop\Antigravity work files\TLC App PWA`
**Protected desktop reference:** `C:\Users\Giancarlo\Desktop\Antigravity work files\AQ-TLC-streamlit`
**Production target:** Streamlit Community Cloud
**Document scope:** Planning only. This document does not authorize code changes, Git pushes, deployment changes, or removal of the existing deployment.

## 1. Final direction

The work will proceed in this order:

1. Establish numerical, protocol, release, and rollback baselines.
2. Fix the mobile peak-area defect and modularize the mobile app while preserving its current behavior.
3. Replace Flask transport with the proven desktop Streamlit custom-component pattern.
4. Validate a separate mobile preview deployment on physical phones.
5. Align approved desktop functionality into the mobile interface without copying the desktop layout.
6. Release the tested mobile commit to Streamlit production.
7. Retire the Hugging Face deployment after an agreed migration/observation window.
8. Apply confirmed high-priority shared fixes to desktop through separate, narrow releases.

The desktop application is already deployed and works as intended. It is a protected functional reference. Its three-column interface and browser-session lifecycle will not be redesigned or made persistent.

The mobile target is a phone-first Streamlit web application. It may support a home-screen shortcut, but it will not be marketed as a fully installable or offline PWA unless that behavior is demonstrated from the final top-level Streamlit URL on supported physical devices.

## 2. Critical review of v4

### 2.1 Improvements in v4 that are retained

v4 made several useful advances:

- It described the current automatic/manual peak-area inconsistency more concretely.
- It supplied an explicit trapezoidal integration formula.
- It retained action-scoped request correlation.
- It recognized that browser storage does not migrate between Hugging Face and Streamlit origins.
- It restored a user-facing Streamlit deployment guide.
- It kept the desktop layout and session lifecycle protected.

### 2.2 Corrections required before execution

| v4 issue | Severity | Final resolution |
|---|---:|---|
| Hugging Face is disabled and archived before the Streamlit replacement exists. | Critical | The final target is Streamlit-only, but the old deployment remains available during preview, cutover, and the agreed migration window. It is then retired deliberately. |
| The new application is pushed directly to `main` before physical-device acceptance. | Critical | Work occurs on a protected implementation branch. CI, preview deployment, physical-device acceptance, and approval precede the production merge. |
| v4 instructs the user to create the desktop Streamlit app again. | High | The desktop app already exists. Record and verify its current URL, branch, entrypoint, Python version, and known-good behavior; do not recreate it. |
| Automatic area is changed to visible threshold bounds without quantifying the result change. | Critical | Preserve the current automatic AUC convention over detection bases. Return separate integration and display bounds. Draggable integration handles define reported area; narrower visual/FWHM bounds remain display metadata. |
| `profile_norm` direction and relationship to the displayed profile are not fully defined. | High | Return explicitly named, origin-to-front `profile_display` and `profile_analysis` arrays. Area calculations use only `profile_analysis`. |
| Protocol envelopes lack a version and complete error contract. | Medium | Add `protocol_version`, request ID, action, `ok`, `data`, and typed error fields to every response. |
| The copied Streamlit configuration disables CORS and XSRF protection. | High | Use a minimal configuration and retain security defaults. Community Cloud may override settings; do not depend on disabled XSRF/CORS. |
| Requirements use broad minimum versions and call the result production-ready. | High | Choose one Python version for mobile preview/production and pin tested direct dependencies. Do not alter the existing desktop Python version during migration. |
| v4 claims ten numerical scenarios but lists five and defines only Python test execution. | High | Add independently known synthetic cases, shared JSON fixtures, JavaScript tests, Python tests, and cross-language conformance checks. |
| Most desktop-to-mobile feature alignment from the original request is absent. | Critical | Restore a feature-alignment phase covering filters, snapping, calibration modes, reports, validation, and deliberate bandwidth deferral. |
| Shared improvements are reduced to one numerical desktop patch. | High | Restore request reliability, safe rendering/export, input/memory limits, dependency hygiene, terminology, and calibration edge cases in priority order. |
| Existing `archive/` contents are ignored and legacy files are moved into another archive blindly. | Medium | Inventory the existing archive first. Prefer a Git tag/branch for legacy recovery rather than duplicating deployable files in the production tree. |
| The component `manifest.json` is described as a PWA shell. | Medium | A manifest inside an iframe does not establish top-level PWA capability. Treat manifest/service-worker files as legacy unless deployed behavior proves otherwise. |
| `git revert HEAD` is the primary rollback. | High | Record the exact release and previous-good commits; revert the release pull request or explicit release commits. Do not assume `HEAD` is the release. |
| Six to ten working days covers refactor, migration, parity, device QA, deployment, and desktop fixes. | Medium | Use a phased 18–32 working-day engineering range, excluding formal scientific validation and observation windows. |

## 3. Verified current state

These facts were verified locally on 27 September 2026 and must be refreshed at implementation start.

### 3.1 Mobile repository

- Branch: `main`, tracking `origin/main`.
- Current commit: `a20872f`.
- The `hf` remote still exists.
- `.github/workflows/sync_to_hf.yml` still force-pushes `main`/`master` to Hugging Face.
- The working tree contains untracked review and plan documents; it is not completely clean.
- `app.js` is approximately 44 KB and contains application state, DOM wiring, canvas rendering, gestures, profiles, calibration, persistence, API calls, and reports.
- Only two server operations are used by the UI: `/generate_profiles` and `/detect/crop`.
- Manual peak creation assigns `area: 10`.
- Dragging an apex or boundary does not maintain a consistent automatic/manual area convention.
- Project recovery uses origin-scoped `localStorage` key `tlc_project` and includes the base64 image.
- Gallery and camera buttons programmatically click hidden file inputs; the camera input uses `capture="camera"`.
- A manifest and service worker exist, but the service worker is not registered by the active client code.
- An existing `archive/` already contains copies of legacy files and must not be overwritten blindly.

### 3.2 Desktop repository

- Branch: `main`, tracking `origin/main`.
- Current commit: `6fec31d`.
- It is already a Streamlit custom-component application.
- `streamlit_app.py` declares the component and routes `generate_profiles` and `crop`.
- Request IDs are received and deduplicated, but responses do not echo them.
- `frontend/modules/api.js` records a latest request ID but cannot reject stale responses without the echoed ID.
- The Python cache has an entry-count limit but no byte-size limit.
- Automatic peak detection integrates the normalized origin-to-front signal over SciPy detection bases.
- The backend returns narrower threshold bounds as `lb`/`rb`, hiding the actual integration bounds.
- Desktop manual peak editing integrates the displayed raw profile over visible bounds. This is not the same scale/boundary convention as automatic peaks.
- The frontend sends `wavelength_bandwidth`; the backend does not use it.
- Desktop dependencies are not pinned to exact tested versions.
- Desktop layout and browser-session lifetime are intentional and protected.

## 4. Product and engineering guardrails

### 4.1 Mobile requirements

- Preserve the landing screen, bottom toolbar, tabs, canvas, camera/gallery paths, crop, rotation, origin/front lines, spotting marks, lane workflow, profile editing, tables, undo, reports, and touch gestures.
- Keep mobile project recovery on the Streamlit origin.
- Add explicit project export/import so projects can move across origins and devices.
- Adapt desktop features to touch controls; never copy the desktop three-column layout into the phone UI.
- Keep every phase runnable, testable, and reversible.

### 4.2 Desktop protections

- No layout redesign.
- No change to browser-scoped session lifetime.
- No server-side persistence or account system.
- No broad directory or architecture refactor.
- No desktop redeployment merely to complete the mobile migration.
- Every later desktop defect fix requires an isolated issue, tests, preview, numerical delta review where relevant, and rollback reference.

### 4.3 Explicit non-goals for the first mobile release

- Migrating unused Flask detection/optimization endpoints.
- Offline analytical processing.
- Claiming full PWA installability without deployed evidence.
- Implementing wavelength bandwidth before its model is scientifically defined.
- Extracting a shared cross-repository package during the initial migration.
- Making mobile and desktop releases simultaneous.

## 5. Source-of-truth decisions

| Concern | Source of truth | Final decision |
|---|---|---|
| Desktop UX and lifecycle | Deployed desktop app | Preserve unchanged. |
| Streamlit host/bridge pattern | Desktop `streamlit_app.py`, `frontend/index.html`, and `streamlit_bridge.js` | Reuse the pattern, then add request correlation and typed errors. |
| Crop/profile backend | Desktop `tlc_backend.py` plus approved numerical contract | Port only the two active actions. |
| Mobile layout and gestures | Current mobile `index.html`, `app.js`, and device behavior | Preserve while modularizing. |
| Mobile recovery | Existing `tlc_project` behavior | Migrate to a versioned schema and add export/import. |
| Automatic AUC behavior | Current desktop normalized signal and SciPy bases | Preserve results; expose actual integration bounds. |
| Manual AUC behavior | Final numerical contract | Use the same normalized signal and integration formula as automatic peaks. |
| Deployment | Streamlit Community Cloud | Preview branch first, production `main` second. |
| Legacy deployment | Current Hugging Face app | Temporary migration/rollback aid only; retire after acceptance. |

## 6. Target mobile architecture

### 6.1 Runtime flow

```text
Phone browser
  -> Streamlit page
    -> custom-component iframe
       - mobile UI and canvas
       - in-memory project state
       - versioned local recovery
       - project export/import
       - request client
    -> streamlit_app.py
       - protocol validation
       - action allowlist
       - request deduplication
       - response routing
    -> tlc_backend.py
       - image decoding and validation
       - crop
       - profile generation and peak detection
```

Streamlit session state is used only to route request/response state. The complete analytical project remains in the component, not in `st.session_state`. Streamlit reruns must not erase the active project.

### 6.2 Target repository structure

```text
TLC App PWA/
├── streamlit_app.py
├── tlc_backend.py
├── requirements.txt
├── .streamlit/
│   └── config.toml
├── .github/
│   └── workflows/
│       └── ci.yml
├── frontend/
│   ├── index.html
│   ├── index.css
│   ├── app.js
│   ├── guide.html
│   ├── favicon.ico
│   ├── icon.svg
│   └── modules/
│       ├── state.js
│       ├── constants.js
│       ├── api.js
│       ├── streamlit_bridge.js
│       ├── analysis.js
│       ├── calibration.js
│       ├── coords.js
│       ├── interactions.js
│       ├── render.js
│       ├── profiles.js
│       ├── workspace.js
│       ├── storage.js
│       ├── reports.js
│       ├── ui.js
│       └── init.js
├── tests/
│   ├── fixtures/
│   ├── python/
│   ├── javascript/
│   ├── contract/
│   └── browser/
└── docs/
    ├── numerical-contract.md
    ├── protocol.md
    ├── deployment-runbook.md
    ├── migration-guide.md
    └── known-limitations.md
```

This is a responsibility map, not a requirement to maximize the number of files. Related modules may be combined when their interface remains clear and testable.

### 6.3 Dependency rules

1. `analysis.js`, `calibration.js`, and `coords.js` are pure and may not import DOM, storage, canvas, or transport code.
2. UI modules call `api.js`; no UI module calls `fetch` or `postMessage` directly.
3. During the Flask-preserving refactor, `api.js` temporarily wraps the existing two HTTP calls. Its internal implementation is later replaced with the Streamlit bridge. No permanent dual-transport architecture is required.
4. `storage.js` serializes a versioned project DTO, not DOM nodes or transient gesture state.
5. Render functions read analytical state; they do not secretly change peak calculations.
6. User text enters the live DOM through `textContent`, element properties, or an audited safe helper.
7. Reports use one reviewed HTML serializer and a separate safe-filename helper.

## 7. Final numerical contract

### 7.1 Signal conventions

The backend will expose two explicit origin-to-front arrays for each lane:

- `profile_display`: baseline-corrected and smoothed intensity in display units, index `0` at origin and final index at solvent front.
- `profile_analysis`: the same signal normalized to `0–100`, in the same origin-to-front order.

Peak detection and every reported peak area use `profile_analysis`. The display may plot either signal, but it must not use `profile_display` for area calculations.

### 7.2 Bounds and peak schema

The existing automatic AUC behavior is preserved by distinguishing integration bounds from narrower visual-band bounds:

```json
{
  "idx": 142,
  "rf": 0.452,
  "height_display": 78.2,
  "height_analysis": 91.4,
  "area": 1240.5,
  "area_lb": 130,
  "area_rb": 155,
  "display_lb": 134,
  "display_rb": 150,
  "manual": false,
  "type": "N"
}
```

- `area_lb` and `area_rb` are the inclusive bounds used for AUC.
- The draggable boundary handles represent `area_lb` and `area_rb`.
- `display_lb` and `display_rb` may show threshold/FWHM banding and are non-authoritative for AUC.
- Reports must state or visually distinguish the integration interval and optional display band.
- For a new manual peak, the initial area bounds are found using the approved monotonic/baseline rule on `profile_analysis`; display bounds are then derived from the selected threshold.
- Moving an apex recalculates initial area/display bounds, Rf, heights, and area.
- Moving an area boundary recalculates area immediately and clamps the display band inside the area bounds.
- Deleting a peak recalculates dependent totals and calibration outputs.

Legacy peaks that contain only `lb`/`rb` are migrated by mapping those values to both area and display bounds. A recalculation marker should be stored when the exact historic automatic integration bounds cannot be reconstructed.

### 7.3 Area formula

For normalized analysis signal `s`, inclusive integer bounds `L < R`, and unit sample spacing:

```text
base = min(s[L], s[R])

area = sum from k=L to R-1 of
       ( max(s[k]   - base, 0)
       + max(s[k+1] - base, 0) ) / 2
```

Rules:

- Clamp indices to the valid array range.
- Return zero for missing/short arrays or `R <= L`.
- Reject or explicitly handle non-finite values before integration.
- Store full practical precision; round only for display/export.
- Area units are normalized-intensity × sample-index units and should be labelled as arbitrary area units unless a validated physical calibration applies.
- Python and JavaScript implementations must produce equal fixture results within a documented tolerance.

### 7.4 Rf and calibration rules

- Use the same origin/front geometry formula in Python and JavaScript.
- Define whether out-of-range Rf peaks are rejected or clamped; do not mix policies.
- Relative quantitation handles zero total area without `NaN`/`Infinity`.
- Single-point calibration rejects zero-area standards.
- Multi-point calibration detects singular/duplicate inputs and reports a user-facing error.
- MW calibration requires the approved minimum number of positive standards and a documented interpolation/extrapolation policy.

### 7.5 Required correctness fixtures

- flat and near-flat profiles;
- triangle with analytically known area;
- symmetric and asymmetric peaks;
- plateau peak;
- overlapping doublet;
- edge peaks;
- negative/noisy baseline before clipping;
- zero-width, reversed, and out-of-range bounds;
- apex and both boundary moves;
- origin, midpoint, front, and outside-range Rf;
- calibration zero, duplicate, singular, insufficient, and valid cases.

Synthetic arrays establish correctness. Representative plate images establish regression parity. Desktop output alone is not a scientific oracle.

## 8. Component protocol

### 8.1 Request

```json
{
  "protocol_version": 1,
  "action": "generate_profiles",
  "request_id": "profiles-000108",
  "payload": {}
}
```

### 8.2 Success response

```json
{
  "protocol_version": 1,
  "action": "generate_profiles_result",
  "request_id": "profiles-000108",
  "ok": true,
  "data": {},
  "error": null
}
```

### 8.3 Error response

```json
{
  "protocol_version": 1,
  "action": "generate_profiles_result",
  "request_id": "profiles-000108",
  "ok": false,
  "data": null,
  "error": {
    "code": "INVALID_IMAGE",
    "message": "The selected image could not be decoded.",
    "retryable": false
  }
}
```

### 8.4 Lifecycle rules

- Every accepted or rejected request receives the same request ID in its response.
- Track `latestRequestIdByAction`, not one global latest ID.
- A crop response cannot invalidate a profile response and vice versa.
- Coalesce rapid profile-setting changes so only the newest queued calculation must run.
- Deduplicate repeated IDs in Python.
- Ignore stale responses in JavaScript.
- Clear or acknowledge delivered responses so reruns cannot apply them as new work.
- Validate protocol version, action, payload shape, and message source.
- Show user-facing validation, offline, timeout, and backend errors in a nonmodal status area.
- Initial action allowlist: `crop` and `generate_profiles` only.

## 9. Security, resource, and privacy requirements

### 9.1 Backend validation

Validate before expensive processing:

- encoded payload byte size;
- allowed data URL/MIME type;
- base64 validity;
- decoded image validity;
- decoded dimensions and total pixel count;
- image decompression-bomb conditions;
- lane count and peak count;
- finite `cx`, `cy`, width, height, angle, and numerical parameters;
- coordinate/range limits;
- crop dimensions and empty regions;
- supported action and protocol version.

### 9.2 Memory and concurrency

- Downscale according to a documented policy before sending or processing oversized images.
- Use a cache limited by bytes as well as entry count.
- Avoid logging image payloads or complete project JSON.
- Coalesce or serialize expensive profile requests per session.
- Measure browser and server memory with repeated unique images and multiple lanes.
- Read actual Community Cloud limits from workspace settings; do not design around an assumed fixed 1 GB limit.

### 9.3 UI and export safety

- Prefer element creation and `textContent` to user-string `innerHTML`.
- Remove inline event handlers while modularizing.
- Treat lane names, peak names/notes, sample IDs, project metadata, and report fields as untrusted.
- Audit report HTML separately from live DOM construction.
- Sanitize filenames independently of HTML.
- Do not insert uploaded file names into paths.

### 9.4 Privacy and hosting

- Tell users that analytical images are processed by the Streamlit-hosted backend.
- Explain what is stored locally, what is sent to the server, and what is included in exported projects/reports.
- Public-app visibility and search indexability must be an explicit deployment choice.
- Use non-sensitive fixtures and remove embedded metadata where appropriate.

## 10. Phased implementation plan

### Phase 0 — baselines, decisions, and release controls

**Goal:** make the implementation measurable and reversible.

Tasks:

1. Re-record both repository commits, branches, remotes, tracked/untracked changes, and dependency environments.
2. Preserve all existing user files; do not treat the untracked reports/plans as disposable.
3. Record the current desktop Streamlit URL, repository/branch/entrypoint coordinates, Python version, access mode, and known-good smoke results. Do not recreate the app.
4. Record the current Hugging Face URL and whether it is still relied on by users.
5. Verify whether the live Flask catch-all can expose repository/source files. If confirmed, issue a minimal containment patch or restrict the legacy deployment immediately.
6. Create the mobile implementation branch from the verified commit, suggested name `codex/mobile-streamlit-final`.
7. Record a legacy tag such as `legacy-flask-hf-20260927` after confirming the exact intended commit. A tag is recovery metadata, not permission to disable the deployment.
8. Confirm `main` branch protection: pull request required, required CI, and no force pushes.
9. Approve the numerical contract and any result-affecting behavior.
10. Create synthetic correctness fixtures and representative-image regression fixtures.
11. Decide supported device/browser versions and secure physical iOS and Android test devices.
12. Approve the storage migration, privacy wording, and PWA capability wording.

Exit gate:

- Baselines and cloud coordinates are recorded.
- Numerical contract is approved.
- Branch/preview/production/rollback paths are agreed.
- Fixtures and devices are available.
- No current deployment has been removed.

### Phase 1 — numerical core and API seam under Flask

**Goal:** correct the highest-risk calculation while the existing app remains runnable.

Tasks:

1. Write Python and JavaScript implementations of the approved area/Rf/calibration rules.
2. Run both implementations against the same fixture JSON and compare results automatically.
3. Update the Flask `generate_profiles` response to provide `profile_display`, `profile_analysis`, and the new peak schema while temporarily retaining compatibility fields if needed.
4. Introduce `api.js` as the only UI-facing API interface; initially wrap the two existing `fetch` calls.
5. Replace `area: 10` with the canonical calculation.
6. Recalculate apex, area bounds, totals, corrected percentages, and calibration outputs consistently after edits.
7. Add legacy peak/project schema migration and a recalculation marker where old information is incomplete.

Exit gate:

- Python and JavaScript conformance tests pass.
- Existing mobile app still runs through Flask.
- Automatic and manual peaks use the same signal scale and area formula.
- No hardcoded placeholder area remains.

### Phase 2 — mobile frontend modularization under the working transport

**Goal:** split responsibilities without combining refactor and deployment failure modes.

Tasks:

1. Move active static assets to `frontend/` and adjust the Flask static root for the transition.
2. Extract modules in vertical increments: state/constants, analysis/calibration, coordinates/rendering, interactions, profiles, workspace/storage, reports/UI, initialization.
3. Consolidate the active CSS source and preserve the current mobile layout.
4. Replace programmatic hidden-input activation with direct user-activated labels or visible inputs while preserving separate camera and gallery intent.
5. Add versioned local storage with migration from `tlc_project`, corruption/quota handling, and clear reset behavior.
6. Add explicit project JSON export/import with schema validation and safe size limits.
7. Replace routine `alert`/console-only failures with a status/progress region.
8. Replace unsafe user-string interpolation and inline handlers.
9. Preserve upload, crop, rotation, lines, marks, lanes, gestures, profiles, tables, undo, and reports through each increment.

Exit gate:

- Mobile feature regression suite passes through Flask.
- No UI module directly calls `fetch`.
- Module dependency rules are respected.
- Old saved projects migrate or fail with an explicit recovery message.
- Camera/gallery and gestures still work at supported viewports.

### Phase 3 — local Streamlit migration

**Goal:** replace Flask transport using the proven desktop component pattern.

Tasks:

1. Create `tlc_backend.py` from the verified crop/profile behavior and the approved numerical contract; do not copy unused endpoints.
2. Create `streamlit_app.py` with one component instance, an action allowlist, request validation/deduplication, typed response envelopes, and narrow exception handling.
3. Add the early inline component-ready bootstrap and buffered render queue.
4. Replace the internal implementation of `api.js` with the Streamlit bridge; remove the temporary HTTP implementation after parity passes.
5. Implement action-scoped correlation, coalescing, stale-response rejection, and replay clearing.
6. Implement backend validation, byte-bounded cache, and payload/image limits.
7. Use responsive iframe sizing with `100dvh`, safe-area insets, visual viewport/orientation handling, and no nested-scroll trap.
8. Use a minimal Streamlit configuration:

   ```toml
   [server]
   headless = true

   [theme]
   base = "dark"

   [client]
   toolbarMode = "minimal"
   ```

   Do not set `enableCORS = false` or `enableXsrfProtection = false` unless a documented test proves necessity and security review approves it.

9. Use Python 3.11 for mobile preview and production unless Phase 0 establishes a tested reason to use another currently supported version. Do not change the desktop Python version as part of this work.
10. Pin the tested direct dependency versions after a clean environment installation succeeds.
11. Run locally from the repository root with `streamlit run streamlit_app.py`.

Exit gate:

- Clean local installation and startup pass.
- Crop/profile/error/duplicate/stale/overlap contract tests pass.
- Streamlit reruns preserve the active project.
- All current mobile workflows pass locally.
- Flask is no longer required by the candidate branch.

### Phase 4 — CI, preview deployment, and physical-device acceptance

**Goal:** prove the final host/iframe/browser behavior before production.

Tasks:

1. Add required CI jobs:
   - Python lint/unit tests;
   - JavaScript lint/unit tests;
   - numerical conformance tests;
   - protocol tests;
   - component-startup smoke test;
   - browser tests at phone viewports;
   - dependency and secret scanning.
2. Deploy the implementation branch as a separate Streamlit preview app.
3. Record the preview URL, commit SHA, Python version, build logs, access mode, actual workspace limits, and cold-start behavior.
4. Test physical iOS Safari and Android Chrome:
   - direct camera and gallery;
   - permission denial/retry;
   - portrait/landscape;
   - pinch, pan, drawing, and peak handles;
   - virtual keyboard and safe areas;
   - reload and sleeping-app wake;
   - project export/import;
   - report download/print;
   - normal, slow, interrupted, and restored network.
5. Test same-origin local recovery on the preview domain.
6. Verify what home-screen addition actually produces; update wording accordingly.
7. Measure representative payload, latency, browser/server memory trend, and repeated-request behavior.

Exit gate:

- Required CI passes before merge.
- Physical iOS and Android suites have no blocking defects.
- Storage, export/import, reports, and network recovery pass.
- Preview serves the exact approved candidate commit.
- Performance is acceptable within observed limits.

### Phase 5 — desktop functionality alignment into mobile

**Goal:** bring approved desktop capabilities to mobile without changing its interaction model.

| Slice | Capability | Mobile implementation | Acceptance |
|---|---|---|---|
| A | Invert colors | Compact image/settings control. | Equivalent backend array for the same fixture and parameters. |
| A | RGB projection presets | Touch-friendly preset selector using accurate terminology. | Fixture parity and report provenance. |
| A | Polarity and peak controls | Compact settings sheet; debounce/coalesce changes. | Latest-result-wins test and parameter round trip. |
| B | Origin/front guidance | Port desktop instruction and validation behavior. | Geometry tests and device usability review. |
| B | Snapping and lane guidance | Port tolerances/cues, adapted for touch. | No accidental movement at supported viewports. |
| B | Rotation/crop/lane behavior | Retain mobile toolbar, align validated geometry. | Cross-app geometry fixtures. |
| C | Relative quantitation | Align formula, labels, validation, and rounding. | Cross-app comparison and zero-area tests. |
| C | Area calibration | Align standard/analyte behavior and error handling. | Known calibration fixtures. |
| C | MW calibration | Align log-MW method, standard requirements, and extrapolation policy. | Known MW fixtures and error cases. |
| D | Reports | Safe mobile download/print with parameters, version, and method provenance. | iOS/Android export and injection tests. |
| D | Reset/undo/help | Preserve mobile workflow; align missing safety/guide behavior. | Device workflow test. |
| Deferred | Wavelength bandwidth | Do not expose until its scientific model and tests are approved. | Listed explicitly as a known limitation. |

Each slice includes state, UI, backend parameters, tests, report fields, and guide changes. A feature is aligned only when its results and error behavior are equivalent, not merely when a similarly named control exists.

Exit gate:

- Parity matrix has no unexplained gaps.
- Numerical outputs match the approved contract within documented tolerances.
- Mobile controls remain usable at the narrowest supported viewport.
- Deferred features are clearly documented.

### Phase 6 — mobile production release and Streamlit-only cutover

**Goal:** deploy the exact accepted commit, then retire legacy infrastructure safely.

Tasks:

1. Freeze the approved preview commit and rerun all required checks.
2. Review and merge the implementation pull request to `main`; do not recreate or squash in a way that changes the tested content without rerunning checks.
3. Create the mobile production app from:
   - repository: `giancarlopascali-hub/TLC-APP-PWA`;
   - branch: `main`;
   - entrypoint: `streamlit_app.py`;
   - Python: the exact preview-tested version.
4. Request `aq-tlc-mobile` as the custom subdomain if available; otherwise record the assigned URL.
5. Confirm the production app serves the accepted commit and run the production smoke suite.
6. Publish the project export/import migration guide and known limitations.
7. Keep the old Hugging Face app available for the agreed migration/observation window, preferably with a notice linking to the new app.
8. Monitor startup/build failures, backend errors, latency, memory trend, camera/upload issues, and report failures.
9. After acceptance and the migration window:
   - disable/remove `.github/workflows/sync_to_hf.yml` in a separate reviewed change;
   - remove the local `hf` remote if desired;
   - remove unused Flask/Docker/service-worker assets from the production tree;
   - retain the legacy Git tag and documented redeployment instructions.
10. Confirm Streamlit is the only active deployment target.

Exit gate:

- Production smoke tests pass on desktop, iOS, and Android.
- Actual URL, commit, Python version, coordinates, access mode, and owner are recorded.
- Project migration path is verified.
- Hugging Face is retired only after acceptance.
- Previous-good Streamlit and legacy source recovery paths are documented.

### Phase 7 — shared high-priority improvements and desktop maintenance

**Goal:** improve both apps without turning the desktop into a second migration project.

Priority order:

1. **P0 — numerical consistency:** apply the approved analysis profile and area/display bounds schema to desktop. Preserve automatic AUC results where possible and show before/after deltas for every result-changing case.
2. **P1 — request reliability:** echo IDs, correlate per action, coalesce rapid updates, and prevent replay.
3. **P1 — rendering/export safety:** replace unsafe interpolation, centralize report serialization, sanitize filenames, and add injection tests.
4. **P1 — input/resource controls:** payload/pixel/geometry limits, byte-bounded cache, bounded concurrency, and safe errors.
5. **P1 — calibration validation:** zero/singular/insufficient inputs and non-finite output handling.
6. **P2 — spectral terminology/bandwidth:** label RGB weighting accurately; implement bandwidth only after scientific definition, otherwise remove/disable it.
7. **P2 — dependency/configuration hygiene:** pin tested versions, remove only confirmed-unused dependencies, retain secure defaults, and scan dependencies/secrets.

Desktop release rules:

- one focused pull request per defect category;
- no layout or session-lifecycle changes;
- separate desktop preview deployment or equivalent safe validation;
- full desktop regression workflow;
- numerical delta report for analytical changes;
- exact previous-good commit and rollback procedure;
- production smoke test after merge.

## 11. Testing strategy

### 11.1 Python tests

- image decoding and invalid data;
- crop geometry and empty crops;
- lane clipping and invalid/non-finite geometry;
- analysis/display profile direction and normalization;
- peak schema and integration/display bounds;
- area/Rf/calibration correctness;
- parameter boundaries;
- payload, pixel, lane, and cache limits;
- typed error mapping.

### 11.2 JavaScript tests

- area/Rf/calibration conformance;
- peak add/apex move/boundary move/delete;
- dependent totals and calibration recalculation;
- coordinate transforms and pinch math;
- request ID generation and action-scoped stale rejection;
- storage migration, corruption, quota handling, export/import validation;
- safe text and report serialization;
- project schema versioning.

### 11.3 Protocol tests

For `crop` and `generate_profiles`:

- valid success;
- validation error;
- backend error;
- unknown action/version;
- missing/malformed request ID;
- duplicate request;
- stale response;
- crop/profile overlap;
- rerun replay;
- rapid setting changes and coalescing.

### 11.4 Browser and device tests

- load image;
- camera/gallery fallback;
- crop/rotate/lines/marks/lanes;
- profile generation and rapid setting changes;
- manual peak add/move/resize/delete;
- all table/calibration modes;
- undo/reset/reload/recovery;
- project export/import;
- report download/print;
- orientation, keyboard, safe areas, touch targets, focus, and status announcements;
- slow/offline/reconnect and sleeping-app wake.

### 11.5 Desktop regression tests

- existing upload/crop/lane/profile workflow;
- established automatic peak outputs;
- manual peak operations;
- relative, area, and MW calibration;
- filters/invert/polarity controls;
- reports;
- browser-session lifetime;
- no layout/navigation changes.

## 12. Streamlit deployment guide

### 12.1 Verify the existing desktop app

1. Sign in to [Streamlit Community Cloud](https://share.streamlit.io) with the GitHub account that manages `giancarlopascali-hub/AQ-TLC-Streamlit`.
2. Open the existing desktop app from the matching workspace.
3. Record its current URL, repository, branch, entrypoint, access mode, Python version, and last known-good commit.
4. Run the desktop smoke test.
5. Do **not** click “Create app,” delete/redeploy it, change Python, or change its URL during the mobile migration.

### 12.2 Create the mobile preview app

After Phase 3 passes locally:

1. Push the implementation branch to GitHub through the agreed workflow.
2. In Community Cloud, select **Create app** and **Yup, I have an app**.
3. Enter:
   - repository: `giancarlopascali-hub/TLC-APP-PWA`;
   - branch: `codex/mobile-streamlit-final` or the actual implementation branch;
   - entrypoint: `streamlit_app.py`.
4. In advanced settings, select the tested Python version, planned as 3.11 unless Phase 0 records a different approved choice.
5. Use a clearly non-production preview subdomain if available.
6. Deploy, record the actual URL, and complete Phase 4.

### 12.3 Create the mobile production app

After Phase 5 acceptance and merge:

1. In Community Cloud, create a separate app from:
   - repository: `giancarlopascali-hub/TLC-APP-PWA`;
   - branch: `main`;
   - entrypoint: `streamlit_app.py`;
   - Python: exact preview-tested version.
2. Request `aq-tlc-mobile` as the subdomain if available. A custom subdomain is optional and must not be assumed in documentation until assigned.
3. Leave secrets empty only after confirming none are required.
4. Deploy and watch the build logs.
5. Record the deployed commit and execute the production smoke test.

### 12.4 Current Community Cloud facts

- Apps are identified by repository, branch, and entrypoint coordinates.
- Code updates on the watched GitHub branch are normally reflected automatically; dependency changes trigger reinstallation and can take longer.
- Python version is a deployment setting and cannot be changed in place without redeploying the app.
- Custom subdomains are optional and subject to availability.
- Resource limits can change and should be read from workspace settings.
- Inactive apps can sleep; cold-start/wake behavior must be tested.
- Community Cloud can override repository configuration, so the app must not depend on disabling XSRF protection.

Primary references:

- [Deploy an app on Community Cloud](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/deploy)
- [File organization](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/file-organization)
- [App dependencies](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/app-dependencies)
- [Manage an app](https://docs.streamlit.io/deploy/streamlit-community-cloud/manage-your-app)
- [Status and limitations](https://docs.streamlit.io/deploy/streamlit-community-cloud/status)

## 13. Release and rollback procedure

### 13.1 Before release

Record:

- candidate commit and tag;
- previous-good mobile commit/tag;
- preview URL and evidence;
- production coordinates;
- storage/protocol schema versions;
- migration compatibility;
- release owner and rollback owner;
- smoke-test results.

### 13.2 Rollback triggers

- component fails to load reliably;
- camera and gallery are unavailable on a supported device;
- stale responses overwrite current work;
- numerical fixtures fail or results change unexpectedly;
- project data is corrupted or unrecoverable;
- repeated resource exhaustion;
- unsafe or broken report export;
- blocking regression in the core mobile workflow.

### 13.3 Rollback method

1. Stop further merges.
2. Revert the specific release pull request or explicit release commits through a reviewed change; do not blindly revert `HEAD` and do not rewrite `main` history.
3. Confirm Community Cloud serves the restored commit.
4. Run production smoke tests.
5. During the migration window, direct users to the retained legacy app if necessary.
6. After Hugging Face retirement, full legacy recovery requires redeploying the legacy tag; checking out the tag locally does not restore a cloud service.
7. Add a regression test and incident note before attempting another release.

## 14. Risk register

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| Automatic/manual area mismatch survives the refactor | Medium / Critical | Explicit analysis signal, separate bounds, cross-language fixtures, delta review. |
| Numerical schema changes established desktop results | Medium / High | Preserve automatic AUC bases; stage desktop changes separately; compare results. |
| Refactor changes gestures or geometry | Medium / High | Flask-first increments, browser tests, physical-device gates. |
| Iframe changes camera behavior | Medium / High | Direct user-activated inputs, early preview, gallery fallback. |
| Old projects disappear after origin change | High / High | Export/import, legacy migration window, clear instructions. |
| Streamlit reruns replay or reorder responses | Medium / High | Versioned envelopes, per-action IDs, deduplication, coalescing, contract tests. |
| Base64 images exhaust browser/server resources | Medium / High | Byte/pixel limits, downscaling, byte-bounded cache, measurement. |
| Feature parity overcrowds mobile UI | High / Medium | Settings sheet/tabs; port behavior rather than layout; slice usability review. |
| PWA language overpromises | High / Medium | Capability testing and accurate limitations. |
| Shared fixes regress desktop | Low / High | Separate focused releases, preview, regression suite, rollback. |
| Direct push deploys untested code | Medium / High | Protected `main`, required PR checks, preview before production. |
| Cloud limits or behavior change | Medium / Medium | Pin dependencies, record settings, consult official docs, post-update smoke. |
| Public hosting exposes sensitive images/metadata | Medium / High | Privacy disclosure, no payload logging, controlled access decision, sanitized fixtures. |

## 15. Indicative effort and review gates

These ranges assume one experienced implementer, an available desktop reference, representative images, and physical phones. Formal analytical-method validation is additional.

| Phase | Estimate | Approval gate |
|---|---:|---|
| Phase 0 — baselines and decisions | 1–2 days | Contracts, fixtures, branch, preview, and rollback approved. |
| Phase 1 — numerical core/API seam | 2–3 days | Cross-language correctness and Flask behavior approved. |
| Phase 2 — modularization | 3–5 days | Mobile behavior and storage migration approved. |
| Phase 3 — local Streamlit migration | 2–4 days | Local component/protocol/security tests approved. |
| Phase 4 — CI/preview/device proof | 2–4 days | Physical-device and cloud evidence approved. |
| Phase 5 — feature alignment | 4–7 days | Slice-by-slice parity approved. |
| Phase 6 — production/cutover | 1–2 days plus observation window | Production and migration evidence approved. |
| Phase 7 — shared/desktop fixes | 3–5 days | Separate approval for each desktop release. |

Expected engineering range: approximately **18–32 working days**, excluding formal scientific validation, review delays, and the post-release observation window.

## 16. Deliverables

1. Approved numerical contract and shared fixtures.
2. Versioned component protocol specification.
3. Modular mobile frontend with documented dependency boundaries.
4. Mobile `streamlit_app.py` and validated `tlc_backend.py`.
5. Versioned local recovery plus project export/import.
6. Python, JavaScript, protocol, browser, and regression tests.
7. CI workflow and protected release process.
8. Mobile/desktop feature-alignment matrix.
9. Physical-device acceptance record.
10. Preview and production deployment record.
11. Storage migration, privacy, and known-limitations documentation.
12. Rollback runbook and previous-good references.
13. Hugging Face retirement change after acceptance.
14. Narrow, independently reversible desktop maintenance patches.

## 17. Definition of done

### Mobile maintainability

- [ ] State, calculation, geometry, rendering, interactions, storage, API, reports, and UI have clear boundaries.
- [ ] Pure calculation modules have no DOM/transport dependencies.
- [ ] UI modules do not call `fetch` or `postMessage` directly.
- [ ] Active CSS has one authoritative source.
- [ ] Project schema is versioned, recoverable, exportable, and validated.

### Numerical correctness

- [ ] Profile direction, normalization, baseline, integration bounds, display bounds, area units, Rf, and rounding are documented.
- [ ] Automatic and manual areas use `profile_analysis` and the same formula.
- [ ] Automatic integration bases remain available and are not confused with display bands.
- [ ] Add/apex move/boundary move/delete update all dependent values.
- [ ] Python and JavaScript conformance fixtures pass.
- [ ] Representative plate regression tolerances pass.

### Streamlit reliability and safety

- [ ] Local and preview components start without timeout.
- [ ] Every response includes protocol version, action, request ID, status, and typed error data.
- [ ] Latest responses are tracked per action and stale responses cannot overwrite state.
- [ ] Reruns do not erase projects or replay completed work.
- [ ] Payload, image, geometry, cache, and concurrency limits are enforced.
- [ ] Secure defaults remain enabled unless a reviewed exception exists.

### Mobile experience and parity

- [ ] Landing, bottom toolbar, tabs, camera/gallery, gestures, crop, rotation, lines, marks, lanes, profiles, tables, calibration, undo, storage, and reports work on supported phones.
- [ ] Approved desktop features are aligned through touch-appropriate controls.
- [ ] iOS and Android physical-device acceptance passes.
- [ ] Orientation, virtual keyboard, safe areas, touch targets, focus, and status feedback pass.
- [ ] PWA/offline wording matches observed capability.

### Desktop protection

- [ ] Existing desktop deployment is not recreated during mobile migration.
- [ ] Desktop layout and browser-session lifecycle remain unchanged.
- [ ] Each desktop fix is focused, previewed, regression-tested, and independently reversible.
- [ ] Result-affecting changes include numerical delta evidence.

### Release and operations

- [ ] `main` is protected by required pre-merge checks.
- [ ] Preview/device acceptance precedes production merge.
- [ ] Production serves the exact approved commit.
- [ ] Actual URL, coordinates, Python version, access mode, and owner are recorded.
- [ ] Cross-origin project migration is documented and tested.
- [ ] Rollback is rehearsed without history rewriting.
- [ ] Hugging Face is retired only after Streamlit acceptance and the migration window.
- [ ] Streamlit is the sole active deployment target at final completion.

## 18. First implementation increment

The first coding increment should stop after the smallest complete portion of Phases 0 and 1:

1. record verified baselines and create the protected implementation branch;
2. approve the numerical contract;
3. add shared synthetic fixtures and representative regression fixtures;
4. add Python and JavaScript conformance tests;
5. introduce the small `api.js` seam around the existing Flask calls;
6. replace `area: 10` and update dependent calculations using the approved signal/bounds schema;
7. confirm the existing mobile app still runs correctly through Flask.

That increment must not alter the desktop app, disable Hugging Face, push unreviewed code to `main`, or create the production Streamlit mobile app. It establishes a tested analytical foundation before the architectural migration begins.
