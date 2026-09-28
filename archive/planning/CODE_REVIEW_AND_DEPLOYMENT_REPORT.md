# AQ-TLC Mobile PWA and Desktop App: Code Review and Deployment Report

**Review date:** 25 September 2026
**Scope:**

- Mobile/PWA folder: `C:\Users\Giancarlo\Desktop\Antigravity work files\TLC App PWA`
- Related desktop folder: `C:\Users\Giancarlo\Desktop\Antigravity work files\TLC app`
- Requested outcome: assessment only; no application source code has been changed.

## 1. Executive summary

The mobile folder contains a real mobile-oriented web application, not merely a copy of the desktop UI. It has a touch-first layout, camera input, pointer/pinch interactions, a web manifest, local autosave, and a service-worker file. The landing page renders cleanly at a 390 × 844 phone viewport.

However, it is not currently a complete, dependable PWA:

- `sw.js` is never registered, so the service worker does not run.
- The analytical functions depend on the Flask server, so even a corrected service worker would only cache the shell; analysis would still require a network connection.
- Installation compatibility is incomplete, especially for iOS icons and install guidance.
- Several workspace controls are smaller than good mobile touch targets and the viewport disables user zoom.

The desktop app is the more recent implementation. Its frontend has been split into modules and it contains later functionality such as wavelength/invert controls and Windows standalone lifecycle handling. The mobile version forked earlier and has already drifted from it. The two applications should not continue to carry separate copies of the analytical backend.

The highest-priority findings are:

1. **Critical security exposure:** both Flask apps will serve arbitrary files from the repository root. Read-only tests confirmed that `/server.py`, `/requirements.txt`, and `/.git/config` return HTTP 200. A public deployment can therefore expose source code and Git repository data.
2. **Critical mobile calculation defect:** manually added mobile peaks receive a fixed area of `10`, and moving a peak or its bounds does not recalculate the area. Relative percentages and calibration results can therefore be wrong after manual editing.
3. **High deployment risk:** both Dockerfiles start Flask's development server with `python server.py`; this is not appropriate for public production use.
4. **High PWA defect:** the service worker is present but unregistered. The install experience described in the README is therefore not reliably available.
5. **High scientific/functional defect:** the desktop “bandwidth” slider is sent to the server but ignored by both server and renderer. The control currently has no meaningful effect.
6. **High maintainability risk:** the backend algorithms are duplicated across apps, and the PWA also contains a second unused copy in `core/algorithms.py`.
7. **Deployment-platform mismatch:** the checked code is Flask + static HTML/JavaScript, not Streamlit. The repository metadata and workflows target Docker-based Hugging Face Spaces. A direct Streamlit Community Cloud deployment will not run the existing application unchanged.

### Overall recommendation

Keep the application as a Flask API plus responsive web frontend, consolidate desktop and mobile into one maintained codebase, and deploy it on a container-capable host. This is the shortest path to a reliable installable mobile experience.

If Streamlit Community Cloud is a mandatory business requirement, treat that as a rewrite or substantial adapter project rather than a deployment configuration change. A native Streamlit UI can be built, but the existing PWA shell, service worker, routing, and JavaScript API calls cannot simply be moved into Streamlit unchanged.

## 2. What is in the folders

### 2.1 Mobile/PWA folder

The folder is a compact Flask-served single-page application:

| Item | Purpose | Review observation |
|---|---|---|
| `index.html` | Mobile UI and a large block of inline CSS | Does not load `index.css`; styling is split between an unused file and inline CSS. |
| `app.js` | All client state, touch interaction, analysis UI, persistence, and report export | About 44 KB in one global script; difficult to test and maintain. |
| `server.py` | Static serving and image-analysis API | Contains most algorithms inline and exposes the repository root. |
| `core/algorithms.py` | Refactored algorithm functions | Not imported anywhere; duplicates logic in `server.py`. |
| `manifest.json` | PWA metadata | Present, but icon coverage is incomplete. |
| `sw.js` | Cache/service worker | Present but never registered. |
| `index.css` | Alternative mobile stylesheet | Not referenced by `index.html`; nevertheless included in the service-worker asset list. |
| `guide.html` | User guide | Not included in the offline cache list. |
| `Dockerfile` | Container build | Uses Python 3.9 and launches the Flask development server. |
| `requirements.txt` | Python dependencies | Partly pinned; missing `scikit-optimize`, although `/detect/optimize` imports `skopt`. |
| `.github/workflows/sync_to_hf.yml` | Deployment sync | Force-pushes `main` to Hugging Face Space `realgcp/TLC-APP-PWA`. |
| `archive/` | An older application copy | Git-ignored, but a local Docker build would include it because there is no `.dockerignore`. |

The Git working tree was clean before this report. It contains 15 tracked files. The configured remotes are GitHub and Hugging Face. The public Hugging Face Space was reachable as metadata during the review but reported as **paused**.

### 2.2 Desktop folder

The desktop folder is also a Flask web app, with a browser-based UI and a packaged Windows build:

| Item | Purpose | Review observation |
|---|---|---|
| `app.js` | ES-module entry point | Cleanly delegates to `modules/init.js`. |
| `modules/*.js` | State, rendering, profiles, events, export, coordinates, API, and workspace | A substantial maintainability improvement over the mobile monolith. |
| `server.py` | Flask/static server and analysis API | Newer than mobile; adds wavelength processing and standalone lifecycle behavior. |
| `dist_release/` | Windows standalone release | Approximately 920.7 MB extracted; ZIP is approximately 272.6 MB; executable is approximately 53.2 MB. |
| `sw.js` | Service worker cleanup | Unregisters itself, but is not referenced by the app. |
| `.github/workflows/sync_to_hf.yml` | Deployment sync | Creates an orphan deployment branch and pushes to Hugging Face Space `realgcp/AQ-TLC-Web`. |

The desktop repository is one local commit ahead of `origin/main`, so the latest standalone auto-shutdown change is not represented on the remote until it is pushed. The repository also tracks `server_error.log` despite `.gitignore` now excluding logs.

The packaged release contains a very broad Python environment, including packages unrelated to this app. The packaging process is not reproducible from the repository because the PyInstaller specification/build configuration is not tracked.

### 2.3 Important version drift

The desktop `server.py` is about 156 inserted lines ahead of the PWA server, mainly for wavelength filtering and standalone lifecycle behavior. The Dockerfiles are byte-for-byte identical even though the apps now have different runtime needs. The mobile README calls itself version 5.0/“Pro,” while the desktop UI calls itself version 1.0. There is no shared version source or API version.

## 3. Verification performed

The review included:

- Git status, history, remotes, branch state, and tracked-file inspection.
- Complete source inspection of both Flask servers, the PWA client, and the desktop frontend modules.
- Python syntax compilation of both servers and `core/algorithms.py`.
- JavaScript syntax checks for the PWA script, desktop entry point, and every desktop module.
- Flask test-client requests against both applications.
- A phone-sized visual check at 390 × 844 pixels.
- Comparison with current official Streamlit, Flask, and Python support documentation.

Results:

- Python and JavaScript syntax checks passed.
- The mobile landing page fits the tested phone viewport without page-level overflow; its two primary buttons were large and clear.
- Both apps returned 200 for `/health`.
- Both apps returned 200 for `/server.py`, `/requirements.txt`, and `/.git/config`, confirming the static-file exposure.
- Invalid `/generate_profiles` input returns a JSON error with HTTP 200 instead of a 4xx response.
- No automated application tests, lint configuration, type checks, dependency lock file, or CI test job were found.

The interactive analysis workflow was not run with a laboratory image in the browser. Numerical findings below are based on code paths and should be followed by reference-image validation.

## 4. Prioritized findings

| ID | Severity | Applies to | Finding | Required action |
|---|---|---|---|---|
| SEC-01 | **Critical** | Both | Catch-all `/<path:filename>` serves the entire repository, including source and `.git` content. | Serve only an explicit `static/` directory or allowlisted files. Ensure `.git`, Python, logs, build files, and secrets are outside the static root. |
| NUM-01 | **Critical** | Mobile | Manual peak add sets `area: 10`; manual peak/boundary movement does not recalculate area. | Use one shared area-integration function for automatic and manual edits; add regression tests. |
| DEP-01 | **High** | Both | Docker launches Flask's development server. | Use a production WSGI server and platform-aware worker/timeout settings. |
| PWA-01 | **High** | Mobile | `sw.js` is never registered. | Register it after page load, handle updates, and test installability on Android and iOS. |
| PWA-02 | **High** | Mobile | Analysis requires live Flask endpoints, so the app is not analytically offline-capable. | Clearly label “online required,” or implement on-device analysis if true offline operation is required. |
| SCI-01 | **High** | Desktop | `wavelength_bandwidth` is collected and transmitted but never used. | Implement a defined algorithm or remove/disable the control. Do not present it as functional meanwhile. |
| SCI-02 | **High** | Both | “Wavelength filtering” is inferred from an ordinary RGB photo; it is not equivalent to spectral selection. | Rename it as an RGB/channel projection unless validated against calibrated spectral data. Document limitations. |
| ARC-01 | **High** | Both | Backend algorithms are copied across servers; PWA has an additional unused copy. | Create a shared `tlc_core` Python package and thin API routes. |
| API-01 | **High** | Both | No request-size, pixel-count, list-length, or parameter bounds at the API boundary. | Add `MAX_CONTENT_LENGTH`, image/pixel limits, schema validation, and bounded lane/optimization work. |
| API-02 | **High** | Both | CPU-heavy, unused detection/optimization endpoints are public; CORS allows every origin. | Remove unused endpoints from production or protect/rate-limit them; restrict or remove CORS for same-origin UI. |
| MEM-01 | **High** | Both | Global cache holds up to 40 decoded color/gray arrays without a byte limit and is shared across users. | Use a byte-bounded LRU or request-local processing; measure worker memory. |
| UX-01 | **High** | Both | Slider `input` events issue repeated full-image requests without debounce, cancellation, or response ordering. | Debounce; cancel prior request with `AbortController`; discard stale responses by request ID. |
| DEP-02 | **High** | Mobile | `scikit-optimize` is missing from requirements while code imports `skopt`. | Add/pin it if the endpoint remains, or remove the unused endpoint/code. |
| DEP-03 | **High** | Both | Container base is Python 3.9, which reached end-of-life on 31 October 2025. | Move to a supported Python version, preferably 3.12 or 3.13 after compatibility testing. |
| SEC-02 | **Medium–High** | Both | User-entered lane/peak names are interpolated into `innerHTML` and exported HTML without escaping. | Build DOM with `textContent`/properties and HTML-escape report fields and filenames. Add a CSP. |
| API-03 | **Medium** | Both | Exceptions often return HTTP 200 with internal error text and traceback logging. | Return consistent 400/413/422/500 responses with safe messages and request IDs. |
| OPS-01 | **Medium** | Desktop | Every browser sends a heartbeat every 2 seconds, even on hosted deployments. | Enable lifecycle traffic only in frozen standalone mode or through a build/runtime flag. |
| OPS-02 | **Medium** | Desktop | `/api/shutdown` accepts GET and POST and is publicly reachable, although exit occurs only when frozen. | Make it standalone-only, POST-only, loopback-only, and token-protected if retained. |
| DATA-01 | **Medium** | Mobile | Autosave uses unguarded `localStorage` for the entire base64 image/project. | Move projects to IndexedDB; add schema/versioning, quota handling, corruption recovery, and explicit delete/export. |
| DATA-02 | **Medium** | Desktop | No project save/restore is present. A refresh or browser close loses the analysis. | Add project export/import and optional autosave, ideally shared with mobile. |
| IMG-01 | **Medium** | Both | Every upload is downscaled to 1000 px and recompressed to lossy JPEG at quality 0.9. | Preserve an original/lossless analysis image or make processing resolution explicit and validated. |
| CAL-01 | **Medium** | Both | Calibration has no units, fit diagnostics, uncertainty, blank handling, weighting, or range warnings. | Add method metadata, minimum-standard rules, R²/residuals, range/extrapolation warnings, and units. |
| TEST-01 | **High** | Both | There are no automated tests or validated reference datasets. | Add unit, API, browser, PWA, and numerical regression tests before claiming high-precision use. |
| ACC-01 | **Medium** | Mobile | Viewport disables pinch-to-zoom; icon/abbreviated controls lack accessible names/labels. | Remove `user-scalable=no`; add labels, ARIA names, focus states, and keyboard paths. |
| BUILD-01 | **Medium** | Both | No `.dockerignore`; local builds can include `.git`, archives, caches, logs, images, and releases. | Add a strict `.dockerignore`; use a non-root runtime user and multi-stage/minimal build. |
| CI-01 | **Medium** | Both | Deployment workflows contain no tests/security scan and use `actions/checkout@v3`. | Add quality gates, upgrade/pin actions, build once, scan, then deploy. |
| PKG-01 | **Medium** | Desktop | Windows release is extremely large and built from an overfull environment. | Rebuild from a clean locked environment, track the build spec, and exclude unused packages/test data. |

## 5. Detailed mobile/PWA review

### 5.1 What is good

- The landing page is clear, visually coherent, and genuinely phone-oriented.
- Upload and camera paths are separated.
- Pointer events and two-finger pan/zoom are implemented for the main canvas.
- A bottom toolbar and tabbed Image/Profile/Table workflow are more suitable for a phone than the desktop three-column layout.
- Safe-area padding is used at the bottom.
- Images are reduced before upload, which improves latency and request size, although the scientific trade-off needs validation.
- There is undo state and local autosave.
- The API is same-origin by default, which makes deployment simpler once unnecessary global CORS is removed.

### 5.2 PWA/installability defects

`index.html` links the manifest, and `sw.js` defines cache behavior, but no code calls `navigator.serviceWorker.register(...)`. Consequently:

- the cache does not activate;
- there is no service-worker-controlled page;
- the PWA install prompt is unlikely to satisfy normal Chromium install criteria;
- the “Install App” button remains hidden unless the browser independently fires `beforeinstallprompt`;
- iOS, which does not use `beforeinstallprompt`, receives no Add to Home Screen guidance.

Even after registration, the current service worker would not provide full offline operation. It caches HTML/CSS/JS/manifest/icon only. `/generate_profiles` and `/detect/crop` require the Python server. The product should state whether it is an **installable online app** or a **fully offline app**; those are different requirements.

Recommended PWA work:

1. Add guarded service-worker registration and an update/reload flow.
2. Choose a deliberate caching strategy: network-first for navigation, cache-first or stale-while-revalidate for versioned assets, and no caching of analysis POST responses.
3. Cache `guide.html` and a local font set if offline shell behavior is promised.
4. Generate at least 192 × 192 and 512 × 512 PNG manifest icons, a maskable icon with a correct safe zone, and appropriate Apple touch icons. Keep SVG as an additional asset, not the only primary icon.
5. Add an `id` to the manifest and consider manifest screenshots/shortcuts.
6. Add an iOS-specific install help message.
7. Test install, update, launch, and offline fallback on physical Android/iOS devices over HTTPS.

### 5.3 Mobile layout and accessibility

The tested landing viewport was good, but the workspace has risks visible in source:

- `maximum-scale=1.0, user-scalable=no` prevents users with low vision from zooming.
- Several sidebar buttons are 30–40 px and inputs are 35 px wide, below a comfortable 44–48 px touch target.
- `D`, `S`, `B`, the radar icon, settings icon, and emoji tool buttons depend on visual context and lack explicit accessible names.
- Labels such as `Pol.`, `Prom.`, `Dist.`, and `Thresh` are difficult for occasional users.
- The right sidebar has no explicit vertical scrolling. It can be clipped on short phones or landscape orientation.
- Fixed `100vh` can conflict with mobile browser chrome and the on-screen keyboard. Use `100dvh` with a fallback.
- Bottom safe-area padding exists, but equivalent top/side safe-area treatment is incomplete.
- There is no visible busy state, progress, retry action, offline indicator, or user-facing server error.
- A lane/name input can cause the mobile keyboard to cover the profile/table without a keyboard-aware layout.

Recommended UX changes:

- Use a collapsible settings sheet instead of the permanently narrow right rail.
- Use full terms with tooltips/help and accessible labels.
- Ensure all interactive targets are at least 44 × 44 CSS pixels.
- Add clear steps: image → origin/front → spotting marks → lanes → peaks → report.
- Disable or queue actions while analysis is running, and show progress/failure.
- Add explicit “Save project,” “Export project,” and “Delete local project” controls.
- Test 320 px width, common iPhone/Android sizes, landscape, large text, and reduced motion.

### 5.4 Mobile numerical bug: manual integration

In `app.js`, a new manual peak is created with `area: 10`. Moving the apex updates index, height, Rf, and bounds, but not area. Moving a boundary also changes only `lb`/`rb`. The displayed area, relative percentage, corrected percentage, and calibration input can therefore stop matching the highlighted integration window.

This must be fixed before deploying the mobile app for quantitative use. The area routine should:

- receive the same profile, lower/upper bounds, and baseline rule for every pathway;
- be called after automatic detection, add, apex move, and boundary move;
- explicitly define whether the visual FWHM region or the wider peak-base region is integrated;
- be covered by numerical regression tests with known arrays.

The desktop module already recalculates areas during manual editing and can provide a starting point, although its automatic and manual conventions still need to be made consistent.

### 5.5 Mobile maintainability

The 44 KB global `app.js` combines state, lifecycle, drawing, gestures, API calls, calculations, HTML generation, persistence, and export. The desktop modularization is markedly better. Mobile should adopt the same module boundaries and share pure functions rather than copying desktop code manually.

`index.css` is currently unused, while most live CSS is inline in `index.html`. Choose one source of truth. The service worker should not precache a stylesheet that the page does not load.

`core/algorithms.py` is also unused. Leaving a second algorithm implementation next to the live one creates false confidence and drift. Either make it the imported implementation or remove it.

## 6. Detailed desktop review

### 6.1 What is good

- The ES-module split is clear and substantially easier to review.
- Central constants and state reduce some duplication.
- UI event delegation in the profile table is better than the mobile inline handlers.
- Manual area recalculation is present in desktop profile editing.
- Image filtering has a cached render path.
- The standalone build has explicit browser launch and shutdown behavior.
- Report export has a fallback download path when popup writing fails.

### 6.2 Wavelength and bandwidth behavior

The feature is labelled “Wavelength Filtering” and includes target wavelength plus bandwidth. In the current implementation:

- the renderer uses only `targetWavelength` and `invertColors` in its cache key;
- the renderer does not use `wavelengthBandwidth`;
- the client sends `wavelength_bandwidth` to `/generate_profiles`;
- the server reads only `target_wavelength` and ignores bandwidth;
- the server derives a weighted grayscale value from the three RGB channels using a wavelength-to-RGB approximation.

Therefore, moving the bandwidth slider triggers analysis traffic but does not change the result. This is a functional defect.

More importantly, an RGB camera image contains three broad, device-dependent channels. It cannot reconstruct a narrow-band measurement at an arbitrary wavelength. The feature can be useful as a colour-channel projection, but terms such as “UV-254” and an exact nanometre/bandwidth selector imply spectral specificity that the input does not contain.

Recommended action:

- Immediately relabel the feature as “RGB colour-channel filter (experimental)” or hide it.
- Remove the bandwidth control until there is an implemented and validated definition.
- If wavelength-specific measurements are required, accept images acquired using known illumination/filter hardware and calibration, store that acquisition metadata, and validate against reference measurements.

### 6.3 Hosted versus standalone behavior

`modules/init.js` sends a heartbeat every two seconds for every client. The server only shuts down when packaged/frozen, but hosted users still generate unnecessary heartbeat and page-close traffic. Ten concurrent hosted users would produce about 300 extra requests per minute.

Make standalone lifecycle code conditional at build/runtime. For the local packaged app:

- bind to `127.0.0.1`, not `0.0.0.0`;
- expose shutdown as POST only;
- require a per-launch token;
- do not rely solely on browser `pagehide`, which also fires in navigation/cache scenarios.

For hosted mode, omit the endpoints and client traffic entirely.

### 6.4 Project persistence and reproducibility

The desktop app has no persistent project model. A user can produce a detailed analysis and lose it on refresh. Reports also omit important provenance.

Add a versioned project format containing:

- original image hash, dimensions, and optional original image;
- processed image and crop/rotation;
- origin/front lines, spotting marks, lane geometry, peak bounds, and manual-edit flags;
- all detection/integration/filter settings;
- calibration standards, units, model, fit statistics, and warnings;
- application/core algorithm version and timestamp.

The exported report should include the relevant subset of this metadata so results can be reproduced.

### 6.5 Windows package

The extracted standalone release is about 920.7 MB, with a 272.6 MB ZIP. Its `_internal` tree includes many packages and test datasets unrelated to this app. Likely causes are building from a broad development environment and not tracking a constrained PyInstaller specification.

Recommended packaging changes:

- Build from a clean, locked virtual environment containing only runtime dependencies.
- Track the `.spec` file and build script in source control.
- Explicitly include the required HTML/CSS/JS/assets and explicitly exclude notebooks, plotting stacks, schema/test data, and unrelated packages.
- Generate checksums and a signed release where appropriate.
- Run the packaged executable in CI or a clean Windows VM as a smoke test.

## 7. Shared backend, API, and security review

### 7.1 Static-file exposure

Both servers define:

```python
@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory(STATIC_DIR, filename)
```

Because `STATIC_DIR` is the repository/application root, every readable file under it becomes a candidate web asset. Path traversal is mitigated by Flask's helper, but over-broad publication is not. The confirmed `.git/config` response means Git objects and references may also be retrievable, allowing significant repository reconstruction.

Required design:

- Put public assets under a dedicated `static/` directory.
- Configure Flask with explicit static handling or allowlist the small set of root files.
- Keep the server, dependencies, `.git`, logs, reports, archives, and user data outside that directory.
- Add tests asserting 404 for `/server.py`, `/.git/config`, `/requirements.txt`, logs, and traversal attempts.
- Add `.dockerignore` and verify the final image contents.

### 7.2 Input and resource controls

Every analysis request accepts base64 image data and arrays without schema validation or meaningful limits. Public users can submit very large images, many lanes, extreme parameters, or repeated optimization requests. The optimization endpoint performs 50 Bayesian optimization calls and is not used by either current frontend.

Add:

- Flask `MAX_CONTENT_LENGTH` and reverse-proxy/body limits;
- strict JSON schema/model validation;
- decoded-image byte, pixel, width, and height limits before expensive conversion;
- numeric bounds and finite-number checks;
- maximum lane/mark/line counts;
- request timeouts and rate limiting for public deployments;
- a smaller, byte-bounded cache or no cross-request image cache;
- authentication if data or compute must not be public.

### 7.3 Error and observability behavior

Many exception handlers return `{'error': ...}` with HTTP 200. The clients often ignore non-result responses and only write to the console. This makes outages look like empty analyses.

Use consistent error responses, for example:

- 400 for malformed JSON/fields;
- 413 for oversized uploads;
- 422 for valid JSON with invalid geometry/parameters;
- 429 for rate limits;
- 500 with a generic message and server-side request ID.

Use structured logging with latency, status, algorithm version, image dimensions, and anonymized request ID. Do not log images or sensitive sample names.

### 7.4 CORS and headers

The UI and API are served from the same origin, so `CORS(app)` is not necessary for the normal architecture. Global `Access-Control-Allow-Origin: *` makes the compute endpoints callable from unrelated sites.

Remove CORS unless there is a documented cross-origin client. If retained, allow only known origins and methods. Also set:

- a Content Security Policy compatible with locally hosted fonts/scripts;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy`;
- appropriate `Permissions-Policy`;
- frame restrictions unless embedding is intentionally supported;
- secure cache headers for HTML/API and immutable headers for fingerprinted assets.

### 7.5 Production server and container

Both Dockerfiles end with `CMD ["python", "server.py"]`. Flask's official guidance says not to use its development server in production because it is not designed to be secure, stable, or efficient.

For a Linux container, use a production WSGI server such as Gunicorn. Worker count must be chosen conservatively because OpenCV/NumPy arrays and the global cache are memory-heavy. Long optimization endpoints should be removed or moved to a job queue instead of extending all web request timeouts.

The container should also:

- use Python 3.12 or 3.13 after tests;
- install locked, hashed dependencies;
- run as a non-root user;
- include a health check;
- avoid copying `.git`, `archive`, releases, logs, images, and caches;
- emit the application version/commit at `/health` without exposing sensitive details.

For the Windows local executable, use a production-quality server that supports Windows, such as Waitress, rather than Flask's development server.

## 8. Scientific and quantitative review

This is a code-quality review, not an analytical-method validation. The application should not describe itself as “high-precision” without a documented validation set and acceptance criteria.

### 8.1 Image acquisition is the dominant uncertainty

Phone cameras automatically alter exposure, white balance, sharpening, denoising, tone curves, HDR, compression, and lens shading. Current code does not capture or control these variables. Downscaling and JPEG recompression add another transformation.

Recommended acquisition protocol:

- fixed camera/plate distance and orthogonal alignment;
- even, known illumination and shielding from ambient light;
- exposure, focus, white-balance, and HDR lock where the platform allows it;
- a reference background and ideally a calibration/grey strip in every image;
- glare/saturation detection;
- perspective correction using plate corners/fiducials;
- stored acquisition metadata and warnings when quality criteria fail.

### 8.2 Lane geometry and Rf

Lane construction pairs lines and assigns marks using nearest-distance heuristics. The Rf formula then assumes the lane box is exactly 1.10 times solvent distance with 5% padding at each end. This works only if the generated geometry remains consistent with those assumptions.

Prefer calculating Rf directly from the detected/drawn origin and front line intersections along each lane axis. This handles rotated or nonparallel lines more explicitly and removes duplicated hard-coded constants between Python and JavaScript. Perspective rectification should occur before densitometry.

### 8.3 Baseline and peak integration

The rolling-median window is fixed at 50% of lane height. This may suppress broad peaks or behave differently for short lanes. Automatic detection calculates area between broad `left_bases`/`right_bases` while displaying narrower threshold/FWHM bounds. Manual editing then integrates the visible bounds in desktop, and fails to recalculate in mobile. The meaning of “Area” is therefore not uniform.

Required changes:

- define the reported integration bounds and make the visual region match them;
- expose or document the baseline algorithm and window;
- test narrow, broad, overlapping, saturated, edge, and flat peaks;
- prevent double-counting overlapping integration windows or explicitly define it;
- report raw and baseline-corrected signals where useful;
- record whether a peak or boundary was manually edited.

### 8.4 Calibration

The area calibration uses a through-origin one-point function for one standard and ordinary least squares for two or more. The MW calibration uses piecewise log-linear interpolation/extrapolation and can divide by zero when standards share the same Rf.

Recommended changes:

- require an explicitly chosen calibration model;
- validate minimum count and unique independent-variable values;
- display units, equation, R², residuals, range, and extrapolation status;
- distinguish standards, unknowns, blanks, and controls;
- support replicates and defined aggregation;
- define whether zero-intercept is forced;
- validate absorbance/response correction semantics (`absRatio`) and allowable values;
- block zero/negative/NaN standards and zero/negative correction ratios.

### 8.5 Validation suite

Build a versioned reference corpus with expert-annotated plates and synthetic signals. At minimum, measure:

- Rf error against known marks;
- lane-position/width error;
- peak precision/recall and split/merge errors;
- integrated-area bias and repeatability;
- concentration/MW prediction error;
- inter-phone, inter-lighting, rotation, perspective, and compression robustness;
- agreement between desktop and mobile for identical project input.

Every algorithm change should run this corpus in CI and produce a comparison report with tolerances.

## 9. Streamlit deployment assessment

### 9.1 What the repository currently targets

The files do not describe a Streamlit app:

- neither requirements file includes `streamlit`;
- there is no Streamlit entry point or `.streamlit/config.toml`;
- the application object is Flask;
- the frontend calls Flask routes such as `/generate_profiles` and `/detect/crop`;
- both READMEs use Hugging Face Docker Space metadata;
- both GitHub Actions workflows push to Hugging Face Spaces;
- both Dockerfiles expose port 7860 and run `server.py`.

Therefore, the statement that the desktop app is deployed on Streamlit is not reproducible from these folders. The deployed Streamlit version may live elsewhere or differ from this local repository. Before implementation, record the actual deployed URL, repository/branch, entry point, and hosting configuration.

### 9.2 Why direct Streamlit Community Cloud deployment will not work

Streamlit Community Cloud executes `streamlit run` against a selected Python entry-point file. It does not launch this Dockerfile or treat `server.py` as an arbitrary Flask service. Selecting the existing `server.py` is not a valid conversion.

Streamlit static serving is also intended for small media assets. Non-media files such as JavaScript are served as `text/plain` with `nosniff`, so copying this SPA under Streamlit's static folder is not a workable deployment technique. A custom Streamlit component can run JavaScript, but it introduces iframe/origin/communication constraints and does not naturally preserve a top-level PWA service worker and install experience.

### 9.3 Recommended deployment choice

#### Option A — recommended: keep Flask/PWA and use container hosting

Use the existing architecture after remediation and deploy the container to a service that runs arbitrary web containers. The existing Hugging Face Docker Space is the closest current target, although it was paused when checked. Other container hosts are also suitable.

Benefits:

- lowest rewrite risk;
- preserves camera/file inputs, canvas interactions, install manifest, service worker, and API routes;
- one URL can serve desktop-responsive and phone-responsive layouts;
- straightforward production WSGI setup.

#### Option B — mandatory Streamlit: native UI rewrite

Create a real Streamlit entry point and rebuild the workflow with Streamlit widgets/components. Move algorithms into a shared pure Python package first so they can be used from either Flask or Streamlit.

Trade-offs:

- significant UI rewrite;
- Streamlit rerun/session-state model needs deliberate project-state handling;
- interactive canvas editing likely requires a custom component;
- PWA installation/offline control will be weaker and more complex;
- existing JavaScript cannot call the Flask routes unless a separate API is hosted elsewhere.

#### Option C — Streamlit wrapper around separately hosted Flask app

Embed or link the separately hosted app from a Streamlit page. This provides a Streamlit landing surface but is still two deployments and may have iframe, camera, print, CSP, and service-worker limitations. It should not be described as deploying the mobile app “on Streamlit.”

### 9.4 Recommended deployment pipeline

1. Push to a protected main branch through review.
2. Run Python/JavaScript lint and type/static checks.
3. Run unit, API, numerical regression, and browser tests.
4. Run dependency, secret, and container scans.
5. Build one immutable container tagged with commit/version.
6. Smoke-test `/health`, upload/crop/profile/report, and forbidden-file routes.
7. Deploy to staging, run mobile install/update tests, then promote the same image to production.
8. Keep rollback to the prior image.

Do not deploy directly from an untested force-push workflow.

## 10. Recommended target architecture

```text
One repository
├── tlc_core/                 # Pure, tested Python algorithms
├── api/                      # Thin Flask routes and validation
├── web/
│   ├── shared/              # State, API client, calculations, reports
│   ├── responsive UI        # Desktop + mobile layouts from one frontend
│   └── static PWA assets
├── tests/
│   ├── unit/
│   ├── api/
│   ├── browser/
│   └── reference_images/
├── packaging/windows/       # Reproducible standalone build
├── Dockerfile
├── .dockerignore
└── locked dependencies
```

The preferred end state is one responsive application, not two forks. Desktop and mobile can present different layouts while importing the same state model, API client, calculations, report generator, and Python core.

## 11. Phased remediation plan

### Phase 0 — stop-ship fixes before another public release

1. Restrict static serving and verify source/`.git`/logs return 404.
2. Replace Flask development server in hosted/container builds.
3. Add request/image/parameter limits and proper error status codes.
4. Remove global CORS unless a known cross-origin client requires it.
5. Fix mobile manual area recalculation.
6. Disable or remove the nonfunctional bandwidth control.
7. Add missing dependency or remove unused optimization code.
8. Upgrade off Python 3.9.
9. Escape all user-controlled HTML/report values.

### Phase 1 — reliability and maintainability

1. Extract one shared Python analysis package.
2. Modularize mobile using the desktop structure or merge into one responsive frontend.
3. Add request debounce/cancellation/stale-response protection.
4. Add project import/export and robust persistence.
5. Add loading, failure, offline, and retry states.
6. Make automatic and manual integration semantics identical.
7. Add unit/API tests and CI quality gates.
8. Add reproducible container and Windows builds.

### Phase 2 — PWA and mobile quality

1. Register and test the service worker.
2. Decide and communicate online-only versus true offline analysis.
3. Add complete icons and iOS install help.
4. Improve dynamic viewport/safe-area behavior and touch targets.
5. Complete keyboard/screen-reader/zoom accessibility.
6. Test physical devices, camera capture, orientation changes, and interrupted connectivity.

### Phase 3 — scientific validation

1. Define acquisition protocol and quality checks.
2. Validate baseline, polarity, lane geometry, Rf, integration, and calibration choices.
3. Build a reference corpus with numerical acceptance thresholds.
4. Add fit diagnostics, units, provenance, and uncertainty/warnings.
5. Version algorithms and embed the version/settings in projects and reports.

## 12. Suggested acceptance criteria

### Security/deployment

- `/server.py`, `/.git/config`, requirements, logs, archives, and build files return 404.
- Oversized and malformed requests return controlled 4xx responses without expensive processing.
- Production runs behind a supported WSGI server as a non-root container user.
- Only required routes and same-origin access are enabled.
- Dependency and container scans have no unresolved critical/high issues or have documented exceptions.

### Mobile/PWA

- Chrome/Android install prompt or explicit install UI works over HTTPS.
- iOS Add to Home Screen instructions and icons work.
- A new service-worker version updates without leaving the app permanently stale.
- The app clearly reports offline limitations.
- All controls work at 320 px width, in landscape, with 200% text/zoom where applicable.
- Touch controls meet a 44 px minimum target and have accessible names.

### Numerical behavior

- Automatic and manual areas match a reference integration function.
- Moving bounds/apex immediately updates area, percentages, and calibration consistently.
- Desktop and mobile produce identical results from the same versioned project.
- Duplicate/invalid calibration standards are rejected with a clear message.
- Reference image metrics remain within agreed tolerances across releases.

### Reliability

- Rapid slider changes result only in the latest response being applied.
- Network failures produce actionable UI errors without losing the project.
- Project save/load round-trips all settings and manual edits.
- Reports contain acquisition, processing, calibration, manual-edit, and version provenance.

## 13. Documentation sources used for deployment conclusions

- Streamlit Community Cloud runs a selected Python entry point with `streamlit run` and initializes from the repository root: [Streamlit file organization](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/file-organization) and [deploy an app](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/deploy).
- Streamlit static serving limits executable asset types and sends other file types as `text/plain` with `nosniff`: [Streamlit static file serving](https://docs.streamlit.io/library/advanced-features/static-file-serving).
- Flask explicitly advises against using the development server in production: [Flask deployment guidance](https://flask.palletsprojects.com/en/stable/deploying/).
- Python 3.9 reached end-of-life on 31 October 2025: [Python version status](https://devguide.python.org/versions/).
- The configured public mobile Docker Space reported itself paused during this review: [TLC Analyzer Pro on Hugging Face Spaces](https://huggingface.co/spaces/realgcp/TLC-APP-PWA).

## 14. Final recommendation

Do not deploy the mobile folder publicly in its present state. First complete the Phase 0 items, especially static-file isolation, the mobile area-recalculation fix, production server configuration, request limits, and removal of misleading/nonfunctional controls.

For hosting, use a container platform for the current Flask/PWA architecture. Consolidate the two forks into shared core and frontend modules before adding more features. Pursue Streamlit Community Cloud only if there is a firm requirement to rebuild the application as a Streamlit app and accept the PWA trade-offs.

After those engineering changes, run a separate analytical-method validation before representing outputs as high-precision quantitative results.
