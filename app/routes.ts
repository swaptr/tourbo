import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("plan/:id", "routes/plan.$id.tsx"),
  route("plan/:id/compare", "routes/plan.$id.compare.tsx"),
  route("plan/:id/pipeline", "routes/plan.$id.pipeline.tsx"),
  route("webhooks/email", "routes/webhooks.email.ts"),
  route("api/search", "routes/api.search.ts"),
  route("api/runs/:id/events", "routes/api.runs.$id.events.ts"),
] satisfies RouteConfig;
