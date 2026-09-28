# AQ-TLC Mobile Streamlit Implementation Plan — v1

**Plan version:** v1
**Prepared:** 26 September 2026
**Primary implementation target:** `C:\Users\Giancarlo\Desktop\Antigravity work files\TLC App PWA`
**Reference Streamlit implementation:** `C:\Users\Giancarlo\Desktop\Antigravity work files\AQ-TLC-streamlit`
**Functional desktop reference:** the currently deployed AQ-TLC Streamlit application

## 1. Purpose

This plan implements the following agreed direction:

1. Preserve the desktop Streamlit application and its current user experience.
2. Preserve the intentional desktop lifecycle: a working session exists with the browser session and ends with it.
3. Refactor the mobile code for maintainability without redesigning its working mobile workflow.
4. Deploy the mobile app through the same Streamlit custom-component strategy used by the desktop app.
5. Align desktop functionality into the mobile interface while retaining a phone-appropriate layout.
6. After mobile alignment, improve both applications beginning with high-priority correctness, reliability, and security fixes.

This is an implementation plan only. It does not authorize a major desktop rewrite or a change to desktop session persistence.

## 2. Important correction to the initial audit

The initial audit examined the two folders named in the original request:

- `TLC App PWA`
- `TLC app`

Those folders contain Flask/Docker implementations. A subsequent search found the separate folder `AQ-TLC-streamlit`, which contains the actual deployed Streamlit architecture:

- `streamlit_app.py` declares and renders a custom Streamlit component.
- `frontend/` contains the desktop HTML/CSS/JavaScript application.
- `frontend/modules/streamlit_bridge.js` implements the component `postMessage` protocol.
- `tlc_backend.py` provides pure Python crop and profile-generation functions without Flask.
- Streamlit reruns route component actions to Python and return responses to the iframe.

The mobile implementation should copy and adapt this proven strategy. A native Streamlit UI rewrite is not planned.

## 3. Product and engineering guardrails

### 3.1 Desktop guardrails

The following are explicit non-goals for v1:

- Do not replace the desktop custom-component architecture.
- Do not redesign the desktop layout or workflow.
- Do not add persistent server-side desktop sessions.
- Do not change the fact that the desktop working session ends with the browser session.
- Do not merge the mobile UI into the desktop UI.
- Do not port the mobile bottom navigation or local autosave behavior into desktop unless separately requested.
- Do not restructure the desktop repository merely to make the mobile refactor cleaner.
- Do not change established desktop analysis behavior during the mobile deployment phases unless a confirmed high-priority defect requires a narrowly scoped fix.

Desktop is the functional reference and regression baseline, not the first refactoring target.

### 3.2 Mobile guardrails

- Preserve the mobile landing screen, camera option, touch/pinch interaction, tabs, bottom toolbar, and narrow-screen workflow.
- Refactor behavior before adding desktop features.
- Keep each migration step runnable and testable.
- Do not copy the desktop three-column layout into the phone UI.
- Reuse desktop calculations and interaction behavior where they are better, but adapt their presentation for touch.
- Do not remove the current Flask version until the Streamlit version passes parity and deployment checks.
- Do not knowingly copy a confirmed defect simply to claim feature parity.

### 3.3 Session and persistence policy

- Desktop remains browser-session-scoped exactly as intended.
- Mobile v1 initially retains its existing local project recovery behavior so the refactor does not remove a working feature.
- Mobile storage must be isolated from Streamlit session state; Streamlit reruns must not erase the active client-side project.
- Whether mobile local recovery should later match desktop's ephemeral model is a product decision outside this plan.

## 4. Definition of v1 success

Mobile v1 is complete when all of the following are true:

1. The mobile code is split into maintainable modules with clear responsibilities.
2. It runs locally through `streamlit run streamlit_app.py`.
3. It is deployed on Streamlit Community Cloud using a custom-component iframe, matching the desktop strategy.
4. Upload, direct camera capture, crop, rotation, origin/front lines, spotting marks, lane creation, profiles, peak editing, tables, calibration modes, and reports work on supported phones.
5. The important features of the deployed desktop app are available in the mobile workflow unless explicitly deferred in the feature matrix.
6. Mobile and desktop return equivalent analytical results for the same image, lane geometry, settings, and backend version.
7. High-priority mobile correctness defects are fixed before release.
8. High-priority shared fixes are applied narrowly and verified against desktop regression tests.
9. No major desktop layout, lifecycle, or session behavior changes occur.
10. Deployment, rollback, and operational checks are documented.

## 5. Source-of-truth decisions

| Concern | v1 source of truth | Notes |
|---|---|---|
| Streamlit component lifecycle | `AQ-TLC-streamlit/streamlit_app.py` | Reuse the working declaration, request routing, response injection, iframe sizing, and rerun pattern. |
| Component bridge | `AQ-TLC-streamlit/frontend/modules/streamlit_bridge.js` | Adapt for mobile; improve request correlation without changing desktop until the shared-fix phase. |
| Python analysis backend | `AQ-TLC-streamlit/tlc_backend.py` | Use as the starting backend because it is already separated from Flask and compatible with Streamlit. |
| Desktop functionality | Deployed `AQ-TLC-streamlit/frontend/` | This is the parity reference, not the older `TLC app` folder where the two differ. |
| Mobile layout and gestures | `TLC App PWA/index.html`, `app.js`, and live mobile behavior | Preserve mobile navigation and pointer/touch design. |
| Mobile persistence | Existing PWA local project state | Retain initially; move behind a storage module. |
| Numerical expected results | Golden reference fixtures created in Phase 0 | Code equivalence alone is insufficient. |
| Desktop session lifetime | Existing deployed Streamlit behavior | Protected requirement; no persistence redesign. |

## 6. Target mobile repository structure

The mobile repository should evolve toward the following structure:

```text
TLC App PWA/
├── streamlit_app.py             # Streamlit entry point and action router
├── tlc_backend.py               # Pure Python analytical backend
├── requirements.txt             # Streamlit/runtime dependencies
├── .streamlit/
│   └── config.toml
├── frontend/
│   ├── index.html               # Mobile component shell
│   ├── index.css                # Single live mobile stylesheet
│   ├── app.js                   # Minimal module bootstrap
│   ├── guide.html
│   ├── favicon.ico
│   ├── manifest.json            # Retained pending PWA feasibility decision
│   ├── icons/
│   └── modules/
│       ├── state.js             # Central client state
│       ├── constants.js         # Defaults and shared constants
│       ├── streamlit_bridge.js  # Component protocol
│       ├── api.js               # Action requests and response routing
│       ├── workspace.js         # Image load/reset/crop/undo
│       ├── storage.js           # Mobile project persistence and schema
│       ├── coords.js            # Canvas/image transforms
│       ├── events.js            # Main canvas pointer/touch events
│       ├── render.js            # Image canvas rendering
│       ├── profiles.js          # Densitogram render/edit behavior
│       ├── tables.js            # Mobile integration/calibration tables
│       ├── analysis.js          # Client-side calibration and area helpers
│       ├── export.js            # Report creation/download/print
│       ├── ui.js                # Tabs, menus, status, toasts, dialogs
│       └── init.js              # Wiring only
├── tests/
│   ├── python/
│   ├── javascript/
│   ├── browser/
│   └── fixtures/
├── legacy_flask/                # Temporary during migration only
└── README.md
```

The final location of legacy Flask files should be decided only after Streamlit production acceptance. They may remain on a tagged legacy branch rather than inside the deployment tree.

## 7. Streamlit mobile architecture

### 7.1 Runtime flow

```text
Phone browser
  → Streamlit page
    → mobile custom-component iframe
      → mobile JS state/canvas/touch UI
        → streamlit:setComponentValue action
          → streamlit_app.py router
            → tlc_backend.py computation
          ← response stored in st.session_state for the rerun
        ← streamlit:render component args
      → update mobile state and canvas
```

`st.session_state` is used only to route the most recent backend response through Streamlit. It is not the authoritative store for the entire mobile project. The active project remains in the component's JavaScript state and optional local mobile storage.

### 7.2 Initial action contract

Only actions required by the current mobile UI should be exposed initially:

| Action | Payload | Result |
|---|---|---|
| `generate_profiles` | Image, lanes, peak settings, polarity, filter settings | Profiles and optional detected peaks |
| `crop` | Image, ROI, angle | Cropped base64 image |
| `ping` | Protocol/client version | Backend/protocol version and readiness |

The legacy Flask detection/optimization routes are not part of mobile v1 unless a live UI feature actually uses them. This prevents unused compute and dependency surface from being migrated.

Every request and response should use a stable envelope:

```json
{
  "protocol_version": 1,
  "request_id": "mobile-42",
  "action": "generate_profiles",
  "payload": {}
}
```

```json
{
  "protocol_version": 1,
  "request_id": "mobile-42",
  "action": "generate_profiles_result",
  "ok": true,
  "data": {},
  "error": null
}
```

The Python router must echo `request_id`. The frontend must apply a response only when it matches the latest relevant request. The current desktop bridge declares a latest-request variable but does not receive an echoed request ID, so this should be completed in mobile and later offered as a narrowly scoped desktop reliability fix.

### 7.3 Error behavior

- Bridge and backend errors must be shown in a mobile status/toast area, not only `console.error` or `alert`.
- An error response must not clear the previous valid profile or project.
- Controls that launch analysis must show pending state and recover after failure.
- Python must return a safe structured error rather than raw tracebacks to the component.
- Logs may retain stack traces on the server but must not include base64 images or sample names.

### 7.4 Camera and file input inside the component

The desktop Streamlit component already uses a real file input positioned over the upload target because programmatic file-picker clicks are unreliable in iframes. Mobile must follow the same direct-user-gesture pattern:

- Upload control: `<input type="file" accept="image/*">` associated with a visible label/button.
- Camera control: a separate direct input using `accept="image/*"` and `capture="environment"` where supported.
- Do not rely on a hidden input opened solely by a scripted `.click()`.
- Test camera behavior on physical iOS Safari and Android Chrome in the deployed HTTPS app.
- Provide upload fallback when direct camera capture is ignored by the browser.

## 8. Delivery phases

## Phase 0 — baseline, safety net, and decision gates

**Goal:** establish reproducible current behavior before refactoring.

### Tasks

1. Create a dedicated implementation branch in the mobile repository, suggested name `codex/mobile-streamlit-v1` when implementation begins.
2. Tag or record the current mobile commit and the reference desktop Streamlit commit.
3. Record the deployed desktop URL, Streamlit app settings, repository branch, Python version, and current working build.
4. Create a small approved fixture set:
   - one simple plate;
   - one rotated plate;
   - one dark-spot plate;
   - one bright/fluorescent plate;
   - one plate with multiple lanes/standards;
   - one image that currently stresses peak detection.
5. Capture expected desktop results for those fixtures:
   - lane geometry;
   - profile length and representative values;
   - peak count, Rf, bounds, height, and area;
   - calibration outputs;
   - report content.
6. Capture the current mobile workflow and expected state transitions.
7. Document the current mobile local-storage schema and storage key.
8. Establish a comparison harness around `generate_profiles()` and `crop_image()`.
9. Verify whether the same custom-component path can satisfy the intended installable-PWA requirement.

### Decision gate: PWA meaning

A Streamlit custom component runs inside an iframe. The mobile UI can be fully usable in a phone browser, but top-level PWA installation/service-worker ownership may not behave like the present standalone Flask page.

For v1, the default assumption is:

- **Required:** excellent phone-browser behavior on the deployed Streamlit URL.
- **Required:** camera/upload, touch, rotation, responsive layout, and browser home-screen bookmark compatibility.
- **To validate:** whether an actual install prompt, standalone display mode, and service worker can be supported reliably through the Streamlit component path.
- **Not to claim until validated:** fully installable or analytically offline PWA behavior.

If installability is mandatory and the feasibility check fails, the product decision is either:

1. deploy a separate top-level PWA shell backed by a service API; or
2. accept the Streamlit mobile web app without claiming full PWA installation.

This gate should not block the modular refactor.

### Phase 0 exit criteria

- Reference commits and deployment details are recorded.
- At least three representative fixtures have expected results.
- Current mobile critical workflows have a repeatable smoke checklist.
- PWA-installability requirement is classified as required or deferred.

## Phase 1 — modularize mobile without changing deployment

**Goal:** split the current mobile monolith while keeping the Flask version available for behavior comparison.

### Work package 1.1: state and constants

- Move the global `state` object into `frontend/modules/state.js`.
- Move defaults, limits, Rf offsets, and tool identifiers into `constants.js`.
- Define documented object shapes for lines, marks, lanes, profiles, and peaks.
- Add `projectSchemaVersion` to persisted mobile state.
- Remove direct global access from inline HTML handlers.

### Work package 1.2: UI and styles

- Move all active CSS out of the large inline block into `frontend/index.css`.
- Remove or archive the currently unused stylesheet copy.
- Keep the mobile landing, header, right-side controls, tabs, and bottom toolbar visually stable.
- Move tab/menu/status behavior into `ui.js`.
- Replace inline `onchange` strings with event listeners and data attributes.
- Add a nonmodal progress/status region for backend actions.

### Work package 1.3: canvas and geometry

- Move transforms into `coords.js` and keep them pure where possible.
- Move main-canvas drawing into `render.js`.
- Move pointer, pinch, wheel, rotate, crop, selection, and movement handling into `events.js`.
- Handle `pointercancel` and lost pointer capture.
- Preserve two-finger zoom and phone gestures.

### Work package 1.4: profiles and tables

- Move chart rendering/editing into `profiles.js`.
- Move table modes and editable cells into `tables.js`.
- Move calibration and manual integration helpers into `analysis.js`.
- Use one `calculatePeakArea()` function for automatic/manual client-side recalculation.
- Fix the mobile defect where manual peaks retain the placeholder area of `10`.
- Recalculate area after apex movement and either boundary movement.
- Keep Image/Profile/Table as mobile tabs.

### Work package 1.5: workspace and storage

- Move upload, image scaling, reset, crop application, undo, and new-project behavior into `workspace.js`.
- Move `localStorage` access into `storage.js`.
- Wrap parse/write operations in error handling.
- Keep the existing storage key readable, then migrate to a versioned record.
- Do not make Streamlit session state responsible for restoring the mobile project.

### Work package 1.6: API adapter seam

- Introduce an API interface with `generateProfiles()` and `cropImage()`.
- Retain a temporary Flask adapter so the refactored client can be compared with current behavior.
- Ensure UI modules do not know whether the backend is Flask or Streamlit.
- Add loading, response, error, and stale-response hooks.

### Phase 1 exit criteria

- Mobile works through the existing local Flask server.
- No required mobile workflow regresses.
- `app.js` is bootstrap-only.
- No functional inline event handlers remain.
- Live CSS has one source of truth.
- Manual peak areas update correctly.
- Syntax/unit checks pass.

## Phase 2 — replace Flask transport with the Streamlit component strategy

**Goal:** make the refactored mobile frontend run as a Streamlit custom component.

### Work package 2.1: Python backend

- Copy the proven separation pattern from `AQ-TLC-streamlit/tlc_backend.py`.
- Implement only `generate_profiles`, `crop_image`, decoding, and directly required helpers.
- Add input validation at the function boundary:
  - required fields;
  - finite numbers;
  - positive lane dimensions;
  - bounded image dimensions/decoded bytes;
  - bounded lane count;
  - bounded peak parameters.
- Include backend/protocol version in readiness responses.
- Preserve expected desktop results for shared functions.

### Work package 2.2: Streamlit entry point

- Base `streamlit_app.py` on the working desktop entry point.
- Use a distinct component name, for example `aq_tlc_mobile`.
- Render a full-width, chrome-minimized mobile component.
- Route the approved actions only.
- Deduplicate request IDs.
- Echo request IDs and consistent error envelopes.
- Use a height appropriate to mobile `visualViewport`, not a desktop-only fixed assumption.
- Keep the Python script thin; computations remain in `tlc_backend.py`.

### Work package 2.3: bridge

- Port the inline early `streamlit:componentReady` bootstrap.
- Port render-event buffering so early Streamlit arguments are not lost.
- Add response correlation by request ID.
- Route crop and profile responses through one dispatcher instead of independent listeners where practical.
- Prevent stale responses from overwriting newer slider/settings results.
- Validate that inbound events come from the parent window and match expected Streamlit message shapes.
- Continue supporting dynamic host origins; do not hard-code a local URL.

### Work package 2.4: iframe/mobile behavior

- Set iframe height using `visualViewport.height` with safe fallback.
- Update height on orientation and viewport changes without rerender loops.
- Test on-screen keyboard behavior for name/calibration inputs.
- Use direct file input gestures for upload and camera.
- Verify report download/print behavior inside the Streamlit iframe.
- Verify guide navigation without losing the current analysis.

### Work package 2.5: configuration and dependencies

- Replace Flask-only dependencies with the Streamlit runtime set.
- Pin compatible top-level versions for a reproducible v1 release.
- Use a currently supported Streamlit Cloud Python version.
- Begin with the known desktop configuration only where required.
- Test whether default XSRF/CORS protections can remain enabled for mobile; disable a protection only with a documented reason and regression test.
- Remove Docker/Hugging Face deployment files from the active Streamlit deployment path only after cutover, or retain them explicitly as a legacy deployment option.

### Phase 2 exit criteria

- Local `streamlit run streamlit_app.py` launches successfully.
- Upload and direct camera inputs work in the component.
- Crop and profile calls round-trip through Streamlit.
- Streamlit reruns do not clear client project state.
- Stale responses are ignored.
- Mobile layout works at agreed viewport sizes.
- A preview deployment passes smoke tests.

## Phase 3 — align desktop functionality into mobile

**Goal:** bring the deployed desktop feature set to mobile without copying its desktop layout.

Parity should be delivered in functional slices. Each slice includes state, UI, backend parameters, reports, tests, and guide updates.

### 3.1 Feature alignment matrix

| Capability | Current mobile | Streamlit desktop reference | v1 mobile action |
|---|---|---|---|
| Upload image | Present | Direct iframe-safe input | Keep mobile screen; adopt direct input technique. |
| Camera capture | Present | Not a primary desktop workflow | Preserve and validate inside deployed component. |
| Image downscale/JPEG | Present | Present | Keep current behavior for parity; document dimensions/quality. |
| New/reset/undo | Present | New/reset and desktop undo shortcuts | Preserve mobile buttons; align underlying snapshot behavior. |
| Pan/zoom/rotation | Touch implementation | Mouse implementation | Keep pointer/touch implementation; port desktop geometry fixes only. |
| Crop | Flask fetch | Streamlit `crop` action | Replace transport; preserve mobile tool. |
| Origin/front lines | Present | Enhanced desktop instructions/interaction | Align geometry and guidance; keep mobile toolbar. |
| Spotting marks | Present | Improved snapping/guidance | Port snapping rules and user feedback. |
| Find lanes | Present | Newer Streamlit desktop implementation | Port verified lane calculation and warnings. |
| Polarity modes | Present | Present with full labels | Preserve logic; improve mobile labels/accessibility. |
| Profile generation | Flask fetch | Streamlit bridge | Use shared backend and action contract. |
| Automatic peak detection | Present | Present | Align parameters and outputs. |
| Manual add/move/delete | Present but area bug | More complete area recalculation | Port corrected behavior and tests. |
| Peak bound editing | Present | More complete visual handles/calculation | Adapt handles for touch targets. |
| Chart zoom/pan/reset | Present | More developed desktop chart | Port logic with touch gestures and mobile menus. |
| Relative intensity | Present | Present | Match columns/calculations and report output. |
| Area calibration | Present | Present | Match type handling, values, and result display. |
| MW calibration | Present | Desktop includes area and improved table | Align columns, validation, and report content. |
| Lane/peak naming | Present | Present | Retain; sanitize rendered/exported values. |
| Single-lane report | Present | Present | Align output and iframe fallback behavior. |
| Full report | Present | Present | Align output and mobile download/print UX. |
| Wavelength presets | Missing | Present | Add in a collapsible mobile settings sheet after correctness decision. |
| Custom wavelength | Missing | Present | Add only with clear “RGB projection” wording. |
| Bandwidth | Missing | UI present but backend effect not implemented | Do not port as active. Hide/disable until shared fix defines behavior. |
| Invert colours | Missing | Present | Add with shared backend parameter and visual parity. |
| Quick guide | Present | Newer guide | Merge content and mobile-specific instructions. |
| Guidance toasts | Limited | Present in newer Streamlit frontend | Port mobile-friendly messages without blocking workflow. |
| Session shutdown/watchdog | Not relevant to Streamlit component | Desktop lifecycle is browser-scoped by Streamlit | Do not add Flask heartbeat/shutdown code to mobile Streamlit. |

### 3.2 Alignment order

#### Slice A — analytical correctness

- Backend parity for profiles and crop.
- Peak detection parameters.
- Manual area recalculation.
- Relative, area calibration, and MW tables.
- Matching report numbers.

This slice is completed before adding wavelength UI.

#### Slice B — lane/geometry behavior

- Origin/front interaction improvements.
- Mark snapping.
- Lane-width calculation.
- Selection/movement behavior.
- Clear mobile guidance when lines or marks are missing.

#### Slice C — image/filter capabilities

- Invert colours.
- Full RGB and named channel projections.
- Custom RGB projection control.
- Clear terminology that does not imply unavailable spectral resolution.
- Bandwidth remains hidden until implemented and validated.

#### Slice D — reporting and usability

- Desktop-equivalent quantitative table content.
- Export lane/full report.
- Consistent labels, types, manual flags, and settings metadata.
- Updated quick guide.
- Touch-size controls, loading status, and errors.

### Phase 3 exit criteria

- Feature matrix is signed off item by item.
- Shared fixtures yield equivalent desktop/mobile analytical output.
- Phone workflows remain understandable without showing a desktop sidebar.
- Reports agree on values and required metadata.
- Deferred features are explicitly documented rather than silently omitted.

## Phase 4 — high-priority improvements across both apps

**Goal:** address confirmed high-priority issues after the mobile Streamlit version reaches functional parity, while making only narrow, regression-tested desktop changes.

### Priority 1: numerical consistency

1. Define one peak-area convention for automatic and manual integration.
2. Make the visible bounds correspond to the reported area, or display both base bounds and visual threshold bounds explicitly.
3. Fix/verify manual add, apex move, and boundary move in both apps.
4. Reject duplicate MW calibration Rf values that cause zero-length interpolation segments.
5. Validate calibration values, units, correction ratios, and finite-number inputs.
6. Add golden-array and golden-image regression tests.

Desktop impact: calculation-only changes with before/after fixtures; no lifecycle or layout change.

### Priority 2: wavelength/bandwidth correctness

1. Decide what the feature scientifically represents: RGB channel projection, not arbitrary spectral reconstruction from a phone image.
2. Rename labels/help accordingly.
3. Either define and implement a real bandwidth calculation over RGB response assumptions or remove the bandwidth control.
4. Include filter settings in backend cache keys and reports.
5. Validate visual and analytical filtering use the same settings.

Desktop impact: narrow correction to an existing feature; retain the established control location unless removal is chosen.

### Priority 3: bridge request reliability

1. Echo request IDs through Python responses.
2. Debounce rapid parameter changes.
3. Apply only the latest valid response for each action type.
4. Show pending/error state.
5. Prevent duplicate Streamlit reruns from replaying responses.

Desktop impact: internal reliability only; no user-visible session model change.

### Priority 4: HTML and export safety

1. Stop interpolating lane and peak names directly into executable HTML attributes.
2. Use DOM properties/`textContent` for live UI values.
3. Escape report content and sanitize filenames.
4. Test malicious/special names containing quotes, tags, ampersands, slashes, and Unicode.

Desktop impact: internal rendering hardening; appearance should remain unchanged.

### Priority 5: backend limits and memory

1. Validate decoded image size and dimensions before expensive processing.
2. Bound lane count and numeric parameters.
3. Replace the entry-count image cache with a byte-bounded strategy or Streamlit-aware resource cache.
4. Avoid retaining multiple color/grayscale copies for many user images.
5. Measure memory under concurrent sessions using the available Streamlit plan limits.
6. Return safe structured errors.

Desktop impact: protective validation only; valid current workflows must continue to work.

### Priority 6: dependencies and configuration

1. Pin tested top-level runtime versions.
2. Remove unused `scikit-optimize` if no live action uses it.
3. Use a supported Python version.
4. Review `.streamlit/config.toml`, especially disabled CORS/XSRF protections.
5. Test the component with safer defaults before changing the deployed desktop configuration.
6. Add automated dependency and secret scanning.

Desktop configuration changes require a preview deployment and rollback plan.

## Phase 5 — release, deployment, and cutover

### 5.1 Preview deployment

- Deploy the mobile branch as a separate Streamlit app/subdomain.
- Keep the current mobile deployment available during validation.
- Use the same Python/runtime family as the desktop app where compatible.
- Record commit hash and backend/protocol version in an About/diagnostic view.

### 5.2 Test matrix

| Surface | Minimum coverage |
|---|---|
| iOS | Current Safari on at least one physical iPhone; portrait/landscape; camera/upload; keyboard; report. |
| Android | Current Chrome on at least one physical Android phone; portrait/landscape; camera/upload; report. |
| Small viewport | 320 px CSS width. |
| Common viewport | Approximately 390 × 844. |
| Tablet | Portrait and landscape. |
| Desktop regression | Current desktop Streamlit application on Chrome/Edge or its established supported browser set. |
| Network | Normal, slow, interrupted during profile request, reconnect/retry. |
| Images | Representative JPEG/PNG, rotated, large, dark, bright, and flat/invalid. |

### 5.3 Production cutover

1. Freeze release candidate commit.
2. Run automated and manual acceptance suites.
3. Export known reports and compare with baselines.
4. Deploy the exact tested commit.
5. Run production smoke checks.
6. Keep prior mobile deployment/commit available for rollback.
7. Monitor startup errors, backend exceptions, request latency, and memory.
8. Announce deferred PWA/install/offline limitations accurately.

### 5.4 Rollback criteria

Rollback if any of the following occurs:

- camera/upload is unavailable on a supported phone;
- Streamlit reruns clear the active project unexpectedly;
- crop/profile requests repeatedly time out or replay stale data;
- analytical fixture results differ beyond approved tolerance;
- reports lose data or cannot be downloaded;
- memory causes repeated application restarts;
- a high-impact security issue is discovered.

## 9. Testing strategy

### 9.1 Python unit tests

Test pure backend functions with generated and approved fixture images:

- base64 decoding and invalid input;
- crop bounds, negative drag dimensions, rotation, empty crop;
- dark, bright, and default polarity;
- flat profiles;
- smoothing and baseline behavior;
- peak prominence/distance/threshold limits;
- Rf filtering;
- area calculation;
- filter/invert settings;
- cache limits;
- oversized image rejection.

### 9.2 JavaScript unit tests

- Rf calculation and edge cases.
- Manual peak-area calculation.
- Calibration curves and duplicate/invalid standards.
- Coordinate transforms and inverse transforms.
- state snapshot/undo.
- storage schema migration and corrupt storage recovery.
- request ID generation and stale-response rejection.
- HTML escaping/filename sanitization.

### 9.3 Contract tests

For each Streamlit action:

- validate request schema;
- call the action router/backend;
- validate response envelope;
- verify request ID echo;
- verify safe error structure;
- verify unknown action handling;
- verify duplicate request handling.

### 9.4 Browser tests

Automate the non-camera path at phone viewports:

1. Load component and receive readiness.
2. Upload an approved fixture.
3. Draw or inject known geometry through supported UI steps.
4. Find lanes and wait for profiles.
5. Change peak settings rapidly and confirm latest result wins.
6. Add/move/resize/delete a peak and confirm area changes.
7. Switch table/calibration modes.
8. Crop, undo, and reset.
9. Export a lane and full report.
10. Reload and verify intended mobile local recovery.

Camera opening itself remains a physical-device/manual check because browser automation cannot validate the complete native capture flow reliably.

### 9.5 Desktop regression tests

Because desktop changes are intentionally minimal, focus on protecting established behavior:

- page/component readiness;
- upload and Find Lanes;
- profile/peak results for fixtures;
- calibration tables;
- exports;
- browser-session lifecycle;
- no new persistence across a closed/reopened browser session;
- unchanged layout and primary control flow.

## 10. Detailed file-level implementation map

### New mobile files

| File | Planned role |
|---|---|
| `streamlit_app.py` | Component declaration, protocol routing, session response handoff, page config. |
| `tlc_backend.py` | Pure image/profile/crop computation with validation. |
| `.streamlit/config.toml` | Minimal tested Streamlit Cloud settings. |
| `frontend/modules/streamlit_bridge.js` | Early-ready-compatible Streamlit messaging. |
| `frontend/modules/api.js` | Action client, request correlation, stale response protection. |
| `frontend/modules/storage.js` | Versioned mobile local persistence. |
| `frontend/modules/ui.js` | Mobile tabs, menus, status, toasts, accessibility. |
| `frontend/modules/tables.js` | Mobile quantitative/calibration table rendering. |
| `tests/**` | Numerical, protocol, storage, and browser regression coverage. |

### Files to split/move

| Current file | Destination |
|---|---|
| Root `app.js` | Small `frontend/app.js` plus modules listed above. |
| Inline CSS in `index.html` | `frontend/index.css`. |
| Root `index.html` | `frontend/index.html` with early component bootstrap. |
| Root `guide.html` | `frontend/guide.html`, updated after parity work. |
| Live parts of `server.py` | `tlc_backend.py` and temporary legacy Flask adapter. |
| Useful parts of `core/algorithms.py` | Consolidated into the tested backend or removed after migration. |

### Files not removed until cutover

- `server.py`
- existing root `index.html`, `app.js`, and related Flask assets
- Docker/Hugging Face deployment files
- old service worker/manifest assets

Removal or archival occurs only after production Streamlit acceptance and a retained rollback tag.

## 11. Work sequencing and dependencies

```text
Baseline fixtures and deployment record
  ↓
Mobile modular refactor under existing Flask transport
  ↓
Fix mobile manual-integration correctness
  ↓
Introduce transport interface
  ↓
Add Streamlit component bridge + pure Python backend
  ↓
Deploy mobile preview on Streamlit
  ↓
Align desktop analytical/geometry/report features into mobile
  ↓
Run cross-app golden-result comparison
  ↓
Apply narrow high-priority fixes to both apps
  ↓
Device acceptance, production deployment, rollback readiness
```

The Streamlit migration must not be attempted by editing the current monolithic `app.js` in place and simultaneously adding all desktop features. Separating refactor, transport migration, and feature parity makes regressions attributable and reversible.

## 12. Checkpoints and review gates

### Checkpoint A — modular mobile parity

Review:

- module boundaries;
- current mobile workflow;
- no Streamlit dependency yet;
- manual area fix;
- storage migration.

Approval allows Streamlit transport work.

### Checkpoint B — local Streamlit mobile

Review:

- component startup;
- bridge action contract;
- upload/camera strategy;
- crop/profile round trips;
- state survival across reruns;
- phone layout.

Approval allows cloud preview deployment.

### Checkpoint C — functional alignment

Review the feature matrix and desktop/mobile result comparison. Any desktop feature not included must have an explicit defer reason.

### Checkpoint D — shared high-priority fixes

Each desktop change requires:

- isolated issue statement;
- fixture demonstrating the defect;
- narrow patch;
- desktop regression evidence;
- no session lifecycle or layout change.

### Checkpoint E — production readiness

Review physical-device testing, cloud memory/latency, reports, rollback, and product wording about PWA/offline capability.

## 13. Relative effort estimate

These are planning ranges, not fixed commitments. They assume one experienced implementer, access to the deployed Streamlit app, and timely access to representative plate images and physical phones.

| Phase | Indicative effort |
|---|---:|
| Phase 0 — baseline and gates | 1–2 working days |
| Phase 1 — modular mobile refactor | 4–7 working days |
| Phase 2 — Streamlit component migration | 3–5 working days |
| Phase 3 — desktop feature alignment | 5–9 working days |
| Phase 4 — high-priority shared fixes | 4–8 working days |
| Phase 5 — device testing and cutover | 2–4 working days |

Expected engineering range: approximately **19–35 working days**, excluding formal scientific-method validation and delays obtaining devices/fixtures.

The range can be reduced by deferring wavelength UI, full automated browser coverage, or installable-PWA work, but numerical correctness, Streamlit request reliability, camera/upload validation, and rollback should not be compressed out of v1.

## 14. Risks and mitigations

| Risk | Likelihood/impact | Mitigation |
|---|---|---|
| Streamlit iframe camera behavior differs across mobile browsers | Medium/High | Direct input elements, early physical-device spike, upload fallback. |
| Streamlit reruns replay or reorder responses | Medium/High | Request ID echo, action-specific latest ID, debounce, structured dispatcher. |
| Base64 image messages stress Streamlit WebSocket/session memory | Medium/High | Preserve bounded resize, measure payload/memory, reject oversized images, byte-bounded cache. |
| Refactor changes gestures or geometry | Medium/High | Flask parity checkpoint before transport migration; viewport/browser regression tests. |
| Desktop feature port makes mobile controls overcrowded | High/Medium | Mobile settings sheet and tabs; port behavior, not desktop layout. |
| Mobile local storage behaves differently under component URLs | Medium/Medium | Storage spike in deployed preview; versioned schema; explicit recovery/export. |
| PWA install prompt unavailable under Streamlit | High/Medium | Early decision gate; avoid unverified PWA claims; separate shell if mandatory. |
| Wavelength feature is copied with known bandwidth defect | High/Medium | Hide bandwidth in mobile until shared implementation is defined. |
| Desktop regression from shared fixes | Low/High | Narrow patches after mobile parity, fixtures, preview deployment, rollback. |
| Scientific results differ between versions | Medium/High | Shared backend fixtures and tolerance-based golden tests. |

## 15. Release deliverables

The completed v1 work should produce:

1. Modular mobile frontend source.
2. Mobile `streamlit_app.py` and `tlc_backend.py`.
3. Versioned bridge protocol documentation.
4. Streamlit Community Cloud deployment configuration.
5. Automated unit/contract/browser tests.
6. Approved golden fixtures and expected results.
7. Mobile/desktop feature parity checklist.
8. Updated mobile guide and README.
9. Deployment and rollback runbook.
10. Known limitations document, including PWA/offline and spectral-filter wording.
11. Narrow desktop patches for only approved high-priority shared fixes.
12. Release notes stating that desktop session lifecycle and UX were intentionally preserved.

## 16. v1 definition of done checklist

### Mobile maintainability

- [ ] `app.js` is bootstrap-only.
- [ ] State, canvas, events, API, storage, profiles, tables, export, and UI are separate modules.
- [ ] CSS has one active source.
- [ ] No inline handlers depend on global mutable state.
- [ ] Legacy Flask transport is isolated from UI logic.

### Streamlit deployment

- [ ] `streamlit run streamlit_app.py` works locally.
- [ ] Preview and production Community Cloud deployments are reproducible.
- [ ] Component readiness does not time out.
- [ ] Crop/profile responses are correlated by request ID.
- [ ] Streamlit reruns do not wipe mobile project state.
- [ ] Camera and upload work on supported physical devices.

### Functional parity

- [ ] Desktop/mobile shared fixtures produce equivalent profiles and peaks.
- [ ] Lane calculation and snapping align with desktop reference behavior.
- [ ] Relative, area calibration, and MW modes align.
- [ ] Reports contain equivalent numerical results.
- [ ] Invert/filter features follow the approved parity decision.
- [ ] Bandwidth is implemented correctly or explicitly not exposed.

### High-priority quality

- [ ] Manual peak areas recalculate correctly.
- [ ] Stale responses cannot overwrite newer results.
- [ ] User-entered names are safely rendered/exported.
- [ ] Backend inputs and memory are bounded.
- [ ] Calibration edge cases are validated.
- [ ] Runtime dependencies are supported and reproducible.

### Desktop protection

- [ ] Desktop layout is unchanged except for separately approved defect fixes.
- [ ] Desktop browser-session lifecycle is unchanged.
- [ ] No server-side persistence has been added to desktop.
- [ ] Desktop regression fixtures and workflows pass.
- [ ] Every desktop patch has an isolated rollback.

### Release

- [ ] Physical iOS and Android checks pass.
- [ ] Known limitations are documented accurately.
- [ ] Production smoke test passes.
- [ ] Prior version can be restored quickly.

## 17. Recommended first implementation increment

The first coding increment should stop after Phase 1 and should not yet deploy to Streamlit. Its deliverable is a modular mobile app still running against the current local Flask API, with the manual peak-area defect fixed and behavior checks in place.

That checkpoint creates the safest foundation for the Streamlit bridge. Once approved, Phase 2 can reuse the proven `AQ-TLC-streamlit` component pattern with far less risk, and Phase 3 can add desktop functionality into clean mobile modules instead of extending the present monolith.
