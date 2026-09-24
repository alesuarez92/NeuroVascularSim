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
stripped**. The owner has since supplied PDFs of the JCBFM 2025 paper and the
2021a accepted manuscript, so sections 2.2 and 3 are from the full texts. The
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
| **ECI** (enhanced cortical inhibition) | Inhibition after the spike (the slow wave of spike–wave) exceeds excitation, e.g. layer III/V pyramidal hyperpolarisation | Large inhibitory response time $\tau_{i1}$ [P] |
| **NDA** (network deactivation, e.g. DMN) | An IED switches off an RSN node, which recovers slowly | Reduced intralaminar excitatory connectivity $c_{e2} = 0.01$ and a large excitatory response time $\tau_{e2}$ (fitted **3 s** in patient 3) [P] |

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
  baseline Ca²⁺ keeps rising. This is Moshkforoush A, Balachandar L, Moncion
  C, et al. 2021, "Unraveling ChR2-driven stochastic Ca²⁺ dynamics in
  astrocytes: a call for new interventional paradigms", *PLoS Comput Biol*
  17:e1008648 (confirmed by the JCBFM reference list). The JCBFM model uses its
  10 × 10 astrocyte network as input.
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

### 2.2 Astrocyte-mediated vasoactive pathways (2025 JCBFM, full text read)

Source: the published PDF supplied by the owner (not committed). The
equation table is in the paper's Supplementary Material 2, which I have not
seen; everything below is from the main text [P] unless marked.

**Input.** A global astrocytic Ca²⁺ signal $\mathrm{Ca^{2+}_{ast}}$: the
mean of a *simulated* 10 × 10 network of gap-coupled astrocytes under the
same light protocol (Moshkforoush et al. 2021, PLoS Comput Biol; 40
simulated trials). In-vivo Ca²⁺ was not recorded.

**Five compartments and their pathways:**

| Compartment | Pathways and states |
|---|---|
| Astrocyte | Ca²⁺ → cPLA₂ → arachidonic acid $AA_{ast}$. AA → **EET** (CYP2C epoxygenase) and **PGE₂** (COX-1). Ca²⁺ and EET gate astrocytic **BK** ($n_{ast}$), which releases K⁺. PGE₂ efflux by facilitated diffusion (pH- and voltage-driven). |
| Perivascular space | **sPLA₂** (Ca²⁺-sensitive, coupled to cPLA₂) → $AA_p$, which enters the SMC and **constricts**. This is new in this paper. $K^+_p$ is set by BK_ast, BK_smc and Kir_smc currents and by clearance. |
| Smooth muscle cell | $V_{smc}$ from BK_smc, Kir (depends on $V$ and $K^+_p$), VGCC and leak currents. $\mathrm{Ca^{2+}_{smc}}$ from VGCC and Ca-ATPase. PGE₂ → EP receptor → **cAMP**. $AA_p$ → **20-HETE** (CYP4A), inhibited by NO; the NO term is new. NO → sGC → **cGMP** (Yang et al. 2005). |
| Endothelium | Wall-shear-driven eNOS → **NO**, in a simplified form (Yamazaki & Kamiyama 2014), with shear stress $ss = q/\phi$, $\phi$ the relative diameter. The inverse relation was checked with the 2021a network. |
| Lumen and wall | A four-state myosin–actin crossbridge model (Koenigsberger et al. 2008). Ca²⁺ drives MLCK and cGMP drives MLCP. A new cAMP desensitisation factor $1/(k\,\mathrm{cAMP}+1)$ multiplies the $K_1$ and $K_6$ rates. The output is the relative diameter $\phi$, taken as **proportional to relative CBF**. |

**Modified BK_smc steady-state gating** (new; exact typography to be checked
against the supplement):

$$
n^{smc}_{\infty,BK} = \tfrac12\left[1+\tanh\!\left(\frac{V_{smc} + k_{EET}\,EET + k_{cAMP}\,cAMP + k_{cGMP}\,cGMP - k_{HETE}\,HETE - v_{3,BK}(\mathrm{Ca^{2+}_{smc}})}{v_{4,BK}}\right)\right]
$$

The model builds on Yang et al. 2005, Koenigsberger et al. 2008, Witthoft &
Karniadakis 2012, Yamazaki & Kamiyama 2014 and Tesler et al. 2023. It was
solved with MATLAB `ode15s`.

**Parameters and fitting:**

- 81 parameters in total. 17 are uncertain or new.
- **Sensitivity analysis:** LHS with 10 000 samples, each parameter normal
  around an arbitrary mean with a 5% SD. Linear partial correlations (MATLAB
  `partialcorr`) against peak latency and FWHM, FWER-corrected.
- **12 of the 17 were significant and fitted.** The text describes the 17:
  $R_{decay}$, $VR_{ps}$, $g_{KIR,0}$, $g_{BK,smc}$, $k_{EET}$, $k_{cAMP}$,
  $k_{cGMP}$, $k_{HETE}$, $Ca^{smc}_{3,BK}$, $Ca^{smc}_{4,BK}$, $g_{L,smc}$,
  $O_{NO}$, $\delta$, $k$, $K_{m,cGMP}$, $k_{mlcp}$ and $r$. Which 12 were
  fitted is shown only in Figure 3c and the supplement.
- **Fit:** least squares with `fmincon`.

**Data:**

- n = 5 ChR2&Mlc1 mice and n = 5 wild-type mice; 5 more ChR2 mice for the
  drug experiment.
- LDF under isoflurane plus dexmedetomidine.
- Protocol: blue light for 20 s at 0.15 mW/mm², over about 2 mm, then amber
  for 5 s, with 175 s between stimuli. Five repetitions.
- Processing:
  1. Low-pass filter at 0.1 Hz (10th-order Butterworth).
  2. Subtract the wild-type response, to remove a light-on CBF dip that the
     authors attribute to light leaking into the LDF sensor.
  3. Low-pass filter at 0.05 Hz, to remove a **0.072 ± 0.022 Hz oscillation
     that the stimulus evoked**.
  4. Normalise to the 10 s before stimulation.

**Results:**

- **Component 1:** ~13% at ~18 s. Not captured by the model.
- **Component 2:** ~18% at ~45 s, decaying over ~135 s. Fitted well.
- **Explaining component 1** within the model would need $k_{EET}$ doubled,
  which then spoils component 2.
- **Drug cocktail** (MAFP 100 µM for cPLA₂, varespladib 100 µM for sPLA₂,
  paxilline 100 µM for BK): removes component 2, while a component matching
  the unexplained residual (component 1) remains.
- **Model knock-outs:** blocking P450 gives −73%, COX −38% (consistent with
  the literature) and BK −90% (inconsistent with Girouard 2010's ~52%).

**Candidate mechanisms for component 1 (discussion):**

1. Astrocytic eNOS producing NO, which inhibits 20-HETE. Paxilline should
   have blocked this.
2. Capillary K⁺ activating endothelial Kir2.1, with the hyperpolarisation
   conducted upstream (Longden 2017; Moshkforoush 2020), and/or ensheathing
   pericytes (Gonzales 2020). Paxilline may not reach capillary depth.
3. Glutamate from the endfeet reaching neuronal NMDA receptors, then COX-2
   producing PGE₂.

### 2.3 Neurometabolic coupling (2021b)

An **oxygen-to-tissue transport (OTT)** component models the oxygen
extraction fraction and O₂ concentration in blood and tissue [P]. The
**neurometabolic coupling gain $\kappa$** sets how strongly neural activity
raises O₂ consumption [P].

- **ANC** (abnormal neurovascular/metabolic coupling): with $\varepsilon$
  fixed, a disproportionately large $\kappa$ gives an NBR, "an exaggerated
  initial dip" [P].
- The balance is the ratio $\varepsilon/\kappa$. Normal positive responses
  have $\varepsilon/\kappa \approx 0.4/0.05 = 8$ [P].
- Fitted value for patient 4: $\kappa = 0.51\ \mathrm{s^{-1}}$ with
  $\varepsilon = 0.28$, giving $0.28/0.51 = 0.55$, about **14× smaller**
  than normal [P]. The "normal" reference uses $\varepsilon = 0.4$ and the
  patient fit uses $\varepsilon = 0.28$, so the 14× mixes a change in
  $\varepsilon$ with the change in $\kappa$.
- The OTT equations are not visible (the reference is probably Zheng et al.
  2002 or a Riera-lab variant) [S?].

---

## 3. Vascular stage

Source: the accepted manuscript of 2021a supplied by the owner (not
committed), including Table 1, Table A1 and Tables B1–B3. The PDF's equation
typography extracts poorly, so the equations below are pieced back together
from the extracted coefficients and the cited sources. They are marked [P]
where the coefficients are legible and [R] where the form had to be
inferred.

### 3.1 Detailed steady-flow network model (2021a)

**Network (Table 1)** [P]: a symmetric tree of 22 segments and 14 nodes,
with fixed inlet and outlet pressures.

| Segment class | Diameter (µm) | Length (µm) |
|---|---|---|
| 1st-order arteriole | 27.5 | 100 |
| 2nd-order (feeding) arteriole | 17.5 [15.5–19.5] | 100 [70–130] |
| 3rd-order (daughter) arteriole | 11 [10–12] | 100 [70–130] |
| Capillary | 8 | 250 |
| 3rd / 2nd / 1st-order venule | 13 / 19.5 / 33 | 100 |

Boundary conditions: $P_{in} = 60$ [50–70] mmHg, $P_{out} = 25$ mmHg,
baseline discharge hematocrit $H_D = 0.45$ [0.32–0.50].

**Equations (Table A1):**

- In-vivo apparent viscosity [P], with $D$ in µm (the form with the
  $D/(D-1.1)$ factor is the Pries et al. 1994 in-vivo law; the paper cites
  Pries & Secomb 2005/2008):

$$
\eta_{vivo} = \left[1 + (\eta^*_{0.45}-1)\,\frac{(1-H_D)^C - 1}{(1-0.45)^C - 1}\left(\frac{D}{D-1.1}\right)^2\right]\left(\frac{D}{D-1.1}\right)^2
$$
$$
\eta^*_{0.45} = 6e^{-0.085D} + 3.2 - 2.44e^{-0.06D^{0.645}}, \quad
C = \left(0.8 + e^{-0.075D}\right)\left(-1 + \frac{1}{1+10^{-11}D^{12}}\right) + \frac{1}{1+10^{-11}D^{12}}
$$

- Hagen–Poiseuille and Ohm [P]: $R = \dfrac{128\,\eta\,L}{\pi D^4}$, $\ \Delta P = R\,Q$.
- Continuity at every node [P]: $\sum_j Q_j = 0$. Together with Ohm this
  gives the square linear system $M Y = Z$, with segment flows and node
  pressures in $Y$ and $P_{in}$, $P_{out}$ in $Z$.
- Phase separation at every bifurcation, from feeding vessel $F$ to
  daughters $\alpha$ and $\beta$ [P, Pries & Secomb]:

$$
\operatorname{logit} FQ_{E,\alpha} = A + B\,\operatorname{logit}\frac{FQ_{B,\alpha}-X_0}{1-2X_0},\qquad \operatorname{logit} x = \ln\frac{x}{1-x}
$$
$$
A = -13.29\,\frac{D_\alpha^2/D_\beta^2 - 1}{D_\alpha^2/D_\beta^2 + 1}\,\frac{1-H_{D,F}}{D_F},\quad
B = 1 + 6.98\,\frac{1-H_{D,F}}{D_F},\quad
X_0 = 0.964\,\frac{1-H_{D,F}}{D_F}
$$

- RBC mass conservation [P]: $H_\alpha Q_\alpha = FQ_{E,\alpha} H_F Q_F$ and
  $H_\beta Q_\beta = H_F Q_F - H_\alpha Q_\alpha$.
- **Solution scheme** [P]: solve $MY = Z$, update the hematocrits, then
  viscosity, then resistance, and iterate until the hematocrit converges
  (tolerance $10^{-6}$, as read). This is quasi-steady: the network
  re-equilibrates at every time step (1 ms) after a diameter change.
- **Stimulus** [P/R]: a Gaussian relative neural activity $n(t)$ drives a
  vasoactive signal with flow feedback. The feedback term is described as a
  "shear-stress feedback that sets the saturation of flow increase".

$$
\dot s = \varepsilon\,(n-1) - \frac{s}{\tau_s} - \frac{Q_a/Q_{a,0} - 1}{\tau_f},\qquad
\dot\phi = h_{se}\,s - h_{ds}\,\phi,\qquad D_a = D_{a,0}\,(1+\phi)
$$

  with $\varepsilon = 0.52$, $h_{se} = 1$ and $h_{ds} = 0.25$. Only segment 4
  dilates, by about 30%.
- **Stealing ratio** [P]:
  $\ \text{SR} = \dfrac{1 - \min f_p}{\max f_a - 1}\times 100\%$.

**Results** [P]:

- ≈30% dilation gives only ≈10% more CBF in the active arteriole.
- With the hematocrit held constant, ABS almost disappears.
- SR is 27.4% at $H_D = 0.32$ and 23.3% at $H_D = 0.50$; over 100 random
  networks it ranges from 16.4% to 40.5%.
- Inlet pressure has no effect.
- PRCC: SR rises with feeding-arteriole length and daughter diameter, and
  falls with $H_D$, daughter length and feeding diameter.
- Segments 6 and 7, which do not share the feeding vessel, gain a little
  flow.

**Two consequences I derived (not in the paper):**

1. **Inlet pressure cannot matter in this model.** Poiseuille flow is
   linear in $\Delta P$, and phase separation depends only on flow
   *fractions*. So every relative quantity is independent of the pressure
   scale. The pressure result is an identity of the model, not a
   physiological finding.
2. **The small CBF gain is set by the capillaries.** In units of $L/D^4$
   (µm⁻³), the feeding arteriole is ≈$1.1\times10^{-3}$, a daughter
   ≈$6.8\times10^{-3}$ and one 250 µm capillary ≈$6.1\times10^{-2}$.
   Capillaries dominate each path's resistance, and in vivo their higher
   apparent viscosity makes this stronger. Dilating the daughter by 30%
   cuts its resistance by $1 - 1.3^{-4} \approx 65\%$, which is only ≈10%
   of the path: the paper's ≈10% CBF.
   - The feeding arteriole is only ~1–2% of the path, so pressure-mediated
     stealing is tiny. This is why ABS here depends almost entirely on
     hematocrit redistribution.
   - The 2 × 250 µm capillaries per path are the lever, so realistic
     capillary-bed geometry matters more than anything in the arterial
     tree.

   **Check.** I rebuilt the network in numpy. The topology is inferred from
   the 14 unknown pressures: each daughter splits into two capillaries that
   rejoin at a 3rd-order venule. With $\eta(D)$ at a fixed $H_D = 0.45$
   and no phase separation, a 30% dilation of segment 4 gives **+10.4%**
   flow in segment 4 and **−0.25%** in segment 5. That is a pure-resistance
   stealing ratio of about 2.4%, against ~25% with phase separation. The
   feeding arteriole is 1.4% of the path's resistance. This confirms the
   paper's point quantitatively: in this network, stealing is about 10×
   larger because of hematocrit redistribution than because of pressure.

### 3.2 Parsimonious windkessel model (2021a, reused in 2021b)

**Circuit (Fig. 3, Table B1)**: two regions ($i$ = 1 active, 2 passive)
share a feeding artery with resistance $R_A$ and inductance $L_A$. Each
region has an arteriolar resistance $R^0 r_i$ and a windkessel compliance.
The regions drain into a common vein. Resistances are normalised so that
[P]

$$
2R_A + R^0 + R_V = 1 \qquad \text{(B2, normalised total network resistance)}
$$

with $R_V$ standing for the downstream (capillary–venous) resistance; the
symbol is inferred.

Flow dynamics [R]: from Kirchhoff's second law, written for the relative
flows $\mathbf f = (f_1, f_2)^T$, with $\mathbf M = \begin{pmatrix}1&1\\1&1\end{pmatrix}$
(so flow through the shared artery is $f_1+f_2$) and $\mathbf N = \mathrm{diag}(r_1, r_2)$:

$$
\tau_A\,\mathbf M\,\dot{\mathbf f} = \mathbf 1 - R_A\,\mathbf M\,\mathbf f - R^0\,\mathbf N\,\mathbf f - R^0\,\mathbf p(\mathbf v,\mathbf c)
$$

$\mathbf p$ is the windkessel (post-arteriolar) pressure term, a function
of volume $v_i$ and compliance $c_i$. $\mathbf M$ is singular, so the system
is a DAE solved with `ode15s` [P].

Other equations:

- **Volume and compliance** [P, forms from Zheng & Mayhew 2009]:
  $\tau_0\,\dot v_i = f_i - f_{out}(v_i, c_i)$, with a viscoelastic
  compliance $c_i$ whose time constant is $\tau_c = 6.68$ s and whose CBV
  gain is $\kappa = 7.6$. The exact $f_{out}$ and $\dot c$ equations
  extract illegibly; to confirm from the source file.
- **Neurovascular coupling** [P]:
  $\dot s = \varepsilon(n-1) - s/\tau_s - (f_1 - 1)/\tau_f$.
- **Arteriolar resistance** [P]: $\dot r_1 = -r_1^2\,s$. This follows from
  $f \propto 1/r$ and $\dot f = s$.
- **Inductance** [P]: $L = 4\rho l/(\pi D^2)$, with $\rho = 1.056$ g/cm³.
  So $\tau_A = L/R = \rho D^2/(32\eta)$, taken as 1 ms for 20–30 µm
  arterioles. It is ≈1.4 ms in mouse pial arteries and ≈0.3 s in human
  large arteries.

**Parameters (Table B3)** [P]:

| Parameter | Value |
|---|---|
| $\varepsilon$ (neurovascular coupling efficacy) | 0.28 [0.2–0.5] |
| $\tau_s$ | 1.1 s |
| $\tau_f$ (autoregulation time constant) | 1.2 s |
| $\tau_0$ (tissue mean transit time) | 1.8 s |
| Exponent ("diminished reserved volume") | 2 |
| $\tau_c$ | 6.68 s |
| $\kappa$ | 7.6 s |
| $\tau_A$ | 1 ms |
| $R_A$ (estimated) | ≈0.175–0.205 |
| $R^0$ (estimated) | ≈0.415–0.465 |

The $\varepsilon$ here (0.28) differs from the detailed model's
$\varepsilon = 0.52$.

**Fitting** [P]: $J = \frac1N\sum_k[(f_a - \hat f_a)^2 + (f_p - \hat f_p)^2]$
against the detailed model plus noise with σ = 0.003, using `fmincon`, 30
trials per hematocrit value. As $H_D$ rises, $R_A$ falls and $R^0$ rises,
both parabolically.

**Interpretation note (mine):** the fitted $R_A \approx 0.19$ of total
resistance is about ten times the feeding arteriole's geometric share
(≈1–2%). So $R_A$ is an *effective* parameter: it carries the hematocrit
redistribution, not the artery's physical resistance. The same caution
applies to $R_A = 0.17$ in 2021b. For the suite this is the central
coarse-graining question: mesoscopic parameters should be *derived* from
the graph (flows, hematocrit and pressure sensitivities), not only fitted.

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
documentation at `http://web.eng.fiu.edu/jrieradi/NBR-Model/` [P]. The
server returns 403 from this environment. The equations are in the online
Supplementary Tables A1–A3, which are not in the article PDF.

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
2. The **JCBFM 2025 supplement** (the equations and parameter table) is
   needed, as are which 12 parameters were fitted and their values.
3. Should **Moshkforoush et al. 2021** (the astrocyte Ca²⁺ network model that
   drives the JCBFM model) join the paper list in VISION.md?
4. The **2021b Supplementary Material** (Tables A1–A3 with the model
   equations and parameter ranges) and the NBR-Model code: upload both under
   `legacy/`, since the FIU link is not reachable from here.
5. For 2021a: the exact $f_{out}$, compliance and pressure-term equations of
   Table B1, which extract illegibly from the manuscript PDF.
6. Units are now known ($\tau_{e2}$ = 3 s, $\kappa$ = 0.51 s⁻¹). $R_A$ =
   0.17 is a fraction of the normalised total resistance, but it is an
   effective parameter (see section 3.2).

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
