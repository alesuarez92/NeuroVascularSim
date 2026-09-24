# Vision and first steps

## The product

**A real application for testing all kinds of experimental brain data
against physiological models, in both directions:**

- **Forward problem:** physiology → model → the signal each instrument
  records: BOLD (any field strength, TE, GE or SE), CBF (ASL, LDF, laser
  speckle), CBV (VASO), optical imaging, Ca²⁺ imaging, LFP and EEG. All
  parameters and the ground truth are known.
- **Inverse problem:** recorded data → the physiology that produced it.
  This covers parameter estimation with uncertainty, comparison of
  competing mechanisms, and identifiability analysis before any fit. Every
  inverse method is validated on forward-simulated data before it is
  applied to real data.
- **Real data of every kind:** readers, preprocessing and analyses, with
  the owner's MATLAB app NeuroAnalyzer rebuilt natively in Python as part
  of the same platform, then extended. Both directions use them.

It is a web application (see [architecture.md](architecture.md)) built to
grow without limit: new models, modalities, analyses and inverse methods
are plugins.

## What the suite should do

Explain the fMRI signal (and other hemodynamic and electrophysiological
signals) from the physiology that produces it, in health and disease, at two
linked levels of detail:

1. **Detailed level: a 3D microvascular network.** Circulation modelled on a
   realistic vascular graph: nodes (bifurcations, vessel points) and edges
   (vessel segments) in 3D, each carrying geometry (diameter, length, wall),
   vessel type (pial and penetrating arterioles, precapillary arterioles,
   capillaries, venules, veins) and cortical depth and layer. Built from
   reconstructed networks or generated synthetically. Blood flow, pressure,
   hematocrit and rheology, vessel mechanics, oxygen transport and the
   measured signal are all computed on this graph.
2. **Biochemical pathways that depend on layer and vessel type.** Cell
   populations (excitatory and inhibitory neurons and their subtypes,
   astrocytes, pericytes, smooth muscle, endothelium) are placed according to
   laminar cell densities. Their vasoactive and metabolic signalling (K⁺, NO,
   prostaglandins, EETs, 20-HETE, adenosine, O₂ consumption, and others) acts
   on the vessel segments they are near. Which pathway dominates depends on
   the layer and on the vessel type (e.g., smooth muscle on arterioles,
   pericytes on capillaries). The owner's astrocyte NVC model (Suarez et al.
   2025) is one of these pathway modules. **Signals also travel along the
   graph**: capillary endothelial cells sense neuronal activity (e.g., K⁺
   through Kir2.1) and the resulting hyperpolarization spreads upstream
   through endothelial gap junctions to dilate the feeding arterioles (the
   Nelson group's model), with contractile and thin-strand pericytes acting
   at the arteriole–capillary transition. So the graph carries membrane
   potential and electrical coupling on its edges, not only flow.
3. **Mesoscopic level: a 2D cortical column.** A reduced model over cortical
   depth (layers I–VI) and lateral position, with compartments per layer
   (arteriolar, capillary, venular). Its parameters come from vessel and cell
   distributions, and are derived from the detailed level by coarse-graining
   (in the spirit of fitting the parsimonious windkessel to the detailed
   network in Suarez et al. 2021a). It includes venous drainage across layers
   and lateral coupling through shared arteries (blood stealing).
4. **Signal acquisition at both levels.** A detailed forward model of BOLD
   (intra- and extravascular, field strength, TE, GE vs SE, laminar profiles)
   computed from the 3D vessel geometry, and a mesoscopic BOLD model for the
   2D column. Other modalities as well: CBV (VASO), CBF (ASL, LDF), optical
   imaging and electrophysiology.
5. **Physiology and pathology as mechanisms.** Each condition (e.g.,
   neural inhibition, network deactivation, neurovascular or metabolic
   uncoupling, blood stealing, capillary stalling, occlusion or rarefaction,
   hematocrit changes, impaired astrocytic signalling, altered vessel walls)
   is represented at both levels, with its predicted signature across
   modalities and layers. This is the route to improving what fMRI can
   detect and to separating mechanisms that look alike in BOLD alone.
6. **Real data in the same framework.** Fit the mesoscopic model to
   recordings, use the detailed model as ground truth to test analyses, and
   reuse NeuroAnalyzer's readers and analyses where possible.

The owner's published models are the **baseline and context**, not the
target: they show the approach (detailed model → parsimonious model →
inference from data) that the suite generalises to 3D, layers and many
pathways.

Compared with general-purpose tools such as Brainstorm, the emphasis is on
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
[background.md](background.md) summarises these papers.

## Research code

The owner uploads the original code under `legacy/` (one subfolder per topic,
e.g. `legacy/biochemical`, `legacy/flow`, `legacy/fmri`), without lab data.

## Order of work

1. **Read the owner's papers** and summarise the framework, models and open
   questions (`docs/background.md`), to be corrected by the owner.
2. **Review the owner's existing code** and map it onto the levels above.
3. **Survey the literature the suite builds on**: vascular graph
   reconstructions and synthetic network generation, laminar vessel and cell
   densities, network flow and rheology, oxygen transport, detailed BOLD
   simulation from vessel geometry, laminar BOLD models, and layer-specific
   neurovascular coupling.
4. **Decide the architecture**: language and performance needs (3D networks
   with many segments, sparse solvers, possibly Monte Carlo MR simulation),
   the graph data model, module boundaries (network → flow → pathways →
   oxygen → signal; detailed ↔ mesoscopic), a common data format shared with
   NeuroAnalyzer, and how models are tested (analytic cases and synthetic
   ground truth).
5. **First vertical slice**: one cortical column, one stimulus, detailed
   network to a laminar BOLD profile, then its coarse-grained 2D column
   reproducing it, with tests, before widening any single stage.

## Open decisions

- Species for the first column (mouse, where reconstructed networks and the
  owner's optogenetic and LDF data exist, or human, the fMRI target).
- Language and toolboxes (MATLAB like the existing code, or Python or Julia
  for large sparse graphs and GPU simulation).
- Sources of vascular networks and laminar cell densities.
- Licence and when to make the repository public.
- Which papers and datasets define the first validation targets.
