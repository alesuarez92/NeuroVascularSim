# NeuroVascularSim

A physiological simulation suite for the brain and the fMRI signal, by the
NMD Lab (Alejandro Suarez, Ph.D.).

**Status: planning.** Private until the first working models are in place.

## Idea

Model brain function end to end, with explicit physiology at every step:

1. **Neural activity**: the events that start a response.
2. **Biochemical pathways**: the metabolic and vasoactive signalling that
   couples neurons to blood vessels.
3. **Blood flow dynamics**: flow, volume and oxygenation in the vascular
   network.
4. **Signal acquisition**: how an fMRI scanner (and other methods such as
   Laser Doppler Flowmetry, electrophysiology and optical imaging) turns that
   physiology into a measured signal.

Real recordings are processed and analysed in the same framework, so models
can be fitted to data, compared with it, and used to improve how signals such
as BOLD are interpreted. The goal is to close the gap between what is
measured and what happens physiologically, step by step.

It is a sibling of
[NeuronalDataAnalyzerLab](https://github.com/alesuarez92/NeuronalDataAnalyzerLab)
(NeuroAnalyzer): the two share data conventions, so simulated data opens in
NeuroAnalyzer and real recordings analysed there can drive or test the models.

See [docs/VISION.md](docs/VISION.md) for the plan.

## Data

Lab recordings are not part of this repository. Tests and demos use synthetic
data with known ground truth.

## Author

Alejandro Suarez, Ph.D. All rights reserved (see [LICENSE.txt](LICENSE.txt)).
