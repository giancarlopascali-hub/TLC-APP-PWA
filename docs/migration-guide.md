# Moving projects to AQ-TLC Mobile on Streamlit

Projects are stored in browser-local storage, so they do not automatically
cross from the old Hugging Face origin to the new Streamlit URL, or from one
phone/browser to another.

## For new Streamlit projects

Use the **Project** export button in the workspace before changing device,
browser, or deployment URL. Import the resulting JSON file from the Project
import button after opening the destination app. The file contains the image,
annotations, analytical settings, and peaks; handle it as sensitive laboratory
data where appropriate.

The Streamlit project format is versioned. It can migrate the unversioned
shape used by earlier builds when that data is available on the same browser
origin. Invalid, corrupt, or newer unsupported files are rejected with a
clear message rather than partially overwriting the active project.

## From the retained Hugging Face application

The old app's browser-local `tlc_project` cannot be read by a new Streamlit
origin. Before the old deployment is retired, finish or export any necessary
reports there and retain the original image and analysis record. Re-upload the
image in Streamlit and recreate the annotations if no project export file is
available.

This limitation is intentional: browser-origin isolation prevents one public
website from reading another website's local project data. The old deployment
will remain available through the agreed migration window, so do not delete
its local browser data until you have confirmed the new project is complete.

## Before clearing old data

1. Export a Streamlit project and verify that it imports successfully.
2. Export any report required for the laboratory record.
3. Confirm profile, peak, and calibration results after import.
4. Keep a copy of the source image outside browser storage.

Do not rely on browser cache clearing, device migration, or home-screen app
installation to preserve a project.
