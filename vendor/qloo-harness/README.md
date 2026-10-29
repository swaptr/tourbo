# Qloo Harness

`qloo-harness` is the Qloo-owned terminal runtime built on Pi's public SDK. It
owns the unified `qloo` executable, Qloo-specific state and resources, and the
Pi adapters for the shared Qloo capability tools.

The runtime starts in the read-only `explore` profile and offers four explicit
authority profiles:

| Command | Workspace authority |
| --- | --- |
| `qloo explore` | Qloo workflows plus read, grep, find, and list inside the starting folder. |
| `qloo integrate` | Explore tools plus individually approved model shell calls. |
| `qloo plan` | Read-only project inspection for an implementation plan. |
| `qloo build` | Approved model shell calls, edits, and writes. |

Profiles load no project/global Pi extensions or ambient project instructions.
In `explore` and `plan`, `read`, `grep`, `find`, and `ls` accept only paths
inside the folder Qloo started in, after following symlinks. They never reach
Qloo's private state, and they are unavailable when Qloo starts in the home
folder or the file system root.
Direct `!` shell is available only in `integrate` and `build`, where the user is
issuing the command explicitly. Tools still run with the invoking user's
operating-system permissions and are not a sandbox. External `/share`, project
`/trust`, project-trust events, and unapproved extension tools remain denied.
Per-turn call budgets and repeated-call detection stop accidental tool loops.
Qloo workflow state is stored as a versioned, bounded session entry so the
latest intent and provenance survive resume and branching. A resumed or forked
`build` session is automatically downgraded to read-only `plan` authority.
User-confirmed entity and tag matches are stored separately with their semantic
role and target scope, then reused before later tool calls so the same
ambiguity is not presented repeatedly.
Its responsive opening mark interprets Qloo's rounded wordmark and connected
taste graph in terminal-native line art, using the Qloo purple-to-blue palette
in truecolor and 256-color terminals.

## Requirements

- Node.js 22.19.0 or newer.
- Authentication for at least one model provider supported by Pi.
- `QLOO_API_KEY` or `qloo config set api-key ...` for live Qloo workflows.
  Without either, guided setup can continue in clearly labeled learning mode
  with the local `qloo_capabilities` tool.

Model-provider state is stored beneath `~/.qloo/agent`; set `QLOO_HOME` to use
another Qloo state root. This package never uses the generic `~/.pi/agent`
directory. During interactive execution it scopes Pi's process-level agent
directory setting to the Qloo path because Pi's TUI still consults that setting
for a small set of TUI-owned paths; the caller's setting is restored if the run
returns.

Pi startup telemetry, version checks, catalog refresh, package checks, and
managed-tool downloads are disabled by default with invocation-scoped privacy
settings. Model-provider inference remains available. Explicit caller values
for Pi's environment controls are preserved, and temporary overrides are
restored when the runtime exits.

## Install and Run

Requirements:

- Node.js 22.19.0 or newer.
- pnpm 11 or newer for the recommended installation path.

Install the public
[`@qloo/qloo-harness`](https://www.npmjs.com/package/@qloo/qloo-harness)
package globally with pnpm:

```sh
pnpm add --global @qloo/qloo-harness
```

Or use npm instead:

```sh
npm install --global @qloo/qloo-harness
```

You only need one of those install commands. If pnpm reports that its global
bin directory is not on `PATH`, run `pnpm setup`, open a new terminal, and
retry the pnpm install.

Confirm the installation, then start the harness:

```sh
qloo --version
qloo
```

### Uninstall

Remove the global package with the same package manager you used to install it:

```sh
pnpm remove --global @qloo/qloo-harness
```

Or with npm:

```sh
npm uninstall --global @qloo/qloo-harness
```

Package removal intentionally leaves credentials, settings, and sessions in
`~/.qloo` (or the directory selected by `QLOO_HOME`). A later reinstall reuses
that state and will not ask for keys again. Delete only that dedicated state
directory separately if you also want to erase the saved configuration.

### Run from Source

Contributors can prepare the repository once instead of installing the public
package:

```sh
npm ci
npm run build
```

Then start the harness:

```sh
node apps/qloo-harness/dist/bin.js
```

To inspect the available commands without starting an interactive session:

```sh
node apps/qloo-harness/dist/bin.js --help
```

When working from source, replace `qloo` in the examples below with
`node apps/qloo-harness/dist/bin.js`.

### Test a Local Release Artifact

To test unpublished changes through the same global-install shape, build the
verified tarball and install that local artifact:

```sh
npm run pack:qloo-harness
QLOO_HARNESS_VERSION="$(node -p "require('./apps/qloo-harness/package.json').version")"
QLOO_ARTIFACT="$(pwd -P)/build/qloo-harness/qloo-qloo-harness-$QLOO_HARNESS_VERSION.tgz"
(cd /tmp && pnpm add --global "$QLOO_ARTIFACT")
```

Interactive startup requires TTY stdin and stdout so it cannot accidentally
consume piped automation input.
`qloo api <command>` and direct legacy verbs execute the existing CLI through
its import-safe runner; no subprocess is used.

Run `qloo setup` at any time to configure or replace the Qloo API credential
and sign in to a Pi-supported model provider. A first interactive launch opens
the same flow when required. Qloo credentials are validated with a bounded
probe before they are stored in the private shared config; model login uses
Pi's public provider authentication flow. A rejected credential is never
stored. When VPN or routing prevents validation, the user may explicitly save
the key for later diagnosis. Secret input is hidden and never echoed in status
or error output. For automation, `qloo setup --status --json` reports readiness
without prompting or changing state.

After setup, a fresh chat prints a short, non-interactive list of things Qloo
can help with while leaving the editor focused for immediate typing. `/start`
opens the optional guided goal and editable-starter picker; choosing integration
safely selects the read-only `plan` profile.

### Guided Qloo Journeys

Run `/journey` inside chat for a resumable, milestone-based walkthrough of the
harness. You can also start one directly:

| Command | Walkthrough |
| --- | --- |
| `/journey insight` | Ask in natural language, clarify only material ambiguity, run a Qloo query, refine it, and explain what the result supports. |
| `/journey artifact` | Refine a result, inspect the recorded API request with `/request`, and create a self-contained HTML, SVG, CSV, JSON, or Markdown file. |
| `/journey integration` | Ground a product idea in Qloo, inspect the request, map it onto the current project, and save a validated typed plan accepted by `qloo build --plan`. |

The editor always receives an editable starter rather than immediately sending
a model request. Journey progress is stored as bounded structured session state
and survives resume and branching without storing a second copy of the user's
prompt. Use `/journey status`, `/journey pause`, `/journey resume`,
`/journey skip`, or `/journey stop` to manage it. Skipping is available only
for optional refinement or request-inspection milestones.

The artifact journey uses a dedicated writer that cannot write to the project.
Files are mode `0600` on supported platforms and live beneath the current
project's private `$QLOO_HOME/agent/projects/.../artifacts/<session>/`
directory. Existing names are not overwritten. HTML receives a restrictive
content-security policy and rejects external references and common network
APIs; SVG must be passive. HTML is still active local content, so review it
before opening. `/artifacts` lists the exact paths for files created in the
current session together with any bound Qloo source correlations. The harness
removes invented correlation IDs and falls back to the latest Qloo call it
actually observed on the current branch. The model is instructed to return the
saved path and a short explanation instead of printing the complete file in
chat.

### Evidence-backed integration plans

`qloo plan` without arguments remains an interactive, read-only planning
profile. Supplying a goal runs one model-backed planning turn without a TUI and
emits a versioned artifact:

```sh
qloo plan "Add taste-based movie recommendations to CatalogService"
qloo plan "Rank venue candidates for a brand and city" --json
```

The planner uses the same authenticated Pi runtime and Qloo-owned prompts as
chat, but its active workspace tools remain read, grep, find, and list. It must
inspect bounded project context, retrieve the exact canonical Qloo workflow,
cite focused project-relative evidence, and submit a typed field mapping,
change set, verification contract, error policy, privacy constraints, rollout,
and rollback. The harness—not the model—adds the current Qloo contract checksum,
project fingerprint, and SHA-256 for each cited evidence file. It stores the
artifact as a mode-`0600` file beneath the current project's private
`$QLOO_HOME/agent/projects/.../plans` directory. JSON output contains no
absolute project or state path.
Every existing file declared for modification must also be cited as evidence,
and every Qloo mapping field is checked against the selected operation's input
schema or the normalized result envelope before the plan is accepted.

A ready artifact can start a build session by ID:

```sh
qloo build --plan qplan_0123456789abcdef01234567
```

Before starting the TUI, the harness verifies the artifact's integrity, current
Qloo contract, project identity, ready status, and every evidence-file hash. A
stale or `needs_input` plan is refused. Invoking the handoff grants only the
normal session-scoped `build` profile; every model-initiated shell command,
edit, and write still receives a separate approval prompt. Bare `qloo build`
continues to open build mode without a stored handoff for explicitly guided
work.

### Non-interactive workflow execution

`qloo exec` runs the same validated direct workflow executor without loading a
model or TUI:

```sh
qloo exec find_tags --input '{"query":"sneakers","limit":1}'
qloo exec describe --input-file ./describe-input.json
printf '%s' '{"entity":"Nike","type":"brand"}' | qloo exec describe
qloo exec recommend --input-file ./audience.json --jsonl
```

The default output is one normalized result JSON object. `--jsonl` emits a
versioned `started` event followed by `completed` or `failed`. Input is bounded
to 1 MiB, workflow schema validation happens before Qloo is called, and exit
codes distinguish usage/input (`2`), missing Qloo authentication (`4`), normal
execution failure (`1`), and cancellation (`130`). This first automation slice
accepts structured workflow input; it is not yet a model-backed prompt runner.

### Canonical MCP

`qloo mcp` starts the generated canonical MCP stdio adapter:

```sh
qloo mcp
```

It advertises `qloo_capabilities` plus the nine `qloo_*` workflow tools from
`@qloo/tool-schema`, executes them through the same in-process workflow owner as
chat and `qloo exec`, and returns the shared normalized result envelope with
`execution.transport` set to `mcp`. `qloo_capabilities` and
`qloo://contracts/workflows` expose the contract version, SHA-256 checksum,
exact schemas, supported operations, and readiness without contacting Qloo.
With no Qloo credential the schemas remain discoverable and workflow calls fail
with a structured `QLOO_AUTH` result; the adapter never changes transports.

`qloo api mcp` deliberately preserves the CLI's six legacy endpoint-shaped
tools for existing consumers. New MCP integrations should use `qloo mcp`.
Because MCP clients commonly cache `tools/list`, reconnect or restart a client
when the advertised contract checksum changes.

## Updates

The harness owns one Pi-style update command:

```sh
qloo update                       # harness only
qloo update --extensions          # configured Qloo extension packages only
qloo update --all                 # extensions, then harness
qloo update --self --extensions   # equivalent explicit form
qloo update --extension <source>  # one configured package
qloo update --force               # reinstall or explicitly downgrade
qloo update --timeout 300         # bound each install phase to five minutes
```

Self-update applies only to a global npm or pnpm installation. A source checkout
should be updated through Git and rebuilt with `npm run build`.

Self-update first installs and smoke-checks the candidate in an isolated
location, then activates it with whichever supported package manager owns the
current global command: npm or pnpm 11+. Every external phase has a total
deadline, bounded output, a progress heartbeat, and process-group cancellation.
A staging failure leaves the active installation untouched; an activation
failure is reported as potentially partial because package managers cannot
provide an atomic cross-platform global-install swap. The default target is
`@qloo/qloo-harness@latest`. For an approved local artifact or rollback, select
the tarball explicitly:

```sh
QLOO_UPDATE_SPEC=/absolute/path/to/qloo-qloo-harness-version.tgz qloo update
```

`QLOO_UPDATE_SPEC` also accepts an exact Qloo package tag or version. Extension
management reads only the Qloo agent's global package settings beneath
`$QLOO_HOME/agent`; project Pi packages are excluded. Pinned and local package
sources are left unchanged. Package updates may run code supplied by those
packages, so configure only trusted extension sources.

The guarded release artifact is built with `npm run pack:qloo-harness`. Its
release output compiles the unpublished Qloo client, tool schema, and legacy
CLI into the harness while leaving pinned Pi as an ordinary registry
dependency. The release gate installs and reinstalls the artifact with both npm
and pnpm, including a pnpm-owned `qloo update --force` smoke. Registry releases
are published only from that verified artifact with
`npm run publish:qloo-harness`; direct source `npm pack` and `npm publish` are
rejected by `prepack`.

Custom Qloo gateways require an exact trust decision before any API key is
sent. Use `qloo config set base-url <https-url>` to store the endpoint and its
matching trust value, or set both `QLOO_BASE_URL` and
`QLOO_TRUSTED_BASE_URL` to the same URL for one invocation. `qloo doctor`
reports the active trust source without displaying credentials.

## Integrating Qloo Tools

The default runtime registers the canonical operations from
`@qloo/tool-schema`: recommend, rank, describe, geographic affinity, audience
comparison, entity tags, aggregate demographics, trends, and tag search. They
execute through a Qloo-owned workflow executor and the direct `@qloo/client`
transport, resolve human names before primary calls, return candidate choices
for ambiguity, and keep signal, filter, demographic, location, and output
semantics separate. Every result identifies the selected transport and carries
the Pi tool-call correlation ID. The interactive agent does not shell out to
the CLI and does not silently fall back to MCP. Explicit CLI and MCP executor
adapter boundaries exist for negotiated integrations, but are not selected by
the default chat runtime.

Entity and tag grounding runs through a versioned resolution-provider contract.
The default `native` provider runs entirely inside the harness and uses Qloo
`/search`, `/entities`, and `/v2/tags`; `public` remains a configuration alias
for compatibility. Tag concepts use Qloo's semantic search, retain its returned
rank, and are locally scoped to the requested entity domain when the response
includes parent metadata. Identifiers and one exact normalized name proceed.
For entity names with additional context, the native provider compares the
supplied terms with candidate names, descriptions, types, and locations. A
unique candidate matching every term can proceed with a warning and visible
alternatives; otherwise only the context-compatible choices are shown.
Unscored semantic candidates become guided choices instead of having
popularity or result order relabeled as confidence. Entity and tag outcomes are
cached in a bounded 15-minute session-local cache. No taste-resolver process,
embedding model, or resolver database is required for this default path. Every
workflow result includes bounded resolution outcomes with match kind,
alternatives, warnings, and provider provenance.

An existing hosted taste-resolver can be selected explicitly for fuzzy tag
concepts while entity resolution and final Qloo execution remain direct:

```sh
export QLOO_RESOLUTION_PROVIDER=taste-resolver
export TASTE_RESOLVER_URL=https://resolver.example.internal
export QLOO_TRUSTED_TASTE_RESOLVER_URL=https://resolver.example.internal
export TASTE_RESOLVER_API_KEY=... # only when the deployment requires it
# Prefer the decomposer-free endpoint when that deployment implements it:
export QLOO_TASTE_RESOLVER_TAG_ENDPOINT=structured
# Optional policy overrides; defaults are 0.70 score and 0.05 separation:
export QLOO_TASTE_RESOLVER_MIN_SCORE=0.70
export QLOO_TASTE_RESOLVER_MIN_MARGIN=0.05
qloo doctor
qloo
```

Loopback HTTP resolver URLs are allowed for local development; non-loopback
endpoints require the exact trust value above before any concept or credential
is sent. `taste_resolver_url` may also be stored in the shared Qloo config, but
provider selection and remote trust remain explicit. Compatibility mode calls
`POST /v1/resolve`; `QLOO_TASTE_RESOLVER_TAG_ENDPOINT=structured` calls the
narrow `POST /v1/tags/resolve` contract and bypasses redundant natural-language
decomposition. A non-exact candidate proceeds only when it has a normalized
score at or above the configured threshold and enough separation from the
runner-up. Otherwise the workflow returns named choices before any material
Qloo call. Resolver outcomes are retained in a bounded 15-minute, session-local
memory cache keyed by contract, provider, mode, target type, and normalized
input. Cache hits and all semantic choices remain visible in provenance.
Resolver selection is never enabled by the mere presence of a URL and a
failure never silently falls back to native tag search.

The interactive harness adds confirmed-choice memory above that lookup cache.
A choice is keyed by normalized input, entity-versus-tag role, and target scope;
it is never reused across an incompatible tag target or entity type. Choices
survive session resume and branching, while `/matches` can inspect or forget
them. Several unresolved inputs from one workflow appear in one review dialog
and are applied in one retry. When one model response requests several Qloo
workflows, the harness runs them sequentially so their modal clarification
flows cannot conflict and an earlier choice can be reused by a later call.
Active workflow cards emit an elapsed-time heartbeat. Canceling a clarification
suppresses any remaining clarification dialogs for that turn while preserving
the unresolved results. Explicit location and naming terms also narrow entity
candidates before the harness asks.

`qloo_capabilities` returns the exact shared input/result schemas, active
resolution strategy, and source documentation for selected operations without
a network request. It identifies the harness, canonical Node MCP, and canonical
Python MCP adapters against the same generated manifest and checksum; the
legacy CLI MCP reports its lower compatibility level explicitly. During
integration work, `qloo_project_context` creates a bounded, non-secret summary
of top-level manifests and structural markers and reuses a private fingerprinted
cache beneath `$QLOO_HOME/projects`. It identifies source roots, existing HTTP
clients, data-modeling and configuration libraries, test frameworks, and safe
verification command names without reading source files or environment values.
Integration guidance then maps local domain fields to Qloo signals, filters,
and normalized outputs at the project's existing code boundary.

Inside chat, `/start` offers lightweight guided goals, `/journey` opens the
resumable capability walkthroughs above, and `/status` reports the active
profile, journey, artifact count, actual transport, model, workspace, context
use, and turn budget.
`/mode` opens a profile chooser, while `/mode explore`, `/mode integrate`,
`/mode plan`, or `/mode build` targets one directly. Every switch shows the
destination profile's authority and requires confirmation; the harness repeats
the authority after switching. `/usage` shows the current model's context-window
use as a raw token count and percentage, while `/exit` closes the harness
cleanly.
`/why` and `/sources` show the latest normalized query intent and provenance.
`/request` shows the latest safe underlying GET request preview, while
`/request prev`, `/request next`, `/request first`, `/request latest`, and
`/request <number>` navigate all previews recorded for the latest answer in
execution order. Navigation wraps at either end and is restored with the
answer's bounded workflow state. `/trace` shows the latest
20 events from the branch-local durable ledger; `/trace all` shows the latest
50, and categories such as `/trace approvals`, `/trace files`,
`/trace artifacts`, and `/trace verification` filter it. `/next` offers
operation-aware continuations.
`/doctor [network]` runs explicit diagnostics,
`/raw [page|next|prev]` shows paginated redacted detail from the latest live
normalized result, and `/retry` replays its recorded input once without model
reconstruction. `/matches` inspects or forgets user-confirmed entity and tag
choices. A DNS, connection, TLS, timeout, authentication, or resolver
connection failure automatically runs one bounded diagnostic per turn and
presents the most useful recovery step without dumping the full report.
`/artifacts` lists files produced by the private artifact writer. Goals,
clarifications, decisions, profile transitions, approvals, workflow outcomes,
file activity, artifacts, verification, and compaction are append-only hidden
session events. Prompts, result bodies, file contents, command text, and
credentials are excluded. Journey progress, generated-file metadata, typed
integration-plan IDs, and the ledger are restored from bounded structured
state; project mutation authority is never restored.
Qloo tool calls render the interpreted input, concise result,
operation-specific meaning guardrail, warnings, and provenance. In an
interactive terminal, material named ambiguities open a bounded candidate
picker and rerun the same workflow with the chosen Qloo ID. Raw result bodies
are not duplicated in the extra durable session-state entry.

## Diagnostics and local traces

`qloo doctor` performs static, offline-safe readiness checks. Use
`qloo doctor --network` for explicit bounded Qloo and selected taste-resolver
health probes, and add `--json` for stable machine-readable results. DNS,
connection, TLS, proxy, timeout, authentication, rate-limit, resolver-contract,
and upstream failures remain distinct.

Completed and failed Qloo workflows append privacy-minimized JSONL records
beneath `$QLOO_HOME/agent/logs`. Default records contain operation, transport,
correlation ID, duration, status, count, and safe error classification only;
they exclude prompts, tool arguments, result bodies, file paths, commands,
credentials, and error messages.

Separately, the interactive session stores versioned `qloo.ledger-event`
entries inside Pi's append-only session JSONL. These entries follow the active
session branch, do not participate in model context, and power `/trace` after
resume, fork, tree navigation, and compaction. They may contain bounded
project-relative paths and artifact metadata, but never prompt text, file
contents, command text, result bodies, or credentials.

Tests and alternate adapters can call `launchInteractiveHarness({ customTools
})` or `createPiHarnessRuntime({ customTools, ... })` with injected Pi tool
definitions. The explore policy allows those exact names and blocks all other
tool calls.

## Verification

```sh
npm run check
npm run eval
```

Tests cover shared executable contracts, typed network failures, Qloo path
isolation and permissions, every profile's authority, loop guards, bundled
resources, blocked sharing/trust, model/Qloo diagnostics, custom endpoint
trust, staged and timeout-safe updates, execution provenance, privacy-safe
traces, guided setup, fresh-session journeys, result continuations, safe request
inspection, automatic diagnostics, richer project context, runtime dependency
injection, and TTY behavior. The
deterministic eval suites grade the compound Philadelphia/young-women/DMX
recommendation journey plus ambiguity, missing-geography, no-credential, and
semantic-resolution paths. The tool-contract suite validates tools and
`qloo exec`; the canonical MCP suite validates all nine generated tools and
envelopes; the full-agent suite runs the same work through a real pinned Pi
`AgentSession`, Qloo
prompts, policy hooks, tool messages, and a scripted offline model. They emit
secret-free traces beneath `build/evals`.

## Preview Boundary

This internal preview now includes guided `explore`, `integrate`, `plan`, and
`build` profiles, but the latter two are policy profiles rather than operating
system containment. Unscripted live model-matrix grading, richer
operation-specific tables, redacted session export, live cross-transport MCP
grading, an optional build
sandbox, full compaction migration coverage, and fully atomic update rollback
remain roadmap work. `qloo mcp` is the canonical generated nine-workflow
adapter. `qloo api mcp` is retained as an explicitly non-canonical legacy
endpoint adapter, and the Python server retains unprefixed compatibility aliases
alongside its canonical `qloo_*` tools.

## Ownership

The Qloo agent platform team owns this application. Pi compatibility upgrades
must update the exact dependency pin and pass this package's checks before
release.
