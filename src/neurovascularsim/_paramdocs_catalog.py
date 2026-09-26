"""The parameter catalog: meaning, unit, group, level and source of every
user-facing parameter (see :mod:`neurovascularsim.paramdocs`).

Sources are the citations given in the code comments and in ``docs/``
(networks.md, oxygen.md, literature.md, background.md). Values without a
published source say so plainly.
"""
from __future__ import annotations

from .paramdocs import DOCS, GROUPS, P

# -- citations used below (all from the code comments and docs/) ------------------------------
BLINDER_2013 = "Blinder et al. 2013, Nat Neurosci, doi:10.1038/nn.3426"
JI_2021 = "Ji et al. 2021, Neuron, doi:10.1016/j.neuron.2021.02.006"
SCHMID_2017 = "Schmid et al. 2017, PLoS Comput Biol, doi:10.1371/journal.pcbi.1005392"
SCHMID_2017_EITHER = (
    "Schmid et al. 2017 (the code comment does not say which of the two 2017 papers in docs/literature.md: "
    "PLoS Comput Biol, doi:10.1371/journal.pcbi.1005392, or NeuroImage, doi:10.1016/j.neuroimage.2017.06.046)"
)
ADAMS_2018 = "Adams et al. 2018, doi:10.1038/s41598-018-27910-3 (journal not in repo)"
HOOKS_2011 = "Hooks et al. 2011, PLoS Biol, doi:10.1371/journal.pbio.1000572"
FEILER_2010 = "Feiler et al. 2010, J Neurosci Methods, doi:10.1016/j.jneumeth.2010.05.005"
HILL_2015 = "Hill et al. 2015, Neuron, doi:10.1016/j.neuron.2015.06.001"
GRANT_2019 = "Grant et al. 2019, J Cereb Blood Flow Metab, doi:10.1177/0271678X17732229"
ALBERDING_2021 = (
    "Alberding & Secomb 2021, PLoS Comput Biol, doi:10.1371/journal.pcbi.1009164 "
    "(value from the authors' code AngioAdapt20)"
)
SUAREZ_2021 = "Suarez et al. 2021, J Theor Biol, doi:10.1016/j.jtbi.2021.110856 (Table 1)"
PAETZOLD_2021 = "Paetzold et al. 2021, NeurIPS Datasets and Benchmarks (DOI not in repo)"
SAKADZIC_2014 = "Sakadžić et al. 2014, Nat Commun, doi:10.1038/ncomms6734"
GAGNON_2016 = "Gagnon et al. 2016, Front Comput Neurosci, doi:10.3389/fncom.2016.00082"
GOLUB_2012 = "Golub & Pittman 2012, Am J Physiol Heart Circ Physiol, doi:10.1152/ajpheart.00131.2012"
FANG_2008 = "Fang et al. 2008, Opt Express, doi:10.1364/oe.16.17530"
LUCKER_2018 = "Lücker et al. 2018, Front Physiol, doi:10.3389/fphys.2018.00420"
OBATA_2004 = "Obata et al. 2004, NeuroImage, doi:10.1016/j.neuroimage.2003.08.040"
STEPHAN_2007 = "Stephan et al. 2007, NeuroImage, doi:10.1016/j.neuroimage.2007.07.040"
PRIES_1992 = "Pries et al. 1992, Am J Physiol, doi:10.1152/ajpheart.1992.263.6.H1770"
PRIES_1994 = "Pries et al. 1994, Circ Res, doi:10.1161/01.res.75.5.904"
PRIES_2005 = "Pries & Secomb 2005, Am J Physiol Heart Circ Physiol, doi:10.1152/ajpheart.00297.2005"
MODEL = "model choice: no published source"
ASSUMPTION = "assumption: no published source"

# -- network/mouse_cortex_synthetic -------------------------------------------------------------
_S = "network/mouse_cortex_synthetic"
_SIZE, _BED, _PEN, _OFF, _BC, _BLOOD, _ADAPT, _RAND = (
    "Column size", "Capillary bed", "Penetrating vessels", "Offshoots and connections",
    "Boundary conditions", "Blood", "Structural adaptation", "Randomness",
)
GROUPS[_S] = [_SIZE, _BED, _PEN, _OFF, _BC, _BLOOD, _ADAPT, _RAND]
DOCS[_S] = {
    # Column size
    "size_x_um": P("Width (x)", "Lateral size of the simulated cortical column. Larger columns hold more "
                   "penetrating vessels and give smoother statistics but take longer to solve.",
                   "µm", _SIZE, "basic", MODEL),
    "size_y_um": P("Width (y)", "Lateral size of the column in the second horizontal direction.",
                   "µm", _SIZE, "basic", MODEL),
    "depth_um": P("Cortical depth", "Thickness of the cortex from the pial surface to the white matter. "
                  "Layer boundaries are scaled to this depth.", "µm", _SIZE, "basic", SCHMID_2017_EITHER),
    # Capillary bed
    "capillary_bed": P("Capillary bed model", "How the capillary mesh is built: 'nearest_neighbour' joins evenly "
                       "spaced junctions to their nearest neighbours (up to 3 vessels each); 'foam' uses Voronoi "
                       "edges, the earlier model whose segments are too short.", "", _BED, "advanced", MODEL),
    "capillary_length_density": P("Capillary length density", "Total capillary length per tissue volume. It sets "
                                  "the spacing of capillary junctions and so the segment length and the "
                                  "tissue-to-vessel distance.", "m/mm³", _BED, "advanced", JI_2021),
    "capillary_diameter_mean_um": P("Capillary diameter (mean)", "Mean diameter of capillary segments. Wider "
                                    "capillaries lower resistance and raise flow.", "µm", _BED, "advanced",
                                    SCHMID_2017),
    "capillary_diameter_sd_um": P("Capillary diameter (SD)", "Spread of capillary diameters between segments; "
                                  "more spread makes flow more heterogeneous.", "µm", _BED, "advanced",
                                  SCHMID_2017),
    "tortuosity": P("Tortuosity", "Ratio of a capillary's path length to the straight distance between its ends. "
                    "Higher tortuosity makes vessels longer and more resistive.", "", _BED, "advanced", JI_2021),
    "l4_density_boost": P("Layer 4 density boost", "Relative extra capillary density in layer 4, where the "
                          "measured vascular density peaks. 0 gives a uniform bed.", "", _BED, "advanced",
                          BLINDER_2013),
    "capillary_min_distance_fraction": P("Junction exclusion radius", "Minimum distance between capillary "
                                         "junctions, as a fraction of their mean spacing. Higher values give a "
                                         "more regular bed with fewer very short segments.", "", _BED,
                                         "advanced", MODEL),
    "capillary_edge_noise": P("Neighbour choice noise", "Randomness (log-normal SD) in which neighbours a junction "
                              "connects to; fitted to measured segment lengths. Higher values give a wider spread "
                              "of segment lengths.", "", _BED, "advanced", MODEL),
    # Penetrating vessels
    "pa_density_per_mm2": P("Penetrating arteriole density", "Number of penetrating arterioles entering the cortex "
                            "per surface area (mouse sensory cortex). They are the only arterial inflows to the "
                            "column.", "per mm²", _PEN, "advanced", ADAMS_2018),
    "av_to_pa_ratio": P("Venules per arteriole", "Number of ascending venules per penetrating arteriole; venules "
                        "drain the column to the surface.", "", _PEN, "advanced", BLINDER_2013),
    "pa_diameter_median_um": P("Arteriole diameter (median)", "Median diameter of penetrating arterioles where they "
                               "enter the cortex. Wider trunks lose less pressure along their length.", "µm", _PEN,
                               "advanced", BLINDER_2013),
    "av_diameter_median_um": P("Venule diameter (median)", "Median diameter of ascending venules at the surface.",
                               "µm", _PEN, "advanced", BLINDER_2013),
    "trunk_terminal_diameter_um": P("Trunk end diameter", "Diameter each penetrating trunk tapers to at its deepest "
                                    "point.", "µm", _PEN, "advanced", MODEL),
    "pa_min_depth_fraction": P("Minimum trunk depth", "Shallowest a trunk may end, as a fraction of cortical depth; "
                               "each trunk's depth is drawn between this and the full depth.", "", _PEN,
                               "advanced", MODEL),
    # Offshoots and connections
    "branch_spacing_um": P("Connection spacing", "Distance along a trunk between the levels where it joins the "
                           "capillary bed; calibrated so capillary branch order matches the measured value (mean "
                           "3.4). Closer spacing means more, shorter paths from arterioles to venules.", "µm", _OFF,
                           "advanced", "calibrated to " + JI_2021),
    "connections_per_level": P("Connections per level", "Number of capillary junctions a trunk joins at each "
                               "connecting level (one more at the trunk end).", "", _OFF, "advanced", MODEL),
    "pa_branches_per_trunk": P("Arteriole connecting levels", "Number of levels along each penetrating arteriole "
                               "that connect to the bed, spread evenly with depth. 0 connects every level.", "",
                               _OFF, "advanced", MODEL),
    "av_branches_per_trunk": P("Venule connecting levels", "Number of levels along each ascending venule that "
                               "connect to the bed. 0 connects every level.", "", _OFF, "advanced", MODEL),
    "arteriolar_offshoot_generations": P("Arteriolar offshoot generations", "Generations of precapillary "
                                         "arterioles grown from each arterial connection into the bed (the "
                                         "arteriole-capillary transition zone; Mughal et al. 2023). Calibrated to "
                                         "the measured capillary branch order.", "", _OFF, "advanced",
                                         "calibrated to " + JI_2021),
    "venular_offshoot_generations": P("Venular offshoot generations", "Generations of postcapillary venules grown "
                                      "from each venous connection into the bed.", "", _OFF, "advanced",
                                      "calibrated to " + JI_2021),
    "connector_diameter_um": P("Connector diameter", "Diameter of the vessel joining a trunk to the capillary bed.",
                               "µm", _OFF, "advanced", MODEL),
    # Boundary conditions
    "boundary": P("Boundary type", "'penetrating_tops' fixes pressures where arterioles and venules enter the "
                  "cortex (standard for cropped networks); 'pial_tree' adds pial trees with one inlet and one "
                  "outlet, sized by Murray's law.", "", _BC, "advanced",
                  f"{BLINDER_2013}; {SCHMID_2017}"),
    "p_in_mmhg": P("Arterial pressure", "Blood pressure at the arterial inflows. With the venous pressure it sets "
                   "the pressure drop that drives flow through the column (34 mmHg by default). The default is "
                   "calibrated so perfusion matches measured cortical CBF; no mouse pial pressure measurement was "
                   "found.", "mmHg", _BC, "basic",
                   "calibrated to CBF 90.1 ± 7.3 mL/100 g/min in awake C57BL/6 mice: Xu M et al. 2022, "
                   "J Cereb Blood Flow Metab 42:811, doi:10.1177/0271678X211062279"),
    "p_out_mmhg": P("Venous pressure", "Blood pressure at the venous outflows (pial venules).", "mmHg", _BC,
                    "basic", SCHMID_2017),
    # Blood
    "hematocrit": P("Hematocrit", "Volume fraction of red cells in the blood entering the column. Higher values "
                    "raise viscosity and oxygen-carrying capacity.", "", _BLOOD, "basic",
                    "median of adult C57BL/6J males: Mazzaccara C et al. 2008, PLoS One 3:e3772, "
                    "doi:10.1371/journal.pone.0003772"),
    # Structural adaptation
    "structural_adaptation": P("Structural adaptation", "Adapt vessel diameters to equilibrium with shear stress, "
                               "pressure and a metabolic signal (Alberding & Secomb 2021 model) before solving. "
                               "Off by default.", "", _ADAPT, "basic", MODEL),
    "adapt_steps": P("Adaptation steps", "Number of time steps of the diameter adaptation.", "", _ADAPT, "advanced",
                     ALBERDING_2021),
    "adapt_metabolic_signal": P("Metabolic signal", "Uniform metabolic signal added per µm of vessel; it makes "
                                "low-flow vessels grow. Calibrated so adapted capillary diameters match 4.0 ± 1.0 "
                                "µm.", "per µm", _ADAPT, "advanced", "calibrated to " + SCHMID_2017),
    "adapt_k_m": P("Metabolic sensitivity", "Weight of the metabolic signal in the diameter response.", "", _ADAPT,
                   "advanced", ALBERDING_2021),
    "adapt_k_s": P("Shrinking tendency", "Constant tendency of vessels to shrink, balanced by the growth stimuli.",
                   "", _ADAPT, "advanced", ALBERDING_2021),
    "adapt_tau_ref_dyn_cm2": P("Reference shear stress", "Small shear stress added to the wall shear stress so "
                               "the shear stimulus stays finite in vessels with almost no flow.", "dyn/cm²", _ADAPT,
                               "advanced", ALBERDING_2021),
    "adapt_q_ref_nl_min": P("Reference flow", "Flow added in the denominator of the metabolic signal, so the signal "
                            "stays finite at low flow.", "nL/min", _ADAPT, "advanced", ALBERDING_2021),
    "adapt_conduction_length_um": P("Conduction length", "Decay length of the metabolic response conducted "
                                    "upstream along the vessel wall.", "µm", _ADAPT, "advanced", ALBERDING_2021),
    "adapt_min_diameter_um": P("Minimum diameter", "Floor on adapted diameters (used instead of pruning vessels).",
                               "µm", _ADAPT, "advanced", MODEL),
    "adapt_scope": P("Vessels that adapt", "'capillaries' (default), 'microvessels' (everything below the "
                     "penetrating trunks) or 'all'. Precapillary arterioles are actively regulated by smooth "
                     "muscle or pericytes, so they are left out by default.", "", _ADAPT, "advanced",
                     f"{HILL_2015}; {GRANT_2019}"),
    "tissue_pressure_mmhg": P("Tissue pressure", "Pressure outside the vessels (intracranial pressure), subtracted "
                              "from blood pressure to give the transmural pressure used by structural "
                              "adaptation.", "mmHg", _BC, "basic", FEILER_2010),
    # Randomness
    "seed": P("Random seed", "Seed of the random generator. The same seed gives the same network; different seeds "
              "give statistically equivalent columns.", "", _RAND, "basic", MODEL),
}

# -- network/suarez2021a ------------------------------------------------------------------------
_S = "network/suarez2021a"
GROUPS[_S] = ["Geometry", "Boundary conditions", "Blood"]
DOCS[_S] = {
    "d_feeding_um": P("Feeding arteriole diameter", "Diameter of the two 2nd-order (feeding) arterioles.", "µm",
                      "Geometry", "advanced", SUAREZ_2021),
    "l_feeding_um": P("Feeding arteriole length", "Length of the two feeding arterioles.", "µm", "Geometry",
                      "advanced", SUAREZ_2021),
    "d_daughter_um": P("Daughter arteriole diameter", "Diameter of the four 3rd-order (daughter) arterioles.", "µm",
                       "Geometry", "advanced", SUAREZ_2021),
    "l_daughter_um": P("Daughter arteriole length", "Length of the four daughter arterioles.", "µm", "Geometry",
                       "advanced", SUAREZ_2021),
    "p_in_mmhg": P("Inlet pressure", "Blood pressure at the network inlet (1st-order arteriole).", "mmHg",
                   "Boundary conditions", "basic", SUAREZ_2021),
    "p_out_mmhg": P("Outlet pressure", "Blood pressure at the network outlet (1st-order venule).", "mmHg",
                    "Boundary conditions", "basic", SUAREZ_2021),
    "hematocrit": P("Hematocrit", "Discharge hematocrit of the blood entering the network.", "", "Blood", "basic",
                    SUAREZ_2021),
}

# -- network/graph_files ------------------------------------------------------------------------
_S = "network/graph_files"
_FILES, _GEOM, _LAB = "Files", "Crop and orientation", "Labels and boundary conditions"
GROUPS[_S] = [_FILES, _GEOM, _LAB]
DOCS[_S] = {
    "nodes_file": P("Nodes file", "CSV file of node positions in the data directory (NeuroVascularSim or "
                    "VesselGraph/Voreen format).", "", _FILES, "basic", PAETZOLD_2021),
    "edges_file": P("Edges file", "CSV file of vessel segments (end nodes, radius or diameter, length) in the data "
                    "directory.", "", _FILES, "basic", PAETZOLD_2021),
    "voxel_size_um": P("Voxel size", "Size of one voxel of the reconstruction; positions, radii and lengths given "
                       "in voxels are multiplied by it. Use 1 for files already in micrometres.", "µm", _FILES,
                       "basic", ""),
    "crop_lo_um": P("Crop box (low corner)", "Lower corner [x, y, z] of a box to keep; empty keeps the whole graph. "
                    "Only the largest connected piece inside the box is kept.", "µm", _GEOM, "advanced", ""),
    "crop_hi_um": P("Crop box (high corner)", "Upper corner [x, y, z] of the crop box.", "µm", _GEOM, "advanced",
                    ""),
    "depth_axis": P("Depth axis", "Coordinate axis (0 = x, 1 = y, 2 = z) that points into the cortex.", "", _GEOM,
                    "advanced", ""),
    "surface": P("Pial surface side", "Whether the pial surface is at the minimum or maximum coordinate of the "
                 "depth axis.", "", _GEOM, "advanced", ""),
    "labels": P("Arterial/venous labels", "'types' uses vessel types in the file; 'diameter' calls the widest "
                "penetrating trees arterial (penetrating arterioles are wider and about 3 times fewer; a weak "
                "heuristic); 'auto' uses types when present, otherwise the heuristic.", "", _LAB, "advanced",
                BLINDER_2013 + " (basis of the diameter heuristic)"),
    "p_arterial_mmhg": P("Arterial pressure", "Pressure held at the surface ends of the arterial trees.", "mmHg",
                         _LAB, "basic", BLINDER_2013 + " (50 mmHg arteriole-to-venule drop)"),
    "p_venous_mmhg": P("Venous pressure", "Pressure held at the surface ends of the venous trees.", "mmHg", _LAB,
                       "basic", SCHMID_2017),
    "prepare": P("Prepare for flow", "Find penetrating trees, label them and set boundary conditions. Off loads the "
                 "graph as read, for viewing only (flow cannot be solved).", "", _LAB, "advanced", ""),
}

# -- perturbations ------------------------------------------------------------------------------
_S = "perturbation/scale_diameter"
GROUPS[_S] = ["Change", "Selection"]
DOCS[_S] = {
    "factor": P("Diameter factor", "Multiplies the diameter of the selected vessels: above 1 dilates, below 1 "
                "constricts. Resistance scales roughly with diameter to the power -4.", "", "Change", "basic",
                MODEL),
    "edges": P("Vessel indices", "Explicit vessel (edge) indices, or names of network metadata entries such as "
               "'active_edge'.", "", "Selection", "advanced", ""),
    "vessel_types": P("Vessel types", "Vessel types to change (e.g. PENETRATING_ARTERIOLE, CAPILLARY).", "",
                      "Selection", "basic", ""),
    "depth_range_um": P("Depth range", "Only vessels whose midpoint lies in [low, high] depth below the pia; empty "
                        "means any depth.", "µm", "Selection", "basic", ""),
    "layers": P("Cortical layers", "Only vessels in these layers (1 = L1, 2 = L2/3, 3 = L4, 4 = L5, 5 = L6).", "",
                "Selection", "basic", HOOKS_2011 + " (layer boundaries)"),
}

_S = "perturbation/scale_cmro2"
GROUPS[_S] = ["Change", "Selection"]
DOCS[_S] = {
    "factor": P("CMRO2 factor", "Multiplies tissue oxygen consumption, e.g. above 1 for neuronal activation. Used "
                "by the oxygen model.", "", "Change", "basic", MODEL),
    "depth_range_um": P("Depth range", "Only tissue in [low, high] depth below the pia; empty means everywhere.",
                        "µm", "Selection", "basic", ""),
    "layers": P("Cortical layers", "Only tissue in these layers (1 = L1, 2 = L2/3, 3 = L4, 4 = L5, 5 = L6).", "",
                "Selection", "basic", HOOKS_2011 + " (layer boundaries)"),
}

# -- viscosity/constant -------------------------------------------------------------------------
_S = "viscosity/constant"
GROUPS[_S] = ["Viscosity"]
DOCS[_S] = {
    "value": P("Relative viscosity", "Blood viscosity relative to plasma, the same in every vessel (Newtonian "
               "blood, no Fåhræus-Lindqvist effect); for tests and baselines.", "", "Viscosity", "basic", MODEL),
}

# -- model/oxygen -------------------------------------------------------------------------------
_S = "model/oxygen"
_BOX, _TIS, _NUM = "Blood oxygen", "Tissue", "Numerics"
GROUPS[_S] = [_BOX, _TIS, _NUM]
DOCS[_S] = {
    "inlet_po2_mmhg": P("Arterial PO2", "Oxygen partial pressure of blood entering the pial arterioles.", "mmHg",
                        _BOX, "basic", SAKADZIC_2014),
    "p50_mmhg": P("P50", "PO2 at which hemoglobin is half saturated (C57BL/6 mice). Higher P50 releases oxygen "
                  "more easily.", "mmHg", _BOX, "advanced", SAKADZIC_2014),
    "hill_n": P("Hill coefficient", "Steepness of the hemoglobin dissociation curve (C57BL/6 mice).", "", _BOX,
                "advanced", SAKADZIC_2014),
    "hb_capacity_mM": P("Heme density of red cells", "Concentration of oxygen-binding sites in red cells; with "
                        "hematocrit it sets how much oxygen blood carries.", "mM", _BOX, "advanced", LUCKER_2018),
    "nusselt": P("Nusselt number", "Sets the intravascular resistance to oxygen transfer through the vessel wall. "
                 "Higher values let oxygen leave the blood more easily.", "", _BOX, "advanced", ASSUMPTION),
    "cmro2_umol_per_g_min": P("CMRO2", "Maximal tissue oxygen consumption rate. Higher consumption lowers tissue "
                              "and venous PO2.", "µmol/g/min", _TIS, "basic",
                              "measured with 17O-MRS in mouse cortex: Zhu XH et al. 2013, NeuroImage 64:437, "
                              "doi:10.1016/j.neuroimage.2012.09.028"),
    "km_mmhg": P("Michaelis-Menten Km", "Tissue PO2 at which consumption is half maximal; below it consumption "
                 "falls. Measured values in muscle are higher (5-10 mmHg; Golub & Pittman 2012).", "mmHg", _TIS,
                 "advanced", f"{GAGNON_2016}; {GOLUB_2012}"),
    "tissue_density_g_per_ml": P("Tissue density", "Converts CMRO2 from per gram to per volume of tissue.", "g/mL",
                                 _TIS, "advanced", ASSUMPTION),
    "alpha_uM_per_mmhg": P("O2 solubility", "Dissolved oxygen per mmHg of PO2, one value for plasma and tissue.",
                           "µM/mmHg", _TIS, "advanced", FANG_2008),
    "diffusivity_m2_per_s": P("O2 diffusivity", "Diffusion coefficient of oxygen in tissue; higher values spread "
                              "oxygen farther from vessels.", "m²/s", _TIS, "advanced", FANG_2008),
    "voxel_um": P("Tissue voxel size", "Grid spacing of the tissue oxygen field. Smaller voxels are more accurate "
                  "and slower.", "µm", _NUM, "advanced", MODEL),
    "sample_um": P("Vessel step length", "Length of the steps along each vessel for the blood oxygen march.", "µm",
                   _NUM, "advanced", MODEL),
    "tol_mmhg": P("Tolerance", "Iteration stops when tissue PO2 changes less than this.", "mmHg", _NUM, "advanced",
                  MODEL),
    "max_iter": P("Maximum iterations", "Upper limit on blood-tissue iterations.", "", _NUM, "advanced", MODEL),
    "relaxation": P("Relaxation", "Mixing factor of the (Anderson-accelerated) tissue iteration; lower values are "
                    "slower but more stable.", "", _NUM, "advanced", MODEL),
}

# -- model/bold ---------------------------------------------------------------------------------
_S = "model/bold"
_FS, _VS = "Field and sequence", "Vessel signal"
GROUPS[_S] = [_FS, _VS, _NUM]
DOCS[_S] = {
    "field_t": P("Field strength", "Magnetic field of the scanner. The extravascular frequency offset scales with "
                 "it; r0 and epsilon are not scaled and must be set for other fields.", "T", _FS, "basic",
                 f"{OBATA_2004}; {STEPHAN_2007}"),
    "te_ms": P("Echo time (TE)", "Gradient-echo echo time at which the signal is read; longer TE gives more "
               "sensitivity to deoxygenated blood.", "ms", _FS, "basic", f"{OBATA_2004}; {STEPHAN_2007}"),
    "theta0_per_s_at_1p5t": P("Frequency offset at 1.5 T", "Frequency offset at the surface of a vessel of fully "
                              "deoxygenated blood at 1.5 T (scaled with field strength).", "1/s", _VS, "advanced",
                              f"{OBATA_2004} (via {STEPHAN_2007})"),
    "r0_per_s": P("Intravascular r0", "Slope of intravascular R2* against (1 - saturation), at 1.5 T; set it for "
                  "other fields.", "1/s", _VS, "advanced", OBATA_2004),
    "epsilon": P("Intra/extravascular signal ratio", "Ratio of intravascular to extravascular signal at rest; "
                 "poorly known and best treated as free.", "", _VS, "advanced",
                 STEPHAN_2007 + " (prior mean)"),
    "extravascular_factor": P("Static dephasing factor", "Scales the extravascular R2* change from deoxygenated "
                              "blood (static dephasing regime), applied to every vessel class.", "", _VS,
                              "advanced", OBATA_2004),
    "slab_um": P("Depth slab thickness", "Thickness of the depth slabs of the laminar BOLD profile.", "µm", _NUM,
                 "advanced", MODEL),
}

# -- model/solver -------------------------------------------------------------------------------
_S = "model/solver"
GROUPS[_S] = ["Rheology", "Numerics"]
DOCS[_S] = {
    "viscosity": P("Viscosity law", "How blood viscosity depends on vessel diameter and hematocrit: "
                   "'pries_invitro' (glass tubes; the default for cortical networks, owner's decision), "
                   "'pries_invivo' (higher in small vessels) or 'constant'.", "", "Rheology", "basic",
                   f"{PRIES_1992}; {PRIES_1994}"),
    "phase_separation": P("Phase separation", "How red cells split at bifurcations: 'pries' (empirical law; the "
                          "faster branch gets more red cells) or 'none' (red cells split with the flow).", "",
                          "Rheology", "advanced", PRIES_2005),
    "tol": P("Tolerance", "Iteration stops when the largest relative change in flow falls below this.", "",
             "Numerics", "advanced", MODEL),
    "max_iter": P("Maximum iterations", "Upper limit on flow-hematocrit iterations.", "", "Numerics", "advanced",
                  MODEL),
    "relaxation": P("Relaxation", "Initial under-relaxation factor for hematocrit (0-1]; it is reduced "
                    "automatically when the iteration oscillates.", "", "Numerics", "advanced", MODEL),
}
