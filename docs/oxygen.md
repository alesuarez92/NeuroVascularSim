# Oxygen transport and BOLD

Two models run after the flow solution, when an experiment spec contains
`"oxygen": {...}` and optionally `"bold": {...}` (an empty object uses the
defaults). Code: `vascular/oxygen.py` and `vascular/bold.py`.

## Oxygen transport (`solve_oxygen`)

**Blood.** Oxygen is bound to hemoglobin and dissolved in plasma. Its content
per volume of blood is `C = H·C_hb·S(P) + α·P`, with the Hill saturation
`S = Pⁿ / (Pⁿ + P50ⁿ)`.
- **Along a vessel:** oxygen is carried with the flow and lost through the
  wall at `k_w·(P − P_tissue)` per length, where `k_w = π·α·D·Nu`.
- **Each ~5 µm step:** integrated exactly toward equilibrium with the
  surrounding tissue, so it is stable at any flow and conserves oxygen.
- **At junctions:** oxygen fluxes mix and PO2 is continuous.

**Tissue.** On a voxel grid (10 µm by default), the model solves
`D·α·∇²P − M(P) + Σ G·(P_vessel − P) = 0`.
- **Consumption:** Michaelis–Menten, `M = M0·P / (P + Km)`.
- **Vessel exchange:** each vessel step exchanges with its voxel through
  `G = Q·(1 − e^−λ)·dC/dP`. This equals the wall conductance for fast flow and
  the flow-limited conductance for slow flow, so blood and tissue balance
  exactly at convergence.
- **Faces:** closed (no flux), as in the flow model.

**Iteration.** Vessels and tissue alternate until tissue PO2 changes by less
than 0.05 mmHg. Anderson acceleration speeds this up; it typically takes ~25
iterations. The result reports the oxygen balance (delivered / consumed,
≈ 1.00).

**Condition changes.** The `scale_cmro2` perturbation multiplies
consumption everywhere, or in a depth range or layers (e.g. neuronal
activation).

### Parameters

| Parameter | Default | Source |
|---|---|---|
| Hill n, P50 | 2.59, 40.2 mmHg | C57BL/6 mice, as used by Sakadžić et al. 2014 |
| CMRO2 (maximal, M0) | 2.44 µmol/g/min | Zhu et al. 2013, *NeuroImage* 64:437, [doi:10.1016/j.neuroimage.2012.09.028](https://doi.org/10.1016/j.neuroimage.2012.09.028) (17O-MRS, mouse cortex) |
| Pial arteriole PO2 (inflow) | 100 mmHg | Sakadžić et al. 2014 |
| O2 solubility α (plasma and tissue) | 1.27 µM/mmHg | Fang et al. 2008 (mouse cortex VAN model); Lücker et al. 2018 give 1.11 (plasma) and 1.53 (tissue) |
| O2 diffusivity in tissue | 2.4·10⁻⁹ m²/s | Fang et al. 2008; Lücker et al. 2018 (2.41·10⁻⁵ cm²/s) |
| Heme (O2-binding) density of red cells | 20.3 mM | Lücker et al. 2018, Table 1 (2.03·10⁻⁵ mol/cm³) |
| Km of consumption | 1 mmHg | "usually assumed to be about 1 mmHg" (Gagnon et al. 2016); measured 5–10 mmHg in muscle (Golub & Pittman 2012) — worth a sensitivity run |
| Nusselt number | 2.5 | **assumption**, not from a paper; it depends on hematocrit (Lücker et al. 2017); method as in Hellums et al. 1996 |
| Tissue density | 1.05 g/mL | **assumption**, no source found; only converts CMRO2 units |

All cited from PubMed:
- Sakadžić S et al. 2014, *Nat Commun* 5:5734,
  [doi:10.1038/ncomms6734](https://doi.org/10.1038/ncomms6734).
- Fang Q et al. 2008, *Opt Express* 16:17530,
  [doi:10.1364/oe.16.17530](https://doi.org/10.1364/oe.16.17530).
- Lücker A, Secomb TW, Weber B, Jenny P 2018, *Front Physiol* 9:420,
  [doi:10.3389/fphys.2018.00420](https://doi.org/10.3389/fphys.2018.00420).
- Lücker A et al. 2017, *Microcirculation* 24:e12337,
  [doi:10.1111/micc.12337](https://doi.org/10.1111/micc.12337).
- Gagnon L et al. 2016, *Front Comput Neurosci* 10:82,
  [doi:10.3389/fncom.2016.00082](https://doi.org/10.3389/fncom.2016.00082).
- Golub AS, Pittman RN 2012, *Am J Physiol Heart* 303:H47,
  [doi:10.1152/ajpheart.00131.2012](https://doi.org/10.1152/ajpheart.00131.2012).
- Hellums JD et al. 1996, *Ann Biomed Eng* 24:1,
  [doi:10.1007/BF02770991](https://doi.org/10.1007/BF02770991).

Values not taken from a paper are marked **assumption**.

### Tests (all pass)

- With no consumption, vessels and tissue sit at the arterial PO2, within
  the iteration tolerance.
- Oxygen is conserved (balance 1.00 ± 0.02), PO2 falls from arterioles to
  capillaries, and tissue PO2 stays between 0 and the arterial value.
- More consumption lowers venous saturation, and more flow raises it.

### On the synthetic column (default 600 × 600 × 1200 µm, seed 0, in-vitro viscosity, phase separation)

| Quantity | Default network | Deep arterioles + 1.3 × trunks | Measured (Sakadžić 2014) |
|---|---|---|---|
| OEF | 0.19 | 0.10 | 0.35 |
| Share of extraction by arterioles | 0.21 | 0.15 | 0.50 |
| Tissue PO2 mean (hypoxic < 10 mmHg) | 28 mmHg (31%) | 39 mmHg (18%) | little hypoxia expected |
| Median capillary PO2 | 27 mmHg | 41 mmHg | (in figures) |
| CMRO2 achieved | 1.77 | 2.06 µmol/g/min | 2.3 (input) |

"Deep arterioles + 1.3 × trunks" means `pa_min_depth_fraction` 0.8, trunks
1.3 × wider and tapering to 8 µm.

**What the oxygen model reveals about the synthetic network.** Perfusion is
normal (~100 mL/100 g/min), but flow in the bed is very uneven:
- 40–50% of capillaries carry blood slower than 0.1 mm/s, and the
  coefficient of variation of capillary velocity is ~2.5.
- Deep capillaries get ~30 × less flow than superficial ones.

Blood therefore passes through fast channels with little extraction (low
OEF), while slow regions, especially deep ones, run short of oxygen.

Other parts of the gap:
- **Penetrating arterioles end at 30–100% of the depth**, so the deepest
  tissue has no arteriole of its own.
- **The trunks are fixed-tissue diameters tapering to 6 µm.** Deep
  capillaries then sit at nearly venous pressure.
- **The measured 50% arteriolar extraction is not reproduced** at Nu = 2.5.
  This is the classical gap between measured and predicted arteriolar
  oxygen loss, and it is left open.

**With structural adaptation** and the current defaults (perfusion
calibrated to the measured 90 mL/100 g/min, hematocrit 0.415, CMRO2 2.44;
seeds 0–3): OEF 0.32 (measured 0.32–0.39 awake), arteriolar share 0.14
(0.34 awake), 19% hypoxic tissue. Penetrating-arteriole PO2 falls from 100
mmHg in L1 to 88 in L5 (measured awake: 99 to 84; Li 2019). The OEF gap was
mass balance (too much flow); what remains is the spread of flow between
capillaries (see [networks.md](networks.md), structural adaptation).

**Why arterioles release too little oxygen (investigation, adapted column,
seed 0).** Measured the way Sakadžić 2014 defines it (saturation drop from
the inlet to the precapillary arterioles, over the drop to the ascending
venules), the model's arteriolar share is only 0.07: precapillary
arterioles stay at PO2 93 mmHg (SO2 0.90), against 66 mmHg (SO2 0.78)
measured under anaesthesia (Sakadžić 2014) and 84 mmHg in layer V
arterioles of awake mice (Li 2019, whose awake arteriolar share is 34%).
What does not explain it:
- the intravascular mass transfer (Nusselt number 2.5 → 100 changes the
  share from 0.15 to 0.15);
- the tissue grid (10 → 6 µm voxels: unchanged);
- a capillary-free sleeve of 53 µm around penetrating arterioles through
  layers I–IV (Kasischke 2011; option `periarteriolar_free_radius_um`): the
  share falls slightly (0.15 → 0.13, 0.13 → 0.10) and hypoxia rises, because
  the sleeve is only ~7% of the tissue volume;
- high oxygen use by the vessel wall, proposed by Tsai et al. 2003, was
  attributed to a measurement artefact (Golub & Pittman 2008, 2011) and is
  not used.
Still open. Sources: Kasischke KA et al. 2011, *J Cereb Blood Flow Metab*
31:68, [doi:10.1038/jcbfm.2010.158](https://doi.org/10.1038/jcbfm.2010.158);
Tsai AG, Johnson PC, Intaglietta M 2003, *Physiol Rev* 83:933,
[doi:10.1152/physrev.00034.2002](https://doi.org/10.1152/physrev.00034.2002);
Golub AS, Pittman RN 2008, *Am J Physiol Heart* 294:H2905,
[doi:10.1152/ajpheart.01347.2007](https://doi.org/10.1152/ajpheart.01347.2007);
Golub AS, Pittman RN 2011, *Am J Physiol Heart* 301:H737,
[doi:10.1152/ajpheart.00353.2011](https://doi.org/10.1152/ajpheart.00353.2011).

These are properties of the synthetic network and the vessel wall model,
not of the transport solver (which conserves oxygen and passes the limit
tests). Running on a reconstructed network (the Kleinfeld graphs) is the
direct check.

## BOLD (`bold_profile`)

Each depth slab (50 µm) is treated as a voxel holding the vessels that
cross it. Its gradient-echo signal is

    S = (1 − V)·exp(−TE·ΔR2*_E) + ε·Σ v_k·exp(−TE·r0·(1 − Y_k))
    ΔR2*_E = 4.3·ϑ0·Σ v_k·(1 − Y_k)

- `v_k` and `Y_k` are each vessel's volume fraction in the slab and its
  saturation from the oxygen model.
- `ϑ0` is the frequency offset at the vessel surface for fully deoxygenated
  blood: 40.3 s⁻¹ at 1.5 T, scaled with field strength.
- `r0` is the slope of intravascular R2* against (1 − Y): 25 s⁻¹ at 1.5 T.
- `ε` is the ratio of intravascular to extravascular signal. It is poorly
  known and best treated as free.

These values are those of Obata et al. 2004 as reported by Stephan et al.
2007 (*NeuroImage* 38:387,
[doi:10.1016/j.neuroimage.2007.07.040](https://doi.org/10.1016/j.neuroimage.2007.07.040),
cited from PubMed).

The defaults are the 1.5 T, TE = 40 ms settings of those papers. At other
fields, set `r0_per_s` and `epsilon` yourself: they are not scaled
automatically, and no value is assumed.

The change of a condition against the baseline includes both saturation
changes and blood volume changes (diameters), vessel by vessel. That is how
deoxygenated blood draining up the ascending venules shapes the laminar
profile.

**Outputs:**
- the signal change per slab and for the column;
- its extravascular and intravascular parts;
- the change when only one vessel class (arterial, capillary, venous)
  changes.

**Tests:**
- More oxygenation gives positive BOLD.
- The extravascular effect grows with field strength.
- Dilation gives positive BOLD, and a CMRO2 rise at constant flow gives
  negative BOLD. With a flow-to-CMRO2 coupling ratio below 1, the response
  is negative, as expected.

**Simplifications:**
- The 4.3 static-dephasing factor is applied to every vessel class. Around
  capillaries at low field, diffusion reduces the extravascular effect
  (Uludağ et al. 2009); this is not modelled yet.
- The signal is steady state: no dynamics yet.
