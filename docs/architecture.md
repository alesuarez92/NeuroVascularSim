# Architecture

Status: first version. It records the agreed decisions and will grow with
the code.

## Goal

An interface-based application that is powerful and can grow without
limit: new models, pathways, modalities, analyses and interfaces are added
without rewriting what exists.

**One platform for simulation and real data.** The owner's public MATLAB
application, NeuroAnalyzer
([NeuronalDataAnalyzerLab](https://github.com/alesuarez92/NeuronalDataAnalyzerLab)),
is **rebuilt natively in Python** as a core part of this platform. It is
not a wrapper around the MATLAB code and not an add-on. It then grows
beyond the original:

- Readers, preprocessing, analyses and exporters are rewritten in Python
  inside the engine's `data/` package, and are served by the same API and
  web app as the simulations.
- Each rebuilt function is tested against the MATLAB output on the same
  input. The MATLAB app stays in use until the Python version reaches
  parity.
- Simulated and recorded signals share one **recording data model**
  (channels, time series, events, sampling rates, metadata). Every analysis
  then runs on both, which is what fitting models to data and testing
  analyses on synthetic ground truth require.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Engine language | **Python** (numpy, scipy) | Sparse solvers and graph tooling. Runs where the code is developed. GPU later (JAX or numba) for Monte Carlo MR. MATLAB is not available in the development container. |
| Interface | **Web app**: FastAPI back end, React/TypeScript front end, 3D with vtk.js or three.js | Runs locally or on a lab server or GPU cluster. Multi-user, shareable, no install for collaborators. |
| First species | **Mouse** | Reconstructed vascular graphs (Blinder, Kleinfeld, Schmid, Kirst), laminar cell densities (Keller/Erö), and the owner's optogenetic and LDF data. Human comes second, through synthetic networks. |
| Units inside the engine | **SI** (m, s, Pa, m³/s, Pa·s) | One convention. Helpers convert from µm, mmHg and nL/min at the edges. |
| NeuroAnalyzer | Rebuilt natively in Python in `data/`. Reads `.mat` / HDF5 files from the MATLAB version. | One codebase, one app. Existing MATLAB data stays readable. |

## Layers

```
 ┌────────────────────────────────────────────────────────────┐
 │ 5. Interfaces (clients of the API)                         │
 │    web app (React + 3D) · notebooks · command line         │
 ├────────────────────────────────────────────────────────────┤
 │ 4. Service: FastAPI (experiments, runs, results, plugins)  │
 │    + job runner (local → server → HPC/GPU workers)         │
 ├────────────────────────────────────────────────────────────┤
 │ 3. Experiments: declarative specs (network + plugins +     │
 │    parameters + stimulus + outputs), saved with provenance │
 ├────────────────────────────────────────────────────────────┤
 │ 2. Plugin registry: every model component is a plugin      │
 │    behind a declared interface                             │
 ├────────────────────────────────────────────────────────────┤
 │ 1. Engine (headless, tested): vascular graph, flow,        │
 │    pathways, oxygen, signals, 2D column                    │
 └────────────────────────────────────────────────────────────┘
```

Rules that keep it growable:

- **No science in the interface.** Every computation lives in the engine
  and is reachable from Python without a server or browser.
- **Plugins, not edits.** A new viscosity law, pathway, network loader,
  BOLD model or analysis is a new plugin registered under a *kind*. Core
  code does not change. External packages can add plugins through Python
  entry points (`neurovascularsim.plugins`).
- **Experiments are data.** The UI edits specs and the engine runs them,
  so every run can be reproduced from its spec and code version.
- **Fields on a graph.** On the detailed level, every state is a per-edge
  field (diameter, flow, hematocrit, membrane potential) or a per-node field
  (pressure, concentrations). Modules read and write those fields; they
  don't call each other directly.

## Forward and inverse

The engine is organised around the two directions of the product:

```
 physiological model ──forward──▶ observation models ──▶ simulated recordings
  (graph, pathways,      (per modality: BOLD, ASL, LDF,     (same data model as
   O2, 2D column)         VASO, optical, Ca2+, LFP/EEG)      real recordings)
          ▲                                                        │
          └───────────────inverse (estimation, model comparison)───┘
                                                          ◀── real recordings
                                                              (readers, preprocessing)
```

- **Observation models** are plugins, one per modality. Each maps model
  state to what that instrument records, including its sampling, filtering
  and noise.
- **Inverse methods** are plugins: least squares with profile likelihoods,
  Bayesian inference (MCMC or simulation-based), and mechanism or model
  comparison. Every fit reports uncertainty. Identifiability is checked
  before fitting.
- **Validation loop:** every inverse method is tested on forward-simulated
  recordings with known parameters before it is used on real data.

## Engine packages

```
src/neurovascularsim/
  registry.py       plugin kinds, registration, lookup, entry-point discovery
  units.py          unit conversions (µm, mmHg, nL/min, cP ↔ SI)
  vascular/
    graph.py        VascularGraph: nodes (xyz, depth, layer) and edges
                    (diameter, length, vessel type), stored as arrays
    rheology.py     plugins: in-vivo viscosity, phase separation (Pries et al.)
    flow.py         steady flow: Kirchhoff + Poiseuille on the graph,
                    iterated with hematocrit redistribution
    networks.py     plugins: network builders (idealised networks; loaders later)
  (next)
  pathways/         vasoactive and electrical signalling per segment class
  oxygen/           O2 advection on the graph and tissue diffusion
  signal/           BOLD (detailed from geometry and SO2; mesoscopic), LDF, …
  column/           mesoscopic 2D laminar column, derived by coarse-graining
  observation/      forward observation models per modality
  inverse/          estimation, identifiability, model comparison
  data/             recording data model, readers, preprocessing, analyses
                    (NeuroAnalyzer rebuilt here)
server/             FastAPI service (next)
web/                React front end (after the service)
```

## Testing

- **Analytic cases:** single-tube Poiseuille, series and parallel
  resistances, symmetric bifurcations, and mass conservation of blood and
  red cells at every node.
- **Published results as regression targets:** first, the Suarez et al.
  2021a network (≈10% CBF for 30% dilation, and stealing driven by
  phase separation).
- **Synthetic ground truth** for any analysis method.
- `pytest` runs locally before every push, and in CI (GitHub Actions) on
  pushes and pull requests that touch Python code.

## Build order

1. Engine core: registry, graph, rheology, flow, test networks. **(done)**
2. Experiment spec and run records (`experiment.py`, `nvs run`). **(done)**
3. FastAPI service (`server/app.py`, `nvs serve`): plugins, networks,
   validation, runs. **(done; synchronous runs; job runner comes with
   large 3D networks)**
4. Web front end (`web/`): 3D network viewer (instanced vessels, hover
   details), experiment editor (form + full JSON spec), colour by vessel
   type, vessel segment, diameter, layer, depth, flow change, flow or
   hematocrit, per-edge table, run history. Served by `nvs serve` once
   built. **(done; light theme only until a dark palette is validated)**
   Interactive controls: every plugin parameter editable (numbers, choices,
   switches, data files with upload), vessel width magnification,
   show/hide vessel classes, a depth slab, click a vessel for its details
   and add it to a condition, network statistics against measurements.
5. Realistic networks: synthetic mouse cortical columns validated against
   published statistics, a loader for reconstructed graphs (the Kleinfeld
   graphs via VesselGraph), depth and layer on every node, layer-selective
   perturbations, network statistics. **(done; see [networks.md](networks.md)
   for validation and known gaps)**
6. Boundary conditions and vessel labelling for reconstructed graphs
   (`labeling.py`). **(done)**
7. Background job queue (`jobs.py`, `/api/jobs`): runs on worker threads
   with progress and cancellation; the web app lists jobs and opens the
   result when it finishes. **(done; jobs are kept in memory, runs on disk)**
8. Oxygen transport and BOLD (`vascular/oxygen.py`, `vascular/bold.py`;
   optional `oxygen` / `bold` blocks in specs; `scale_cmro2` perturbation;
   the app's Oxygen & BOLD tab with laminar profiles and a tissue PO2 map).
   **(done, first version; see [oxygen.md](oxygen.md) for parameters,
   tests and the gaps the synthetic network shows)**
9. Mesoscopic summaries (`vascular/summary.py`): every solve in a run
   stores standard outputs for the whole column and per cortical layer
   (inflow, perfusion, inlet/outlet pressure; per region capillary speed
   mean, median, spread and slow share, red-cell flow, capillary pressure,
   blood volume fraction). Depth bins are available from Python. These are
   the outputs learned mesoscopic models will be trained on (see
   VISION.md, design principles). **(done, flow only; oxygen per layer
   when a study needs it)**
10. Then widen the science: pathways (astrocyte, EC
   conduction, pericytes), oxygen, BOLD, the 2D column.
