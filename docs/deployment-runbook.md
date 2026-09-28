# Mobile Streamlit deployment runbook

This runbook covers the new mobile Streamlit application. It does not replace
or reconfigure the existing desktop Streamlit app.

## Before creating a preview

1. Confirm the candidate branch is `codex/mobile-streamlit-final` (or record
   the actual reviewed branch and commit).
2. Confirm the GitHub Actions checks pass, including the Streamlit candidate
   and retained legacy-fallback jobs.
3. Record the current Hugging Face fallback URL and the previous-good Git
   commit. Leave that deployment online during preview and the observation
   window.
4. Confirm that a deployment is permitted to process the intended plate
   images, and decide whether the Streamlit app should be public or restricted.

## Create the mobile preview app (manual Streamlit Cloud step)

In Streamlit Community Cloud, create a **new**, clearly non-production app
with these coordinates:

| Setting | Value |
|---|---|
| Repository | `giancarlopascali-hub/TLC-APP-PWA` |
| Branch | `codex/mobile-streamlit-final` |
| Main file path | `streamlit_app.py` |
| Python | `3.11` |
| Secrets | None, unless a separately approved integration requires one |

Use a preview-only subdomain if Community Cloud offers one. Record the final
URL, deployed commit SHA, access mode, Python version, build log result, and
cold-start behaviour. Dependency changes can take longer than ordinary code
updates. Do not change the Python version in place after deployment; Cloud
requires a redeploy for that change.

## Preview acceptance

Run the following on the preview URL, not just locally:

- Load a representative non-sensitive plate image from gallery and camera.
- Crop and rotate it; add lines and marks; generate lanes and profiles.
- Change settings quickly and confirm an old response cannot replace a newer
  result.
- Add, move, resize, and delete manual peaks; verify area/Rf/table updates.
- Check relative, area-calibration, and molecular-weight calibration error and
  success paths.
- Export/import a project and create a report.
- Test portrait and landscape, virtual keyboard, safe areas, slow connection,
  reload/recovery, and wake after the app has slept.
- Test on current iOS Safari and Android Chrome. Confirm actual camera,
  download, popup, and home-screen behaviour rather than assuming PWA support.

Log failures with the preview URL and commit SHA. Do not merge to `main` until
the owner accepts these results.

## Production cutover (manual approval required)

After preview acceptance, merge the reviewed release to `main` and create a
separate production Cloud app with:

| Setting | Value |
|---|---|
| Repository | `giancarlopascali-hub/TLC-APP-PWA` |
| Branch | `main` |
| Main file path | `streamlit_app.py` |
| Python | the exact preview-tested version, currently `3.11` |

Record the production URL and commit, then repeat a focused smoke test on both
phone platforms. Keep the old Hugging Face deployment available for the
agreed observation period.

## Rollback

If the component fails to load, numerical tests fail, a current result is
replaced by a stale result, project recovery is unsafe, or a core phone flow is
blocked:

1. Stop further release changes.
2. Revert the specific release pull request or identified release commit; do
   not blindly revert `HEAD` or rewrite `main` history.
3. Confirm Cloud serves the restored commit and rerun the focused smoke test.
4. Direct affected users to the retained Hugging Face fallback during the
   migration window if necessary.
5. Add a regression test and an incident note before another release attempt.

## References

- [Deploy a Streamlit Community Cloud app](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/deploy)
- [Community Cloud file organization](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/file-organization)
- [Community Cloud dependencies](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/app-dependencies)
- [Manage a Community Cloud app](https://docs.streamlit.io/deploy/streamlit-community-cloud/manage-your-app)
