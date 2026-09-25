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
  taper with depth, 24 per mm² at a 1 : 3 ratio. They join the bed every
  40 µm of depth. Each join grows an offshoot tree (one generation by
  default): capillary edges next to the trunk are relabelled as
  precapillary arterioles or postcapillary venules, and then the capillary
  density is recalibrated.
- **Calibration:** the defaults were fitted to the capillary topology of
  Ji et al. 2021 (branch order and the arteriole-to-venule path) and not to
  flow. The perfusion that results (below) is therefore a test of the model,
  not a fit.
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
| Capillary length density | 0.88–0.95 m/mm³ | 0.88 ± 0.17 (vS1), 0.98 (somatosensory) | Ji 2021 |
| Capillary diameter | median 4.0 µm | 4.0 ± 1.0 µm (network value) | Schmid 2017 |
| Capillary segment length | median 33–36 µm | median 46–50 µm | Blinder 2013, Ji 2021 |
| Junction degree | ~87% degree 3 | predominantly degree 3 | Blinder 2013 |
| Capillary branch order (mean) | 3.4–3.8 | 3.4 ± 0.2 | Ji 2021 |
| Arteriole-to-venule path (median) | 5–7 branches | ~7 | Ji 2021 |
| Capillaries, share of vascular volume | ~0.55 | 0.8 ± 0.2 | Ji 2021 |
| Capillaries, share of vascular length | ~0.82 | 0.959 | Ji 2021 |
| Venules : arterioles | 3 : 1 | 3.0 ± 0.1 | Blinder 2013 |
| Laminar capillary density | rises gently with depth (< 30%) | not tracking neuron density; shallow L4 peak | Tsai 2009, Blinder 2013 |
| Perfusion | 66–69 mL/100 g/min | roughly 100 | see Schmid 2017 |

The app's **Network statistics** panel computes these quantities for any
network, including reconstructed ones, and marks each against its measured
range.

### Known gaps (open work, not hidden)

- **Segment length:** about 30% shorter than measured at the correct length
  density. Matching both would need tortuosity near 1.4, against the ~1.2
  measured, so the capillary topology itself needs more work.
- **Offshoots take capillary share:** relabelling capillary edges as
  offshoot trees lowers the capillary share of vascular volume (~0.55
  against 0.8) and of length (~0.82 against 0.96). Offshoot vessels are
  probably too wide or too many.
- **Perfusion** is about two thirds of the measured value. Rheology was not
  tuned to close the gap, and neither were the pressures.
- **Capillary hematocrit:** a few low-flow capillaries reach extreme values
  (near 0 or above 0.7), from phase separation at very low flows.
- **Solve time:** with phase separation, a 600 × 600 × 1200 µm column takes
  ~25–35 s. The adaptive under-relaxation converges to a 0.1% flow change.
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

### From a reconstructed graph to a solvable network

`graph_files` runs `labeling.prepare_network` on every loaded graph (turn
it off with `prepare: false`):

1. **Depth** below the pia along `depth_axis`, with the surface at the
   `min` or `max` coordinate.
2. **Penetrating trees:** the connected components of vessels wider than
   6.5 µm that start within 30 µm of the surface and reach at least 100 µm
   deep. Their surface ends are where blood enters or leaves.
3. **Arterial or venous**, set by `labels`:
   - `types` uses the vessel types in the file.
   - `diameter` is a heuristic: the widest quarter of trees at entry are
     called arterial.
   - `auto` (the default) uses types when every tree has them, otherwise the
     heuristic. The method used is recorded in the network metadata.
4. **Boundary conditions:** arterial entries are held at `p_arterial_mmhg`
   (default 60) and venous exits at `p_venous_mmhg` (default 10). Capillary
   dead ends at the crop faces are pruned, so no flow crosses the faces.

On synthetic columns with their labels stripped, the tree detection finds
86–92% of the true entry points, with no spurious ones and no mixed trees.
The diameter heuristic is weak: it identifies only about a third to half of
the arterial trees. Use labelled data whenever possible.

In the app, CSV files can be uploaded from the network form (the
**Upload CSV** button next to `nodes_file` and `edges_file`). Uploads are
stored in the data directory, which is never committed.
