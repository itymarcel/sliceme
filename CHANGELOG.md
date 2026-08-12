# Changelog

Changes are grouped into one consolidated summary per calendar day.

## 2026-08-12

- Added an ARM64 Docker Compose development environment for running and testing the complete application on the Raspberry Pi against a prebuilt OrcaSlicer runtime.
- Added the browser-based measuring tool with two-point distance, signed X/Y/Z deltas, surface picking, visible annotations, and exact mesh-vertex snapping.
- Added measurement unit tests and browser interaction verification support.
- Documented trusted-LAN access to the local development frontend on port 3007.
- Refined the interface with the `#5FE547` highlight accent, removed the visible application title, and expanded the active Measure header highlight.
- Simplified the G-code header by removing the shared Preview/Source container and placing layer/Z metadata in its own compact panel.
- Replaced inline G-code textareas with explicit Edit buttons and a focused overlay editor with Save, Cancel, backdrop-dismiss, and Escape-dismiss behavior.
