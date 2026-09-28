# AQ-TLC Mobile known limitations

- **Scientific validation:** the application is an analytical aid. Its
  normalization, peak detection, and calibration output require validation for
  the intended method, plate chemistry, imaging conditions, and laboratory
  workflow.
- **RGB projection:** the colour controls are RGB image-weighting presets.
  They are not a physical monochromator, spectrometer, or measured wavelength.
- **Wavelength bandwidth:** no bandwidth control is exposed because there is
  no approved analytical model for it yet.
- **PWA/installability:** the new Streamlit component does not claim
  home-screen installation or offline processing. Verify actual browser
  behaviour on a deployed URL before making such a claim.
- **Offline use:** analytical processing requires the Streamlit host. The app
  displays a status error if it is opened outside that host.
- **Project storage:** recovery is local to a browser origin and can be lost by
  clearing browser data. Export projects before migration or device changes.
- **Image limits:** the browser and backend limit image size, dimensions,
  pixels, lane count, and geometry to protect the hosted worker. Very large
  images may need to be reduced before upload.
- **Cloud behaviour:** Streamlit Community Cloud can sleep inactive apps and
  can change resource limits or hosting settings. Test cold starts and review
  the current workspace settings before release.
- **Legacy fallback:** the old Flask/Hugging Face application remains only
  during the migration window. It is not the feature-equivalent production
  target and will be retired through a separate reviewed change after
  acceptance.
