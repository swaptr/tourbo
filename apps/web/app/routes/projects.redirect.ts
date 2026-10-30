import { redirect } from "react-router";

import { getProject } from "@tourbo/core/projects/projects.server.ts";
import type { Route } from "./+types/projects.redirect";

// Projects are retired (PLAN Q21): a project's notes and to-dos live on its tour now. Old links
// land on the tour (the newest one in the project) or the workspace.
export async function loader({ params }: Route.LoaderArgs) {
  const run = params.id ? (await getProject(params.id).catch(() => undefined))?.runs[0] : undefined;
  return redirect(run ? `/plan/${run.id}` : "/work", 301);
}
