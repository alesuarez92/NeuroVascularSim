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

**Perfusion: depends on the viscosity law**

| Viscosity law | Perfusion (mL/100 g/min) | Mean capillary velocity | Measured |
|---|---|---|---|
| In vitro (Pries et al. 1992), **default for cortical networks** | 97–111 (seeds 0–1, with or without phase separation) | 0.65–0.72 mm/s | ~100; 0.5–1.5 mm/s (Schmid 2017, from the literature) |
| In vivo (Pries et al. 1994) | 15–22 | ~0.08 mm/s | |

### Why the viscosity law decides perfusion

The two laws differ mostly in narrow vessels:

| Diameter (discharge hematocrit 0.45) | In vitro | In vivo |
|---|---|---|
| 4 µm | 2.3 | 17.7 |
| 10 µm | 1.3 | 5.9 |
| 100 µm | 2.4 | 2.5 |

The in-vivo law carries the endothelial surface layer, as fitted in rat
mesentery.

The network itself is not the limit. With plasma viscosity it gives 175
mL/100 g/min. A Poiseuille estimate shows why the in-vivo law fails here: at
the measured ~1 mm/s, a 4 µm capillary with a relative viscosity of 18 would
need ~20 mmHg per 60 µm segment. That is impossible across ~7 segments within
the 50 mmHg arteriole-to-venule drop.

With the in-vivo law, no single documented correction closes the gap (seed 0,
no phase separation, baseline 16.6):

| Change | Perfusion |
|---|---|
| Trunks 1.3 × wider (a possible fixed-tissue shrinkage) | 25.9 |
| Capillaries 5 µm mean instead of 4 µm | 29.5 |
| Inflow discharge hematocrit 0.30 | 24.1 |
| Trunks 1.3 × wider, taper to 8 µm, 5 µm capillaries, hematocrit 0.30 | 77.6 |

The owner decided on the in-vitro law as the default for cortical networks
(synthetic and reconstructed). With the measured morphology it reproduces
measured perfusion and capillary velocities with no tuning. The in-vivo law
remains selectable, and the Suarez et al. 2021 network keeps it, as in that
paper.

Median capillary velocity (0.16–0.26 mm/s) is lower than the mean because
flow in the bed is heterogeneous. Many capillaries carry little flow, and
in-vivo velocity measurements favour the capillaries with visible red-cell
flow.

### Why capillary flow is uneven (diagnosis, flow only)

Default column, seeds 0–3, in-vitro viscosity, phase separation:

| Quantity | Model | Measured / benchmark |
|---|---|---|
| Mean capillary speed | 0.49 mm/s | 0.71 mm/s, range 0.11–3.63 (awake mouse; Li 2019) |
| Capillaries below 0.1 mm/s | 42% | almost none among flowing capillaries (Li 2019); ~0.45% stalled at any moment (Erdener 2019) |
| Spread of speeds (SD / mean) | 2.3 | 1.4–1.6 in simulations on reconstructed networks (Schmid 2017) |
| Red-cell flux, layer 1 : layer 5 | 3.3 | 41 : 38 RBC/s, about 1.1 (Li 2019) |

Experiments (each changes one thing):
- **Short paths dominate.** Capillaries 1–2 segments from both an
  arteriole and a venule carry 3–6 mm/s, those 10 or more segments away
  ~0.2 mm/s. Venules sit closer to the capillaries than arterioles (median
  2 vs 4 segments).
- **Trunk pressure loss sets part of the depth gradient.** Arterial
  pressure falls ~35% along the penetrating arterioles by 400 µm. This is
  in line with Schmid 2017, where arterioles take 51–61% of the pressure
  drop for deep paths, so the trunks are not the fault. Widening trunks 3×
  flattens the gradient but has no measured support; removing the taper
  does not help.
- **Capillary diameter spread and the rheology laws matter little:**
  uniform 4 µm capillaries lower the spread from 2.0 to 1.7; Newtonian
  blood without phase separation leaves it at 1.85.
- **Measured branching helps only a little.** `pa_branches_per_trunk = 7`
  (about 7 offshoots per penetrating arteriole: 52 offshoots from 7
  arterioles in Grant 2019, our count) with 3 arteriolar offshoot
  generations lowers the spread to 1.9 and the slow share to 36%, but the
  layer 1 : layer 5 flux ratio stays at ~4. Fewer venule branches push the
  capillary branch order above the measured 3.4 ± 0.2. The defaults are
  unchanged (every level connects).
- **The in-vivo viscosity law** (much stiffer capillaries) still gives a
  layer 1 : layer 5 ratio of 3–4.5. Simulations on reconstructed networks
  also give slower deep flow (transit time 0.07 s at 0–0.2 mm vs 0.52 s at
  0.8–1.0 mm; Schmid 2017). Network layout alone therefore does not explain
  the measured flat flux; adaptation of vessel diameters to local signals
  (Pries et al. 1998) is the next candidate.

Sources:
- Li B, …, Sakadžić S 2019, *eLife* 8:e42299,
  [doi:10.7554/eLife.42299](https://doi.org/10.7554/eLife.42299).
- Erdener ŞE, …, Boas DA 2019, *J Cereb Blood Flow Metab* 39:886,
  [doi:10.1177/0271678X17743877](https://doi.org/10.1177/0271678X17743877).
- Schmid F, Tsai PS, Kleinfeld D, Jenny P, Weber B 2017, *PLoS Comput Biol*
  13:e1005392, [doi:10.1371/journal.pcbi.1005392](https://doi.org/10.1371/journal.pcbi.1005392).
- Grant RI, Hartmann DA, …, Shih AY 2019, *J Cereb Blood Flow Metab* 39:411,
  [doi:10.1177/0271678X17732229](https://doi.org/10.1177/0271678X17732229).
- Pries AR, Secomb TW, Gaehtgens P 1998, *Am J Physiol* 275:H349,
  [doi:10.1152/ajpheart.1998.275.2.H349](https://doi.org/10.1152/ajpheart.1998.275.2.H349).

### Other known gaps

- **Segment-length spread** is narrower than measured (p90 85 µm; the
  measured range reaches 200 µm).
- **Capillary hematocrit:** a few low-flow capillaries reach extreme values,
  from phase separation at very low flows.
- **Layer boundaries** are the measured fractions of cortical depth in mouse
  vibrissal S1 (Hooks et al. 2011, *PLoS Biol* 9:e1000572,
  [doi:10.1371/journal.pbio.1000572](https://doi.org/10.1371/journal.pbio.1000572)),
  scaled to the 1200 µm column: 108, 372, 552, 888 µm. Those fractions come
  from young mice (P20–25).

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
