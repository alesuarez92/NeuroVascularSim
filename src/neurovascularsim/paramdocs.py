"""Documentation of every user-facing parameter, for interfaces.

Each entry says what a parameter means physiologically, its unit, the group
it belongs to in the setup wizard, whether it is a basic or an advanced
setting, and where its default comes from (a cited paper, or "model
choice" / "assumption" stated plainly). Interfaces read it through the API
(``/api/plugins`` and ``/api/models``), so explanations live next to the
science and are tested for completeness.

Scopes are ``"<kind>/<plugin name>"`` for plugins and ``"model/<name>"`` for
the oxygen and BOLD parameter sets and the flow solver.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, replace

LEVELS = ("basic", "advanced")


@dataclass(frozen=True)
class ParamDoc:
    label: str
    help: str
    unit: str = ""
    group: str = "General"
    level: str = "basic"
    source: str = ""  # citation (authors, year, journal, DOI), or "model choice" / "assumption"
    # Mathematical symbol, in a small markup: "_{...}" subscript, "^{...}" superscript, Unicode
    # Greek letters and digits (e.g. "P_{in}", "τ_{ref}", "D_{O₂}"). Empty when there is none.
    symbol: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def P(label, help, unit="", group="General", level="basic", source="", symbol=""):
    return ParamDoc(label, help, unit, group, level, source, symbol)


# Group order per scope, as the wizard shows them.
GROUPS: dict[str, list[str]] = {}
DOCS: dict[str, dict[str, ParamDoc]] = {}


def docs_for(scope: str) -> dict:
    """Plain-data docs and group order for one scope (empty if undocumented)."""
    return {
        "groups": GROUPS.get(scope, []),
        "params": {k: v.to_dict() for k, v in DOCS.get(scope, {}).items()},
    }


from . import _paramdocs_catalog  # noqa: E402,F401  (fills GROUPS and DOCS)

# Symbols, as used in the papers the models come from or in standard physiology notation.
SYMBOLS: dict[str, dict[str, str]] = {
    "network/mouse_cortex_synthetic": {
        "size_x_um": "L_{x}", "size_y_um": "L_{y}", "depth_um": "L_{z}",
        "capillary_length_density": "L_{V}", "capillary_diameter_mean_um": "D_{cap}",
        "capillary_diameter_sd_um": "σ_{D}", "pa_density_per_mm2": "n_{PA}",
        "av_to_pa_ratio": "n_{AV}/n_{PA}", "pa_diameter_median_um": "D_{PA}", "av_diameter_median_um": "D_{AV}",
        "p_in_mmhg": "P_{in}", "p_out_mmhg": "P_{out}", "hematocrit": "H_{sys}",
        "adapt_metabolic_signal": "J_{m}", "adapt_gf_permeability": "k_{GF}", "adapt_k_m": "k_{m}",
        "adapt_k_s": "k_{s}", "adapt_tau_ref_dyn_cm2": "τ_{ref}", "adapt_q_ref_nl_min": "Q_{ref}",
        "adapt_conduction_length_um": "L_{c}", "adapt_min_diameter_um": "D_{min}",
        "tissue_pressure_mmhg": "P_{t}",
    },
    "network/suarez2021a": {
        "d_feeding_um": "D_{f}", "l_feeding_um": "L_{f}", "d_daughter_um": "D_{d}", "l_daughter_um": "L_{d}",
        "p_in_mmhg": "P_{in}", "p_out_mmhg": "P_{out}", "hematocrit": "H_{sys}",
    },
    "network/graph_files": {"voxel_size_um": "Δx", "p_arterial_mmhg": "P_{a}", "p_venous_mmhg": "P_{v}"},
    "perturbation/scale_diameter": {"factor": "D/D_{0}"},
    "perturbation/scale_cmro2": {"factor": "M/M_{0}"},
    "viscosity/constant": {"value": "η_{rel}"},
    "model/oxygen": {
        "p50_mmhg": "P_{50}", "hill_n": "n", "hb_capacity_mM": "C_{Hb}",
        "nusselt": "Nu", "cmro2_umol_per_g_min": "CMRO₂", "km_mmhg": "K_{m}", "tissue_density_g_per_ml": "ρ",
        "alpha_uM_per_mmhg": "α", "diffusivity_m2_per_s": "D_{O₂}", "voxel_um": "Δx", "sample_um": "Δs",
    },
    "model/bold": {
        "field_t": "B_{0}", "te_ms": "TE", "theta0_per_s_at_1p5t": "ϑ_{0}", "r0_per_s": "r_{0}",
        "epsilon": "ε", "slab_um": "Δz",
    },
}
for _scope, _symbols in SYMBOLS.items():
    for _name, _symbol in _symbols.items():
        DOCS[_scope][_name] = replace(DOCS[_scope][_name], symbol=_symbol)
