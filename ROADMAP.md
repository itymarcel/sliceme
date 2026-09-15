# Roadmap

SliceMe is an early beta. Priorities are set from reproducible user reports, real-print validation, and maintainability—not feature-count parity.

## Beta release gates

- Publish repeatable real-print comparisons across several common printer families and materials.
- Keep printer/profile selection, slicing, cancellation, G-code preview, download, and project recovery reliable.
- Make hosted processing, telemetry, limitations, engine version, and failure reporting easy to understand.
- Add regression fixtures whenever a user report exposes unsafe or incorrect G-code behavior.

## Delivered in the current beta candidate

- Local deterministic model diagnostics for build-volume fit, bed contact, topology, geometric overhangs, and conservative nozzle-relative feature estimates.
- Deterministic post-slice indicators derived from the already-parsed G-code, with measured evidence, limitations, layer navigation, and links to effective exposed settings.
- Effective machine retraction controls used by the frequent-retractions finding.

These checks are advisory and deliberately do not declare a model or slice printable.

## Near term

- Improve first-use guidance without turning the workspace into a marketing page.
- Expand profile validation and public compatibility results.
- Validate and tune model/post-slice thresholds against real prints, especially support confidence, bridge metadata, first-layer evidence, and false-positive rates.
- Strengthen 3MF interoperability and clearly report anything that cannot round-trip.
- Refine direct OctoPrint/Moonraker handoff within browser security constraints.
- Improve accessibility and keyboard operation across non-canvas controls.

## Longer term

- Richer support/seam controls and diagnostics.
- Broader multiextruder and multicolor workflows.
- Multi-plate project handling and stronger desktop-project migration.
- Calibration workflows and additional printer integrations.
- Optional local/offline execution where the browser/runtime architecture permits it.

## Contributing

Use focused GitHub issues for bugs and proposals. Include the printer, profile, model characteristics, expected behavior, actual behavior, and generated output where it is safe to share. See [CONTRIBUTING.md](CONTRIBUTING.md).
