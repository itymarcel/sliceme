# Changelog

Changes are grouped into one consolidated summary per calendar day.

## 2026-08-13

- Added click-to-open information icons for every slicer, range, position, and rotation parameter, with Orca-source-audited explanations and parameter-specific vector diagrams for genuinely geometric concepts; popovers open beside the click pointer, flip at viewport edges, and close on outside click or Escape.
- Added validated OrcaSlicer 3MF project import/export with embedded model geometry, build transforms, standard units, supported global printer/process/filament settings, explicit unsupported-setting notices, correct imported STL facet normals, and native Orca round-trip verification.
- Corrected OrcaSlicer 3MF export so object-level process overrides are attached to the object rather than its mesh volume, preserving settings such as layer height after import; added explicit global/object layer-height validation against nozzle diameter and verified object overrides with Orca-generated 0.4 mm layer transitions.
- Added distinct setting-specific diagrams for brim placement modes, brim-width measurement, skirt loops/distance, spiral mode, top and bottom shell layers, printable height, and Z offset; exposed Skirt loops as the skirt enable control, where zero disables the skirt and positive values select the loop count.
- Replaced inconsistent per-override revert buttons with bounded workspace setting Undo/Redo controls centered in the navbar, including Ctrl/Cmd+Z and Ctrl/Cmd+Y shortcuts for global, object, and height-range setting changes; history persists with the local browser session and restores after reload.
- Consolidated model/project actions and GitHub links under a three-dot navbar disclosure while retaining Buy Me a Coffee on the left, clarified the local-session storage badge, generalized the slicing overlay copy to “Slicer engine,” and moved project/error notifications below the top navbar; the disclosure restores trigger focus on Escape and workspace history shortcuts preserve native editing inside form controls.

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
