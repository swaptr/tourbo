import { FolderOpen } from "lucide-react";
import { Link, useFetcher } from "react-router";

// "Add to project" on a plan: pick an existing project or make one named after the act.
export function ProjectPicker({ current, projects }: { current?: { id: string; title: string }; projects: { id: string; title: string }[] }) {
  const f = useFetcher<{ error?: string }>();
  if (current)
    return (
      <Link to={`/projects/${current.id}`} className="inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-sm hover:bg-muted">
        <FolderOpen className="size-4" /> {current.title}
      </Link>
    );
  return (
    <f.Form method="post" className="flex items-center gap-1">
      <input type="hidden" name="intent" value="project" />
      <select
        name="project"
        aria-label="Add to project"
        defaultValue=""
        disabled={f.state !== "idle"}
        onChange={(e) => e.currentTarget.value && f.submit(e.currentTarget.form)}
        className="h-7 rounded-lg border bg-transparent px-2 text-sm"
      >
        <option value="" disabled>
          Add to project…
        </option>
        <option value="new">New project for this tour</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
      {f.data?.error && <span className="text-xs text-destructive">{f.data.error}</span>}
    </f.Form>
  );
}
