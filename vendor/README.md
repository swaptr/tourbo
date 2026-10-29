# Vendored Qloo tooling

- `qloo-harness/`: `@qloo/qloo-harness@0.1.26` (MIT, `npm pack`), the package behind `qloo mcp` / `qloo exec` / `qloo explore`. Not wired into `package.json` yet (PLAN §14 item 8). Runtime deps: `@earendil-works/pi-coding-agent@0.84.2`, `typebox@1.3.7`.
- `qloo-hackathon-kit/`: git submodule of https://github.com/qloo/qloo-hackathon-kit, pinned at `80a82b2` (2026-10-20). Submodule, not a copy: the kit ships no license. `git submodule update --init` to fetch.
