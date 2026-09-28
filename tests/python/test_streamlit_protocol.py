from __future__ import annotations

import streamlit_app


def request(action: str = "generate_profiles", request_id: str = "profiles-1", payload=None):
    return {
        "protocol_version": 1,
        "action": action,
        "request_id": request_id,
        "payload": {} if payload is None else payload,
    }


def test_success_response_is_versioned_and_correlated(monkeypatch) -> None:
    monkeypatch.setattr(
        streamlit_app.tlc_backend,
        "generate_profiles",
        lambda payload: {"results": [], "_detectPeaks": False},
    )
    component_request, response = streamlit_app.response_for_component_request(request())
    assert component_request is not None
    assert response == {
        "protocol_version": 1,
        "action": "generate_profiles_result",
        "request_id": "profiles-1",
        "ok": True,
        "data": {"results": [], "_detectPeaks": False},
        "error": None,
    }


def test_invalid_protocol_and_unknown_action_have_typed_errors() -> None:
    invalid_protocol = request()
    invalid_protocol["protocol_version"] = 2
    _request, response = streamlit_app.response_for_component_request(invalid_protocol)
    assert response["action"] == "generate_profiles_result"
    assert response["request_id"] == "profiles-1"
    assert response["error"]["code"] == "UNSUPPORTED_PROTOCOL"

    unknown = request(action="erase_everything")
    _request, response = streamlit_app.response_for_component_request(unknown)
    assert response["action"] == "erase_everything_result"
    assert response["error"]["code"] == "UNSUPPORTED_ACTION"


def test_malformed_request_id_is_not_reflected_unboundedly() -> None:
    _request, response = streamlit_app.response_for_component_request(
        request(request_id="bad id")
    )
    assert response["action"] == "generate_profiles_result"
    assert response["request_id"] == "bad id"
    assert response["error"]["code"] == "INVALID_REQUEST_ID"

    _request, response = streamlit_app.response_for_component_request(
        request(request_id="x" * 129)
    )
    assert response["request_id"] == ""
    assert response["error"]["code"] == "INVALID_REQUEST_ID"


def test_backend_validation_error_is_mapped_without_a_traceback(monkeypatch) -> None:
    monkeypatch.setattr(
        streamlit_app.tlc_backend,
        "crop_image",
        lambda payload: (_ for _ in ()).throw(
            streamlit_app.tlc_backend.ImageValidationError("The selected image could not be decoded.")
        ),
    )
    _request, response = streamlit_app.response_for_component_request(
        request(action="crop", request_id="crop-1")
    )
    assert response["ok"] is False
    assert response["action"] == "crop_result"
    assert response["error"] == {
        "code": "INVALID_IMAGE",
        "message": "The selected image could not be decoded.",
        "retryable": False,
    }


def test_same_id_is_deduplicated_and_mismatched_reuse_is_rejected(monkeypatch) -> None:
    calls = []

    def fake_crop(payload):
        calls.append(payload)
        return {"image": "data:image/jpeg;base64,AA=="}

    monkeypatch.setattr(streamlit_app.tlc_backend, "crop_image", fake_crop)
    cache = streamlit_app.RequestResponseCache(max_items=4, max_bytes=1024)
    first = request(action="crop", request_id="crop-1", payload={"x": 1})
    first_response = streamlit_app.process_component_value(first, cache)
    repeated_response = streamlit_app.process_component_value(first, cache)
    assert repeated_response is first_response
    assert calls == [{"x": 1}]

    changed = request(action="crop", request_id="crop-1", payload={"x": 2})
    mismatch = streamlit_app.process_component_value(changed, cache)
    assert mismatch["ok"] is False
    assert mismatch["error"]["code"] == "DUPLICATE_REQUEST_MISMATCH"
    assert calls == [{"x": 1}]


def test_response_cache_is_byte_bounded() -> None:
    cache = streamlit_app.RequestResponseCache(max_items=3, max_bytes=100)
    response = {
        "protocol_version": 1,
        "action": "crop_result",
        "request_id": "crop-1",
        "ok": True,
        "data": {"image": "x" * 500},
        "error": None,
    }
    assert cache.put("crop-1", "fingerprint", response) is False
    assert cache.get("crop-1") is None
    assert cache.stats()["bytes"] == 0


def test_host_rejects_an_oversized_data_url_before_fingerprinting(monkeypatch) -> None:
    cache = streamlit_app.RequestResponseCache(max_items=4, max_bytes=1024)
    monkeypatch.setattr(streamlit_app.tlc_backend, "MAX_IMAGE_DATA_URL_BYTES", 20)
    oversized = request(payload={"image": "data:image/png;base64," + "A" * 100})
    response = streamlit_app.process_component_value(oversized, cache)
    assert response["ok"] is False
    assert response["error"]["code"] == "IMAGE_TOO_LARGE"
    assert cache.stats()["items"] == 0


def test_response_identity_does_not_compare_crop_data_urls() -> None:
    previous = {
        "protocol_version": 1,
        "action": "crop_result",
        "request_id": "crop-1",
        "ok": True,
        "data": {"image": "old"},
        "error": None,
    }
    current = {**previous, "data": {"image": "new"}}
    assert streamlit_app._same_response_identity(previous, current)
