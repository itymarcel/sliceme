# Changelog

Changes are grouped into one consolidated summary per calendar day.

## 2026-09-04

- Added a navbar changelog popover that opens directly beneath its clock button, stays within the viewport, scrolls long release history, and formats dated entries and inline code more clearly. The browser fetches the deployed `/changelog.md` file on demand rather than embedding changelog content in the application bundle.
- Prepared the public early-beta launch package: prominent live/source/feedback links, honest privacy and roadmap documents, community and release copy, structured issue templates, social-sharing/search metadata, favicon/manifest/robots/sitemap assets, privacy-safe normalized telemetry failure categories, and visible early-beta labels on desktop and mobile. Restored the concise local-session navbar wording, subdued the early-beta badge, and moved the version into a custom tooltip on the compact changelog control.

## 2026-09-02

- Fixed multipart layer-height overrides after model splitting: Orca ignores `layer_height` on individual normal parts inside one multipart object, so SliceMe now converts each explicit part override into a world-Z height range on the logical printable object. Export grouping is placement-dependent: elevated/stacked pieces remain multipart to avoid Orca's floating-object failure, while fully grounded pieces moved side-by-side export as independent Orca objects and retain independent object-level layer-height settings.
- Added an explicit README disclosure describing the repository's semi-autonomous AI-agent maintenance workflow, the public sources it reviews, the agent's role in implementation and verification, and the human maintainer's control over priorities and publication.

## 2026-09-01

- Hardened the new model-preparation release before deployment: preserved X/Y-tilted world transforms, retained common grounding across generated cut/split parts, remapped height ranges into each generated part, and triangulated hollow cut cross-sections as contours with holes.
- Changed the browser page title to `[V] SLICEME [V]`.
- Removed the redundant bespoke variable-layer editor because the existing height-range modifiers already provide that control. Converted Model tools from a full-screen modal into a button-anchored popover and restyled its actions with the standard SliceMe button variants.
- Fixed Model tools closing immediately on trigger click, made the full object-tree row select its object, and added a hover explanation to the orange placement warning (outside the bed and/or true 3D overlap).
- Added drag-to-stack placement: while moving a printable model, XY contact raises it onto the highest intersected model; moving clear returns it to the bed. Placement validation now accounts for Z, so correctly stacked touching parts are not reported as overlapping.
- Corrected the Z-split popover controls to use compact SliceMe button and form-field styling. Fixed Orca exit code 156 for vertically stacked cut parts by preserving generated pieces as one printable multipart assembly while keeping them independently selectable and movable in the workspace; real unsplit and middle-split hollow-tube slices now both complete successfully.
- Fixed startup on browsers or non-secure contexts without `crypto.randomUUID` by reusing the existing UUID fallback; added a regression test and verified the deployed app with `randomUUID` explicitly unavailable.

## 2026-08-31

- Added desktop model preparation tools for selected printable objects: plane cut with both capped parts retained, disconnected-shell splitting, and mesh repair for degenerate/duplicate facets, inconsistent winding, normals, and simple planar holes. Destructive geometry work runs in a dedicated browser worker, emits valid binary STL, bakes transforms without changing world placement, remains undoable, and preserves/rebinds attached modifiers.
- Strengthened the existing per-object height-range modifiers with validated non-overlapping ranges, workspace history and local persistence, native Orca `layer_config_ranges.xml` export, and 3MF import restoration.
- Corrected Orca range-object IDs for parent objects with modifiers and added backend validation for finite boundaries, overlap, positive heights, and nozzle limits. Verified real Orca output at 100 constant-height layers versus 125 variable-height layers, including the parent-with-modifier path.

## 2026-08-28

- Added privacy-conscious PostgreSQL-backed usage sessions: visible-tab active-time tracking with start, heartbeat, and page-exit updates, plus a token-protected session listing endpoint. Added generic usage events for slice-triggered/succeeded/failed counts and failure reasons, a summary in the admin page, and local storage for the admin token.
- Updated the usage admin page to open per-session unsuccessful slice timestamps and reasons from a three-dots action instead of showing failure reasons in the summary bar.
- Normalized verbose Orca slice diagnostics into concise failure reasons and made failure-event requests use keepalive delivery.
- Added anonymous session environment metadata: browser, operating system, language, time zone, screen, viewport, and touch capability, with a compact Browser / OS column in the admin table.

## 2026-08-24

- Added a Flow color-mode toggle next to Print preview that colors tube/print-preview segments by volumetric extrusion (mm³/mm) along a blue→red ramp normalized to the slice's actual flow range (fixes the coarse >12 scale). The toggle is disabled unless Print preview is active.
- Dimmed object/range settings that are inherited from the parent (global for files, effective file-level for ranges) while keeping explicit overrides at full opacity, with a unit test asserting the inherited/overridden row classes.
- Added AI-prefill success and neutral preset-change notifications: after a successful prefill the description textbox is cleared and a confirmation toast appears; selecting any printer/print preset shows a neutral "settings updated" notice (including the custom reset path).
- Gave the success/neutral notices a 5-second visible numeric countdown that auto-dismisses and pauses on hover, rendered with the countdown immediately before the Dismiss button.

## 2026-08-23

- Replaced the nine G-code-only printer targets with a broad catalog discovered from the bundled Orca machine profiles; selecting one now applies its complete inherited bed, nozzle, firmware, speed, limit, and start/end G-code configuration.
- Added separate Draft, Standard, Fine, Strong, and Vase print presets with an explicit overwrite warning and full process-setting replacement, while keeping printer and print profiles independently selectable.
- Added spatial STL/STEP modifier meshes with parent-child object-tree organization, independent per-modifier settings, translucent viewport rendering, browser persistence, native Orca `modifier_part` slicing/export, and safe parent deletion.
- Extended Orca 3MF import to restore recognized per-object process/material settings and spatial modifier parts instead of flattening those components into one printable mesh.
- Made modifier operations respect parent grouping across duplicate, mirror, arrange, and center, and excluded modifier meshes from placement warnings and build-volume bounds.
- Hardened printer-profile loading against symlink traversal and inheritance cycles, preserved legacy preset IDs for existing workspaces, and recorded preset application as discrete undoable history steps with request cancellation.
- Verified the full stack with unit tests (frontend, backend, engine, API), a production build, browser profile/modifier checks, and a real Orca slice of a Bambu A1 0.4 / Standard project with a 100% infill modifier mesh.
- Replaced the native profile dropdowns with a searchable combobox (filter by all typed terms) for both the printer/machine catalog and the print preset catalog; kept the small "overwrite all current print settings" warning on the print preset.

## 2026-08-22

- Simplified the sidebar panel headings by removing the redundant “Workspace” eyebrow above Objects and “Settings” eyebrow above the active settings scope.
- Published SliceMe as an AGPL-3.0-or-later open-source project with clear forking and contribution guidance, protected project branding, pull-request guidance, and third-party notices.

## 2026-08-21

- Aligned the transform panel to a consistent three-column axis grid: rotation uses all three columns at full width, while translation reserves the left axis column and right-aligns its X/Y inputs.
- Moved Center beside the mirror controls with matching compact styling and shortened the surface-placement action label to “Select flat.”
- Decoupled G-code editor line selection from the visible layer/move range and repositioned the source editor above the camera controls so the controls no longer cover editable text.

## 2026-08-20

- Added essential object preparation tools: uniform scaling, per-axis mirroring, duplicate, center, click-to-select flat-surface placement, editable object names, modifier-key multi-selection, and visible out-of-bed/overlap warnings.
- Extended browser persistence, unified undo/redo history, viewport rendering, slice manifests, and native Orca 3MF transforms so scale and mirror state survive reloads and produce matching sliced geometry.
- Replaced automatic largest-face placement with a one-shot viewer mode that visualizes planar STL surfaces, highlights the hovered candidate, rotates the clicked surface onto the bed, and exits automatically; removed the auto-arrange sparkle shortcut from the Objects heading while retaining the AI settings prefill panel.

## 2026-08-15

- Added a persistent X-Ray model inspection toggle with a Lucide Sun control that renders selected and unselected models as translucent double-sided geometry while preserving model picking, camera controls, and expanded view.
- Changed the main application accent and selected-model highlight to `#89FF8E` while retaining yellow for G-code toolpaths.
- Added and refined a clean phone layout with a 50/50 STL/G-code split, centered single-column hamburger menu, navbar Undo/Redo, labeled SlidersHorizontal settings and slicing actions, horizontally aligned Measure/Position/Rotation controls, compact fullscreen/X-Ray controls, shrink-wrapped visible Toolpaths, collapsible top-left Print Info, and true full-height expanded viewers.
- Extended unified workspace Undo/Redo to model position and rotation edits plus model addition and removal, with one history entry per viewer drag and durable model restoration.
- Swapped the Slice button icon from scissors to the Lucide Slice icon, and added a clear disabled visual state for the mobile navbar Undo/Redo controls so they no longer appear permanently active.
- Removed the Position/Rotation text labels beside the transform icons for a wider input area, focused each transform input on entry so a leading zero is replaced cleanly when typing, disabled pinch-zoom on mobile via the viewport meta, and replaced the X/Y/Z quick-rotate text buttons with a floating Lucide RotateCw overlay on the right of each rotation input (hidden while that input is focused) that steps the axis 45 degrees clockwise (wrapped to 0-359).

## 2026-08-14

- Replaced browser-native viewer fullscreen with an in-app expanded mode that hides the SliceMe navbar, settings sidebar, and sibling viewer while retaining the selected viewer's complete controls and state.
- Added target-printer G-code presets backed by the bundled Orca machine profiles for common Bambu Lab, Prusa, Creality, Elegoo, and Anycubic machines; presets affect only injected printer G-code, while independently editable bed width, bed depth, and build height control slicing bounds and both 3D previews.

## 2026-08-13

- Added click-to-open information icons for every slicer, range, position, and rotation parameter, with Orca-source-audited explanations and parameter-specific vector diagrams for genuinely geometric concepts; popovers open beside the click pointer, flip at viewport edges, and close on outside click or Escape.
- Added validated OrcaSlicer 3MF project import/export with embedded model geometry, build transforms, standard units, supported global printer/process/filament settings, explicit unsupported-setting notices, correct imported STL facet normals, and native Orca round-trip verification.
- Corrected OrcaSlicer 3MF export so object-level process overrides are attached to the object rather than its mesh volume, preserving settings such as layer height after import; added explicit global/object layer-height validation against nozzle diameter and verified object overrides with Orca-generated 0.4 mm layer transitions.
- Added distinct setting-specific diagrams for brim placement modes, brim-width measurement, skirt loops/distance, spiral mode, top and bottom shell layers, printable height, and Z offset; exposed Skirt loops as the skirt enable control, where zero disables the skirt and positive values select the loop count.
- Replaced inconsistent per-override revert buttons with bounded workspace setting Undo/Redo controls centered in the navbar, including Ctrl/Cmd+Z and Ctrl/Cmd+Y shortcuts for global, object, and height-range setting changes; history persists with the local browser session and restores after reload.
- Consolidated model/project actions and GitHub links under a three-dot navbar disclosure while retaining Buy Me a Coffee on the left, clarified the local-session storage badge, generalized the slicing overlay copy to “Slicer engine,” and moved project/error notifications below the top navbar; the disclosure restores trigger focus on Escape and workspace history shortcuts preserve native editing inside form controls.
- Added automatic restart policies for the web and slicer API containers so Pi or Docker daemon restarts do not leave the frontend serving 502 responses with its API stopped.
- Added a Toolpaths dropdown to G-code preview that detects Orca `TYPE` markers and provides independent Logic-style Mute and Solo controls per toolpath class, including Travel as a first-class M/S row, with red active Mute controls, persisted visibility state, and an atomic one-click M/S reset; added an optional per-type color rendering toggle, refined the result toolbar with compact Cuboid Print preview and Axis3d Grid toggles, added Scan fullscreen toggles to both viewers while retaining the complete G-code toolbar and Preview/Source modes in fullscreen, and reordered Download as a secondary action before the rightmost Slice control.

## 2026-08-12

- Added an ARM64 Docker Compose development environment for running and testing the complete application on the Raspberry Pi against a prebuilt OrcaSlicer runtime.
- Added the browser-based measuring tool with two-point distance, signed X/Y/Z deltas, surface picking, visible annotations, and exact mesh-vertex snapping.
- Added measurement unit tests and browser interaction verification support.
- Documented trusted-LAN access to the local development frontend on port 3007.
- Refined the interface with the `#5FE547` highlight accent, removed the visible application title, and expanded the active Measure header highlight.
- Simplified the G-code header by removing the shared Preview/Source container and placing layer/Z metadata in its own compact panel.
- Replaced inline G-code textareas with explicit Edit buttons and a focused overlay editor with Save, Cancel, backdrop-dismiss, and Escape-dismiss behavior.
- Added local IndexedDB workspace persistence, Docker/Vite hot reload, and server-side AI settings prefill.
- Added post-slice G-code enhancements, including Perimeter Echo, smooth vase transitions, final-layer coasting, and slower detailed moves.
- Added compact header links for Buy Me a Coffee and the SliceMe and Custom Orca source repositories.
- Added the README credit “Perimeter Echo by Sam Beany.”
- Fixed AI settings prefill so explicitly requested nozzle diameters survive server post-processing when OpenAI returns qualified override keys.
- Reframed the README as a standalone SliceMe project without legacy product provenance.
- Boxed and aligned the G-code Preview/Source selector, changed Enhance to the Broom Sparkles icon, and removed upward button movement on hover.
