import { z } from "zod";

// Client-safe project types (the DB code lives in projects.server.ts).
export const ItemKind = z.enum(["note", "todo", "setlist", "brief"]);
export type ItemKind = z.infer<typeof ItemKind>;

export type Project = { id: string; title: string; artist?: string; kind?: string; createdAt: string };
export type ProjectItem = { id: string; kind: ItemKind; city?: string; text: string; done: boolean; createdAt: string };
export type ProjectRun = { id: string; artistName: string; status: string; createdAt: string; stops: number; cities: string[] };
export type ProjectDetail = Project & { items: ProjectItem[]; runs: ProjectRun[] };
