"""Penetrating trees, labels and boundary conditions, validated on synthetic
columns whose truth is known (the labels are stripped, then recovered)."""

from dataclasses import replace

import numpy as np
import pytest

from neurovascularsim import registry
from neurovascularsim.vascular import io, labeling, solve_flow
from neurovascularsim.vascular.graph import VesselType


@pytest.fixture(scope="module")
def case():
    return registry.create("network", "mouse_cortex_synthetic", size_x_um=400, size_y_um=400, depth_um=800, seed=5)


def stripped(case):
    t = case.graph.vessel_type.copy()
    t[t != VesselType.CAPILLARY] = VesselType.UNCLASSIFIED
    return replace(case.graph, vessel_type=t, meta=dict(case.graph.meta))


def test_trees_start_at_true_entries_and_never_mix(case):
    truth_a, truth_v = set(case.meta["sources"]), set(case.meta["sinks"])
    trees = labeling.find_penetrating_trees(stripped(case))
    entries = {n for t in trees for n in t.entry_nodes}
    assert entries <= truth_a | truth_v  # no spurious entry points
    assert len(entries) >= 0.8 * len(truth_a | truth_v)  # narrow vessels may be missed
    for t in trees:
        assert not (set(t.entry_nodes) & truth_a and set(t.entry_nodes) & truth_v)


def test_types_reproduce_the_true_boundary_conditions(case):
    prepared = labeling.prepare_network(case.graph, labels="types")
    assert prepared.meta["labels_method"] == "types"
    assert prepared.meta["n_arterial_trees"] >= 0.8 * len(case.meta["sources"])
    p = np.array(list(prepared.pressure_bc.values())) / 133.322387415
    assert set(np.round(p, 6)) == {60.0, 10.0}


def test_auto_falls_back_to_heuristic_without_labels(case):
    g = stripped(case)
    prepared = labeling.prepare_network(g)
    assert prepared.meta["labels_method"] == "diameter"
    assert prepared.meta["n_arterial_trees"] >= 1 and prepared.meta["n_venous_trees"] >= 1
    # Large vessels in penetrating trees take their tree's type; others stay unclassified.
    assert np.sum(prepared.graph.vessel_type == VesselType.UNCLASSIFIED) < np.sum(g.vessel_type == VesselType.UNCLASSIFIED)
    assert np.any(prepared.graph.vessel_type == VesselType.PENETRATING_ARTERIOLE)


def test_depth_from_axis():
    g = registry.create("network", "suarez2021a").graph
    d = labeling.with_depth(g, axis=0, surface="max")
    assert d.depth.max() == pytest.approx(g.positions[:, 0].max() - g.positions[:, 0].min())
    assert d.depth.min() == 0.0


def test_needs_two_trees():
    g = labeling.with_depth(registry.create("network", "suarez2021a").graph)
    with pytest.raises(ValueError):
        labeling.prepare_network(g)


def test_reconstructed_graph_round_trip(case, tmp_path, monkeypatch):
    """Export a column, reload it as a 'reconstructed' graph, compare flow."""
    monkeypatch.setattr(io, "DATA_DIR", tmp_path)
    io.save_graph_csv(case.graph, tmp_path / "nodes.csv", tmp_path / "edges.csv")
    loaded = registry.create("network", "graph_files")
    assert loaded.meta["labels_method"] == "types"

    def inflow(c):
        sol = solve_flow(c.graph, c.pressure_bc, phase_separation="none")
        g = c.graph
        return sum(np.abs(sol.flow[(g.edges[:, 0] == n) | (g.edges[:, 1] == n)]).sum() for n in c.meta["sources"])

    assert inflow(loaded) == pytest.approx(inflow(case), rel=0.15)
