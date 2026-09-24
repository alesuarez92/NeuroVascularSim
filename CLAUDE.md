# CLAUDE.md — agent contract for NeuroVascularSim

If you're an AI coding agent (Claude Code, Codex, Cursor, Aider) opening this repo, **start here**.

## Read order

1. **This file** — agent contract.
2. **`README.md`** — what this project is, then **`docs/VISION.md`**.

This project uses the **minimal tier** of the per-project doc system: `docs/` holds only the vision for now. Session continuity lives in commit messages. Upgrade to standard tier when work needs cross-session tracking.

## Classification ritual

Before any meaningful work, announce one of:

- `NEW STRAND`: multi-PR / multi-session effort.
- `EXISTING STRAND`: continuation of in-flight work.
- `HOTFIX`: urgent, single-PR.
- `MINOR / EVERYDAY`: small change.
- `ASK USER`: classification ambiguous.

## Work discipline

- Tests + CI green on every change. No "trivial" exemption.
- Build clean (0 errors; warnings acceptable if pre-existing).
- Use your own CLI tools (`gh`, `git`, language toolchains). Don't ask the human what you can run yourself.
- No AI/agent attribution on commits, PRs, or other GitHub-visible artefacts. The owner, Alejandro Suarez, is the sole author of this repository; only add other people who are real collaborators.
- Before the first commit of every session, set the commit identity to the owner (cloud containers default to another identity):
  `git config user.name "Alejandro Suarez" && git config user.email "107207149+alesuarez92@users.noreply.github.com"`
  Never add `Co-Authored-By` or session-link trailers.

## After every checkpoint

- Commit with a clear message describing the change.

## Data

- Lab recordings are the owner's lab property and are never committed. Tests and demos use synthetic data with known ground truth.
- Published papers (PDFs) are not committed either (publisher copyright); cite them in `docs/`.
