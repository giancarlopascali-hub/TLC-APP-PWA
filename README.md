# AQ-TLC Mobile

AQ-TLC Mobile is a touch-oriented quantitative thin-layer chromatography
workspace deployed as a Streamlit custom component. It keeps the existing
mobile workflow—camera or gallery input, crop and rotation, origin/front lines,
spotting marks, lane generation, profile editing, calibration, reports, undo,
and local recovery—while using a Streamlit-hosted analysis service.

## Release status

The Streamlit application is ready for a **preview deployment** from
`codex/mobile-streamlit-final`. It must pass the documented Streamlit Cloud
and real-device acceptance checks before it is merged to `main` and used as the
production mobile application.

The root `index.html` / `app.js` Flask application and Hugging Face Docker
configuration are deliberately retained as a temporary migration fallback.
They are not the new mobile app and should remain available until the Streamlit
release has completed its agreed observation window. The fallback uses
`requirements-legacy.txt`; Streamlit Community Cloud uses only
`requirements.txt`.

## Capabilities

- Camera and gallery image input with client-side downscaling
- Crop, rotation, origin/front lines, spotting marks, lane guidance, and touch
  gestures
- Server-computed density profiles, automatic peaks, and manual peak editing
- Consistent peak areas calculated from the normalized analytical profile and
  explicit integration bounds
- Relative, area-calibration, and molecular-weight calibration modes with
  validation for invalid standards
- Local project recovery plus versioned project export/import
- Printable reports with safe text serialization
- RGB image-projection controls; these are image weightings, not physical
  spectrometer or wavelength-bandwidth measurements

See [the numerical contract](docs/numerical-contract.md) and
[component protocol](docs/protocol.md) for the implementation contracts.

## Important limitations and privacy

The Streamlit component is not claimed to be an installable PWA. The old
top-level PWA manifest/service-worker files belong to the retained fallback;
an iframe component cannot establish equivalent top-level installability.

Project recovery is browser-origin-specific. Export a project before moving
to another device, browser, or deployment URL. Plate images are held in the
browser for the active project and sent to the selected Streamlit app only for
analysis. This application does not implement server-side project accounts or
long-term image storage. Do not upload sensitive material until the app's
Cloud access mode and organisational privacy requirements have been confirmed.

Read [known limitations](docs/known-limitations.md) and the
[migration guide](docs/migration-guide.md) before cutover.

## Local development

Use Python 3.11 for the Streamlit candidate.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt -r requirements-dev.txt
streamlit run streamlit_app.py
```

Open the local URL printed by Streamlit. The Streamlit component must be
opened through that host; opening `frontend/index.html` directly correctly
shows that the analysis host is unavailable.

Run the automated checks with:

```powershell
python -m py_compile streamlit_app.py tlc_backend.py
python -m pytest tests/python -q
node --test tests/javascript/*.test.mjs
```

To run the retained legacy fallback locally instead, install
`requirements-legacy.txt` and run `python server.py`. Do not use that command
to validate the new Streamlit component.

## Deployment and release

The exact preview, production, validation, and rollback procedure is in
[the deployment runbook](docs/deployment-runbook.md). In short:

1. Push and verify the implementation branch and its CI checks.
2. Create a separate Streamlit Community Cloud preview app from
   `streamlit_app.py` on Python 3.11.
3. Validate it on physical iOS Safari and Android Chrome devices.
4. Obtain acceptance, merge the specific reviewed release to `main`, then
   create a separate production Streamlit app from `main`.
5. Keep Hugging Face live during the agreed observation period; retire it only
   through a deliberate, separately reviewed change.

The existing desktop Streamlit app is independent. Do not recreate, redeploy,
or change its intentional browser-session behaviour as part of this mobile
release.
