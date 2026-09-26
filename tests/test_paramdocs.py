"""The parameter catalog documents every user-facing parameter, and nothing else."""
from dataclasses import fields

import pytest

from neurovascularsim import paramdocs, registry
from neurovascularsim.experiment import SOLVER_OPTIONS
from neurovascularsim.vascular import cortex, io, networks, perturbations, rheology  # noqa: F401  (register plugins)
from neurovascularsim.vascular.bold import BoldParams
from neurovascularsim.vascular.oxygen import OxygenParams

PLUGIN_SCOPES = [s for s in paramdocs.DOCS if not s.startswith("model/")]
EXPECTED = [
    "network/mouse_cortex_synthetic", "network/suarez2021a", "network/graph_files",
    "perturbation/scale_diameter", "perturbation/scale_cmro2", "viscosity/constant",
    "model/oxygen", "model/bold", "model/solver",
]


def test_expected_scopes_documented():
    assert set(EXPECTED) <= set(paramdocs.DOCS)


@pytest.mark.parametrize("scope", PLUGIN_SCOPES)
def test_plugin_parameters_match_docs(scope):
    kind, name = scope.split("/", 1)
    params = set(registry.get(kind, name).parameters)
    docs = set(paramdocs.DOCS[scope])
    assert params - docs == set(), f"undocumented in {scope}"
    assert docs - params == set(), f"docs name unknown parameters in {scope}"


@pytest.mark.parametrize("scope, cls", [("model/oxygen", OxygenParams), ("model/bold", BoldParams)])
def test_model_fields_match_docs(scope, cls):
    assert {f.name for f in fields(cls)} == set(paramdocs.DOCS[scope])


def test_solver_options_match_docs():
    assert set(paramdocs.DOCS["model/solver"]) == SOLVER_OPTIONS


@pytest.mark.parametrize("scope", list(paramdocs.DOCS))
def test_levels_and_groups(scope):
    groups = paramdocs.GROUPS.get(scope, [])
    for key, doc in paramdocs.DOCS[scope].items():
        assert doc.level in paramdocs.LEVELS, f"{scope}/{key}"
        assert doc.group in groups, f"{scope}/{key}: group {doc.group!r} not in GROUPS"
        assert doc.label and doc.help, f"{scope}/{key}"


def test_mouse_column_group_order():
    assert paramdocs.GROUPS["network/mouse_cortex_synthetic"] == [
        "Column size", "Capillary bed", "Penetrating vessels", "Offshoots and connections",
        "Boundary conditions", "Blood", "Structural adaptation", "Randomness",
    ]
