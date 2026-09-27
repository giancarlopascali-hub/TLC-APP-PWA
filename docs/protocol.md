# AQ-TLC Mobile component protocol

The mobile UI runs in a Streamlit custom-component iframe.  It sends JSON-shaped
requests with `window.parent.postMessage` through Streamlit’s component bridge;
the Python host returns the response in the component argument `response`.

## Version 1 request

```json
{
  "protocol_version": 1,
  "action": "generate_profiles",
  "request_id": "profiles-000108",
  "payload": {}
}
```

`action` is one of `generate_profiles` or `crop`.  `request_id` must be unique
within the browser session and match `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`.  The
payload is always an object.  Image values must be JPEG, PNG, or WebP base64
data URLs; raw image data must never be sent in logs or error messages.

## Response envelope

Every accepted request and every request that can safely be correlated receives
the same envelope shape:

```json
{
  "protocol_version": 1,
  "action": "generate_profiles_result",
  "request_id": "profiles-000108",
  "ok": true,
  "data": {},
  "error": null
}
```

An error keeps the result action and request ID when they are safe to echo:

```json
{
  "protocol_version": 1,
  "action": "crop_result",
  "request_id": "crop-000109",
  "ok": false,
  "data": null,
  "error": {
    "code": "INVALID_CROP",
    "message": "The selected crop does not overlap the image.",
    "retryable": false
  }
}
```

The currently defined error codes are `INVALID_REQUEST`,
`UNSUPPORTED_PROTOCOL`, `UNSUPPORTED_ACTION`, `INVALID_REQUEST_ID`,
`INVALID_PAYLOAD`, `INVALID_IMAGE`, `IMAGE_TOO_LARGE`, `INVALID_GEOMETRY`,
`INVALID_CROP`, `INVALID_PARAMETER`, `DUPLICATE_REQUEST_MISMATCH`, and
`PROCESSING_FAILED`.

## Lifecycle rules

- The frontend tracks the latest request ID separately for `crop` and
  `generate_profiles`; a response from one action cannot supersede the other.
- The Python host retains a bounded request/response ledger.  Replaying an
  identical ID returns the original response without recomputing it.  Reusing
  an ID with changed content returns `DUPLICATE_REQUEST_MISMATCH`.
- The host supplies the pending response on every rerun until a newer response
  replaces it.  The frontend deduplicates IDs before applying a response.
- The frontend coalesces rapid profile-setting changes and ignores stale
  responses.  It must show error messages in its non-modal status area.
- Only the two actions above are accepted.  New actions require a protocol
  version review, validation rules, tests, and documentation.

## Action data

`crop_result.data` contains `{ "image": "data:image/jpeg;base64,..." }`.

`generate_profiles_result.data` contains:

```json
{
  "results": [
    {
      "id": "lane-1",
      "profile_display": [],
      "profile_analysis": [],
      "peaks": []
    }
  ],
  "_detectPeaks": true
}
```

The profile and peak fields are defined in
[the numerical contract](numerical-contract.md).
