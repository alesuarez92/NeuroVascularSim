import json
from pathlib import Path

import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from neurovascularsim.server.app import create_app  # noqa: E402

EXAMPLE = json.loads((Path(__file__).resolve().parents[1] / "examples" / "suarez2021a_stealing.json").read_text())


@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(run_dir=str(tmp_path)))


def test_health(client):
    assert client.get("/api/health").json()["status"] == "ok"


def test_plugins_list_kinds_and_parameters(client):
    data = client.get("/api/plugins").json()
    assert {"viscosity", "phase_separation", "network", "perturbation"} <= set(data)
    names = [p["name"] for p in data["network"]["plugins"]]
    assert "suarez2021a" in names


def test_network_description(client):
    r = client.post("/api/networks", json={"name": "suarez2021a", "params": {}})
    assert r.status_code == 200
    g = r.json()["graph"]
    assert g["n_edges"] == 22 and len(g["positions"]) == g["n_nodes"] == 16
    assert g["vessel_type"][0] == "ARTERIOLE"


def test_unknown_network_is_404(client):
    assert client.post("/api/networks", json={"name": "nope"}).status_code == 404


def test_bad_network_parameter_is_422(client):
    r = client.post("/api/networks", json={"name": "suarez2021a", "params": {"bogus": 1}})
    assert r.status_code == 422


def test_validate(client):
    assert client.post("/api/experiments/validate", json=EXAMPLE).json() == {"valid": True}
    bad = dict(EXAMPLE, solver={"viscosity": "nope"})
    assert client.post("/api/experiments/validate", json=bad).json()["valid"] is False


def test_run_lifecycle(client):
    r = client.post("/api/runs", json=EXAMPLE)
    assert r.status_code == 201
    run = r.json()
    assert run["summary"]["dilate_active_30pct"]["relative_flow"][4] < 0.99
    assert [e["id"] for e in client.get("/api/runs").json()] == [run["id"]]
    assert client.get(f"/api/runs/{run['id']}").json()["id"] == run["id"]
    assert client.get("/api/runs/doesnotexist").status_code == 404


def test_invalid_run_is_422(client):
    bad = dict(EXAMPLE, network={"name": "nope", "params": {}})
    assert client.post("/api/runs", json=bad).status_code == 422
