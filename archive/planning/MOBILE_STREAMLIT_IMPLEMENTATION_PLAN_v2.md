# AQ-TLC Dual-App Streamlit Implementation Plan — v2
**Unified Ecosystem: Mobile Workstation & Desktop Reference**

**Document Version:** v2
**Date:** 26 September 2026
**Author:** AI Pair Programmer & System Architect
**Repositories Involved:**
1. **Mobile Workstation:** `TLC App PWA`
   - Local Path: `C:\Users\Giancarlo\Desktop\Antigravity work files\TLC App PWA`
   - GitHub Remote: `https://github.com/giancarlopascali-hub/TLC-APP-PWA.git` (`main`)
   - Cloud Target: **Streamlit Community Cloud only** (no Hugging Face deployment)
2. **Desktop Reference:** `AQ-TLC-streamlit`
   - Local Path: `C:\Users\Giancarlo\Desktop\Antigravity work files\AQ-TLC-streamlit`
   - GitHub Remote: `https://github.com/giancarlopascali-hub/AQ-TLC-Streamlit.git` (`main`)
   - Cloud Target: **Streamlit Community Cloud only** (no Hugging Face deployment)

---

## 1. Executive Summary & Core Mandates

This plan defines the end-to-end strategy to transform the AQ-TLC ecosystem into a harmonized, production-grade suite of two independent, cloud-deployed web applications on Streamlit:
- **AQ-TLC Desktop Edition:** The gold-standard laboratory densitometry workstation, preserving its full three-column interface and browser-session lifecycle.
- **AQ-TLC Mobile Edition:** A touch-first, smartphone-optimized densitometry application that migrates from legacy Flask to Streamlit's custom-component architecture while maintaining its phone layout, gestures, camera input, and local session recovery.

### The Non-Negotiable Core Directives
1. **GitHub `main` Branch Synchronization Mandate:**
   All verified code must ultimately be merged and pushed to the **respective `main` branch** of each GitHub repository:
   - Mobile: `giancarlopascali-hub/TLC-APP-PWA` on `main`
   - Desktop: `giancarlopascali-hub/AQ-TLC-Streamlit` on `main`
   No deployment candidate is considered complete until committed, tagged, and pushed to `origin/main`.
2. **Automated Streamlit Continuous Deployment (CD) Mandate:**
   Both applications must have **automated continuous deployment** configured in Streamlit Community Cloud (https://share.streamlit.io). Pushes to the `main` branch of either repository must automatically trigger build, dependency installation, container rebuild, and zero-downtime deployment.
3. **Desktop Stability & Lifecycle Preservation:**
   The desktop application (`AQ-TLC-streamlit`) is the functional and analytical reference. Its UX, layout, and intentional ephemeral browser-scoped lifecycle must NOT be disrupted or redesigned. Only narrow, regression-tested bug fixes and reliability hardening are permitted.
4. **Mobile Layout & Interaction Preservation:**
   The phone-optimized workflow (landing view, bottom toolbar, tabs, direct camera capture, pinch/zoom canvas gestures) will NOT be replaced with a desktop sidebar. The presentation stays mobile-first, but the backend communication adopts Streamlit's custom-component bridge.
5. **Analytical Parity & Defect Remediation:**
   The mobile app's critical calculation bug (manual peak additions receiving hardcoded `area: 10` and moving bounds failing to recalculate area) must be resolved immediately by adopting the desktop pure-Python integration logic (`_trapz` / `np.trapezoid`) on both client and server.

---

## 2. Comprehensive Repository & Codebase Audit

### 2.1 Desktop Reference (`AQ-TLC-streamlit`)
- **Git Status:** Clean working tree, tracking `origin/main` (`https://github.com/giancarlopascali-hub/AQ-TLC-Streamlit.git`).
- **Architecture:**
  - `streamlit_app.py`: Declares custom component `aq_tlc`, configures page layout (`wide`, collapsed sidebar, hidden Streamlit chrome), manages `st.session_state` response passing, and routes actions (`generate_profiles`, `crop`).
  - `tlc_backend.py`: Pure Python computation using OpenCV, scikit-image, and SciPy. Implements rolling-median baseline subtraction, `find_peaks`, and NumPy 2.0 trapezoidal integration.
  - `frontend/`: Standalone HTML/CSS/JS client.
  - `frontend/index.html`: Contains early inline bootstrap `<script>` that sends `streamlit:componentReady` immediately on load and buffers incoming `streamlit:render` events to avoid 60-second component timeouts.
  - `frontend/modules/`: Modularized ES6 code (`state.js`, `constants.js`, `streamlit_bridge.js`, `api.js`, `workspace.js`, `coords.js`, `events.js`, `render.js`, `profiles.js`, `analysis.js`, `export.js`, `init.js`).
  - `.streamlit/config.toml`: Production server options (`headless = true`, `enableCORS = false`, `enableXsrfProtection = false`, `theme = "dark"`).
- **Identified Improvement Areas:**
  - Missing request correlation ID echo in `streamlit_app.py` responses (prevents discarding out-of-order slider requests).
  - Wavelength bandwidth slider present in UI but ignored in backend computation.
  - Potential unescaped user inputs in report exports.

### 2.2 Mobile Repository (`TLC App PWA`)
- **Git Status:** On branch `main`. Up to date with `origin/main` (`https://github.com/giancarlopascali-hub/TLC-APP-PWA.git`). (Legacy `hf` remote to Hugging Face is decommissioned).
- **Current Architecture:**
  - Monolithic Flask server in `server.py` (serves static files from root via catch-all `/<path:filename>`, exposing `.git` and source code).
  - Monolithic client script in root `app.js` (~44 KB) holding all state, touch handlers, canvas rendering, and reporting.
  - Inline CSS in `index.html` (>100 lines), while an unlinked `index.css` sits in root.
  - Legacy blob detection algorithms (`core/algorithms.py` and endpoints `/detect/log`, `/detect/watershed`) that are unused by the UI.
  - `requirements.txt` contains Flask, Werkzeug, and gunicorn; lacks `streamlit`.
  - Legacy `.github/workflows/sync_to_hf.yml` and `Dockerfile` targeting Hugging Face Spaces (to be deleted; Streamlit Cloud is the sole deployment target).
- **Identified Critical Defects:**
  - **NUM-01 (Critical):** In `app.js` line 322, manually added peaks are assigned `area: 10`. Pointer dragging of peak apexes or boundaries (`lb`, `rb`) never recalculates area, leading to invalid relative percentages and quantitative calibrations.
  - **SEC-01 (Critical):** `server.py` serves arbitrary repository files via catch-all routing.
  - **DEP-01 (High):** `requirements.txt` does not support Streamlit.
  - **UX-01 (High):** File upload uses scripted `$('file-input').click()`, which fails or is blocked in sandboxed Streamlit iframes. Must migrate to native `<label for="...">` overlays.

---

## 3. Automated Streamlit Cloud Deployment Architecture

Both applications will be deployed and continuously maintained via **Streamlit Community Cloud** with automated triggers on push to `main`.

```text
               +-------------------------------------------------------------+
               |                  Developer Workspace (Git)                   |
               +-------------------------------------------------------------+
                               /                             \
     git push origin main     /                               \  git push origin main
                             v                                 v
        +-----------------------------------+   +------------------------------------+
        |   Desktop GitHub Repository       |   |   Mobile GitHub Repository         |
        | giancarlopascali-hub/             |   | giancarlopascali-hub/              |
        |   AQ-TLC-Streamlit                |   |   TLC-APP-PWA                      |
        | branch: main                      |   | branch: main                       |
        +-----------------------------------+   +------------------------------------+
                         |                                       |
                         | GitHub Webhook Trigger                | GitHub Webhook Trigger
                         v                                       v
        +-----------------------------------+   +------------------------------------+
        |   Streamlit Community Cloud       |   |   Streamlit Community Cloud        |
        | App: AQ-TLC Desktop               |   | App: AQ-TLC Mobile                 |
        | Entry: streamlit_app.py           |   | Entry: streamlit_app.py            |
        | Python: 3.11 / 3.12               |   | Python: 3.11 / 3.12                |
        +-----------------------------------+   +------------------------------------+
                         |                                       |
                         v                                       v
              [ https://aq-tlc.streamlit.app ]        [ https://aq-tlc-mobile.streamlit.app ]
```

### 3.1 Configuration Matrix for Streamlit Community Cloud

| Parameter | Desktop App (`AQ-TLC-Streamlit`) | Mobile App (`TLC-APP-PWA`) |
|---|---|---|
| **GitHub Repository** | `giancarlopascali-hub/AQ-TLC-Streamlit` | `giancarlopascali-hub/TLC-APP-PWA` |
| **Branch** | `main` | `main` |
| **Main File Path** | `streamlit_app.py` | `streamlit_app.py` |
| **Custom App URL** | `aq-tlc.streamlit.app` (or assigned) | `aq-tlc-mobile.streamlit.app` (or assigned) |
| **Python Version** | 3.11 or 3.12 | 3.11 or 3.12 |
| **Automatic Redeployment** | Enabled (Auto-updates on any commit to `main`) | Enabled (Auto-updates on any commit to `main`) |
| **Memory Limit** | 1.0 GB (Community Cloud Standard) | 1.0 GB (Community Cloud Standard) |
| **Root Component Path** | `./frontend` | `./frontend` |

### 3.2 Hugging Face Decommissioning — Streamlit-Exclusive Deployment
Neither the mobile application nor the desktop application requires or uses Hugging Face (HF) deployment. Streamlit Community Cloud is the **exclusive, single cloud deployment target** for both applications.
- **Action (Workflow Removal):** Delete `.github/workflows/sync_to_hf.yml` from `TLC App PWA` so GitHub Actions no longer syncs to Hugging Face.
- **Action (Container Removal):** Deprecate and remove the legacy `Dockerfile`; Streamlit Cloud builds containers natively from `requirements.txt` and `.streamlit/config.toml`.
- **Action (Remote Cleanup):** Remove the secondary `hf` git remote (`git remote remove hf`) so that `origin` (`giancarlopascali-hub/TLC-APP-PWA.git`) is the sole authoritative remote.

---

## 4. Mobile Architecture & Target File Hierarchy

The mobile codebase (`TLC App PWA`) will be restructured into a modular, iframe-ready Streamlit component matching the proven desktop architecture while retaining phone-specific ergonomics:

```text
TLC App PWA/
├── streamlit_app.py               # Streamlit entry point, iframe sizing, action router
├── tlc_backend.py                 # Pure Python computation (OpenCV, SciPy, NumPy)
├── requirements.txt               # Streamlit runtime dependencies
├── .streamlit/
│   └── config.toml                # Headless, dark theme, iframe config
├── .github/
│   └── workflows/
│       └── ci.yml                 # Automated Python & JS checks on push/PR (Streamlit Cloud only)
├── frontend/                      # Standalone Streamlit custom component directory
│   ├── index.html                 # Mobile component shell with inline bootstrap
│   ├── index.css                  # Consolidated mobile stylesheet (touch targets, dark theme)
│   ├── app.js                     # Bootstrap entry point (delegates to modules/init.js)
│   ├── guide.html                 # Mobile quick reference guide
│   ├── favicon.ico                # Mobile favicon
│   ├── icon.svg                   # Vector app icon
│   ├── manifest.json              # Web app manifest
│   └── modules/
│       ├── state.js               # Reactive client state & active tools
│       ├── constants.js           # Tool IDs, default settings, tolerances
│       ├── streamlit_bridge.js    # Bidirectional postMessage protocol & frame height
│       ├── api.js                 # Backend request correlation & debouncing
│       ├── workspace.js           # Image upload, camera input, reset, undo stack
│       ├── storage.js             # Local project persistence & migration
│       ├── coords.js              # Canvas transforms, viewport, pinch math
│       ├── events.js              # Multi-touch, pointerdown/move, gestures
│       ├── render.js              # Canvas rendering (lanes, bands, lines)
│       ├── profiles.js            # Densitogram canvas, zoom/pan, peak editing
│       ├── tables.js              # Relative %, Calibration, and MW table rendering
│       ├── analysis.js            # Client-side trapezoidal area & calibration math
│       ├── export.js              # Mobile report generator & sanitized exports
│       ├── ui.js                  # Tabs, bottom toolbar, menus, toast alerts
│       └── init.js                # Lifecycle orchestration & bridge listener setup
├── tests/
│   ├── python/                    # Pytest test suite for tlc_backend.py
│   ├── javascript/                # Unit tests for coords, analysis, and storage
│   └── fixtures/                  # Calibrated test plates and expected profiles
└── README.md                      # Documentation, local run & deployment instructions
```

---

## 5. Detailed Component Protocol & Action Contracts

The communication between the mobile JavaScript frontend and the Streamlit Python host runs through `window.parent.postMessage`.

### 5.1 Early Bootstrap in `frontend/index.html`
To prevent Streamlit's 60-second custom-component timeout on slow mobile networks, `index.html` executes an immediate inline script:
```html
<script>
  (function () {
    window.__stCallbacks   = [];
    window.__stRenderQueue = [];
    window.addEventListener('message', function (ev) {
      if (!ev.data || ev.data.type !== 'streamlit:render') return;
      var args = ev.data.args || {};
      if (window.__stCallbacks.length > 0) {
        window.__stCallbacks.forEach(function (cb) { cb(args); });
      } else {
        window.__stRenderQueue.push(args);
      }
    });
    function _send(msg) {
      window.parent.postMessage(Object.assign({ isStreamlitMessage: true }, msg), '*');
    }
    _send({ type: 'streamlit:componentReady', apiVersion: 1 });
    _send({ type: 'streamlit:setFrameHeight', height: window.innerHeight || 844 });
  })();
</script>
```

### 5.2 Structured Message Contract with Request Correlation
All client requests include a monotonic `request_id`. The Python host must echo the `request_id` in the response envelope so the frontend can safely drop stale responses caused by rapid slider adjustments.

#### Request Envelope:
```json
{
  "action": "generate_profiles",
  "request_id": "req-108",
  "payload": {
    "image": "data:image/jpeg;base64,...",
    "lanes": [{ "id": 1, "cx": 250, "cy": 400, "w": 45, "h": 600, "angle": 0 }],
    "peak_detection": true,
    "peak_prominence": 40,
    "peak_distance": 8,
    "peak_threshold": 50,
    "smooth_sigma": 1.5,
    "polarity_mode": "default",
    "target_wavelength": null,
    "invert_colors": false
  }
}
```

#### Response Envelope:
```json
{
  "action": "generate_profiles_result",
  "request_id": "req-108",
  "ok": true,
  "data": {
    "results": [
      {
        "id": 1,
        "profile": [12.4, 15.1, 45.8, ...],
        "peaks": [
          {
            "idx": 142,
            "rf": 0.45,
            "height": 78.2,
            "area": 1240.5,
            "lb": 130,
            "rb": 155,
            "v_lb": 134,
            "v_rb": 150,
            "manual": false,
            "type": "N"
          }
        ]
      }
    ]
  },
  "error": null
}
```

---

## 6. Phased Implementation Roadmap

```text
Phase 0: Environment Setup, Branch Baselines & Decision Gates
   |
Phase 1: Mobile Modularization & Critical Calculation Bug Fix (NUM-01)
   |
Phase 2: Streamlit Component Transport & Python Backend Integration
   |
Phase 3: Functional Parity & Desktop Feature Alignment for Mobile
   |
Phase 4: Shared High-Priority Improvements across Both Applications
   |
Phase 5: Git Protocol: Merge & Push to Respective 'main' Branches
   |
Phase 6: Automated Streamlit Cloud Deployment, Verification & Runbook
```

---

### Phase 0: Environment Setup, Branch Baselines & Decision Gates

**Goal:** Establish safety nets, baseline commits, test fixtures, and Git branching for both repositories.

#### Tasks:
1. **Desktop Baseline:**
   - Record current commit on `AQ-TLC-Streamlit` (`6fec31d`).
   - Confirm local working tree is clean and synchronized with `origin/main`.
2. **Mobile Baseline & Branching:**
   - In `TLC App PWA`, create working branch `feature/streamlit-mobile-v2` from `main`.
   - Record baseline commit (`a20872f`).
3. **Reference Golden Fixtures:**
   - Assemble 4 benchmark TLC plate images:
     - `fixture_standard_normal.jpg`: Standard multi-lane plate.
     - `fixture_slanted_rotation.jpg`: Plate requiring angle correction.
     - `fixture_fluorescent_bright.jpg`: Bright spots on dark background.
     - `fixture_dense_spots.jpg`: Stressed peak resolution plate.
   - Run baseline calculations on desktop `tlc_backend.py` and store golden outputs (profile arrays, peak counts, Rf values, integration areas) in `tests/fixtures/`.
4. **PWA & Offline Policy Finalization:**
   - **Policy:** Streamlit custom components execute inside an `<iframe>`. Full PWA service-worker offline installation cannot be claimed when served via `*.streamlit.app`.
   - **Resolution:** Deliver a phone-perfect, responsive web application supporting "Add to Home Screen" bookmarks, camera access, and persistent client-side project caching (`localStorage`), while documenting that analytical recalculation requires network access.

---

### Phase 1: Mobile Modularization & Critical Bug Fix (NUM-01)

**Goal:** Decompose the 44 KB monolithic `app.js` into ES6 modules and resolve the manual peak area calculation defect before altering the server transport.

#### Tasks:
1. **Fix NUM-01 (Manual Peak Area & Boundary Recalculation):**
   - Create `frontend/modules/analysis.js` incorporating a client-side trapezoidal area integration function:
     ```javascript
     export function calculatePeakArea(profile, lb, rb) {
       if (!profile || lb >= rb) return 0;
       const baseVal = Math.min(profile[lb], profile[rb]);
       let area = 0;
       for (let i = lb; i < rb; i++) {
         const y1 = Math.max(0, profile[i] - baseVal);
         const y2 = Math.max(0, profile[i + 1] - baseVal);
         area += (y1 + y2) * 0.5;
       }
       return parseFloat(area.toFixed(2));
     }
     ```
   - In peak creation (`edit-add`), replace hardcoded `area: 10` with `calculatePeakArea(profile, lb, rb)`.
   - In pointer handlers (`edit-move`), whenever a peak apex or boundary (`lb` or `rb`) is dragged, recompute `pk.area = calculatePeakArea(profile, pk.lb, pk.rb)` on `pointerup`.
2. **Modular File Decomposition:**
   - `frontend/modules/state.js`: Centralize reactive state, active tool, selection states, undo stack.
   - `frontend/modules/constants.js`: Define tool IDs, zoom bounds, polarity keys, default parameters.
   - `frontend/modules/coords.js`: Pure functions for canvas-to-image coordinates, rotation matrices, pinch-zoom math.
   - `frontend/modules/events.js`: Multi-touch gestures, pointer capture, drag thresholds.
   - `frontend/modules/render.js`: Canvas drawing engine for plate image, origin/front lines, marks, lane overlays.
   - `frontend/modules/profiles.js`: Densitogram rendering, baseline display, interactive peak handles.
   - `frontend/modules/tables.js`: Tabular views for Relative %, Single/Multi-point Area Calibration, and Molecular Weight (Rf vs log MW).
   - `frontend/modules/storage.js`: Local project serialization, auto-save, and corruption recovery.
   - `frontend/modules/workspace.js`: File loading, image downscaling, reset, undo execution.
   - `frontend/modules/ui.js`: Tab switching (Image, Profile, Table), bottom toolbar toggles, status toasts.
   - `frontend/modules/init.js`: DOM event wiring and component bootstrap.
3. **Consolidate Stylesheets:**
   - Extract inline CSS from `index.html` and merge into `frontend/index.css`.
   - Ensure touch targets are at least 44 × 44 px for phone accessibility.

**Phase 1 Exit Criteria:**
- Monolithic `app.js` replaced with ES modules in `frontend/modules/`.
- Manual peak addition and boundary dragging correctly recalculate areas.
- Automated tests verify `calculatePeakArea()` against NumPy trapezoid results.

---

### Phase 2: Streamlit Component Transport & Backend Integration

**Goal:** Connect the modular mobile frontend to Streamlit using the custom-component bridge.

#### Tasks:
1. **Python Analytical Engine (`tlc_backend.py`):**
   - Copy and verify the pure Python implementation from `AQ-TLC-streamlit/tlc_backend.py`.
   - Verify input validation: check base64 validity, clamp lane coordinates inside image boundaries, enforce positive width/height, reject empty arrays.
   - Ensure support for NumPy 2.0 (`np.trapezoid` fallback to `np.trapz`).
2. **Streamlit Host Script (`streamlit_app.py`):**
   - Implement custom component declaration:
     ```python
     _component_func = components.declare_component("aq_tlc_mobile", path=_FRONTEND_DIR)
     ```
   - Configure responsive height matching phone viewport (`visualViewport.height`).
   - Implement request deduplication and response dispatching via `st.session_state`.
   - Hide all Streamlit chrome (header, footer, sidebar) with CSS overrides.
3. **Streamlit Component Bridge (`frontend/modules/streamlit_bridge.js`):**
   - Wire `stSend()` and `stOnRender()`.
   - Handle iframe height updates dynamically when viewport orientation changes.
4. **File Input Iframe Compatibility:**
   - Replace scripted `.click()` calls with direct `<label for="file-input">` overlays to guarantee compatibility across iOS Safari and Android Chrome inside iframes.
5. **Runtime Dependencies (`requirements.txt`):**
   - Replace Flask/gunicorn with Streamlit runtime dependencies:
     ```text
     streamlit>=1.35.0
     numpy>=1.24.0
     pillow>=10.0.0
     opencv-python-headless>=4.8.0
     scikit-image>=0.21.0
     scipy>=1.11.0
     ```
6. **Local Streamlit Verification:**
   - Run `streamlit run streamlit_app.py` in `TLC App PWA`.
   - Validate upload, crop, lane finding, profile generation, and peak detection.

**Phase 2 Exit Criteria:**
- Mobile application runs locally via `streamlit run streamlit_app.py`.
- Image analysis requests round-trip through Streamlit postMessage bridge.
- Streamlit reruns do not reset active client state or wipe loaded plates.

---

### Phase 3: Functional Parity & Desktop Feature Alignment

**Goal:** Bring missing desktop capabilities to mobile while adapting them for touch interactions.

| Feature | Desktop Implementation | Mobile Status | v2 Alignment Action |
|---|---|---|---|
| **Color Inversion** | Checkbox in desktop sidebar | Missing | Add toggle in mobile Image toolbar or collapsible settings drawer. |
| **Spectral Projections** | UV-254, Ninhydrin, Iodine presets | Missing | Implement dropdown in mobile settings; clarify as RGB channel weighting. |
| **Snapping Guides** | Visual snapping for origin/front lines | Partial | Port desktop snapping tolerance and haptic/visual cueing. |
| **MW Calibration Table** | Calibration mode with log MW fit | Partial | Align table columns, regression calculation ($R^2$), and error bounds. |
| **Full PDF/HTML Report** | Formatted report with lane crops & graphs | Present | Standardize report HTML/CSS, include run parameters, sanitize fields. |
| **Wavelength Bandwidth** | Present in UI but non-functional | Missing | **Deliberate decision:** Exclude bandwidth control from mobile UI until a validated scientific model is implemented. |

**Phase 3 Exit Criteria:**
- Invert colors and RGB channel projections work smoothly on mobile.
- Quantitative calibration and MW tables match desktop numerical outputs.
- Full analytical reports export cleanly on mobile browsers.

---

### Phase 4: Shared High-Priority Improvements across Both Applications

**Goal:** Apply critical reliability, security, and scientific fixes to **both** `AQ-TLC-Streamlit` and `TLC-APP-PWA`.

#### 1. Bridge Request Correlation (Reliability)
- In both `streamlit_app.py` files, echo `request_id` in response payloads.
- In both `api.js` files, ignore responses whose `request_id` does not match the latest outbound request.

#### 2. XSS & HTML Injection Sanitization (Security)
- In both `tables.js` and `export.js`, eliminate direct interpolation of user strings into `innerHTML`.
- Implement robust HTML escaping helper:
  ```javascript
  export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  ```
- Sanitize lane names, peak notes, sample IDs, and export filenames.

#### 3. Memory & Resource Safeguards (Reliability)
- In `tlc_backend.py`, replace unbounded image cache with an LRU cache limited to 20 entries or 100 MB.
- Enforce maximum decoded image resolution (e.g., 4096 × 4096 px) to avoid exceeding Streamlit Cloud's 1.0 GB RAM limit.

#### 4. Scientific Terminology Alignment (Correctness)
- Clarify "Wavelength Filtering" labels across both apps to state "RGB Channel Projection", preventing misleading impressions of physical monochromator simulation.

**Phase 4 Exit Criteria:**
- Out-of-order responses discarded in both apps.
- All user-supplied fields safely escaped in live UI and exported reports.
- Memory consumption bounded and verified within 1.0 GB limit under stress.

---

### Phase 5: Git Protocol — Merge & Push to Respective `main` Branches

**Goal:** Complete code review, merge feature branches, and push all final changes to the **respective `main` branch** of each GitHub repository.

> [!IMPORTANT]
> Both Streamlit Community Cloud deployments monitor the `main` branch. Uncommitted local work or unpushed feature branches will NOT deploy.

#### Step-by-Step Git Execution Runbook

#### 1. Desktop Repository (`AQ-TLC-streamlit`):
```bash
# Navigate to desktop repository
cd "C:\Users\Giancarlo\Desktop\Antigravity work files\AQ-TLC-streamlit"

# Verify current status
git status

# If changes were made in Phase 4 (shared fixes):
git add streamlit_app.py tlc_backend.py frontend/modules/api.js frontend/modules/export.js
git commit -m "fix(shared): implement request correlation, HTML sanitization, and cache limits"

# Ensure on main branch and push to origin
git branch -M main
git pull origin main --rebase
git push origin main

# Confirm remote status
git status
```

#### 2. Mobile Repository (`TLC App PWA`):
```bash
# Navigate to mobile repository
cd "C:\Users\Giancarlo\Desktop\Antigravity work files\TLC App PWA"

# Review modified and new files
git status

# Run automated tests before committing
pytest tests/python/

# Stage all modularized assets, backend, config, and tests
git add streamlit_app.py tlc_backend.py requirements.txt .streamlit/
git add frontend/ tests/ .github/
git add MOBILE_STREAMLIT_IMPLEMENTATION_PLAN_v2.md

# Commit to feature branch
git commit -m "feat(mobile-streamlit): modularize frontend, implement Streamlit component bridge, fix NUM-01"

# Switch to main branch, merge, and tag
git checkout main
git merge feature/streamlit-mobile-v2 --no-ff -m "merge: release mobile Streamlit workstation v2.0"
git tag -a v2.0.0-mobile -m "AQ-TLC Mobile Streamlit Edition v2.0.0"

# Push main branch and tags to GitHub origin
git push origin main --tags

# Confirm sync
git log -1 --stat
```

**Phase 5 Exit Criteria:**
- `git status` on both repositories reports clean working trees and `up to date with 'origin/main'`.
- GitHub remotes reflect the latest commits on their respective `main` branches.

---

### Phase 6: Automated Streamlit Cloud Deployment, Verification & Runbook

**Goal:** Establish and verify continuous automated deployment on Streamlit Community Cloud for both apps.

#### 6.1 Manual Preparation Checklist for the Developer (Pre-Deployment Setup)

Before launching the applications on Streamlit Community Cloud, complete the following one-time manual preparation tasks:

##### Step 1: GitHub Account & Repository Verification
- [ ] **GitHub Login:** Sign in to your GitHub account (`giancarlopascali-hub`).
- [ ] **Verify Default Branch on GitHub:**
  - For `AQ-TLC-Streamlit`: Go to `https://github.com/giancarlopascali-hub/AQ-TLC-Streamlit/settings/branches` and confirm default branch is `main`.
  - For `TLC-APP-PWA`: Go to `https://github.com/giancarlopascali-hub/TLC-APP-PWA/settings/branches` and confirm default branch is `main`.
- [ ] **Verify Repository Visibility:**
  - Streamlit Community Cloud connects directly to public GitHub repositories. If the repositories are private, ensure your Streamlit account is granted access to private repositories during OAuth authorization.

##### Step 2: One-Time Local Terminal Cleanup
Run this command once in your terminal to remove the legacy Hugging Face remote from `TLC App PWA` so you never accidentally push there:
```powershell
cd "C:\Users\Giancarlo\Desktop\Antigravity work files\TLC App PWA"
git remote remove hf
```
Verify that `git remote -v` now shows only `origin` pointing to `https://github.com/giancarlopascali-hub/TLC-APP-PWA.git`.

##### Step 3: Streamlit Community Cloud Account Linking
1. Navigate to **[Streamlit Community Cloud](https://share.streamlit.io)** in your browser.
2. Click **Continue with GitHub** and log in with your GitHub account (`giancarlopascali-hub`).
3. When prompted by GitHub, grant Streamlit authorization to access your repositories and webhooks (this enables the automatic deploy-on-push feature).

---

#### 6.2 One-Time Streamlit Community Cloud App Creation Steps

You only need to perform these app creation steps **once** for each repository. After this initial setup, every future `git push origin main` deploys automatically without touching the Streamlit dashboard!

##### Deploying App 1: Desktop Workstation (`AQ-TLC-Streamlit`)
1. On your Streamlit Cloud workspace ([share.streamlit.io](https://share.streamlit.io)), click **Create app** (top-right button) > select **Yup, I have an app**.
2. Configure the deployment parameters:
   - **Repository:** `giancarlopascali-hub/AQ-TLC-Streamlit`
   - **Branch:** `main`
   - **Main file path:** `streamlit_app.py`
   - **App URL:** `aq-tlc` (resulting URL: `https://aq-tlc.streamlit.app`)
3. Click **Advanced settings...**:
   - **Python version:** Select `3.11` (recommended for SciPy/OpenCV compatibility)
   - **Secrets:** Leave empty (no external API keys or credentials needed)
4. Click **Deploy!**
5. Streamlit will pull the repo, run `pip install -r requirements.txt`, and boot the app in ~60–90 seconds.

##### Deploying App 2: Mobile Workstation (`TLC-APP-PWA`)
1. Click **Create app** > select **Yup, I have an app**.
2. Configure the deployment parameters:
   - **Repository:** `giancarlopascali-hub/TLC-APP-PWA`
   - **Branch:** `main`
   - **Main file path:** `streamlit_app.py`
   - **App URL:** `aq-tlc-mobile` (resulting URL: `https://aq-tlc-mobile.streamlit.app`)
3. Click **Advanced settings...**:
   - **Python version:** Select `3.11`
   - **Secrets:** Leave empty
4. Click **Deploy!**

---

#### 6.3 How Continuous Automated Deployment Works (Zero Ongoing Manual Effort)

Once both apps are registered in Streamlit Community Cloud:
- **Automatic Webhook:** Whenever you push code to GitHub:
  ```bash
  git push origin main
  ```
- **Live Rebuild:** Streamlit Community Cloud detects the commit via GitHub webhook within 5–10 seconds.
- **Log Monitoring:** You can view real-time build logs by clicking the **Manage app** button in the bottom-right corner of the running app screen, then opening the **Logs** drawer.
- **No Manual Intervention:** Dependency installations and server restarts happen automatically in the background.

---

#### 6.4 Mobile Phone First-Run Verification
Once `https://aq-tlc-mobile.streamlit.app` is live:
1. Open the URL in Safari on iOS or Chrome on Android.
2. Tap the **Camera** button:
   - The browser will request permission: *"aq-tlc-mobile.streamlit.app would like to access your camera"*. Tap **Allow**.
   - Snap a TLC plate photo and verify it loads directly into the canvas.
3. (Optional) Tap the browser share button > **Add to Home Screen** to pin the mobile workstation icon to your phone's home screen.

---

#### 6.5 Post-Deployment Smoke Test Matrix

| Test Case | Verification Steps | Pass Criteria |
|---|---|---|
| **App Startup** | Open live URLs on desktop Chrome and iPhone Safari. | Zero modal errors; `<canvas>` initializes within 3s. |
| **Component Bridge** | Upload `fixture_standard_normal.jpg`. | Image renders on canvas; no console errors. |
| **Lane Creation** | Draw origin/front lines, add spotting marks, click Find Lanes. | Lanes calculate and render correctly. |
| **Profile Generation** | Switch to Profile tab. | Densitograms generate; peak detection overlays visible. |
| **Manual Peak Fix (NUM-01)** | Add manual peak; drag apex and boundaries. | Area updates dynamically from trapezoid integral; relative % recalculates. |
| **Camera Access** | Click Camera button on physical smartphone. | Native device camera opens; captured plate loads into workspace. |
| **Report Export** | Click Full Report > Print/PDF. | Sanitized report modal renders; download succeeds. |

---

#### 6.6 Rollback Playbook
If an unexpected regression occurs in production:
```bash
# In the affected repository:
git checkout main
git revert HEAD --no-edit
git push origin main
```
Streamlit Community Cloud will automatically pull the reverted commit and restore the previous stable build within ~60 seconds.

---

## 7. Automated CI/CD Testing Pipeline

To guarantee that broken code is never deployed to production, both repositories will track `.github/workflows/ci.yml`:

```yaml
name: CI Quality Gate

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'

      - name: Install Dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
          pip install pytest flake8

      - name: Python Syntax & Lint
        run: |
          python -m compileall streamlit_app.py tlc_backend.py
          flake8 streamlit_app.py tlc_backend.py --count --max-line-length=120 --statistics

      - name: Run Backend Unit Tests
        run: |
          pytest tests/python/ -v

      - name: Validate Component Directory
        run: |
          test -f frontend/index.html
          test -f frontend/index.css
          test -f frontend/app.js
```

---

## 8. Definition of Done (DoD) Checklist

### Repository & Deployment
- [ ] `AQ-TLC-Streamlit` repository updated, tested, and pushed to `main`.
- [ ] `TLC-APP-PWA` repository refactored, tested, and pushed to `main`.
- [ ] Automated continuous deployment active on Streamlit Cloud for both repositories.
- [ ] Rollback procedures tested and documented.

### Mobile Architectural Excellence
- [ ] Monolithic `app.js` split into single-responsibility ES modules under `frontend/modules/`.
- [ ] Inline styles migrated to `frontend/index.css`.
- [ ] Direct `<label>` file input technique active for camera and gallery upload.
- [ ] Component iframe height dynamically adapts to mobile viewport.

### Analytical & Scientific Accuracy
- [ ] NUM-01 resolved: Manual peak creation and boundary dragging recompute trapezoidal areas.
- [ ] Golden plate fixtures yield identical analytical profiles across desktop and mobile backends.
- [ ] Wavelength controls accurately described as RGB channel projections.

### Reliability & Security
- [ ] Bridge communication includes request correlation IDs and drops out-of-order responses.
- [ ] All user inputs in tables and reports are sanitized against XSS.
- [ ] Backend image cache bounded to prevent out-of-memory errors on Streamlit Cloud.
