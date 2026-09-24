"""Unit conversions. The engine works in SI (m, s, Pa, m^3/s, Pa*s)."""

UM = 1e-6  # m per micrometre
MM = 1e-3  # m per millimetre
MMHG = 133.322387415  # Pa per mmHg
CP = 1e-3  # Pa*s per centipoise
NL_PER_MIN = 1e-12 / 60.0  # m^3/s per nL/min

#: Plasma viscosity at 37 degC, Pa*s (about 1.2 cP).
PLASMA_VISCOSITY = 1.2 * CP


def um(x):
    """Micrometres to metres."""
    return x * UM


def to_um(x):
    """Metres to micrometres."""
    return x / UM


def mmhg(x):
    """mmHg to pascals."""
    return x * MMHG


def to_mmhg(x):
    """Pascals to mmHg."""
    return x / MMHG


def to_nl_per_min(q):
    """m^3/s to nL/min."""
    return q / NL_PER_MIN
