import numpy as np
import pytest

from neurovascularsim import registry
from neurovascularsim.vascular import io
from neurovascularsim.vascular.graph import VesselType


def write(path, text):
    path.write_text(text)
    return path


def test_vesselgraph_dialect(tmp_path):
    nodes = write(tmp_path / "n.csv", "id;pos_x;pos_y;pos_z;degree\n0;0;0;0;1\n1;10;0;0;3\n2;20;5;0;1\n3;10;20;0;1\n")
    edges = write(tmp_path / "e.csv", "node1id;node2id;length;avgRadiusAvg\n0;1;11;2.0\n1;2;12;1.5\n1;3;25;6.0\n")
    g = io.load_graph_csv(nodes, edges, voxel_size_um=2.0)
    assert g.n_nodes == 4 and g.n_edges == 3
    np.testing.assert_allclose(g.diameter / 1e-6, [8.0, 6.0, 24.0])
    np.testing.assert_allclose(g.length / 1e-6, [22.0, 24.0, 50.0])  # voxels -> um
    assert list(g.vessel_type) == [VesselType.CAPILLARY, VesselType.CAPILLARY, VesselType.UNCLASSIFIED]
    assert g.meta["source"] == "vesselgraph"


def test_round_trip_own_dialect(tmp_path):
    case = registry.create("network", "suarez2021a")
    io.save_graph_csv(case.graph, tmp_path / "nodes.csv", tmp_path / "edges.csv")
    g = io.load_graph_csv(tmp_path / "nodes.csv", tmp_path / "edges.csv")
    np.testing.assert_allclose(g.diameter, case.graph.diameter, rtol=1e-5)
    np.testing.assert_allclose(g.length, case.graph.length, rtol=1e-5)
    np.testing.assert_array_equal(g.vessel_type, case.graph.vessel_type)


def test_crop_keeps_largest_component():
    case = registry.create("network", "mouse_cortex_synthetic", size_x_um=300, size_y_um=300, depth_um=500, seed=4)
    g = io.crop(case.graph, [0, 0, 0], [150, 300, 300])
    assert g.n_edges > 0
    assert np.all(g.positions / 1e-6 <= [150 + 1e-6, 300 + 1e-6, 300 + 1e-6])
    assert g.meta["volume_mm3"] == pytest.approx(150 * 300 * 300 * 1e-9)


def test_unknown_dialect(tmp_path):
    nodes = write(tmp_path / "n.csv", "a,b\n1,2\n")
    edges = write(tmp_path / "e.csv", "x,y\n1,2\n")
    with pytest.raises(ValueError):
        io.load_graph_csv(nodes, edges)


def test_graph_files_plugin_stays_inside_data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(io, "DATA_DIR", tmp_path)
    case = registry.create("network", "suarez2021a")
    io.save_graph_csv(case.graph, tmp_path / "nodes.csv", tmp_path / "edges.csv")
    loaded = registry.create("network", "graph_files")
    assert loaded.graph.n_edges == 22 and loaded.meta["needs_boundary_conditions"]
    with pytest.raises(ValueError):
        registry.create("network", "graph_files", nodes_file="../etc/passwd")
