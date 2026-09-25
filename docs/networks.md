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

### Validation against measurements (default 600 × 600 × 1200 µm column, seeds 0–3)

The papers are cited from PubMed: Adams et al. 2018
[doi:10.1038/s41598-018-27910-3](https://doi.org/10.1038/s41598-018-27910-3),
Blinder et al. 2013
[doi:10.1038/nn.3426](https://doi.org/10.1038/nn.3426), Ji et al. 2021
[doi:10.1016/j.neuron.2021.02.006](https://doi.org/10.1016/j.neuron.2021.02.006),
Schmid et al. 2017
[doi:10.1371/journal.pcbi.1005392](https://doi.org/10.1371/journal.pcbi.1005392),
Smith et al. 2019
[doi:10.3389/fphys.2019.00233](https://doi.org/10.3389/fphys.2019.00233) and
Tsai et al. 2009
[doi:10.1523/JNEUROSCI.3287-09.2009](https://doi.org/10.1523/JNEUROSCI.3287-09.2009).
Model values are the mean over seeds, with the range in brackets.

**Consistent with the measurements**

| Quantity | Model | Measured | Source |
|---|---|---|---|
| Capillary length density | 0.91 [0.88–0.95] m/mm³ | 0.88 ± 0.17 (vS1); 0.98 ± 0.02 (somatosensory) | Ji 2021 |
| Capillary diameter | median 4.0 µm, SD 0.9 | 4.0 ± 1.0 µm; radii near 2 µm | Schmid 2017; Blinder 2013 |
| Tissue-to-vessel distance (mean) | 14.0 [13.8–14.1] µm | 13.3 ± 1.2 µm at 0.88 m/mm³ | Ji 2021 |
| Branch points that are triads | 0.92; 0.08 degree ≥ 4 | 0.93 triads, < 0.07 crosses | Blinder 2013 |
| Capillary branch order (mean) | 3.56 [3.36–3.84] | 3.4 ± 0.2 | Ji 2021 |
| Arteriole-to-venule path (median) | 6.3 [5–7] branches | ~7 | Ji 2021 |
| Penetrating arteriole diameter at entry (median) | 11.2 µm | 11 µm | Blinder 2013 |
| Ascending venule diameter at entry (median) | 9.0 µm | 9 µm | Blinder 2013 |
| Venules : arterioles | 3 : 1 | above the rat estimates of 1.8 and 2.6 | Blinder 2013 |

**Inconsistent: open gaps**

| Quantity | Model | Measured | Source |
|---|---|---|---|
| Capillary segment length (median) | 33.5 µm | 50 µm | Blinder 2013 |
| Capillary segment length (spread) | p5–p95 4–65 µm, max 100 µm | broad, 10–200 µm | Blinder 2013 |
| Capillary tortuosity | 1.20 (a parameter) | 1.27 ± 0.05 | Ji 2021 |
| Penetrating arterioles per mm² | 25 | 17.4 (fixed tissue, uncorrected for shrinkage) | Adams 2018 |
| Capillary share of vascular length | 0.80 [0.79–0.81] | 0.959 | Ji 2021 |
| Capillary share of vascular volume | 0.54 [0.53–0.56] | 0.8 ± 0.2 | Ji 2021 |
| Capillary (microvascular) volume fraction | 1.2% | 0.74% (fixed tissue) | Tsai 2009, as cited by Blinder 2013 |
| Laminar capillary density | rises steadily from L1 (~0.77) to L6 (~0.98 m/mm³) | shallow peak at L4 | Blinder 2013; Tsai 2009 |
| Perfusion | 66–69 mL/100 g/min | roughly 100 | see Schmid 2017 |

The app's **Network statistics** panel computes most of these quantities for
any network, including reconstructed ones, and marks each against its
measured range.

### What the gaps point to

- **Capillaries too short and too uniform.** The capillary bed is a regular
  foam, so segment lengths cluster (coefficient of variation 0.57) and none
  exceed ~100 µm. Measured beds are broader, with a median of 50 µm.
  Tortuosity is 1.2, but Ji et al. measured 1.27; raising it alone would
  lengthen segments by ~6%.
- **Too much non-capillary vessel.** One capillary edge in five is relabelled
  as a precapillary arteriole or postcapillary venule (offshoot trees), and
  the penetrating vessels are ~40% denser than Adams et al. counted. Both
  lower the capillary shares of length and volume.
- **Microvascular volume fraction:** the in-vivo diameter (4 µm) at the
  measured length density gives 1.2% by arithmetic. The 0.74% figure comes
  from fixed tissue, where vessels shrink, so this gap may be partly one of
  method.
- **Laminar profile:** the cause of the rise with depth is not yet known.
  The `l4_density_boost` parameter (0.1) does not produce an L4 peak. A
  foam density that depends on depth would give direct control.
- **Other known issues:**
  - A few low-flow capillaries reach extreme hematocrit, from phase
    separation at very low flows.
  - With phase separation, a solve takes ~25–35 s for the default column.
  - Layer boundaries are approximate for mouse S1.

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
