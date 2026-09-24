# Background: physiological framework, models and open questions

**Status: first draft for the owner to correct.** Written from the four papers
listed in [VISION.md](VISION.md), as retrieved from PubMed Central (via the
PubMed full-text service). Sources:
[Suarez et al. 2021a, J Theor Biol](https://doi.org/10.1016/j.jtbi.2021.110856),
[Suarez et al. 2021b, Front Neurol](https://doi.org/10.3389/fneur.2021.659081),
[Suarez et al. 2025, JCBFM](https://doi.org/10.1177/0271678X241311010),
[Balachandar et al. 2025, eNeuro](https://doi.org/10.1523/ENEURO.0220-25.2025).

## How reliable each part is

The retrieved full texts had **all equations, tables and inline symbols
stripped**, and the JCBFM paper (2025) came back as **abstract only**. The
publisher and PMC websites are blocked from this environment. So each
equation below carries one of these marks:

| Mark | Meaning |
|---|---|
| **[P]** | Stated in the paper text as retrieved. |
| **[R]** | Reconstructed from the paper's prose description; the form is plausible but the exact equation must be checked against the paper or the code. |
| **[S]** | Standard form from the literature the paper cites; the paper's actual choice (variant, coefficients) is not visible to me. |

Everything marked [R] or [S] is a question for the owner (collected in the
last section). The legacy code, once uploaded, is the tie-breaker.

## The chain, and where each paper sits

```
 stimulus / IED / light
        │
 1. NEURAL        excitatory–inhibitory populations (extended P-DCM)      ── 2021b
        │         astrocytic Ca²⁺ driven by ChR2(C128S)                   ── 2025 eNeuro, 2025 JCBFM
 2. BIOCHEMICAL   neurovascular coupling signal (vasoactive signal s)     ── 2021b
        │         astrocyte → perivascular → smooth muscle pathways       ── 2025 JCBFM
        │         neurometabolic coupling (O₂ consumption, OTT)           ── 2021b
 3. VASCULAR      detailed network: Hagen–Poiseuille + RBC rheology       ── 2021a
        │         parsimonious: coupled windkessels + inductor (ABS)      ── 2021a, 2021b
 4. ACQUISITION   BOLD (1.5 T, TE 45 ms), rCBF, rCBV                     ── 2021b
                  LDF (relative perfusion, 10 Hz)                         ── 2025 eNeuro, 2025 JCBFM
                  Ca²⁺ imaging (ΔF/F)                                      ── 2025 eNeuro
 ANALYSIS         GLM, NN-ARx HRF estimation, PCA + SVM classification,   ── 2021b
                  parameter estimation, global sensitivity (LHS + PRCC)   ── 2021a, 2025 JCBFM
```

The common thread: **negative and atypical hemodynamic responses have several
physiological causes that produce different waveforms**, and a model with
explicit physiology at each stage can tell them apart where a canonical HRF
cannot.

---

## 1. Neural stage

### 1.1 Excitatory–inhibitory populations (2021b)

A two-state **P-DCM** (Havlicek et al.) per region, with excitatory state
$x_E$ and inhibitory state $x_I$, **extended** in two ways [P]:

- an external (long-range, thalamocortical/corticocortical) input also targets
  the **inhibitory** population;
- IED-evoked synaptic modulation of resting-state networks (RSNs).

Standard P-DCM form [S], shown here with time constants because the paper
reasons with $\tau_E$, $\tau_I$:

$$
\dot x_E = -\frac{x_E}{\tau_E} - \mu_{EI}\,x_I + c_E\,u(t), \qquad
\dot x_I = \frac{x_E - x_I}{\tau_I} + c_I\,u(t)
$$

Two NBR mechanisms live here [P]:

| Mechanism | Physiology | Model knob |
|---|---|---|
| **ECI** (enhanced cortical inhibition) | Inhibition after the spike (the slow wave of spike–wave) exceeds excitation, e.g. layer III/V pyramidal hyperpolarisation | Large inhibitory response time $\tau_I$ |
| **NDA** (network deactivation, e.g. DMN) | An IED switches off an RSN node, which recovers slowly | Reduced intralaminar excitatory connectivity (0.01) and a large excitatory time constant $\tau_E$ (fitted value 3 in patient 3; units not visible) |

### 1.2 Input

IEDs (70–200 ms) are modelled as trains of short pulses [P]. Pulse times are
shifted by the slice-acquisition time [R]: $t \to t + (k/N_s)\,TR$, with $k$
the slice's position in the acquisition order and $N_s$ the number of slices.
For the two patient fits the pulse amplitude was scaled by the normalised EEG
power at the detecting electrode [P]. Simulations used Poisson trains,
2.6 events/min [P].

### 1.3 Astrocytic Ca²⁺ driven by optogenetics (2025 eNeuro; in silico predecessor)

- **Construct:** Mlc1-tTA::tetO-ChR2(C128S)-EYFP mice, a **bistable** opsin
  expressed only in astrocytes [P]. Blue light (470 nm) opens it and amber
  (595 nm) closes it.
- **Photocycle** [P]: dark-adapted D470 → conducting P520, which is in
  equilibrium with P390 → non-conducting P480/P500. P480 → D470 takes ≈46 s,
  so the channel needs a dark phase to reset.
- **Intracellular dynamics** (qualitative, [P]): ChR2 Ca²⁺ influx triggers
  Ca²⁺ release from the ER through the IP₃R, whose Ca²⁺ dependence is
  bell-shaped (high cytosolic Ca²⁺ inhibits it). Clearance is by buffers,
  SERCA, PMCA and the mitochondrial uniporter (MCU).
- **The earlier in silico study** (cited by the eNeuro paper) predicted a
  non-monotonic Ca²⁺ response to light dose: more stimulation increases
  spiking up to a threshold, then spiking drops (ER depletion, pumps) while
  baseline Ca²⁺ keeps rising. *I believe this is Moshkforoush et al. 2021
  (PLoS Comput Biol) on stochastic ChR2-driven astrocytic Ca²⁺, but the
  reference was stripped; the owner should confirm it and whether it belongs in
  the paper list.*
- **Paradigm** [P]: period $T = 100$ s. Blue for $\delta = 20/40/60/80/95\%$
  of $T$, then 5 s amber ($\Delta = 5\%$), then dark. Five periods per
  recording.
- **Findings** [P]: 20, 40 and 60% give a robust response on every period.
  80% declines over periods. 95% responds only to the first period. 20% gives
  the highest peak ΔF/F and the narrowest first-period FWHM. At 7 µW/mm²
  (slices), no response below 20%.

This is the natural first piece of a **stimulus → astrocyte Ca²⁺** model: a
light-driven Markov photocycle → Ca²⁺ influx → an ER/IP₃R/pump model.

---

## 2. Biochemical stage

### 2.1 Neurovascular coupling signal (2021b)

The regions **not** sharing an artery use the Friston et al. (2000)
simplified model ("Option 2") [P]. Its standard form [S]:

$$
\dot s = \varepsilon\,x_E(t) - \frac{s}{\tau_s} - \frac{f-1}{\tau_f}, \qquad \dot f = s
$$

with $\varepsilon$ the **neurovascular coupling gain** (named in the paper
[P]), $s$ the vasoactive signal and $f$ the normalised inflow. The input
is written here as $x_E$; whether the drive is $x_E$ alone or a combination
of $x_E$ and $x_I$ is to be confirmed.

### 2.2 Astrocyte-mediated vasoactive pathways (2025 JCBFM, abstract only)

What the abstract states [P]:

- A **comprehensive biophysical model of vasoactive signalling from
  astrocytes** is combined with optogenetic stimulation of a large astrocyte
  population. Pathways are "highly nonlinear and non-additive".
- Sensitivity analysis plus optimisation to estimate key parameters.
- Optogenetic astrocytic Ca²⁺ produces a CBF response with **two
  components**. Component 1 is rapid and smaller (ΔCBF ≈ 13%, 18 s).
  Component 2 is slower and larger (ΔCBF ≈ 18%, 45 s).
- The model reproduces **component 2**, validated with a pharmacological
  manipulation. Component 1 is **not** in the model; candidate scenarios are
  discussed.

What I **cannot** see and must not guess: the compartments, pathways,
equations, parameters and the drug used. The eNeuro paper mentions K⁺
release into the perivascular space as a slow, sustained vasoactive route
[P]. The usual pathway set in this model family is endfoot BK → perivascular
K⁺ → smooth-muscle Kir → hyperpolarisation → VOCC → SMC Ca²⁺ → dilation,
often plus EETs, 20-HETE and PGE₂. **This is a guess about the model family
that needs the owner or the code to confirm.**

### 2.3 Neurometabolic coupling (2021b)

An **oxygen-to-tissue transport (OTT)** component models the oxygen
extraction fraction and O₂ concentration in blood and tissue [P]. The
**neurometabolic coupling gain $\kappa$** sets how strongly neural activity
raises O₂ consumption [P].

- **ANC** (abnormal neurovascular/metabolic coupling): with $\varepsilon$
  fixed, a disproportionately large $\kappa$ gives an NBR, "an exaggerated
  initial dip" [P].
- Fitted value for patient 4: $\kappa = 0.51$, giving a coupling ratio
  **14× smaller than normal** [P]. The ratio's symbol and normal value were
  stripped; this is most likely the CBF/CMRO₂ coupling ratio $n$.
- The OTT equations are not visible (the reference is probably Zheng et al.
  2002 or a Riera-lab variant) [S?].

---

## 3. Vascular stage

### 3.1 Detailed steady-flow network model (2021a)

**Network** [P]: an idealised symmetric microvascular network of **22
segments**. It runs from a pial artery (inlet) through bifurcating arterioles
and capillaries to converging venules and a pial vein (outlet). Diameters are
8–33 µm, consistent with rodent and cat data. Inlet and outlet pressures are
fixed.

**Per-segment state** [P]: flow $Q$, pressure drop $\Delta P$, discharge
hematocrit $H_D$, resistance $R$ and apparent viscosity $\mu$ (five
variables). Solving means a **linear system of 36 algebraic equations** for
$Q$ and $\Delta P$, then $22 \times 3$ equations for $H$, $R$ and $\mu$
[P]. I read this as iterated to self-consistency, since $R$ depends on
$H_D$ [R].

**Equations**:

- Hagen–Poiseuille [P, named]: $R = \dfrac{128\,\mu_{app}\,L}{\pi D^4}$, $\ \Delta P = Q R$.
- Mass conservation of blood and RBCs at every node [R].
- **Fåhraeus effect** (tube vs discharge hematocrit), **Fåhraeus–Lindqvist
  effect** (apparent viscosity vs diameter and hematocrit) and **phase
  separation at bifurcations** [P, named]. The paper says its viscosity laws
  were **derived from cat data** [P]. Standard phase-separation form (Pries
  et al.) [S]:

$$
FQ_E = \frac{1}{1 + \exp\!\left[-\left(A + B\,\operatorname{logit}\frac{FQ_B - X_0}{1 - 2X_0}\right)\right]}
$$

with $FQ_B$ the fraction of blood flow and $FQ_E$ the fraction of RBC flow
into a daughter branch; $A$, $B$ and $X_0$ depend on diameters and $H_D$.

**Stimulus** [P]: the active arteriole (segment 4) dilates by ≈30%, driven
by a relative neural activity trace.

**Stealing ratio** [P]: $\ \text{SR} = \dfrac{\max|\Delta \text{CBF}_{passive}|}{\max \Delta \text{CBF}_{active}}$.

**Results** [P]:

- ≈30% dilation of the active arteriole gives only ≈**10% CBF increase**
  there, lower than VAN-model and two-photon reports. The paper discusses this
  CBF–diameter mismatch.
- The passive sibling arteriole (segment 5) loses flow: **arterial blood
  stealing (ABS)**.
- With hematocrit held constant, ABS **almost disappears**. The cause is
  phase separation: plasma skimming refills the dilated branch, which raises
  $H_D$ and viscosity in the passive branch.
- SR ≈ 27.4% (Hct 0.32) to 23.3% (Hct 0.50). The inlet pressure has **no
  effect**.
- PRCC (LHS, 1000 sets): SR **rises** with feeding-arteriole length and
  daughter diameter, and **falls** with Hct, daughter length and feeding
  diameter. In 100 random networks SR ranged from 16.4% to 40.5%.
- Arterioles **not** sharing the feeding vessel (segments 6 and 7) gain a
  little flow, because RBCs are drawn toward the higher-flow branch, so
  viscosity and resistance fall there.

**Assumptions** [P]: quasi-steady flow (refilling a 30% dilation takes
≈0.5 s, fast next to a 2–3 s HRF rise). No autoregulation or myogenic tone.
Symmetric network.

### 3.2 Parsimonious windkessel model (2021a, reused in 2021b)

**Structure** [P]: two windkessel regions (active and passive) sharing one
feeding artery and one draining vein. Each region has three ODEs: relative
CBF $f$, a **delayed (viscoelastic) compliance** state and relative CBV $v$.
A **solenoid (inductor)** on the shared artery represents fluid inertia. In
2021b this is "Option 1", with a non-linear delayed compliance [P].

**Circuit** [R], my reading of "two windkessels on one feeding artery with an
inductor":

$$
P_a - P_n = R_A F_A + L_A \dot F_A, \qquad F_A = F_1 + F_2, \qquad
F_i = \frac{P_n - P_{c,i}}{R_i(t)}
$$

where $P_n$ is the node pressure after the shared artery and $R_i(t)$ the
region's arteriolar resistance. Dilation lowers $R_1$, which raises $F_A$,
lowers $P_n$ and so lowers $F_2$: stealing. Inertia ($L_A/R_A$) delays the
passive response.

Each region's volume [S] (Buxton/Mandeville balloon with delayed compliance):

$$
\tau_0 \dot v_i = f_{in,i} - f_{out,i}, \qquad
f_{out,i} = v_i^{1/\alpha} + \tau_{v}\,\dot v_i
$$

The paper's delayed-compliance state is probably a third variable rather than
the $\tau_v \dot v$ shortcut [R].

**Fitting to the detailed model** [P]: noisy (σ = 0.003) CBF traces from
segments 4 and 5 are fitted by least squares with a global optimiser in
MATLAB (the function name was stripped). **Two parameters suffice**: the
feeding second-order arteriole resistance and the baseline resistance of the
daughter arterioles. The first falls and the second rises **parabolically
with Hct** [P].

**Key parameter** (2021b) [P]: NBR amplitude grows with the shared **artery
resistance relative to the total downstream resistance** (arterioles,
capillaries, venules). Fitted $R_A = 0.17$ for patient 1. The quantity is
presumably normalised; to confirm.

**Inertial time constants** [P]: mouse ≈1.4 ms, human ≈0.3 s. The observed
1–5 s delays between positive and negative peaks are **not** explained by a
single bifurcation. Candidates are autoregulation, averaging over many
bifurcations, and departure from steady state. The inductor can absorb all of
these with different time constants.

---

## 4. Acquisition stage

### 4.1 BOLD

A standard BOLD observation equation (Buxton/Obata family) [S]:

$$
\frac{\Delta S}{S_0} = V_0\left[k_1(1-q) + k_2\left(1-\frac{q}{v}\right) + k_3(1-v)\right]
$$

with $q$ normalised deoxyhemoglobin and $v$ normalised CBV. The $k_i$
depend on field strength and TE. The 2021b patient data are **1.5 T, GE-EPI,
TR 2 s, TE 45 ms** [P]. Which variant and coefficients the owner used is to
be confirmed. Paper 2021b also reports **rCBF** and **rCBV** as observables
[P].

The 2021a discussion flags that **hematocrit changes affect blood O₂ content
and hence BOLD**, and that this is "largely sidelined" [P]. This is a direct
research opportunity for this suite.

### 4.2 Laser Doppler flowmetry (2025 eNeuro, 2025 JCBFM)

Protocol and processing [P]:

- PeriFlux 4001 with needle probe 411, placed at the dura and retracted
  20–50 µm, away from large vessels.
- Recorded with PowerLab alongside the LED triggers. Downsampled to 10 Hz,
  then a 5th-order Butterworth low-pass at 0.1 Hz.
- Normalised to the mean of a 117 s pre-stimulus baseline, then averaged
  across mice (n = 4).
- In vivo light: blue 0.15 mW/mm² (≈3 mW over ≈5 mm diameter), amber
  0.01 mW/mm², 20% paradigm.
- Observations: the first period's CBF does not return to baseline, so the
  baseline drifts up. Later peaks are smaller and saturate after the third
  period. Presumably the vessels have not recovered within the 75 s dark
  phase.

LDF (up to 64 Hz) is fast enough to see inertia-induced shifts at a single
bifurcation; fMRI (~1 s sampling) is not [P, 2021a].

### 4.3 Ca²⁺ imaging (2025 eNeuro)

- Rhod-2 AM with confocal imaging (Olympus FV1200, 10×), whole-field LED,
  7 µW/mm².
- Processing: NoRMCorre motion correction, then FIJI ROIs (EYFP ∩ Rhod-2),
  then MATLAB detrending and smoothing to ΔF/F (F₀ = pre-stimulus median).
- Features: peak ΔF/F, FWHM, rise latency and fall latency [P].

### 4.4 EEG (real-data side, 2021b)

Preprocessing pipeline [P]:

1. BrainAmp MR, 32 ch, 5 kHz, synchronised to the MR clock.
2. Upsampled to 50 kHz to correct marker jitter.
3. Template-based gradient artefact removal.
4. Band-pass 0.5–125 Hz.
5. R-wave marking, then ballistocardiogram removal.
6. Infomax ICA.
7. Visual IED marking by two experts.

---

## 5. Analysis methods in the papers

| Method | Paper | Role |
|---|---|---|
| GLM with canonical HRF + temporal and dispersion derivatives, AR(1) prewhitening, F-contrast $I_3$, FWE p < 0.05 (SPM) | 2021b | Detect significant PBR and NBR voxels |
| **NN-ARx** (Riera et al.): AR with exogenous input (IEDs), polynomial drift, AIC-selected orders and onset delay | 2021b | Estimate free-form HRFs |
| Permutation test (5000 shuffles of IED order), 5th–95th percentile band | 2021b | HRF confidence intervals |
| PCA (3 components) + SVM ensemble, 5-fold cross-validation; coarse Gaussian kernel best (89–93.7%) | 2021b | Classify PBR / ECI / NDA / ANC / ABS; the only confusion is ECI↔ABS (~6.3%) |
| Synthetic fMRI: simulated BOLD added to a real EPI series, Gaussian spatial kernel FWHM 2.5 mm, $1/f^\beta$ noise, 8 mm smoothing | 2021b | Ground-truth validation of detection |
| LHS (1000 sets) + PRCC, 95% CI | 2021a | Global sensitivity |
| Least-squares fit with a global optimiser | 2021a, 2025 JCBFM | Parameter estimation |

Note: 2021b says the **model code was released publicly** with PDF
documentation [P]. The link was stripped; it is worth locating, as it may be
the cleanest version of the windkessel and NBR code.

## 6. The four NBR mechanisms at a glance (2021b)

| Class | Origin | Clinically an irritative zone? | Signature | Fitted value |
|---|---|---|---|---|
| ECI | Neural: enhanced inhibition | **Yes** (candidate SOZ) | Close to ABS; smaller with longer inhibitory recovery | $\tau_I$ |
| NDA | Neural: RSN shutdown | No | Prolonged, slow recovery | $\tau_E$ = 3 |
| ANC | Metabolic: O₂ use outruns flow | **Yes** | Fast, bipolar; an exaggerated initial dip; may overshoot positively | $\kappa$ = 0.51 |
| ABS | Vascular: shared-artery stealing | No | Smallest amplitude; no post-stimulus overshoot in pure-vascular simulations | $R_A$ = 0.17 |

The paper's proposed tiebreak for ECI vs ABS is **ASL/CBF**: CBF falls in ABS
but not in ECI.

---

## 7. Open questions

### Stated in the papers

1. **What is CBF component 1** in astrocyte-driven NVC (fast, ~13%, 18 s)?
   The model reproduces only component 2 (2025 JCBFM).
2. **Delays of 1–5 s between positive and negative responses**: are they
   autoregulation, averaging over bifurcations, or transient
   (non-steady-state) flow (2021a)?
3. **CBF–diameter mismatch**: 30% dilation gives 10% CBF here, against much
   larger gains in VAN models and two-photon data. Is this down to network
   size, symmetry, the fixed pressure boundary, or the number of dilated
   vessels (2021a)?
4. **Hematocrit and BOLD**: RBC redistribution changes O₂ content; this is
   unmodelled in standard BOLD models (2021a).
5. **Species scaling**: viscosity laws from cat data; the endothelial surface
   layer differs across species; hematocrit ranges differ (human 0.32–0.50,
   mouse 0.15–0.55, cat 0.20–0.45) (2021a).
6. **Mixed mechanisms**: more than one NBR mechanism in the same voxel, and
   the ECI/ABS ambiguity from BOLD alone (2021b).
7. **Venous back-pressure and delayed compliance** as further NBR and
   undershoot mechanisms, not studied (2021b).
8. **Layer-resolved BOLD** and baseline-CBV bias across cortical layers
   (2021b).
9. **ChR2(C128S) inactivation** at high duty cycles, rest periods, and
   higher-power, lower-duty paradigms. The 95% case shows "stealth
   inactivation" with no known mechanism (2025 eNeuro).
10. **Saturation of CBF** after about three light periods: is it maximal
    dilation? Simultaneous Ca²⁺ and vessel imaging is needed (2025 eNeuro).

### For the suite (my reading)

11. **Bridging the scales**: the astrocyte model outputs vessel tone or
    diameter, and the windkessel uses resistances. $R \propto \mu_{app}(D,
    H)\,L/D^4$ is the natural link. Should the detailed rheology feed the
    windkessel's resistances directly, or only through fitted equivalent
    parameters, as in 2021a?
12. **Neural → astrocyte link**: 2021b drives flow from $x_E$ via
    $\varepsilon$, and 2025 drives it from astrocytic Ca²⁺ (optogenetic).
    Neuronal activity → astrocytic Ca²⁺ (glutamate/mGluR, K⁺) is the missing
    link needed to join them in one chain.
13. **One vertical slice**: the most complete chain already in the papers is
    the 2021b chain (P-DCM → ε-coupling → windkessel/ABS → OTT → BOLD). It is
    a candidate for the first slice, with the astrocyte pathway as the first
    widening.

## 8. Questions for the owner

1. Please confirm or correct every **[R]** and **[S]** equation above.
   Especially: the P-DCM extension, the exact windkessel + inductor circuit
   and its three states per region, the OTT model, and the BOLD equation and
   coefficients.
2. The **JCBFM 2025 model**: which compartments and pathways (K⁺/BK/Kir,
   EETs, 20-HETE, PGE₂, NO?), which drug validated component 2, and which
   earlier NVU model it builds on.
3. Which **in silico ChR2/astrocyte Ca²⁺ paper** the eNeuro study cites, and
   should it join the paper list?
4. Where is the **public code release** from 2021b?
5. Which **phase-separation and viscosity laws** (Pries 1990 in vitro, 1994
   in vivo, 2005 with ESL?) and the 22-segment geometry used in 2021a.
6. What units and normalisation do the fitted $\tau_E = 3$, $\kappa = 0.51$
   and $R_A = 0.17$ use?

## References

- Suarez A, Valdes-Hernandez PA, Moshkforoush A, Tsoukias N, Riera JJ. *J
  Theor Biol* 2021. [doi:10.1016/j.jtbi.2021.110856](https://doi.org/10.1016/j.jtbi.2021.110856) (PMC8507599)
- Suarez A, Valdés-Hernández PA, Bernal B, Dunoyer C, Khoo HM, Bosch-Bayard
  J, Riera JJ. *Front Neurol* 2021. [doi:10.3389/fneur.2021.659081](https://doi.org/10.3389/fneur.2021.659081) (PMC8531269)
- Suarez A, Fernandez F, Riera JJ. *J Cereb Blood Flow Metab* 2025.
  [doi:10.1177/0271678X241311010](https://doi.org/10.1177/0271678X241311010) (PMC11719438)
- Balachandar L, Moncion C, Suarez A, Diaz J. *eNeuro* 2025.
  [doi:10.1523/ENEURO.0220-25.2025](https://doi.org/10.1523/ENEURO.0220-25.2025) (PMC12440239)
- Frameworks cited by these papers and used in [S] forms above: Havlicek et
  al. (P-DCM); Friston et al. 2000 (balloon/NVC); Buxton et al. and Mandeville
  et al. (balloon/windkessel, delayed compliance); Pries et al. (blood
  rheology, phase separation); Riera et al. (NN-ARx). Full references to be
  added once checked against the papers.
