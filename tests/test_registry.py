import pytest

from neurovascularsim import registry


def test_builtin_plugins_are_registered():
    avail = registry.available()
    assert "pries_invivo" in avail["viscosity"]
    assert {"pries", "none"} <= set(avail["phase_separation"])
    assert "suarez2021a" in avail["network"]


def test_unknown_kind_is_rejected():
    with pytest.raises(KeyError):
        registry.register("no_such_kind", "x")


def test_unknown_plugin_lists_alternatives():
    with pytest.raises(KeyError, match="available"):
        registry.get("viscosity", "no_such_law")


def test_duplicate_name_is_rejected():
    @registry.register("viscosity", "_test_dup")
    def first():
        return None

    with pytest.raises(ValueError):

        @registry.register("viscosity", "_test_dup")
        def second():
            return None


def test_parameters_are_documented():
    plugin = registry.get("network", "suarez2021a")
    assert plugin.parameters["d_feeding_um"] == 17.5
    assert plugin.reference
