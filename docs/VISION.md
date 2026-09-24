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

## The owner's papers (open access in PubMed Central)

1. Suarez A, Valdes-Hernandez PA, Moshkforoush A, Tsoukias N, Riera JJ.
   Arterial blood stealing as a mechanism of negative BOLD response: from the
   steady-flow with nonlinear phase separation to a windkessel-based model.
   *J Theor Biol* 2021. doi:10.1016/j.jtbi.2021.110856 (PMC8507599)
2. Suarez A, Valdés-Hernández PA, Bernal B, Dunoyer C, Khoo HM,
   Bosch-Bayard J, Riera JJ. Identification of negative BOLD responses in
   epilepsy using Windkessel models. *Front Neurol* 2021.
   doi:10.3389/fneur.2021.659081 (PMC8531269)
3. Suarez A, Fernandez F, Riera JJ. Characterizing astrocyte-mediated
   neurovascular coupling by combining optogenetics and biophysical
   modeling. *J Cereb Blood Flow Metab* 2025.
   doi:10.1177/0271678X241311010 (PMC11719438)
4. Balachandar L, Moncion C, Suarez A, Diaz J. Characterization of optimal
   optogenetic stimulation paradigms to evoke calcium events in cortical
   astrocytes. *eNeuro* 2025. doi:10.1523/ENEURO.0220-25.2025 (PMC12440239)

Author initials other than the owner's are as listed in PubMed; check them
when citing. The owner may add papers not indexed in PubMed.

## Research code

The owner uploads the original code under `legacy/` (one subfolder per topic,
e.g. `legacy/biochemical`, `legacy/flow`, `legacy/fmri`), without lab data.

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
