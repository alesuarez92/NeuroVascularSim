import json
from pathlib import Path

import pytest

from neurovascularsim.cli import main
from neurovascularsim.experiment import ExperimentSpec, RunStore, run_experiment

EXAMPLE = Path(__file__).resolve().parents[1] / "examples" / "suarez2021a_stealing.json"


def spec(**overrides):
    d = json.loads(EXAMPLE.read_text())
    d.update(overrides)
    return ExperimentSpec.from_dict(d)


def test_spec_round_trips_through_json():
    s = spec()
    again = ExperimentSpec.from_json(s.to_json())
    assert again == s
    assert again.digest() == s.digest()


def test_digest_changes_with_content():
    assert spec().digest() != spec(name="other").digest()


@pytest.mark.parametrize(
    "bad",
    [
        {"network": {"name": "no_such_network", "params": {}}},
        {"solver": {"viscosity": "no_such_law"}},
        {"solver": {"unknown_option": 1}},
        {"conditions": [{"label": "baseline", "perturbations": []}]},
        {"conditions": [{"label": "x", "perturbations": [{"name": "nope", "params": {}}]}]},
    ],
)
def test_invalid_specs_are_rejected(bad):
    with pytest.raises((KeyError, ValueError)):
        spec(**bad).validate()


def test_unsupported_spec_version():
    with pytest.raises(ValueError):
        spec(spec_version=99)


def test_run_reproduces_stealing_and_records_provenance():
    record = run_experiment(spec())
    rel = record.summary["dilate_active_30pct"]["relative_flow"]
    assert rel[3] > 1.08  # active arteriole gains flow
    assert rel[4] < 0.99  # its sibling loses flow (stealing)
    assert record.results["baseline"]["converged"]
    assert record.provenance["spec_digest"] == spec().digest()
    assert record.results["dilate_active_30pct"]["diameter"][3] == pytest.approx(
        1.3 * record.results["baseline"]["diameter"][3]
    )


def test_run_without_phase_separation_barely_steals():
    s = spec(solver={"viscosity": "pries_invivo", "phase_separation": "none"})
    rel = run_experiment(s).summary["dilate_active_30pct"]["relative_flow"]
    assert rel[4] > 0.99


def test_vessel_type_selection():
    d = json.loads(EXAMPLE.read_text())
    d["conditions"] = [
        {"label": "capillaries", "perturbations": [
            {"name": "scale_diameter", "params": {"vessel_types": ["CAPILLARY"], "factor": 1.1}}]}
    ]
    record = run_experiment(ExperimentSpec.from_dict(d))
    # Dilating every capillary raises flow through the whole tree.
    assert record.summary["capillaries"]["relative_flow"][0] > 1.1


def test_store_saves_and_lists(tmp_path):
    store = RunStore(tmp_path)
    record = run_experiment(spec())
    store.save(record)
    assert store.load(record.id)["id"] == record.id
    assert [e["id"] for e in store.list()] == [record.id]
    with pytest.raises(KeyError):
        store.load("../etc")


def test_cli_run(tmp_path, capsys):
    assert main(["run", str(EXAMPLE), "--store", str(tmp_path)]) == 0
    assert "dilate_active_30pct" in capsys.readouterr().out
    assert len(list(tmp_path.glob("*.json"))) == 1
