# AQ-TLC Mobile

AQ-TLC Mobile is the touch-oriented Streamlit edition of the quantitative
thin-layer chromatography workspace. It supports camera or gallery input,
plate preparation, lane generation, profile editing, calibration and printable
reports from a phone-sized interface.

## Production source

The production source is the `main` branch of:

- Repository: `giancarlopascali-hub/TLC-APP-PWA`
- Branch: `main`
- Streamlit entrypoint: `streamlit_app.py`
- Supported deployment Python: `3.11`

Feature branches are temporary development work and must not be used as
permanent Streamlit deployment coordinates. See the
[Streamlit deployment runbook](docs/deployment-runbook.md) for first-time
deployment, moving an existing app from an old branch, routine updates and
rollback.

## Capabilities

- Camera and gallery image input with client-side downscaling
- Crop, rotation, origin/front lines, spotting marks and touch gestures
- Server-computed density profiles and automatic peak detection
- Manual peak add, move, resize and delete workflows
- Peak areas calculated from the normalized analytical profile and explicit
  integration bounds
- Relative, area-calibration and molecular-weight calibration modes
- Printable active-lane and all-lane reports
- RGB image-projection controls and colour inversion

See [the numerical contract](docs/numerical-contract.md) and
[component protocol](docs/protocol.md) for the implementation contracts.

## Session, privacy and analytical limitations

The active analysis is temporary. The normal lifecycle starts on a fresh
landing page after a refresh or a new browser session. The current Mobile app
does not offer project-file export/import, user accounts or long-term server
storage. Keep the source image and export the required report before closing
or refreshing the app.

Plate images are sent to the selected Streamlit deployment for analysis. Do
not upload sensitive material until the deployment access mode and the
organisation's privacy requirements have been confirmed.

RGB projection controls are image-processing weightings. They are not a
physical monochromator, spectrometer or measured wavelength bandwidth. AQ-TLC
is an analytical aid and must be validated for the intended method, plate
chemistry and imaging conditions.

Read [known limitations](docs/known-limitations.md) and the
[migration notes](docs/migration-guide.md) before changing a production URL or
retiring an older deployment.

## Local development

Use Python 3.11.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt -r requirements-dev.txt
streamlit run streamlit_app.py
```

Open the local URL printed by Streamlit. The component must be opened through
the Streamlit host; opening `frontend/index.html` directly does not provide the
Python analysis service.

Run the automated checks with:

```powershell
python -m py_compile streamlit_app.py tlc_backend.py
python -m pytest tests/python -q
node --test tests/javascript/*.test.mjs
```

## Repository layout

- `streamlit_app.py` — Streamlit entrypoint and component protocol host
- `tlc_backend.py` — analytical backend
- `frontend/` — current Mobile interface and quick guide
- `tests/` — Python and JavaScript regression tests
- `docs/` — numerical, protocol, migration and deployment documentation
- `archive/planning/` — historical implementation reviews and plans; not used
  by the Streamlit production entrypoint

The Desktop Streamlit app is maintained independently in
`giancarlopascali-hub/AQ-TLC-Streamlit` and is also deployed from its `main`
branch.
