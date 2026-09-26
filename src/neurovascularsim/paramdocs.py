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

from dataclasses import asdict, dataclass

LEVELS = ("basic", "advanced")


@dataclass(frozen=True)
class ParamDoc:
    label: str
    help: str
    unit: str = ""
    group: str = "General"
    level: str = "basic"
    source: str = ""  # citation (authors, year, journal, DOI), or "model choice" / "assumption"

    def to_dict(self) -> dict:
        return asdict(self)


def P(label, help, unit="", group="General", level="basic", source=""):
    return ParamDoc(label, help, unit, group, level, source)


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
