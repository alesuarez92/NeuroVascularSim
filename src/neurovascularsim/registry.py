"""Plugin registry.

Every model component is a plugin: a factory registered under a *kind*
(what role it plays) and a *name* (which implementation). Calling the
factory with keyword parameters returns the component.

Core code asks the registry for components by kind and name, so new
implementations are added by registering them, never by editing the core.
External packages register plugins through the ``neurovascularsim.plugins``
entry-point group: each entry point names a module whose import registers
its plugins.

Example::

    from neurovascularsim import registry

    @registry.register("viscosity", "my_law", description="...")
    def my_law():
        return lambda diameter, hematocrit: ...

    law = registry.create("viscosity", "my_law")
"""

from __future__ import annotations

from dataclasses import dataclass, field
from importlib.metadata import entry_points
from typing import Any, Callable

ENTRY_POINT_GROUP = "neurovascularsim.plugins"

#: Kinds the engine knows about, with the contract each plugin must follow.
KINDS: dict[str, str] = {
    "viscosity": (
        "Factory returning f(diameter_m, hematocrit) -> apparent viscosity "
        "relative to plasma (arrays, element-wise)."
    ),
    "phase_separation": (
        "Factory returning f(fqb, d_alpha_m, d_beta_m, d_parent_m, h_parent) -> "
        "fraction of parent red-cell flux entering daughter alpha."
    ),
    "network": (
        "Factory returning a NetworkCase (graph, pressure boundary conditions, "
        "inlet hematocrit, metadata)."
    ),
}


@dataclass(frozen=True)
class Plugin:
    kind: str
    name: str
    factory: Callable[..., Any]
    description: str = ""
    reference: str = ""
    parameters: dict[str, Any] = field(default_factory=dict)


_plugins: dict[str, dict[str, Plugin]] = {}


def register(
    kind: str,
    name: str,
    *,
    description: str = "",
    reference: str = "",
    parameters: dict[str, Any] | None = None,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator registering ``factory`` as plugin ``name`` of ``kind``.

    ``parameters`` documents the factory's keyword parameters and defaults,
    so interfaces can show and edit them.
    """
    if kind not in KINDS:
        raise KeyError(f"unknown plugin kind {kind!r}; known kinds: {sorted(KINDS)}")

    def decorator(factory: Callable[..., Any]) -> Callable[..., Any]:
        bucket = _plugins.setdefault(kind, {})
        if name in bucket and bucket[name].factory is not factory:
            raise ValueError(f"plugin {kind}/{name} is already registered")
        bucket[name] = Plugin(kind, name, factory, description, reference, dict(parameters or {}))
        return factory

    return decorator


def get(kind: str, name: str) -> Plugin:
    try:
        return _plugins[kind][name]
    except KeyError:
        known = sorted(_plugins.get(kind, {}))
        raise KeyError(f"no plugin {kind}/{name}; available: {known}") from None


def create(kind: str, name: str, **params: Any) -> Any:
    """Build the component: look up the plugin and call its factory."""
    return get(kind, name).factory(**params)


def available(kind: str | None = None) -> dict[str, list[str]]:
    """Registered plugin names, per kind (or for one kind)."""
    kinds = [kind] if kind is not None else sorted(KINDS)
    return {k: sorted(_plugins.get(k, {})) for k in kinds}


def load_entry_points(group: str = ENTRY_POINT_GROUP) -> list[str]:
    """Import every module advertised under ``group``; returns their names."""
    loaded = []
    for ep in entry_points(group=group):
        ep.load()
        loaded.append(ep.name)
    return loaded
