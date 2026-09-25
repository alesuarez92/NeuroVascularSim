import json
import time
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


def test_serves_the_web_app_when_built(tmp_path):
    web = tmp_path / "dist"
    web.mkdir()
    (web / "index.html").write_text("<!doctype html><title>NeuroVascularSim</title>")
    c = TestClient(create_app(run_dir=str(tmp_path / "runs"), web_dir=str(web)))
    assert "NeuroVascularSim" in c.get("/").text
    assert c.get("/api/health").json()["status"] == "ok"


def test_no_web_app_without_build(tmp_path):
    c = TestClient(create_app(run_dir=str(tmp_path), web_dir=str(tmp_path / "missing")))
    assert c.get("/").status_code == 404


def test_plugins_list_choices(client):
    nets = {p["name"]: p for p in client.get("/api/plugins").json()["network"]["plugins"]}
    assert nets["mouse_cortex_synthetic"]["choices"]["boundary"] == ["penetrating_tops", "pial_tree"]


def test_network_stats(client):
    r = client.post("/api/networks/stats", json={"name": "suarez2021a"})
    assert r.status_code == 200
    data = r.json()
    assert data["statistics"]["n_edges"] == 22
    assert data["statistics"]["vascular_volume_fraction"] is None  # no volume: undefined, not an error
    assert data["branch_order"]["mean_order_nearest"] == 1.0


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    from neurovascularsim.vascular import io

    d = tmp_path / "data"
    monkeypatch.setattr(io, "DATA_DIR", d)
    return d


def test_data_file_upload_and_list(client, data_dir):
    assert client.get("/api/data-files").json() == []
    r = client.put("/api/data-files/my_nodes.csv", content=b"id,x\n0,1\n")
    assert r.status_code == 201 and r.json() == {"name": "my_nodes.csv", "size": 9}
    assert (data_dir / "my_nodes.csv").read_bytes() == b"id,x\n0,1\n"
    assert client.get("/api/data-files").json() == [{"name": "my_nodes.csv", "size": 9}]


@pytest.mark.parametrize("name", ["notes.txt", ".hidden.csv", "a b.csv", "..csv"])
def test_data_file_bad_names(client, data_dir, name):
    assert client.put(f"/api/data-files/{name}", content=b"x").status_code == 422
    assert not data_dir.exists() or not any(data_dir.iterdir())


def test_data_file_path_traversal_is_rejected(client, data_dir):
    r = client.put("/api/data-files/..%2Fescape.csv", content=b"x")
    assert r.status_code >= 400
    assert not (data_dir.parent / "escape.csv").exists()


def test_data_file_too_large(client, data_dir, monkeypatch):
    from neurovascularsim.server import app as server

    monkeypatch.setattr(server, "MAX_UPLOAD_BYTES", 4)
    assert client.put("/api/data-files/big.csv", content=b"12345").status_code == 413


def test_job_lifecycle(client):
    r = client.post("/api/jobs", json=EXAMPLE)
    assert r.status_code == 202
    job = r.json()
    for _ in range(3000):
        job = client.get(f"/api/jobs/{job['id']}").json()
        if job["status"] not in ("queued", "running"):
            break
        time.sleep(0.02)
    assert job["status"] == "done"
    assert client.get(f"/api/runs/{job['run_id']}").json()["id"] == job["run_id"]
    assert [j["id"] for j in client.get("/api/jobs").json()] == [job["id"]]
    assert client.delete(f"/api/jobs/{job['id']}").json()["status"] == "done"  # finished jobs stay finished
    assert client.get("/api/jobs/nope").status_code == 404


def test_invalid_job_is_422(client):
    bad = dict(EXAMPLE, network={"name": "nope", "params": {}})
    assert client.post("/api/jobs", json=bad).status_code == 422


def test_models_list_oxygen_and_bold_parameters(client):
    m = client.get("/api/models").json()
    assert m["oxygen"]["p50_mmhg"] == 40.2 and m["bold"]["field_t"] == 1.5
