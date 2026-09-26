# Handoff

Last updated: 2026-09-26. Branch: `main` (all work committed and pushed; CI
green on the last code commits).

## Done in the last session

- **Diagnosis of uneven capillary flow** (docs/networks.md, "Why capillary
  flow is uneven"): short arteriole-to-venule paths dominate; trunk pressure
  loss is in line with Schmid 2017; layout tuning alone cannot fix it.
- **Column options** (all parameters exposed in the app):
  `pa_branches_per_trunk`, `av_branches_per_trunk`,
  `periarteriolar_free_radius_um` / `_depth_um` (capillary-free sleeve,
  Kasischke 2011; off, it did not help), plus the previously hidden
  unsourced settings.
- **Optional structural adaptation** (`vascular/adaptation.py`,
  `structural_adaptation=True`): Alberding & Secomb 2021 model, parameters
  from their code AngioAdapt20 (reimplemented). Defaults: capillaries only
  (Hill 2015, Grant 2019), tissue pressure 5.1 mmHg (Feiler 2010), uniform
  metabolic signal 0.1 (calibrated to capillary diameter 4 ± 1 µm).
- **Measured defaults** (owner's decision): hematocrit 0.415 (Mazzaccara
  2008), CMRO2 2.44 µmol/g/min (Zhu 2013), inlet pressure 44 mmHg
  calibrated to CBF 90 mL/100 g/min (Xu 2022).
- **Validation** (docs/networks.md, "Structural adaptation"; docs/oxygen.md):
  with adaptation, perfusion 87, OEF 0.32 (measured 0.32–0.39 awake), layer
  1 : 5 flux 1.1 (1.1), speed spread 1.4, arteriole PO2 100 → 88 mmHg L1 →
  L5 (99 → 84). Remaining gaps: 28% slow capillaries, 19% hypoxic tissue,
  mean capillary speed 0.49 mm/s (0.71), arteriolar share 0.14 (0.34 awake).
- **Mesoscopic summaries** (`vascular/summary.py`): every run stores column
  and per-layer outputs (training data for learned mesoscopic models).
- **Parameter documentation** (`paramdocs.py`, `_paramdocs_catalog.py`,
  `/api/docs`): meaning, unit, group, level and source for every setting.
- **Web app redesign**: floating windows (Setup, Network, Results, Runs &
  jobs) with pop-out and sync; six-step Setup wizard with physiological
  figures, live mini-figures and "?" help dialogs.
- **VISION.md "Design principles"**: modular systems, detail on demand,
  learned mesoscopic surrogates.

## In flight

Nothing. No background agents or jobs.

## Next steps

1. **Oxygen-driven metabolic signal for adaptation** (the published
   Alberding & Secomb mechanism: growth factor from hypoxic tissue, instead
   of the uniform signal), to cut the 19% hypoxic tissue and the slow
   capillaries. Proposed to the owner; not yet approved.
2. Surface (pial) veins so the laminar BOLD profile can be compared with
   measurements.
3. Vessel-wall cells (endothelial conduction, smooth muscle, pericytes),
   starting from the owner's papers.

## Open questions for the owner

- Approve step 1 above?
- **Context-budget hook**: install the NeuroAnalyzer hook here
  (`.claude/hooks/context-handoff.sh` and `.claude/settings.json`, plus the
  "Context budget" section of its CLAUDE.md and the `.gitignore`
  exceptions)? The previous session's attempt to copy it was blocked by the
  safety system (external code that changes Claude's settings), so it needs
  the owner's explicit go-ahead or to be copied by the owner.
- Source of the default cortical depth (1200 µm): the code cites "Schmid et
  al. 2017" without saying which of the two 2017 papers.
