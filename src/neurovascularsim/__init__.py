"""NeuroVascularSim: neural activity, neurovascular coupling, microvascular
blood flow and the signals that measure them.

The engine is headless. Interfaces (web app, notebooks, command line) are
clients of it. Model components are plugins; see :mod:`neurovascularsim.registry`.
"""

from . import registry, units
from .vascular import networks, perturbations, rheology  # noqa: F401  (registers built-in plugins)

__version__ = "0.1.0"

__all__ = ["registry", "units", "__version__"]
