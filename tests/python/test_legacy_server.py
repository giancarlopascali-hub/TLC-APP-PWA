from __future__ import annotations

import pytest

from server import app


@pytest.fixture()
def client():
    app.config.update(TESTING=True)
    with app.test_client() as test_client:
        yield test_client


def test_legacy_fallback_serves_only_required_public_assets(client) -> None:
    assert client.get("/").status_code == 200
    for asset in ("app.js", "guide.html", "icon.svg", "manifest.json", "sw.js"):
        assert client.get(f"/{asset}").status_code == 200, asset
    assert client.get("/health").get_json() == {"status": "ok"}


def test_legacy_static_route_does_not_expose_repository_or_dotfiles(client) -> None:
    for path in (
        "/server.py",
        "/requirements.txt",
        "/requirements-legacy.txt",
        "/.git/config",
        "/.env",
        "/frontend/index.html",
        "/archive/anything",
    ):
        assert client.get(path).status_code == 404, path
