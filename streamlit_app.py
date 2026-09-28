"""Streamlit host for the AQ-TLC mobile custom component.

The analytical workspace stays inside the iframe.  Streamlit session state is
used only to retain a bounded request/response ledger across reruns, allowing
the component to correlate responses by action and request ID.

This module keeps protocol helpers separate from ``main`` so they can be tested
without starting a Streamlit server.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Mapping

from PIL import Image

import tlc_backend


PROTOCOL_VERSION = 1
ALLOWED_ACTIONS = frozenset({"crop", "generate_profiles"})
MAX_REQUEST_ID_LENGTH = 128
MAX_RESPONSE_CACHE_ITEMS = 16
MAX_RESPONSE_CACHE_BYTES = 24 * 1024 * 1024

_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_SAFE_ACTION_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


@dataclass(frozen=True)
class ComponentRequest:
    """A protocol-v1 request that passed structural validation."""

    action: str
    request_id: str
    payload: dict[str, Any]


class ProtocolError(Exception):
    """A safe client-visible protocol failure."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        action: Any = None,
        request_id: Any = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.action = action
        self.request_id = request_id
        self.retryable = retryable


def _safe_request_id(value: Any) -> str:
    """Return an ID safe to echo in a response, or an empty sentinel."""

    if isinstance(value, str) and len(value) <= MAX_REQUEST_ID_LENGTH:
        return value
    return ""


def _response_action(action: Any) -> str:
    """Derive a safe result action without reflecting arbitrary text."""

    if isinstance(action, str) and _SAFE_ACTION_RE.fullmatch(action):
        return f"{action}_result"
    return "protocol_error"


def success_response(request: ComponentRequest, data: dict[str, Any]) -> dict[str, Any]:
    return {
        "protocol_version": PROTOCOL_VERSION,
        "action": _response_action(request.action),
        "request_id": request.request_id,
        "ok": True,
        "data": data,
        "error": None,
    }


def error_response(
    *,
    action: Any,
    request_id: Any,
    code: str,
    message: str,
    retryable: bool = False,
) -> dict[str, Any]:
    return {
        "protocol_version": PROTOCOL_VERSION,
        "action": _response_action(action),
        "request_id": _safe_request_id(request_id),
        "ok": False,
        "data": None,
        "error": {
            "code": code,
            "message": message,
            "retryable": bool(retryable),
        },
    }


def validate_component_request(value: Any) -> ComponentRequest:
    """Validate the structural component envelope before backend work begins."""

    if not isinstance(value, Mapping):
        raise ProtocolError(
            "INVALID_REQUEST",
            "The component request must be an object.",
        )

    action = value.get("action")
    request_id = value.get("request_id")
    protocol_version = value.get("protocol_version")
    payload = value.get("payload")

    if isinstance(protocol_version, bool) or protocol_version != PROTOCOL_VERSION:
        raise ProtocolError(
            "UNSUPPORTED_PROTOCOL",
            f"This application supports protocol version {PROTOCOL_VERSION}.",
            action=action,
            request_id=request_id,
        )
    if not isinstance(action, str) or action not in ALLOWED_ACTIONS:
        raise ProtocolError(
            "UNSUPPORTED_ACTION",
            "This request action is not supported.",
            action=action,
            request_id=request_id,
        )
    if not isinstance(request_id, str) or not _REQUEST_ID_RE.fullmatch(request_id):
        raise ProtocolError(
            "INVALID_REQUEST_ID",
            "request_id must contain 1 to 128 letters, numbers, dots, colons, dashes, or underscores.",
            action=action,
            request_id=request_id,
        )
    if not isinstance(payload, Mapping):
        raise ProtocolError(
            "INVALID_PAYLOAD",
            "payload must be an object.",
            action=action,
            request_id=request_id,
        )
    return ComponentRequest(action=action, request_id=request_id, payload=dict(payload))


def _execute_request(request: ComponentRequest) -> dict[str, Any]:
    if request.action == "crop":
        return tlc_backend.crop_image(request.payload)
    if request.action == "generate_profiles":
        return tlc_backend.generate_profiles(request.payload)
    # Defensive only: validate_component_request is the authoritative allowlist.
    raise ProtocolError(
        "UNSUPPORTED_ACTION",
        "This request action is not supported.",
        action=request.action,
        request_id=request.request_id,
    )


def response_for_component_request(value: Any) -> tuple[ComponentRequest | None, dict[str, Any]]:
    """Dispatch a raw component value and return a typed protocol envelope."""

    try:
        request = validate_component_request(value)
    except ProtocolError as error:
        return None, error_response(
            action=error.action,
            request_id=error.request_id,
            code=error.code,
            message=error.message,
            retryable=error.retryable,
        )

    try:
        return request, success_response(request, _execute_request(request))
    except tlc_backend.TLCBackendError as error:
        return request, error_response(
            action=request.action,
            request_id=request.request_id,
            code=error.code,
            message=error.message,
            retryable=error.retryable,
        )
    except Exception:
        # Do not send a traceback or payload-derived error to the browser.
        return request, error_response(
            action=request.action,
            request_id=request.request_id,
            code="PROCESSING_FAILED",
            message="The analysis could not be completed. Please try again.",
            retryable=True,
        )


def _fingerprint_update(hasher: Any, value: Any, *, depth: int = 0) -> None:
    """Hash a JSON-shaped request without constructing another giant JSON string."""

    if depth > 32:
        hasher.update(b"<depth-limit>")
        return
    if value is None:
        hasher.update(b"null")
    elif isinstance(value, bool):
        hasher.update(b"true" if value else b"false")
    elif isinstance(value, str):
        encoded = value.encode("utf-8", errors="replace")
        hasher.update(b"str:")
        hasher.update(str(len(encoded)).encode("ascii"))
        hasher.update(b":")
        hasher.update(encoded)
    elif isinstance(value, (int, float)):
        hasher.update(f"num:{value!r}".encode("ascii", errors="replace"))
    elif isinstance(value, Mapping):
        hasher.update(b"{")
        for key in sorted(value, key=lambda item: str(item)):
            _fingerprint_update(hasher, str(key), depth=depth + 1)
            _fingerprint_update(hasher, value[key], depth=depth + 1)
        hasher.update(b"}")
    elif isinstance(value, (list, tuple)):
        hasher.update(b"[")
        for item in value:
            _fingerprint_update(hasher, item, depth=depth + 1)
        hasher.update(b"]")
    else:
        hasher.update(f"<{type(value).__name__}>".encode("ascii"))


def request_fingerprint(value: Any) -> str:
    """Return a stable, non-reversible fingerprint for duplicate detection."""

    hasher = hashlib.sha256()
    _fingerprint_update(hasher, value)
    return hasher.hexdigest()


def _preflight_request_payload(request: ComponentRequest) -> None:
    """Reject obviously oversized payload fields before duplicate hashing.

    The backend repeats these checks before decoding.  Keeping this inexpensive
    host-side gate means a maliciously large data URL or lane list is not first
    walked in full merely to build a cache fingerprint.
    """

    image = request.payload.get("image")
    if isinstance(image, str) and len(image) > tlc_backend.MAX_IMAGE_DATA_URL_BYTES:
        raise tlc_backend.ImageLimitError("The encoded image exceeds the supported size limit.")
    lanes = request.payload.get("lanes")
    if isinstance(lanes, list) and len(lanes) > tlc_backend.MAX_LANES:
        raise tlc_backend.PayloadValidationError(
            f"No more than {tlc_backend.MAX_LANES} lanes can be analysed at once."
        )


@dataclass
class _ResponseCacheEntry:
    fingerprint: str
    response: dict[str, Any]
    size: int


class RequestResponseCache:
    """Bounded per-session ledger used to deduplicate component requests."""

    def __init__(
        self,
        *,
        max_items: int = MAX_RESPONSE_CACHE_ITEMS,
        max_bytes: int = MAX_RESPONSE_CACHE_BYTES,
    ) -> None:
        if max_items < 1 or max_bytes < 1:
            raise ValueError("Response-cache limits must be positive")
        self.max_items = max_items
        self.max_bytes = max_bytes
        self._entries: OrderedDict[str, _ResponseCacheEntry] = OrderedDict()
        self._bytes = 0

    @staticmethod
    def _size(response: dict[str, Any]) -> int:
        return len(
            json.dumps(
                response,
                ensure_ascii=False,
                separators=(",", ":"),
                allow_nan=False,
            ).encode("utf-8")
        )

    def get(self, request_id: str) -> _ResponseCacheEntry | None:
        entry = self._entries.get(request_id)
        if entry is not None:
            self._entries.move_to_end(request_id)
        return entry

    def put(self, request_id: str, fingerprint: str, response: dict[str, Any]) -> bool:
        size = self._size(response)
        previous = self._entries.pop(request_id, None)
        if previous is not None:
            self._bytes -= previous.size
        if size > self.max_bytes:
            return False
        entry = _ResponseCacheEntry(fingerprint=fingerprint, response=response, size=size)
        self._entries[request_id] = entry
        self._bytes += size
        while self._entries and (
            len(self._entries) > self.max_items or self._bytes > self.max_bytes
        ):
            _, evicted = self._entries.popitem(last=False)
            self._bytes -= evicted.size
        return True

    def stats(self) -> dict[str, int]:
        return {
            "items": len(self._entries),
            "bytes": self._bytes,
            "max_items": self.max_items,
            "max_bytes": self.max_bytes,
        }


def process_component_value(
    value: Any,
    cache: RequestResponseCache,
) -> dict[str, Any]:
    """Apply deduplication before dispatching a component request.

    Reusing an ID with a changed payload is an explicit protocol error instead
    of an accidental replay of a potentially unrelated crop/profile result.
    """

    try:
        request = validate_component_request(value)
    except ProtocolError:
        _request, response = response_for_component_request(value)
        return response

    try:
        _preflight_request_payload(request)
    except tlc_backend.TLCBackendError as error:
        return error_response(
            action=request.action,
            request_id=request.request_id,
            code=error.code,
            message=error.message,
            retryable=error.retryable,
        )

    fingerprint = request_fingerprint(value)
    cached = cache.get(request.request_id)
    if cached is not None:
        if cached.fingerprint == fingerprint:
            return cached.response
        return error_response(
            action=request.action,
            request_id=request.request_id,
            code="DUPLICATE_REQUEST_MISMATCH",
            message="request_id was reused with different request data.",
            retryable=False,
        )

    _request, response = response_for_component_request(value)
    cache.put(request.request_id, fingerprint, response)
    return response


def _same_response_identity(previous: Any, current: Mapping[str, Any]) -> bool:
    """Avoid comparing large crop data URLs on each Streamlit rerun."""

    if not isinstance(previous, Mapping):
        return False
    return (
        previous.get("protocol_version") == current.get("protocol_version")
        and previous.get("action") == current.get("action")
        and previous.get("request_id") == current.get("request_id")
        and previous.get("ok") == current.get("ok")
        and previous.get("error") == current.get("error")
    )


def _get_session_cache(session_state: Any) -> RequestResponseCache:
    key = "_aq_tlc_mobile_response_cache"
    cache = session_state.get(key)
    if not isinstance(cache, RequestResponseCache):
        cache = RequestResponseCache()
        session_state[key] = cache
    return cache


def main() -> None:
    """Render the component and route its next request, if any."""

    import streamlit as st
    import streamlit.components.v1 as components

    root_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.join(root_dir, "frontend")
    favicon_path = os.path.join(root_dir, "favicon.ico")
    favicon = Image.open(favicon_path) if os.path.exists(favicon_path) else None

    st.set_page_config(
        page_title="AQ-TLC Mobile",
        page_icon=favicon,
        layout="wide",
        initial_sidebar_state="collapsed",
        menu_items={"About": "AQ-TLC Mobile — Quantitative TLC analysis"},
    )
    st.markdown(
        """
        <style>
          #MainMenu, footer, header { visibility: hidden; }
          section[data-testid="stSidebar"] { display: none; }
          .block-container { padding: 0 !important; max-width: 100% !important; }
          /* Streamlit includes a small vertical-block gap above components.
             Fill the remaining dynamic viewport rather than imposing a
             desktop-sized iframe that can hide mobile controls off-screen. */
          iframe[data-testid="stCustomComponentV1"] {
            border: 0;
            display: block;
            height: calc(100vh - 16px) !important;
            height: calc(100dvh - 16px) !important;
          }
        </style>
        """,
        unsafe_allow_html=True,
    )

    if not os.path.isdir(frontend_dir):
        st.error("The mobile component files were not found in the deployment package.")
        st.stop()

    component = components.declare_component("aq_tlc_mobile", path=frontend_dir)
    if "_aq_tlc_mobile_pending_response" not in st.session_state:
        st.session_state._aq_tlc_mobile_pending_response = None
    cache = _get_session_cache(st.session_state)

    component_value = component(
        response=st.session_state._aq_tlc_mobile_pending_response,
        protocol_version=PROTOCOL_VERSION,
        key="aq_tlc_mobile_main",
        default=None,
        # CSS applies the final dynamic-viewport height.  This only avoids a
        # clipped first paint before the component's early-ready bootstrap.
        height=800,
    )

    if component_value is None:
        return

    response = process_component_value(component_value, cache)
    previous = st.session_state._aq_tlc_mobile_pending_response
    if not _same_response_identity(previous, response):
        st.session_state._aq_tlc_mobile_pending_response = response
        st.rerun()


if __name__ == "__main__":
    main()
