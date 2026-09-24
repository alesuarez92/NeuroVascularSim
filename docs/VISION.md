# Vision and first steps

## What the suite should do

- **Simulate** the chain from neural activity through biochemical pathways
  and blood flow to the measured signal (fMRI BOLD first; also LDF,
  electrophysiology and optical imaging), with parameters that have
  physiological meaning.
- **Analyse real data** in the same framework, reusing NeuroAnalyzer's
  readers and analyses where possible.
- **Combine the two**: fit models to recordings, compare predictions with
  measurements, and test how well an analysis recovers known physiology
  (simulated ground truth).
- Compared with general-purpose tools such as Brainstorm, the emphasis is on
  physiology and interpretation, not only on signal processing.

## Order of work

1. **Read the owner's papers** and write a short summary of the physiological
   framework, the models used and the open questions (`docs/background.md`),
   to be corrected by the owner.
2. **Review the owner's existing code** (biochemical pathway simulations,
   flow dynamics, fMRI) and map it onto the chain above.
3. **Decide the architecture**: language (MATLAB like the existing code,
   unless there is a strong reason otherwise), module boundaries (neural →
   biochemical → vascular → acquisition), a common data format shared with
   NeuroAnalyzer, and how models are tested (synthetic ground truth, as in
   NeuroAnalyzer's `DemoData`).
4. **First vertical slice**: one stimulus through the whole chain to a
   simulated BOLD signal, with tests, before widening any single stage.

## Open decisions

- Language and toolboxes (after seeing the existing code).
- Licence and when to make the repository public.
- Which papers and datasets define the first validation targets.
