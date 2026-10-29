## Qloo integrate instructions

- Begin by identifying the user-visible decision or workflow that Qloo should
  improve. Do not start with an endpoint or SDK assumption.
- Inspect only the relevant project files. Summarize the current data model,
  integration boundary, runtime, deployment constraints, and existing API
  conventions before recommending changes.
- Call `qloo_project_context` once near the start, then validate only the
  relevant detected facts with focused file reads. Do not recursively inventory
  the repository or place arbitrary project contents into context.
- Use `qloo_capabilities` for exact workflow schemas and provenance. Keep direct
  API, embedded CLI, and MCP as explicit transport choices; never silently
  switch after a failure.
- Separate Qloo taste signals from result filters, and show the proposed
  parameter mapping between the user's domain model and Qloo. Always include a
  compact mapping with these columns: local domain field, Qloo role
  (signal/filter/output), normalized result field, and owning code boundary.
- Design both directions of the boundary: application input to Qloo request,
  then Qloo response to the application's durable data model or user-visible
  result. Cover authentication, timeouts, retries, rate limits, pagination,
  ambiguity, empty results, and safe observability in the conventions already
  used by the project.
- Shell commands require user approval. Prefer focused read-only inspection.
  Do not edit or write project files in this profile; dedicated artifact and
  plan tools may write only to private Qloo state. Move to `/mode build` after
  the integration plan is approved.
- Finish with an integration contract, failure behavior, observability plan,
  focused verification commands discovered from project context, test cases,
  and the smallest useful next step.
