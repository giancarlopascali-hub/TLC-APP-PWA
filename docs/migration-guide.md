# Moving an AQ-TLC Mobile workflow

The current Streamlit Mobile app does not provide project-file export/import
or cross-device project recovery. A normal refresh or new browser session
starts at the image-loading screen.

## Before changing a device, browser or deployment URL

1. Keep the original plate image outside the browser.
2. Finish the current analysis before changing environments.
3. Export the active-lane or all-lane report and verify that the report opens.
4. Record any lane names, peak names, response factors and calibration values
   needed to recreate the analysis.
5. If the analysis must be reproduced, reopen the source image in the new app
   and recreate the lines, marks, lanes and peak edits.

## When moving from an older deployment

Browser security prevents one deployment origin from reading storage owned by
another deployment. Finish and export any required reports from the older app
before it is retired. If the older deployment offered project export, retain
that file as an audit artifact, but do not assume the current Mobile app can
import it.

After opening the new Streamlit deployment:

1. Re-upload the original image.
2. Recreate the plate geometry and calculate lanes.
3. Confirm the profile, peak boundaries and Rf values.
4. Re-enter standards and correction factors.
5. Export a new report from the current deployment.

Project portability can be added in a future release only after its file
format, validation, privacy and backward-compatibility behaviour are tested.
