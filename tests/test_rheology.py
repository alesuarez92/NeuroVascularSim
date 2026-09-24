import numpy as np
import pytest

from neurovascularsim.units import UM
from neurovascularsim.vascular.rheology import phase_separation_pries, viscosity_pries_invivo


def test_viscosity_without_cells_is_the_wall_factor():
    d = np.array([5.0, 10.0, 50.0]) * UM
    expected = (d / UM / (d / UM - 1.1)) ** 2
    np.testing.assert_allclose(viscosity_pries_invivo(d, 0.0), expected)


def test_viscosity_in_large_tubes_approaches_bulk_value():
    # eta*_0.45 -> 3.2 for large diameters.
    assert viscosity_pries_invivo(1000 * UM, 0.45) == pytest.approx(3.2, abs=0.05)


def test_viscosity_increases_with_hematocrit():
    h = np.linspace(0.1, 0.6, 6)
    eta = viscosity_pries_invivo(np.full(6, 10 * UM), h)
    assert np.all(np.diff(eta) > 0)


def test_viscosity_rejects_diameters_below_limit():
    with pytest.raises(ValueError):
        viscosity_pries_invivo(1.0 * UM, 0.45)


def test_phase_separation_symmetric_split():
    assert phase_separation_pries(0.5, 10 * UM, 10 * UM, 15 * UM, 0.45) == pytest.approx(0.5)


def test_phase_separation_conserves_red_cells():
    # Red-cell fractions into the two daughters must sum to one.
    for fqb in (0.2, 0.4, 0.55, 0.8):
        fa = phase_separation_pries(fqb, 8 * UM, 12 * UM, 15 * UM, 0.45)
        fb = phase_separation_pries(1 - fqb, 12 * UM, 8 * UM, 15 * UM, 0.45)
        assert fa + fb == pytest.approx(1.0)


def test_phase_separation_favours_the_faster_branch():
    fqe = phase_separation_pries(0.7, 10 * UM, 10 * UM, 15 * UM, 0.45)
    assert fqe > 0.7


def test_phase_separation_threshold():
    # Below X0 no red cells enter the branch (plasma skimming).
    x0 = 0.964 * (1 - 0.45) / 10.0
    assert phase_separation_pries(0.5 * x0, 5 * UM, 10 * UM, 10 * UM, 0.45) == 0.0
