# AQ-TLC Mobile & Desktop Streamlit Implementation Plan — v4

**Document Version:** 4.0 (Production Blueprint & Implementation Master Plan)
**Date:** 27 September 2026
**Primary Implementation Repository (Mobile):** `C:\Users\Giancarlo\Desktop\Antigravity work files\TLC App PWA`
- **GitHub Remote:** `https://github.com/giancarlopascali-hub/TLC-APP-PWA.git` (branch: `main`)
- **Deployment Platform:** Streamlit Community Cloud (`https://share.streamlit.io`)
- **Target URL:** `https://aq-tlc-mobile.streamlit.app` (or custom subdomain assigned)

**Reference Repository (Desktop):** `C:\Users\Giancarlo\Desktop\Antigravity work files\AQ-TLC-streamlit`
- **GitHub Remote:** `https://github.com/giancarlopascali-hub/AQ-TLC-Streamlit.git` (branch: `main`)
- **Deployment Platform:** Streamlit Community Cloud (`https://share.streamlit.io`)
- **Target URL:** `https://aq-tlc.streamlit.app`

---

## 1. Executive Summary & Synthesis of Plan Evolution

This document (`v4`) is the definitive, execution-ready blueprint that synthesizes and resolves all findings across `v1`, `v2`, and `v3`, while strictly enforcing the user's explicit mandates:

1. **Streamlit Community Cloud as the Sole Target:**
   Neither mobile nor desktop will be deployed on Hugging Face (HF). Hugging Face deployment is completely decommissioned. Automated deployment is powered exclusively by Streamlit Community Cloud watching the `main` branch of each repository.
2. **Commit & Push to `origin/main` Mandate:**
   Every milestone culminates in clean, verified commits pushed to the `main` branch of the respective GitHub repository (`giancarlopascali-hub/TLC-APP-PWA` and `giancarlopascali-hub/AQ-TLC-Streamlit`).
3. **Preservation of Desktop Reference:**
   The desktop workstation layout (three-column densitometry suite, canvas, ephemeral browser session lifecycle) is preserved. Desktop stability is paramount.
4. **Preservation of Mobile-First UX:**
   The mobile application retains its touch-first UI: clean landing view, bottom toolbar, tabbed analysis sheet, camera/gallery direct capture, and pinch/pan canvas gestures.
5. **Exact Numerical Harmonization (`NUM-01` Remediation):**
   The critical manual peak calculation defect (`app.js` line 322 hardcoded `area: 10` and stationary boundaries upon dragging) is solved with a mathematically rigorous, cross-language contract unifying Python backend detection and JavaScript client interactions.
6. **Actionable Developer Manual Runbook:**
   Includes step-by-step instructions for GitHub branch setup, Streamlit Community Cloud app registration, and continuous automated deployment verification.

---

## 2. Critical Review of `v3` (Comparative Analysis: `v1` vs `v2` vs `v3`)

### 2.1 Key Insights from `v3` Accepted & Incorporated
* **The Dual-Signal / Boundary Inconsistency Problem:**
  `v3` correctly identified that in the legacy code (and even in desktop), automatic peak detection computes AUC on a 0–100 normalized profile (`p_norm`) over SciPy peak bases (`lb:rb`), whereas the client was returning thresholded bounds (`v_lb:v_rb`) and calculating manual peaks on raw intensity (`p`). `v4` specifies a single, unified analytical signal and ensures visual boundaries match integration boundaries.
* **Request Correlation & Rerun Replay Protection:**
  `v3` rightly noted that Streamlit reruns can inadvertently replay stale responses if responses lack request ID echoing and action-scoped correlation. `v4` integrates strict action-scoped request correlation (`request_id` echoed by Python and validated by JS).
* **Safe DOM Construction & Sanitization:**
  `v3` emphasized that string concatenation in report generation and UI tables can introduce XSS or broken layout. `v4` enforces strict DOM building or sanitized template rendering.
* **Origin-Scoped Local Storage Awareness:**
  Moving from Hugging Face domains to `streamlit.app` changes the browser origin. Old `localStorage` cannot be read across origins. `v4` incorporates a dedicated JSON project export/import feature.

### 2.2 Material Critiques & Corrections to `v3`
| Finding in `v3` | Severity | Critique & Defect in `v3` | `v4` Correction |
|---|---:|---|---|
| **Retention of Hugging Face Infrastructure** | Critical | `v3` insisted on maintaining the HF remote, `sync_to_hf.yml`, and `Dockerfile` throughout the project. This directly violates the user's explicit directive: *"the mobile, as well as the desktop app, does not need any HF deployment, only Streamlit!"* | Decommission Hugging Face cleanly. Tag the last working Flask/HF commit (`legacy-flask-hf`), move legacy files to `archive/legacy_flask/`, disable the GitHub workflow, and remove the `hf` git remote. Reversibility is guaranteed via Git history without lingering cloud technical debt. |
| **Omission of Step-by-Step Manual Deployment Setup** | High | `v3` removed the concrete, numbered UI instructions from `v2` Section 6.1 (what Giancarlo must click in GitHub and Streamlit Cloud), replacing them with abstract high-level tasks. | Fully restore and expand the complete **Developer Manual Preparation Guide** with exact UI paths, repository names, branch settings, Python versions, and verification steps. |
| **Over-Engineering the Migration Adapter** | High | `v3` proposed a dual-transport system (`transport_flask.js` + `transport_streamlit.js`), maintaining Flask inside `frontend/` through Phase 1 before switching to Streamlit in Phase 2. This doubles development time and introduces throwaway adapter code. | Follow the proven architecture of `AQ-TLC-streamlit`. Modularize the frontend directly into the established ES6 module structure (`streamlit_bridge.js`, `api.js`, `workspace.js`, etc.) while testing locally with Streamlit's official runner. |
| **Unrealistic Timeline & Scheduling Inflation** | Medium | `v3` estimated 23–46 working days (~2 months) for refactoring a single 44 KB JS file and a 500-line Python script where a complete working desktop reference already exists in the adjacent folder. | Re-baseline into realistic, tightly scoped execution milestones totaling **6–10 working days** across 6 clear phases. |
| **Abstract Numerical Guidance without Concrete Formulas** | High | `v3` stated that a numerical contract was required, but failed to provide the exact mathematical formula, array handling, and code definitions to resolve the auto-vs-manual discrepancy. | Provide the explicit mathematical specification, array ordering (origin-to-front), baseline subtraction, and trapezoidal integration algorithm for both Python and JS in Section 4. |

---

## 3. System Architecture & Component Communication

### 3.1 High-Level Architecture
Both applications run as phone/desktop client apps inside a Streamlit Custom Component iframe hosted by Streamlit Community Cloud:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Streamlit Community Cloud                       │
│  https://aq-tlc-mobile.streamlit.app  /  https://aq-tlc.streamlit.app  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Python Host (streamlit_app.py)                                   │  │
│  │  - Headless Streamlit runtime                                    │  │
│  │  - declare_component("aq_tlc", path="./frontend")                │  │
│  │  - Action router & request deduplication                         │  │
│  │  - tlc_backend.py (pure OpenCV, SciPy, NumPy 2.0 computation)   │  │
│  └───────────────────▲──────────────────────────────│───────────────┘  │
│                      │ postMessage                  │ postMessage      │
│                      │ (streamlit:setComponentVal)  │ (streamlit:render│
│  ┌───────────────────│──────────────────────────────▼───────────────┐  │
│  │ Component iframe (./frontend/index.html)                         │  │
│  │  - Immediate handshake: window.parent.postMessage(componentReady)│  │
│  │  - HTML5 Canvas, Touch/Pointer gestures, Responsive CSS          │  │
│  │  - Modular ES6 architecture (state, api, workspace, profiles)    │  │
│  │  - Versioned LocalStorage recovery + JSON project export/import  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Bidirectional Protocol Specification
To eliminate race conditions, out-of-order execution, and replay on Streamlit reruns, the messaging bridge adheres to an explicit envelope:

#### Request (JS → Python via `streamlit:setComponentValue`):
```json
{
  "action": "generate_profiles",
  "request_id": "prof_1727438400123_4",
  "payload": {
    "image": "data:image/jpeg;base64,...",
    "lanes": [
      { "id": 1, "cx": 250, "cy": 400, "w": 60, "h": 650, "angle": 0 }
    ],
    "peak_detection": true,
    "peak_prominence": 15.0,
    "peak_distance": 8,
    "peak_threshold": 50.0,
    "smooth_sigma": 1.5,
    "polarity_mode": "default"
  }
}
```

#### Response (Python → JS via `streamlit:render` args):
```json
{
  "action": "generate_profiles_result",
  "request_id": "prof_1727438400123_4",
  "ok": true,
  "data": {
    "results": [
      {
        "id": 1,
        "profile": [12.4, 15.1, 18.0, ...],
        "profile_norm": [0.0, 2.5, 5.1, ...],
        "peaks": [
          {
            "idx": 142,
            "rf": 0.452,
            "height": 78.2,
            "area": 1240.5,
            "lb": 130,
            "rb": 155,
            "manual": false,
            "type": "N"
          }
        ]
      }
    ],
    "_detectPeaks": true
  },
  "error": null
}
```

#### Protocol Rules:
1. **Request ID Echo:** Every Python response MUST echo the exact `request_id` passed in the request.
2. **Action-Scoped Tracking:** The JS client tracks `latestRequestIdByAction[action]`. If a response arrives whose `request_id` does not match the latest sent request for that action, it is discarded as stale.
3. **Rerun Replay Clearance:** In `streamlit_app.py`, once `st.session_state.pending_response` is rendered to the component, subsequent script executions without new input clear `pending_response = None` to prevent replaying past calculations.

---

## 4. Mathematical & Numerical Specification (`NUM-01` Resolution)

### 4.1 The Core Defect in Legacy Mobile
In `app.js` (line 322):
```javascript
// LEGACY BUGGY CODE:
l.peaks.push({ idx, rf, height: p[idx], area: 10, lb, rb, manual: true, type: 'N' });
```
When manual peaks are placed, `area` is hardcoded to `10`. When boundaries (`lb`, `rb`) or apexes are dragged, the area is never recalculated. Consequently:
- Peak area percentages (`% Area` and `% Corr`) are invalid.
- Area-based quantitative calibration curves produce erroneous concentrations.
- Analytical reports show fictitious data for manual peaks.

### 4.2 The Unified Peak Area Formula
To guarantee 100% mathematical consistency between automatic backend peak detection and manual frontend additions/drags:

1. **Signal Convention:**
   - Analysis profiles are oriented **Origin (index 0) → Solvent Front (last index)**.
   - Profile array: $s[k]$ for $k \in [0, N-1]$.
   - Let $\text{lb}$ and $\text{rb}$ be the inclusive integer peak boundaries ($0 \le \text{lb} < \text{rb} \le N-1$).
2. **Local Baseline Determination:**
   $$\text{base} = \min(s[\text{lb}], s[\text{rb}])$$
3. **Trapezoidal Integration Above Baseline:**
   For any signal array $s$ and boundary pair $[\text{lb}, \text{rb}]$:
   $$\text{Area} = \sum_{k=\text{lb}}^{\text{rb}-1} \frac{\max(s[k] - \text{base}, 0) + \max(s[k+1] - \text{base}, 0)}{2} \cdot \Delta k$$
   (with $\Delta k = 1.0$ index units).
4. **Boundary & Display Unity:**
   - The boundary handles rendered and dragged on the chart ($[\text{pk.lb}, \text{pk.rb}]$) MUST be the EXACT interval over which the area integral is evaluated.
   - When a peak is added manually:
     - Search left from `idx` until signal stops descending or hits baseline/threshold: determines `lb`.
     - Search right from `idx` until signal stops descending or hits baseline/threshold: determines `rb`.
     - Compute $\text{Area}$ using the trapezoidal formula above immediately.
   - When boundary handles are dragged on screen:
     - Update `pk.lb` or `pk.rb`.
     - Recalculate $\text{Area}$ on every pointer event or drag-end.
     - Automatically update dependent tables (`% Area`, `% Corr`, calibration curve fit).

### 4.3 Python Implementation (`tlc_backend.py`)
```python
import numpy as np

# NumPy 2.0 compatibility
_trapz = getattr(np, "trapezoid", getattr(np, "trapz", None))

def calculate_peak_area(profile_arr: np.ndarray, lb: int, rb: int) -> float:
    """Trapezoidal integration above local baseline between lb and rb."""
    lb = max(0, min(lb, len(profile_arr) - 1))
    rb = max(0, min(rb, len(profile_arr) - 1))
    if rb <= lb:
        return 0.0
    segment = profile_arr[lb:rb + 1]
    base_val = min(profile_arr[lb], profile_arr[rb])
    clipped = np.clip(segment - base_val, 0, None)
    return float(round(_trapz(clipped), 2))
```

### 4.4 JavaScript Implementation (`frontend/modules/analysis.js`)
```javascript
/**
 * Computes trapezoidal area under the curve above local baseline.
 * Exactly mirrors Python's calculate_peak_area.
 * @param {number[]} profile - The 1D density profile (origin to front).
 * @param {number} lb - Left boundary index.
 * @param {number} rb - Right boundary index.
 * @returns {number} Non-negative peak area rounded to 2 decimal places.
 */
export function calculatePeakArea(profile, lb, rb) {
  if (!profile || profile.length < 2) return 0.0;
  const n = profile.length;
  const l = Math.max(0, Math.min(Math.round(lb), n - 1));
  const r = Math.max(0, Math.min(Math.round(rb), n - 1));
  if (r <= l) return 0.0;

  const base = Math.min(profile[l], profile[r]);
  let area = 0.0;
  for (let k = l; k < r; k++) {
    const y0 = Math.max(0, profile[k] - base);
    const y1 = Math.max(0, profile[k + 1] - base);
    area += (y0 + y1) / 2.0;
  }
  return Math.round(Math.max(0, area) * 100) / 100;
}
```

---

## 5. Mobile Frontend Modularization Architecture

The monolithic 44 KB `app.js` will be refactored into focused, single-responsibility ES6 modules following the clean architectural conventions established in the desktop reference:

```text
TLC App PWA/
├── .streamlit/
│   └── config.toml               # Streamlit server config (dark theme, minimal toolbar)
├── archive/
│   └── legacy_flask/             # Safely preserved legacy server, Dockerfile, algorithms
├── frontend/
│   ├── index.html                # PWA shell with inline immediate Streamlit handshake
│   ├── index.css                 # Touch-first responsive mobile layout & bottom bar
│   ├── app.js                    # Mobile application bootstrap & module wiring
│   ├── guide.html                # In-app user manual & chemistry guidance
│   ├── favicon.ico               # Application favicon
│   ├── icon.svg                  # High-res SVG app icon
│   ├── manifest.json             # Web app metadata
│   └── modules/
│       ├── state.js              # Centralized reactive state store
│       ├── constants.js          # Color tokens, thresholds, geometry constants
│       ├── streamlit_bridge.js   # Streamlit custom component postMessage bridge
│       ├── api.js                # Asynchronous backend service caller (profiles/crop)
│       ├── coords.js             # Canvas/touch coordinate transforms & math
│       ├── analysis.js           # Pure math: calculateRf, calculatePeakArea, calibration curves
│       ├── workspace.js          # Canvas image loading, rotation, crop handling
│       ├── events.js             # Pointer events: single-touch, pinch-zoom, 2-finger pan
│       ├── render.js             # High-DPI canvas renderer: lanes, marks, bounding boxes
│       ├── profiles.js           # Densitogram chart canvas, touch apex/boundary drag, peak list
│       ├── storage.js            # Versioned LocalStorage autosave + JSON Project Export/Import
│       └── export.js             # Mobile-friendly analytical HTML/PDF report generator
├── tests/
│   ├── test_numerical.py         # Python unit tests for area & calibration
│   └── test_contract.json        # Shared fixtures verifying Python == JS calculation parity
├── .gitignore                    # Python & frontend ignore patterns
├── README.md                     # Project documentation & local run instructions
├── requirements.txt              # Production Python dependencies for Streamlit
├── streamlit_app.py              # Mobile Streamlit Cloud application entry point
└── tlc_backend.py                # Pure Python analytical backend (shared logic)
```

---

## 6. Phased Implementation Roadmap

### Phase 0: Baseline Verification & Safe Legacy Decommissioning
**Objective:** Preserve existing code state, remove dead deployment remotes, and establish a clean Git foundation.

**Tasks:**
1. **Tag Existing State:** Create an annotated Git tag representing the final Flask/Hugging Face state:
   ```bash
   git tag -a legacy-flask-hf -m "Final legacy Flask and Hugging Face deployment"
   git push origin legacy-flask-hf
   ```
2. **Decommission Hugging Face Remote:**
   ```bash
   git remote remove hf
   ```
3. **Archive Legacy Assets:**
   - Create `archive/legacy_flask/`.
   - Move `server.py`, `Dockerfile`, `core/algorithms.py`, and `.github/workflows/sync_to_hf.yml` into `archive/legacy_flask/`.
   - Ensure working tree is clean and tracking `origin/main`.
4. **Commit & Push Baseline:**
   ```bash
   git add archive/ .github/
   git commit -m "chore: archive legacy Flask and HF deployment assets"
   git push origin main
   ```

**Exit Gate:**
- `git remote -v` contains only `origin` pointing to GitHub.
- Tag `legacy-flask-hf` exists on remote GitHub repo.
- No Hugging Face workflow is active on `main`.

---

### Phase 1: Numerical Engine & Parity Testing (`NUM-01` Fix)
**Objective:** Implement the unified area integration and Rf calculation logic in Python and JS with automated test fixtures.

**Tasks:**
1. Create `tlc_backend.py` in the mobile repository by adapting the desktop logic and integrating the unified area function `calculate_peak_area`.
2. Generate `tests/test_contract.json` containing 10 synthetic profile scenarios:
   - Symmetric Gaussian peak.
   - Asymmetric tailed peak.
   - Plateau peak.
   - Close overlapping doublet.
   - Zero-prominence baseline noise.
3. Write `tests/test_numerical.py` verifying `calculate_peak_area` across all test fixtures.
4. Verify Python test execution passes with 100% compliance.

**Exit Gate:**
- Python numerical suite passes locally (`pytest tests/test_numerical.py`).
- Automatic and manual peak algorithms share identical integration semantics.

---

### Phase 2: Frontend Modularization & Touch UX Preservation
**Objective:** Refactor monolithic `app.js` into ES6 modules inside `frontend/modules/` without degrading touch gestures or mobile layout.

**Tasks:**
1. Create `frontend/` directory structure and move static assets (`index.html`, `index.css`, `guide.html`, `manifest.json`, `icon.svg`, `favicon.ico`) into `frontend/`.
2. Extract ES6 modules:
   - `modules/constants.js`: System configuration, color palettes, default parameters.
   - `modules/state.js`: Central state object, undo/redo stack, reactive notifications.
   - `modules/analysis.js`: `calculateRf`, `calculatePeakArea`, `findBoundaries`, calibration regression.
   - `modules/coords.js`: Coordinate transformations, rotation matrices, pinch-zoom scale calculations.
   - `modules/workspace.js`: Image loader, plate rotation, ROI cropping.
   - `modules/events.js`: Pointer event router (single-touch drawing, multi-touch pinch/pan).
   - `modules/render.js`: Main TLC plate canvas renderer.
   - `modules/profiles.js`: Densitogram profile chart, interactive boundary drag, peak selection.
   - `modules/storage.js`: Robust local autosave (`tlc_project_v4`), corruption recovery, and explicit project JSON file download/upload.
   - `modules/export.js`: Analytical report generation with safe DOM creation and print styles.
3. Replace the `area: 10` defect in `profiles.js` with `calculatePeakArea(profile, lb, rb)`.
4. Wire pointermove and pointerup boundary dragging to dynamically update `pk.area`, `% Area`, and calibration curves in real time.

**Exit Gate:**
- Code is cleanly modularized into ES6 modules.
- Zero occurrences of hardcoded `area: 10`.
- Manual peak additions and boundary dragging dynamically compute correct trapezoidal area.

---

### Phase 3: Streamlit Bridge Integration & Local Execution
**Objective:** Replace HTTP `fetch()` with the Streamlit Custom Component `postMessage` protocol.

**Tasks:**
1. Add `frontend/modules/streamlit_bridge.js` (reusing the desktop's production-proven handshake).
2. Insert the immediate inline bootstrap `<script>` into `frontend/index.html` to prevent 60-second component loading timeouts.
3. Implement `frontend/modules/api.js` using `stSend` and `stOnRender`.
4. Create root `streamlit_app.py` configuring:
   - `st.set_page_config(page_title="AQ-TLC Mobile", layout="wide", initial_sidebar_state="collapsed")`
   - Custom CSS hiding Streamlit headers, footers, and menu bars.
   - Component declaration: `components.declare_component("aq_tlc_mobile", path="./frontend")`.
   - Request routing for `generate_profiles` and `crop`.
5. Update `requirements.txt`:
   ```text
   streamlit>=1.35.0
   numpy>=1.24.0
   pillow>=10.0.0
   opencv-python-headless>=4.8.0
   scikit-image>=0.21.0
   scipy>=1.11.0
   ```
6. Add `.streamlit/config.toml`:
   ```toml
   [server]
   headless = true
   enableCORS = false
   enableXsrfProtection = false

   [browser]
   gatherUsageStats = false

   [theme]
   base = "dark"

   [client]
   toolbarMode = "minimal"
   ```
7. Test locally by running:
   ```powershell
   streamlit run streamlit_app.py
   ```
   Verify lane generation, peak detection, crop, rotation, manual peak editing, and reports.

**Exit Gate:**
- `streamlit run streamlit_app.py` starts cleanly and runs without JavaScript or Python console errors.
- Actions (`crop`, `generate_profiles`) execute seamlessly over the Streamlit bridge.

---

### Phase 4: Push to GitHub `main` & Automated CD Activation
**Objective:** Commit and push the complete implementation to GitHub `main` and trigger automated deployment in Streamlit Community Cloud.

**Tasks:**
1. Check Git status and stage all modified/created files:
   ```bash
   git add streamlit_app.py tlc_backend.py requirements.txt .streamlit/ frontend/ tests/ README.md
   git commit -m "feat: complete AQ-TLC Mobile Streamlit migration with unified numerical engine"
   git push origin main
   ```
2. Confirm branch is synchronized with `origin/main`.
3. Complete the one-time manual app creation steps in Streamlit Community Cloud (detailed in Section 7).

**Exit Gate:**
- GitHub repository `giancarlopascali-hub/TLC-APP-PWA` `main` branch reflects the new Streamlit codebase.
- Streamlit Community Cloud initiates automated build from `origin/main`.

---

### Phase 5: Production Verification & Device Acceptance
**Objective:** Validate the live cloud-deployed mobile app on physical smartphone hardware and desktop browsers.

**Verification Matrix:**
- [ ] **Android Chrome (Physical Phone):**
  - Camera button triggers native camera interface.
  - Gallery button uploads image without permissions error.
  - Multi-touch pinch-to-zoom and two-finger pan operate smoothly.
  - Adding a manual peak calculates area > 0 immediately.
  - Dragging a peak boundary handle updates area and relative percent in real time.
- [ ] **iOS Safari (Physical Phone):**
  - Camera and photo library inputs function correctly.
  - Bottom navigation bar avoids iOS Home indicator notch (`safe-area-inset-bottom`).
  - Report download / Print window opens cleanly.
- [ ] **Desktop Browser Check:**
  - Responsive layout scales gracefully.
  - JSON project export downloads `aq_tlc_project.json`.
  - JSON project import restores plate image, lines, lanes, and peaks accurately.

**Exit Gate:**
- Both iOS and Android physical device checks pass without blocking defects.
- Production URL (`https://aq-tlc-mobile.streamlit.app`) is live and operational.

---

### Phase 6: Desktop Maintenance Patch (Isolated Pull Request)
**Objective:** Port the numerical consistency fix (`NUM-01`) to the desktop repository (`AQ-TLC-streamlit`) without altering its layout or session lifecycle.

**Tasks:**
1. Switch to `C:\Users\Giancarlo\Desktop\Antigravity work files\AQ-TLC-streamlit`.
2. Apply the unified `calculate_peak_area` function to `frontend/modules/analysis.js` and `tlc_backend.py`.
3. Update `frontend/modules/profiles.js` so that manual peak creation and boundary dragging use the identical trapezoidal integration.
4. Test locally:
   ```powershell
   streamlit run streamlit_app.py
   ```
5. Commit and push to `AQ-TLC-Streamlit` on `main`:
   ```bash
   git add frontend/modules/analysis.js frontend/modules/profiles.js tlc_backend.py
   git commit -m "fix(numerical): align manual peak integration with Python AUC specification"
   git push origin main
   ```
6. Streamlit Community Cloud automatically rebuilds and redeploys the desktop app within ~60 seconds.

**Exit Gate:**
- Desktop app displays consistent, harmonized peak areas for both automatic and manual peaks.
- Desktop GitHub repository `main` branch is clean and up to date.

---

## 7. Developer Manual Preparation & Streamlit Deployment Guide

Follow this step-by-step checklist to configure and launch both applications on Streamlit Community Cloud.

```
                      ONE-TIME SETUP WORKFLOW
  ┌─────────────────────────────────────────────────────────────┐
  │ 1. Verify GitHub Accounts & Branches (main)                │
  │    - giancarlopascali-hub/AQ-TLC-Streamlit                  │
  │    - giancarlopascali-hub/TLC-APP-PWA                      │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
  ┌──────────────────────────────▼──────────────────────────────┐
  │ 2. Sign In to Streamlit Community Cloud                     │
  │    - Visit https://share.streamlit.io                       │
  │    - Continue with GitHub (Authorize access)                │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
  ┌──────────────────────────────▼──────────────────────────────┐
  │ 3. Create Desktop App on Streamlit Cloud                    │
  │    - Repo: giancarlopascali-hub/AQ-TLC-Streamlit           │
  │    - Branch: main  |  Main file: streamlit_app.py           │
  │    - Python version: 3.11                                   │
  │    - App URL: aq-tlc.streamlit.app                          │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
  ┌──────────────────────────────▼──────────────────────────────┐
  │ 4. Create Mobile App on Streamlit Cloud                     │
  │    - Repo: giancarlopascali-hub/TLC-APP-PWA                 │
  │    - Branch: main  |  Main file: streamlit_app.py           │
  │    - Python version: 3.11                                   │
  │    - App URL: aq-tlc-mobile.streamlit.app                   │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
  ┌──────────────────────────────▼──────────────────────────────┐
  │ 5. Automated CD is Active!                                  │
  │    Every future `git push origin main` auto-deploys in ~60s │
  └─────────────────────────────────────────────────────────────┘
```

### 7.1 Pre-Deployment Verification Checklist
1. **GitHub Account:** Ensure you are logged in to GitHub as `giancarlopascali-hub`.
2. **Repository Visibility & Default Branch:**
   - Open [AQ-TLC-Streamlit Branches](https://github.com/giancarlopascali-hub/AQ-TLC-Streamlit/settings/branches) → Verify default branch is `main`.
   - Open [TLC-APP-PWA Branches](https://github.com/giancarlopascali-hub/TLC-APP-PWA/settings/branches) → Verify default branch is `main`.
3. **Local Git Remote Cleanup:**
   Verify `TLC App PWA` has only `origin` configured:
   ```powershell
   cd "C:\Users\Giancarlo\Desktop\Antigravity work files\TLC App PWA"
   git remote -v
   ```
   *(If `hf` is listed, run `git remote remove hf`)*.

### 7.2 Connecting Streamlit Community Cloud
1. Navigate to **[Streamlit Community Cloud](https://share.streamlit.io)**.
2. Click **Continue with GitHub** and authorize Streamlit to read your repositories.

### 7.3 Step-by-Step: Deploying App 1 (Desktop Workstation)
1. On [share.streamlit.io](https://share.streamlit.io), click **Create app** (top-right) → select **Yup, I have an app**.
2. Fill in the deployment form:
   - **Repository:** `giancarlopascali-hub/AQ-TLC-Streamlit`
   - **Branch:** `main`
   - **Main file path:** `streamlit_app.py`
   - **App URL:** `aq-tlc` (or leave default: `https://aq-tlc.streamlit.app`)
3. Click **Advanced settings...**:
   - **Python version:** Select `3.11`
   - **Secrets:** Leave empty (no API keys required)
4. Click **Deploy!**
5. Streamlit will clone the repository, install dependencies from `requirements.txt`, and boot the app in ~60–90 seconds.

### 7.4 Step-by-Step: Deploying App 2 (Mobile Workstation)
1. On [share.streamlit.io](https://share.streamlit.io), click **Create app** → select **Yup, I have an app**.
2. Fill in the deployment form:
   - **Repository:** `giancarlopascali-hub/TLC-APP-PWA`
   - **Branch:** `main`
   - **Main file path:** `streamlit_app.py`
   - **App URL:** `aq-tlc-mobile` (or leave default: `https://aq-tlc-mobile.streamlit.app`)
3. Click **Advanced settings...**:
   - **Python version:** Select `3.11`
   - **Secrets:** Leave empty
4. Click **Deploy!**
5. Monitor build logs in the lower-right drawer. The app will launch at `https://aq-tlc-mobile.streamlit.app`.

### 7.5 How Automated Continuous Deployment Operates
Once registered, **no further manual work in the Streamlit Cloud dashboard is required**:
- Any time you run `git push origin main` in either local repository, GitHub instantly sends a webhook to Streamlit.
- Streamlit pulls the latest commit, executes incremental dependency checks, and redeploys the container automatically.
- To inspect runtime performance or troubleshoot errors, click the **Manage app** button in the lower-right corner of the running web page to view real-time logs.

---

## 8. Rollback & Disaster Recovery Procedures

Because deployment watches `main`, rollback is clean, reliable, and does not require destructive Git operations.

### Rollback Scenario A: Application Boot Failure in Production
If a recent commit causes a boot error or container crash:
1. Identify the previous good commit hash:
   ```bash
   git log --oneline -5
   ```
2. Create a clean revert commit:
   ```bash
   git revert HEAD --no-edit
   git push origin main
   ```
3. Streamlit Cloud automatically picks up the revert and restores the operational state within 60 seconds.

### Rollback Scenario B: Emergency Rollback to Legacy Flask/HF State
If full restoration of the pre-migration state is ever requested:
1. Checkout the tag created in Phase 0:
   ```bash
   git checkout legacy-flask-hf
   ```
2. The complete legacy source code (`server.py`, `app.js`, `core/algorithms.py`, and Dockerfile) is intact and fully runnable locally with:
   ```powershell
   python server.py
   ```

---

## 9. Definition of Done (DoD) Checklist

### Mobile Architectural Quality
- [ ] Monolithic `app.js` is replaced with modular ES6 files in `frontend/modules/`.
- [ ] Flask routes are replaced with `streamlit_app.py` and `tlc_backend.py`.
- [ ] Hugging Face files are archived; `hf` remote is removed; zero HF workflows run on `main`.
- [ ] All code pushed and verified on `giancarlopascali-hub/TLC-APP-PWA` branch `main`.

### Numerical Consistency
- [ ] Manual peak additions (`profiles.js`) compute area using `calculatePeakArea` instead of `area: 10`.
- [ ] Moving boundaries or apexes recalculates area, `% Area`, and calibration values dynamically.
- [ ] Shared numerical test fixtures pass in Python and JavaScript.

### Streamlit Integration & Mobile UX
- [ ] Immediate `<script>` handshake in `index.html` prevents component load timeouts.
- [ ] Streamlit reruns do not clear the user's active canvas or replay past requests.
- [ ] Direct camera capture and gallery uploads work reliably on physical iOS and Android devices.
- [ ] Touch gestures (pinch-zoom, 2-finger pan, single-touch draw) operate smoothly.
- [ ] Project JSON export/import allows transferring projects across devices and origins.

### Continuous Deployment
- [ ] Desktop app live on Streamlit Cloud (`https://aq-tlc.streamlit.app`).
- [ ] Mobile app live on Streamlit Cloud (`https://aq-tlc-mobile.streamlit.app`).
- [ ] Automated continuous deployment is verified by pushing a test commit to `main`.
