import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("plan/:id", "routes/plan.$id.tsx"),
  route("api/search", "routes/api.search.ts"),
  route("api/runs/:id/events", "routes/api.runs.$id.events.ts"),
] satisfies RouteConfig;
