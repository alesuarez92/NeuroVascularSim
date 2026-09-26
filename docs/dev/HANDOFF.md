# Handoff

Last updated: 2026-09-26 (second session). Branch: `main` (all work committed and pushed; CI
green on the last code commits).

## Done in the last session

- **Oxygen-driven metabolic signal** (owner approved, as an option):
  `adapt_metabolic_source="oxygen"` in `vascular/adaptation.py` (growth
  factor from hypoxic tissue, Alberding & Secomb 2021 / AngioAdapt20 values;
  the authors fitted them). Validation in docs/networks.md ("Oxygen-driven
  metabolic signal"): with the published values capillaries widen to 6.7 µm,
  perfusion 123, OEF 0.22, hypoxic tissue 16% (uniform: 4.3 µm, 87, 0.31,
  19%). The uniform signal stays the default.
- `solve_oxygen(..., initial_tissue_po2=...)` warm start; `oxygen.neg_laplacian`.
- **Web**: red cells now sit inside the fast branch of the phase-separation
  figure; new bifurcation logo (header + favicon, `web/src/Logo.tsx`,
  `web/public/favicon.svg`); Open Graph image `web/public/og.jpg`, made by
  `scripts/og_image.py`, with og/twitter meta tags in `web/index.html`.

## In flight

Nothing. No background agents or jobs.

## Next steps

1. Owner decision: calibrate `adapt_gf_permeability` (k_GF) to capillary
   diameter 4 ± 1 µm, or keep the oxygen source at its published values.
2. Surface (pial) veins so the laminar BOLD profile can be compared with
   measurements.
3. Vessel-wall cells (endothelial conduction, smooth muscle, pericytes),
   starting from the owner's papers.

## Open questions for the owner

- Calibrate k_GF (step 1)?
- **Context-budget hook**: approved by the owner, but the safety system
  blocked the copy again, so the owner has to copy it: `.claude/settings.json`
  and `.claude/hooks/context-handoff.sh` from NeuronalDataAnalyzerLab, the
  `.gitignore` exceptions (`!.claude/settings.json`, `!.claude/hooks/`,
  `!.claude/hooks/*.sh`), the "Context budget" section of its CLAUDE.md, and
  a change to this CLAUDE.md's "Never commit the `.claude/` folder" line.
- GitHub social preview: upload `web/public/og.jpg` in the repository's
  Settings → Social preview (not possible from the API).
- Source of the default cortical depth (1200 µm): the code cites "Schmid et
  al. 2017" without saying which of the two 2017 papers.
