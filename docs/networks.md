# Vascular networks

The detailed level of the suite runs on vascular graphs. There are three
sources:

1. **Idealised test networks**: `suarez2021a`, the 22-segment tree of Suarez
   et al. 2021 (J Theor Biol). Kept as a regression reference only.
2. **Synthetic mouse cortical columns** (`mouse_cortex_synthetic`), generated
   from published statistics. Available anywhere, any size, known ground
   truth.
3. **Reconstructed networks** (`graph_files`), read from node and edge CSV
   files, e.g. the Kleinfeld-lab mouse graphs.

## Synthetic mouse cortical column

Built by `neurovascularsim/vascular/cortex.py`. The components:

- **Capillary bed:** the edges of a 3D Voronoi tessellation of a jittered
  body-centred cubic lattice. This is a regular, "constrained" tessellation
  in the spirit of Smith et al. 2019. Degree-4 junctions are reduced to
  degree 3 by removing a near-perfect matching, and the cell size is
  calibrated to the target capillary length density.
- **Penetrating arterioles and ascending venules:** vertical trunks that
  taper with depth. They branch into the bed every 25 µm through
  precapillary arterioles and postcapillary venules.
- **Boundary conditions:** by default, pressures are fixed where arterioles
  (60 mmHg) and venules (10 mmHg) enter the cortex. This is the standard for
  cropped networks. The alternative `boundary: "pial_tree"` adds pial trees
  with one inlet and one outlet, sized by Murray's law.
- **Depth and layer:** every node carries its depth below the pia and an
  approximate mouse S1 layer (L1, L2/3, L4, L5, L6).

### Validation against measurements (default parameters, seeds 0–3)

The papers are cited from PubMed: Blinder et al. 2013
[doi:10.1038/nn.3426](https://doi.org/10.1038/nn.3426), Ji et al. 2021
[doi:10.1016/j.neuron.2021.02.006](https://doi.org/10.1016/j.neuron.2021.02.006),
Schmid et al. 2017
[doi:10.1371/journal.pcbi.1005392](https://doi.org/10.1371/journal.pcbi.1005392),
Smith et al. 2019
[doi:10.3389/fphys.2019.00233](https://doi.org/10.3389/fphys.2019.00233) and
Tsai et al. 2009
[doi:10.1523/JNEUROSCI.3287-09.2009](https://doi.org/10.1523/JNEUROSCI.3287-09.2009).

| Quantity | Model | Measured | Source |
|---|---|---|---|
| Capillary length density | 0.88–0.90 m/mm³ | 0.88 ± 0.17 (vS1), 0.98 (somatosensory) | Ji 2021 |
| Capillary diameter | median 4.0 µm | 4.0 ± 1.0 µm (network value) | Schmid 2017 |
| Capillary segment length | median ~36 µm | median 46–50 µm | Blinder 2013, Ji 2021 |
| Junction degree | 78% degree 3 | predominantly degree 3 | Blinder 2013 |
| Capillaries, share of vascular volume | ~0.80 | 0.8 ± 0.2 | Ji 2021 |
| Capillaries, share of vascular length | ~0.92 | 0.959 | Ji 2021 |
| Venules : arterioles | 3 : 1 | 3.0 ± 0.1 | Blinder 2013 |
| Laminar capillary density | flat within ~10% (L2/3–L6) | not tracking neuron density; shallow L4 peak | Tsai 2009, Blinder 2013 |
| Capillary segment resistance | ~1.7 P·µm⁻³ | 1.6 P·µm⁻³ per edge | Blinder 2013 |

### Known gaps (open work, not hidden)

- **Segment length:** about 25% shorter than measured at the correct length
  density. Matching both would need tortuosity near 1.4, against the ~1.2
  measured, so the capillary topology itself needs more work.
- **Perfusion is too low:** about 10–35 mL/100 g/min, against roughly
  100 measured. Median capillary velocities are 0.02–0.03 mm/s, against
  0.4–2 mm/s measured (Schmid 2017; Blinder 2013).
  - The segment resistance matches Blinder's value, so the likely causes lie
    elsewhere: the density and branching of penetrating vessels (from
    figures and tables that are only partly legible here), capillary
    hematocrit, and the closed lateral faces of the column.
- **Capillary hematocrit:** a few capillaries reach 0.7 or more, or near
  zero. This comes from phase separation at very low flows.
- **Convergence:** the red-cell partitioning iteration ends in a small limit
  cycle. A few low-flow capillaries keep switching direction, so the solver
  stops at a 0.1% flow change and reports the iteration count. Solves with
  phase separation take ~35 s for a 600 × 600 × 1200 µm column.
- **Penetrating vessel density:** 9 arterioles per mm² by default, read from
  Schmid 2017 Table 2. The reading is ambiguous (range ≈ 7–18 per mm²) and
  should be checked against data.
- **Layer boundaries** are approximate for mouse S1.

## Reconstructed networks (the Kleinfeld graphs)

The Kleinfeld-lab whole-brain mouse graphs (Ji et al. 2021) are distributed
through the VesselGraph dataset (Paetzold et al. 2021, NeurIPS Datasets and
Benchmarks; entries `C57BL_6-K1` to `K3`), with download links in the
VesselGraph repository README. The data are licensed CC BY-NC 4.0, so they
are **never committed** here.

To use them:

1. Download a graph on your own machine and put the node and edge CSV files
   in `data/`. The directory is git-ignored; set `NVS_DATA_DIR` to use
   another one.
2. In the app or a spec, choose the network `graph_files` with
   `nodes_file`, `edges_file`, `voxel_size_um` and optionally a crop box
   (`crop_lo_um`, `crop_hi_um`).

The loader reads the VesselGraph/Voreen columns (`pos_x/y/z`,
`node1id/node2id`, `avgRadiusAvg`, `length`) and the suite's own format. For
the latter, see `save_graph_csv`, which is also how you can export graphs
from your own code without sharing that code.

Reconstructed graphs usually lack arterial and venous labels. Vessels wider
than 8 µm are marked `UNCLASSIFIED` until labelled, and boundary conditions
must be supplied before flow can be solved. Labelling and boundary
conditions for real graphs are the next step on this side.
