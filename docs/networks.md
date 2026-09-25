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

- **Capillary bed:** evenly spaced junctions (blue noise) joined to their
  nearest neighbours, up to three vessels each. The junction spacing, not an
  intermediate tessellation, sets the segment length. The spacing is
  calibrated to the capillary length density. Segment lengths are 1.27 ×
  the straight distance (the tortuosity Ji et al. measured). The earlier
  Voronoi foam is still available (`capillary_bed: "foam"`), but its
  segments are too short (median ~35 µm).
- **Penetrating arterioles and ascending venules:** vertical trunks that
  taper with depth, 17.4 arterioles per mm² (as measured) and 3 venules per
  arteriole. They join the bed every 60 µm of depth, preferring junctions
  with a free slot so that no degree-4 junctions are created. Each join grows
  a one-generation offshoot tree: capillary edges next to the trunk become
  precapillary arterioles or postcapillary venules.
- **Calibration:** the join spacing was fitted to the capillary branch
  order of Ji et al. 2021. Flow was not a target, and the perfusion that
  results is reported below as a test of the model.
- **Boundary conditions:** by default, pressures are fixed where arterioles
  (60 mmHg) and venules (10 mmHg) enter the cortex. This is the standard for
  cropped networks. The alternative `boundary: "pial_tree"` adds pial trees
  with one inlet and one outlet, sized by Murray's law.
- **Depth and layer:** every node carries its depth below the pia and an
  approximate mouse S1 layer (L1, L2/3, L4, L5, L6).

### How quantities are counted

Everything is counted the way the papers count it:
- **Per branch:** the vessel between two branch points, with any degree-2
  points merged in (`stats.contract_branches`).
- **Capillary:** any vessel at most 7 µm wide (radius 3.5 µm), which is Ji et
  al.'s definition, regardless of its label. Thin connectors and offshoots
  therefore count as capillaries, and wide offshoots do not.

The first validation (before this change) counted by vessel label and per
graph edge, so it overstated the match. By Ji's definition, the old defaults
had branch order ~3.9 and an arteriole-to-venule path of 8–10.

### Validation against measurements (default 600 × 600 × 1200 µm column, seeds 0–3)

The papers are cited from PubMed: Adams et al. 2018
[doi:10.1038/s41598-018-27910-3](https://doi.org/10.1038/s41598-018-27910-3),
Blinder et al. 2013
[doi:10.1038/nn.3426](https://doi.org/10.1038/nn.3426), Ji et al. 2021
[doi:10.1016/j.neuron.2021.02.006](https://doi.org/10.1016/j.neuron.2021.02.006),
Schmid et al. 2017
[doi:10.1371/journal.pcbi.1005392](https://doi.org/10.1371/journal.pcbi.1005392)
and Tsai et al. 2009
[doi:10.1523/JNEUROSCI.3287-09.2009](https://doi.org/10.1523/JNEUROSCI.3287-09.2009).
Model values are the mean over seeds, with the range in brackets.

**Consistent with the measurements**

| Quantity | Model | Measured | Source |
|---|---|---|---|
| Capillary length density | 0.90 [0.87–0.91] m/mm³ | 0.88 ± 0.17 (vS1) | Ji 2021 |
| Capillary diameter | median 4.1 µm | 4.0 ± 1.0 µm | Schmid 2017 |
| Capillary tortuosity | 1.27 | 1.27 ± 0.05 | Ji 2021 |
| Branch points that are triads | 0.95 | 0.93 | Blinder 2013 |
| Capillary branch order (mean) | 3.35 [3.0–3.7] | 3.4 ± 0.2 | Ji 2021 |
| Capillary share of vascular volume | 0.71 | 0.8 ± 0.2 | Ji 2021 |
| Penetrating arterioles per mm² | 17.4 (input) | 17.4 | Adams 2018 |
| Venules : arterioles | 3 : 1 | above the rat estimates of 1.8 and 2.6 | Blinder 2013 |
| Arteriole / venule diameter at entry (median) | 11 / 9 µm | 11 / 9 µm | Blinder 2013 |
| Laminar capillary density | flat within ~10% | no strong laminar variation | Tsai 2009 |

**Close, but outside the measured range**

| Quantity | Model | Measured | Source |
|---|---|---|---|
| Capillary segment length (median) | 60 µm (p90 85 µm) | 50 µm; broad, 10–200 µm | Blinder 2013 |
| Tissue-to-vessel distance (mean) | 14.7 [14.5–14.9] µm | 13.3 ± 1.2 µm | Ji 2021 |
| Arteriole-to-venule path (median) | 9 [8–10] branches | ~7 | Ji 2021 |
| Capillary share of vascular length | 0.90 | 0.959 | Ji 2021 |

**Inconsistent: perfusion**

| Quantity | Model | Measured |
|---|---|---|
| Perfusion (in-vivo viscosity law, inflow hematocrit 0.45) | 15–22 mL/100 g/min | roughly 100 |
| Median capillary velocity | ~0.02 mm/s | ~0.5–1.5 mm/s (Schmid 2017, from the literature) |

### Why perfusion is low (diagnosis, open decision)

The network is not the main cause. With plasma viscosity, the same network
gives a median capillary velocity of 0.25 mm/s (mean 0.76 mm/s). The
in-vivo viscosity law (Pries et al. 1994, as implemented and checked)
predicts a relative viscosity of ~18 in a 4 µm capillary at a discharge
hematocrit of 0.45, and capillaries then take about half of the pressure
drop.

A Poiseuille estimate shows the conflict: an 11 µm penetrating arteriole
500 µm long cannot carry the ~1 nL/s that normal perfusion needs within a
physiological pressure drop.

Sensitivity of perfusion (seed 0, no phase separation; the baseline is
16.6 mL/100 g/min):

| Change | Perfusion |
|---|---|
| Trunks 1.3 × wider (a possible fixed-tissue shrinkage) | 25.9 |
| Trunks taper to 8 µm instead of 6 µm | 22.1 |
| Capillaries 5 µm mean instead of 4 µm | 29.5 |
| Inflow discharge hematocrit 0.30 | 24.1 |
| Red-cell phase separation (inflow 0.45 / 0.30) | 16.2 / 24.0 |
| Trunks 1.3 × wider, taper to 8 µm, hematocrit 0.30 | 37.2 |

No single documented correction closes the gap. The likely causes are:
- vessel diameters measured in fixed tissue (Blinder 2013; Adams 2018 did
  not correct for shrinkage) combined with a viscosity law fitted in the
  rat mesentery;
- how the hematocrit enters the law. Schmid et al. 2017 set a *tube*
  hematocrit of 0.3 at the inflows, and they rescaled capillary diameters to
  4.0 ± 1.0 µm.

Which correction to adopt is a modelling decision. It is left open, and
every factor above is a parameter.

### Other known gaps

- **Segment-length spread** is narrower than measured (p90 85 µm; the
  measured range reaches 200 µm).
- **Capillary hematocrit:** a few low-flow capillaries reach extreme values,
  from phase separation at very low flows.
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
