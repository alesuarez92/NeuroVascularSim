# NeuroVascularSim

A physiological simulation suite for the brain and the fMRI signal, by the
NMD Lab (Alejandro Suarez, Ph.D.).

**Status: early development**, developed in the open. The engine's first piece is in: steady blood flow with red-cell
rheology on vascular graphs, validated against analytic cases and against
Suarez et al. 2021 (J Theor Biol).

## Idea

Model brain function end to end, with explicit physiology at every step:

1. **Neural activity**: the events that start a response.
2. **Biochemical pathways**: the metabolic and vasoactive signalling that
   couples neurons to blood vessels.
3. **Blood flow dynamics**: flow, volume and oxygenation in the vascular
   network.
4. **Signal acquisition**: how an fMRI scanner (and other methods such as
   Laser Doppler Flowmetry, electrophysiology and optical imaging) turns that
   physiology into a measured signal.

Real recordings are processed and analysed in the same framework, so models
can be fitted to data, compared with it, and used to improve how signals such
as BOLD are interpreted. The goal is to close the gap between what is
measured and what happens physiologically, step by step.

It is a sibling of
[NeuronalDataAnalyzerLab](https://github.com/alesuarez92/NeuronalDataAnalyzerLab)
(NeuroAnalyzer): the two share data conventions, so simulated data opens in
NeuroAnalyzer and real recordings analysed there can drive or test the models.

Networks: an idealised test tree, **synthetic mouse cortical columns**
generated from published statistics (Blinder 2013, Ji 2021, Schmid 2017,
Smith 2019), and **reconstructed graphs** such as the Kleinfeld-lab mouse
networks, read from CSV. See [docs/networks.md](docs/networks.md).

See [docs/VISION.md](docs/VISION.md) for the plan,
[docs/architecture.md](docs/architecture.md) for how it is built,
[docs/background.md](docs/background.md) for the owner's models and
[docs/literature.md](docs/literature.md) for the literature it builds on.

## Install and test

```bash
pip install -e ".[dev]"
pytest
```

Quick example:

```python
from neurovascularsim import registry
from neurovascularsim.vascular import solve_flow

case = registry.create("network", "suarez2021a")
sol = solve_flow(case.graph, case.pressure_bc)
print(sol.flow, sol.hematocrit)
```

Experiments are JSON specs; runs are saved with provenance:

```bash
nvs run examples/suarez2021a_stealing.json   # run a spec, save it under runs/
nvs serve                                    # web app + API on http://127.0.0.1:8000 (API docs at /docs)
```

The web app (React + three.js) lives in `web/`. In it you can edit every
model parameter, upload graph files, and colour vessels by type, segment,
diameter, layer, depth, flow or hematocrit. You can also magnify vessel
widths, hide vessel classes, cut a depth slab, click a vessel to inspect it
or add it to an experiment condition, and compare a network's statistics
with published measurements. Experiments can include oxygen transport
(vessels and tissue) and laminar BOLD profiles; runs go to a background job
queue. Build it once and `nvs serve` serves it:

```bash
cd web && npm install && npm run build   # then: nvs serve
npm run dev                              # development: hot reload, proxies /api to :8000
npm test                                 # front-end unit tests
```

## Data

Lab recordings are not part of this repository. Tests and demos use synthetic
data with known ground truth.

## How this software is developed

NeuroVascularSim is designed and directed by its author, who sets the scientific
scope, makes the modelling decisions and reviews the results. The code is
written with the assistance of Claude (Anthropic), an AI coding assistant. The
scientific models are implemented from the published literature and cited in
the code and in `docs/`. The author is responsible for the software and its
use.

## Author

Alejandro Suarez, Ph.D. Released under the [MIT licence](LICENSE.txt).
Contributions, issues and discussion are welcome.
