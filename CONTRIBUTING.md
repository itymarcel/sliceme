# Contributing to SliceMe

Contributions are welcome: bug fixes, printer and material support, documentation, tests, accessibility improvements, and focused new features.

By participating, follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Report security-sensitive problems privately as described in [SECURITY.md](SECURITY.md), and review the current priorities in [ROADMAP.md](ROADMAP.md).

## Before you start

- Search existing issues and pull requests to avoid duplicate work.
- For a substantial feature or architectural change, open an issue first so the approach can be discussed.
- Keep changes focused. Unrelated cleanup should be submitted separately.

## Development workflow

1. Fork the repository.
2. Create a branch from `dev`.
3. Make the change with clear commits.
4. Run the checks relevant to the code you changed.
5. Open a pull request against `dev` and explain the problem, solution, and verification performed.

Useful checks:

```bash
cd apps/web
npm install
npm test -- --run
npm run build

cd ../../services/slicer
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m unittest discover -s tests
```

An end-to-end slice requires the Orca runtime described in the README.

## Pull-request expectations

- Preserve browser-local storage and request-scoped server processing.
- Do not commit credentials, `.env` files, generated build output, or private model files.
- Add or update tests when behavior changes.
- Update documentation when configuration, APIs, or workflows change.
- Keep the existing compact SliceMe visual language for frontend changes.

## Contribution license

By submitting a contribution, you agree that it may be distributed under the repository's [GNU Affero General Public License v3.0 or later](LICENSE). You retain copyright in your contribution.

The software license does not grant rights to the SliceMe name or branding. See [TRADEMARKS.md](TRADEMARKS.md).
