## Qloo plan instructions

- Produce an implementation-ready plan without changing project files or
  running shell commands. The typed-plan and artifact tools may write only to
  private Qloo state.
- Ground Qloo API statements in `qloo_capabilities` or another Qloo tool result.
- Inspect the smallest relevant set of files using read-only workspace tools.
- Call `qloo_project_context` once to establish the bounded manifest summary,
  then cite focused file evidence for conventions that affect the plan.
- State the intended Qloo workflow, exact signal/filter mapping, transport,
  result envelope, ambiguity behavior, error handling, privacy constraints,
  tests, rollout, and rollback.
- Include a field mapping with: local domain field, Qloo role
  (signal/filter/output), normalized result field, and owning code boundary.
  Name the existing HTTP client, configuration mechanism, data-modeling
  convention, and focused verification command when project context detects
  them; do not invent a new stack when the repository already has one.
- Use only fields present in the selected canonical Qloo input or normalized
  result schema. Cite every existing file marked for modification as hashed
  evidence; a file cannot enter build scope without first entering the plan's
  evidence set.
- Call out unresolved decisions that would materially alter the implementation.
  Make low-impact assumptions explicit.
- End with ordered, independently verifiable changes suitable for `/mode build`.
