import { FolderOpen } from "lucide-react";
import { Link, useFetcher } from "react-router";
import { ErrorLine } from "~/components/state";
import { Button } from "~/components/ui/button";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";

// "Add to project" on a plan: pick an existing project or make one named after the act.
export function ProjectPicker({ current, projects }: { current?: { id: string; title: string }; projects: { id: string; title: string }[] }) {
  const f = useFetcher<{ error?: string }>();
  if (current)
    return (
      <Button variant="outline" size="sm" nativeButton={false} render={<Link to={`/projects/${current.id}`} />}>
        <FolderOpen /> {current.title}
      </Button>
    );
  return (
    <f.Form method="post" className="flex items-center gap-1">
      <input type="hidden" name="intent" value="project" />
      <NativeSelect
        size="sm"
        name="project"
        aria-label="Add to project"
        defaultValue=""
        disabled={f.state !== "idle"}
        onChange={(e) => e.currentTarget.value && f.submit(e.currentTarget.form)}
      >
        <NativeSelectOption value="" disabled>
          Add to project…
        </NativeSelectOption>
        <NativeSelectOption value="new">New project for this tour</NativeSelectOption>
        {projects.map((p) => (
          <NativeSelectOption key={p.id} value={p.id}>
            {p.title}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <span className="text-xs"><ErrorLine message={f.data?.error} /></span>
    </f.Form>
  );
}
