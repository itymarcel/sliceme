# Privacy

SliceMe is designed so the working project remains in your browser while the slicing service stays request-scoped.

## Browser storage

SliceMe stores the current models, settings, transforms, UI preferences, history, and generated G-code in IndexedDB on the device and site origin you use. The printer host and API key entered in the direct-print dialog are kept in `sessionStorage` and disappear when that browser tab closes. You can remove the current workspace with **Clear** or through your browser's site-data controls.

## Slicing and project conversion

When you slice, import a 3MF, export a 3MF, or request another server-side conversion, the required model/project bytes and settings are sent over HTTPS to the configured SliceMe API. Processing uses a temporary server directory that is removed when the request ends. SliceMe does not provide cloud project storage or accounts.

Generated G-code should still be reviewed before it is sent to a printer. Direct OctoPrint/Moonraker delivery is initiated by the browser to the host you enter; the printer host and API key are not sent to the SliceMe API.

## Optional AI settings prefill

When you use AI prefill, the text description and a limited set of current printer/material settings are sent to the SliceMe API and then to the configured AI provider. Model geometry is not part of the AI prefill request. Do not put secrets or personal information in the description.

## Anonymous hosted-beta telemetry

When telemetry storage is configured, the hosted beta records:

- a random session identifier scoped to the browser tab;
- visible active time and start/heartbeat/end timestamps;
- browser family, operating-system family, user agent, language, time zone, screen and viewport dimensions, and touch capability;
- slice attempt/success/failure events and a normalized category such as
  `slicer_exit_205`; raw server error text and model filenames are not sent as
  telemetry failure reasons.

It does not intentionally record names, email addresses, account identifiers, model filenames, model geometry, G-code, printer addresses, or printer API keys. Telemetry failures never block slicing. Telemetry is currently retained until the hosted-beta operator removes it; a fixed deletion schedule has not yet been established.

Self-hosted operators control whether database-backed telemetry and AI prefill are configured. Their deployment and privacy policy may differ from the public beta.

## Questions and deletion requests

Open a privacy question at <https://github.com/itymarcel/sliceme/issues> without including sensitive data. Because hosted telemetry is intentionally anonymous and has no account identity, locating one person's historical session may not be possible.
