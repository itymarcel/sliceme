# SliceMe v0.1.0-beta — draft release notes

SliceMe is a free, AGPL open-source browser workspace powered by an OrcaSlicer runtime. This first public beta is intended for testing, validation, and focused community feedback.

## Try it

- Live: https://sliceme.up.railway.app/
- Source: https://github.com/itymarcel/sliceme
- Report feedback: https://github.com/itymarcel/sliceme/issues/new/choose

No installation or account is required for the hosted beta.

## Included

- STL and STEP model preparation in the browser.
- Runtime-backed printer profiles and editable machine, filament, and process settings.
- Object overrides, modifiers, height ranges, transforms, mesh repair, splitting, and cutting.
- Orca-compatible 3MF import/export within the documented subset.
- Server-side Orca slicing with layer/move/toolpath/flow G-code inspection.
- Browser-local workspace persistence and direct OctoPrint/Moonraker handoff.
- Optional AI-assisted settings prefill.

## Important beta limitations

- Review generated G-code before printing; this beta does not claim full desktop-slicer parity.
- Painted supports/seams, complete multicolor/multiextruder workflows, multiple plates, calibration/device monitoring, and lossless import of every desktop 3MF feature are not complete.
- Slicing uploads model data temporarily to the hosted API. See [PRIVACY.md](../PRIVACY.md).
- Hosted availability and processing time are best-effort during the beta.

## How the project is maintained

A semi-autonomous agent helps investigate community reports, implement bounded changes, add tests, build, and verify releases. A human maintainer chooses priorities and controls publication. Agent-prepared work is disclosed and must pass the same repository verification gates.

## Most useful feedback

Try a model you already know and report:

- printer and selected profile;
- material/nozzle;
- expected result and what differed;
- whether the issue is visible in preview, G-code, or the physical print;
- a minimal shareable model/project when possible.
