# AQ-TLC Mobile — Streamlit Community Cloud runbook

This runbook keeps the Mobile app deployed from the repository's single
long-lived branch, `main`.

## Production coordinates

| Streamlit field | Required value |
|---|---|
| Repository | `giancarlopascali-hub/TLC-APP-PWA` |
| Branch | `main` |
| Main file path | `streamlit_app.py` |
| Python version | `3.11` |
| Secrets | None required by the current app |

Do not deploy production from a `codex/*`, preview or personal branch. GitHub
`main` is the source of truth.

## If the existing Streamlit app already uses `main`

1. Sign in at <https://share.streamlit.io> with the GitHub account that can
   administer the repository.
2. Select the workspace for `giancarlopascali-hub`.
3. Find the Mobile app and open its overflow menu (`⋮`).
4. Open **Settings** and record the current App URL, access setting and any
   secrets. The current app should not require secrets.
5. Open the running app and choose **Manage app** in the lower-right corner to
   view the Cloud logs.
6. Confirm the log shows a checkout of `main` and that `streamlit_app.py`
   starts successfully.
7. A push to `main` normally updates the app automatically. If it does not, use
   the app overflow menu and choose **Reboot**, then confirm the reboot.

## If the existing Streamlit app uses an old feature branch

Streamlit identifies an app by four GitHub coordinates: owner, repository,
branch and entrypoint. The branch cannot be changed in place. Moving from an
old branch to `main` therefore requires deleting and redeploying the Streamlit
app.

Before deleting anything:

1. Open the app's **Settings** and record:
   - the exact App URL/custom subdomain;
   - repository, branch and entrypoint;
   - access mode (public or restricted);
   - all secrets, if any;
   - the current Python version from the build log or deployment record.
2. Confirm GitHub `main` contains the desired release and its automated checks
   pass.
3. Warn active users that the app will be unavailable for a few minutes during
   redeployment.

Then redeploy:

1. In the Streamlit workspace, open the old app's overflow menu (`⋮`) and
   choose **Delete**. Confirm deletion only after recording the details above.
2. Click **Create app** in the upper-right corner.
3. When asked whether you already have an app, choose **Yup, I have an app**.
4. Enter the production coordinates from the table above.
5. In **App URL**, enter the old custom subdomain exactly. Streamlit releases a
   custom subdomain immediately when its previous app is deleted.
6. Open **Advanced settings** and select Python `3.11`.
7. Leave **Secrets** empty unless separately approved credentials are required.
   Never commit `secrets.toml` or credentials to GitHub.
8. Click **Save**, then **Deploy**.
9. Watch the build log until the app reports a healthy launch. Dependency
   installation can take longer than an ordinary source update.
10. Restore the previous public/restricted access setting in **Settings**.

## Acceptance test after deployment

Run this test on the deployed URL, not only on localhost:

1. Open the app on current iOS Safari and Android Chrome.
2. Load a representative non-sensitive image from the gallery.
3. Test **Take photo** on at least one real phone.
4. Crop and rotate the image; add origin/front lines and spotting marks.
5. Calculate lanes and verify each mark produces the expected lane.
6. Change polarity, sensitivity, distance and width; confirm profiles update.
7. Add, move, resize and delete a manual peak; confirm area, Rf and the table
   update together.
8. Check Relative, Area Calibration and MW Calibration modes, including
   invalid/missing standard messages.
9. Export an active-lane report and an all-lane report. Verify Print/Save as
   PDF and the downloaded-HTML fallback if pop-ups are blocked.
10. Test portrait and landscape orientation, the on-screen keyboard, a cold
    start after hibernation and a deliberate app reboot.

## Routine updates

1. Make and test the change locally.
2. Commit it to `main` and push to GitHub.
3. Wait for the GitHub Actions workflow to pass.
4. Streamlit should detect the new commit automatically. Source-only changes
   usually appear quickly; dependency changes trigger a full rebuild.
5. Open **Manage app** and inspect logs if the update does not appear.
6. Use **Reboot** only when a fresh process/build is needed; a reboot interrupts
   current users for a few minutes.
7. Repeat a focused smoke test of the changed area.

To add or change Python packages, edit the root `requirements.txt`, test with
Python 3.11, commit and push. Use a root `packages.txt` only if a Debian system
package is genuinely required.

## Python version changes

Community Cloud cannot change an app's Python version in place. To change it:

1. Record the URL, GitHub coordinates, access setting and secrets.
2. Test the complete application locally with the target Python version.
3. Delete the Streamlit app.
4. Redeploy it from `main`, choose the new Python version in **Advanced
   settings**, and reuse the recorded subdomain.
5. Repeat the full acceptance test.

## Rollback without recreating a feature branch

1. Identify the faulty commit on `main`.
2. Revert that commit with a new Git commit; do not force-push or rewrite
   `main` history.
3. Push the revert to GitHub and wait for Streamlit to update.
4. If necessary, reboot the app after the revert is visible in GitHub.
5. Run the focused acceptance test and add a regression test before attempting
   the change again.

## Official references

- [Deploy an app](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/deploy)
- [Manage an app](https://docs.streamlit.io/deploy/streamlit-community-cloud/manage-your-app)
- [App settings](https://docs.streamlit.io/deploy/streamlit-community-cloud/manage-your-app/app-settings)
- [Change GitHub coordinates](https://docs.streamlit.io/deploy/streamlit-community-cloud/manage-your-app/rename-your-app)
- [Reboot an app](https://docs.streamlit.io/deploy/streamlit-community-cloud/manage-your-app/reboot-your-app)
- [App dependencies](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/app-dependencies)
- [Change Python version](https://docs.streamlit.io/deploy/streamlit-community-cloud/manage-your-app/upgrade-python)
