# Changelog

Changes are grouped into one consolidated summary per calendar day.

## 2026-08-15

- Added a persistent X-Ray model inspection toggle with a Lucide Sun control that renders selected and unselected models as translucent double-sided geometry while preserving model picking, camera controls, and expanded view.
- Changed the main application accent and selected-model highlight to `#89FF8E` while retaining yellow for G-code toolpaths.
- Added and refined a clean phone layout with a 50/50 STL/G-code split, centered single-column hamburger menu, navbar Undo/Redo, labeled SlidersHorizontal settings and slicing actions, horizontally aligned Measure/Position/Rotation controls, compact fullscreen/X-Ray controls, shrink-wrapped visible Toolpaths, collapsible top-left Print Info, and true full-height expanded viewers.
- Extended unified workspace Undo/Redo to model position and rotation edits plus model addition and removal, with one history entry per viewer drag and durable model restoration.
- Swapped the Slice button icon from scissors to the Lucide Slice icon, and added a clear disabled visual state for the mobile navbar Undo/Redo controls so they no longer appear permanently active.
- Removed the Position/Rotation text labels beside the transform icons for a wider input area, focused each transform input on entry so a leading zero is replaced cleanly when typing, disabled pinch-zoom on mobile via the viewport meta, and added X/Y/Z quick-rotate buttons that step rotation by 45 degrees (wrapped to 0-359).

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
