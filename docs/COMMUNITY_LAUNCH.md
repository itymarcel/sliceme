# Community launch kit

Use one community at a time. Reply to every substantive report, avoid vote requests, and do not paste the same text everywhere on the same day.

## Core links

- Try: https://sliceme.up.railway.app/
- Source: https://github.com/itymarcel/sliceme
- Feedback: https://github.com/itymarcel/sliceme/issues/new/choose

## Publication status and release order

The repository and hosted beta are already public, but the first tagged GitHub beta has not been published. Use the prepared community copy only when the source branch, GitHub release candidate, and Railway deployment all contain the model-check and post-slice-check work described below. Complete this order:

1. Commit the complete beta candidate on `dev`, including both check systems and their tests.
2. Run the full frontend and backend suites, production build, real baseline/modifier slices, and desktop/mobile browser checks.
3. Fast-forward `master` only with maintainer approval, push the exact verified commit, and confirm Railway serves that commit.
4. Confirm the live app exposes Model checks and Post-slice checks, `/health` succeeds, the changelog loads, and telemetry still stores only normalized failure categories.
5. Apply the GitHub description, homepage, topics, Discussions, and private vulnerability-reporting settings below.
6. Publish the prepared `v0.1.0-beta` GitHub release from the verified `master` commit.
7. Soft-launch for print validation first; use wider community posts only after reviewing the first reports.

Do not describe local or `dev`-only functionality as live. The source branch, GitHub release, and Railway deployment must represent the same verified candidate.


## 1. r/3Dprinting — first 3D-printing post

**Before posting:** read the current rules and ask moderators through modmail whether an open-source tool beta is allowed. Automated access to the rules was blocked during preparation, so this is intentionally not treated as pre-approved.

**Title**

> I built a free open-source browser slicer around OrcaSlicer — looking for honest print validation

**Body**

> I’ve been building **SliceMe**, an early-beta browser interface backed by an OrcaSlicer runtime: https://sliceme.up.railway.app/
>
> It handles STL/STEP preparation, printer and print profiles, slicing, G-code preview, 3MF projects, and download/direct LAN handoff without requiring an install or account. The complete project is AGPL open source: https://github.com/itymarcel/sliceme
>
> It also provides local, deterministic model checks before slicing and advisory checks derived from the parsed G-code afterward. Findings show measured evidence and limitations, can navigate to relevant layers or exposed settings, and do not claim that a model is guaranteed to print.
>
> The unusual part is how it is maintained: a semi-autonomous agent researches reproducible slicer problems and can implement/test fixes, but I set priorities and control every publication. That workflow is disclosed in the repository and changelog.
>
> This is **not** a claim of full Orca/Bambu/Prusa parity yet. I’m looking for practical validation: try a model you already know, inspect the G-code, and tell me the printer/profile and what differs from your normal slicer. Please review G-code before printing.
>
> Models are uploaded only for the slicing request; workspace data remains in browser storage. Exact telemetry and processing details are documented in the privacy page.

## 2. Show HN — technical/open-source launch

Post only when you can stay available to answer questions. Do not request upvotes.

**Title**

> Show HN: SliceMe – an open-source OrcaSlicer-powered browser slicer

**Text**

> SliceMe is a free AGPL browser workspace for preparing STL/STEP models, selecting runtime-backed printer profiles, generating G-code with OrcaSlicer, and inspecting toolpaths. The hosted beta works without an account or install: https://sliceme.up.railway.app/
>
> Source: https://github.com/itymarcel/sliceme
>
> Before slicing, worker-based geometry checks inspect fit, bed contact, topology, overhangs, and conservative nozzle-relative feature estimates. After slicing, deterministic checks reuse the parsed toolpath to report measured bridge, layer-time, support, retraction, transition, bounds, and first-layer indicators. These are inspectable warnings with explicit limitations, not printability guarantees.
>
> The project is also an experiment in transparent human-supervised agent maintenance. An agent can research reports, implement bounded changes, add tests, build, and verify them; I choose priorities and control publication. The repository discloses that process rather than presenting generated work as purely human-authored.
>
> The workspace persists in IndexedDB. Model bytes go to a request-scoped slicing API and are removed with the temporary job directory. It is an early beta, and the current goal is output validation and honest feedback rather than claiming desktop-slicer parity.

Guidelines: https://news.ycombinator.com/showhn.html

## 3. Maker Forums / RepRap-oriented forums

Recommended destination: https://forum.makerforums.info/c/3d-printing/5 — first check the category rules and search for an appropriate software/projects category.

**Title**

> SliceMe: AGPL browser workspace backed by OrcaSlicer — beta testers wanted

**Body**

> I’m preparing the first tagged beta of SliceMe, a self-hostable browser workspace backed by an OrcaSlicer runtime.
>
> Live beta: https://sliceme.up.railway.app/  
> Source: https://github.com/itymarcel/sliceme
>
> The goal is low-friction access to model preparation, profiles, slicing, and G-code inspection without hiding that slicing is a safety-sensitive workflow. It is early software: generated G-code should be reviewed, and some desktop workflows are explicitly listed as incomplete.
>
> The beta candidate adds deterministic pre-slice model diagnostics and post-slice checks based on the actual parsed toolpath. They provide measured, advisory evidence and relevant layer/settings navigation rather than silently changing settings or claiming guaranteed printability.
>
> I would especially value reports that include printer, selected profile, material/nozzle, and whether a difference appears in preview, G-code, or the physical print.

## 4. r/opensource — open-source/process angle

Check current subreddit rules before posting.

**Title**

> SliceMe: an AGPL browser slicer maintained with a disclosed human-supervised agent workflow

**Body**

> SliceMe is an AGPL browser workspace backed by OrcaSlicer: https://github.com/itymarcel/sliceme
>
> There is also a no-signup hosted beta at https://sliceme.up.railway.app/
>
> Beyond the slicer itself, I’m testing a transparent maintenance model: an agent researches public reports and may implement/test bounded fixes, while a human maintainer sets priorities and controls publication. The README discloses this explicitly, and changes remain reviewable through normal source, tests, and changelog history.
>
> The current beta candidate includes inspectable local geometry diagnostics and parsed-toolpath checks. Their evidence, thresholds, and limitations remain in the source and tests rather than being presented as AI printability judgments.
>
> Feedback on both the software and what good disclosure/governance should look like is welcome.

## 5. Printer-specific communities — only after relevant validation

Use Klipper, OctoPrint, Bambu, Prusa, Creality, or Voron communities only when the post includes a verified result or integration relevant to that audience. Ask moderators first in Discord communities.

**Short template**

> I tested SliceMe’s early browser-slicing beta with **[printer/profile]** and **[material/nozzle]**. The result was **[result]**. SliceMe is AGPL, uses an OrcaSlicer runtime, and can be tried without an install: https://sliceme.up.railway.app/ — I’m looking specifically for **[community-relevant workflow]** feedback.

## Avoid

- Do not create promotional issues in OrcaSlicer, PrusaSlicer, Cura, or printer support trackers.
- Do not claim cloud-free slicing: the hosted beta uploads model bytes for the temporary slice request.
- Do not lead with “AI-built”; lead with the working open-source tool and explain the supervised agent process.
- Do not claim production readiness or complete desktop parity.
- Do not ask friends or users to coordinate votes.

## Repository metadata to apply when publishing

- Description: `Free, open-source OrcaSlicer-powered browser workspace for preparing models, slicing, and inspecting G-code.`
- Homepage: `https://sliceme.up.railway.app/`
- Topics: `3d-printing`, `slicer`, `orcaslicer`, `gcode`, `react`, `fastapi`, `self-hosted`, `open-source`, `3mf`, `stl`
- Enable GitHub Discussions and private vulnerability reporting.
- Publish the prepared `v0.1.0-beta` notes only after the final beta commit is on `master` and the Railway deployment is verified.
