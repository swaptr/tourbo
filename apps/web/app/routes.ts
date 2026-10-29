import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("start", "routes/start.tsx"),
  route("connect", "routes/connect.tsx"),
  route("explore", "routes/explore.tsx"),
  route("plan/:id", "routes/plan.$id.tsx"),
  route("plan/:id/compare", "routes/plan.$id.compare.tsx"),
  route("plan/:id/prep", "routes/plan.$id.prep.tsx"),
  route("plan/:id/pipeline", "routes/plan.$id.pipeline.tsx"),
  route("plan/:id/live", "routes/plan.$id.live.tsx"),
  route("webhooks/email", "routes/webhooks.email.ts"),
  route("api/search", "routes/api.search.ts"),
  route("api/resolve", "routes/api.resolve.ts"),
  route("api/runs/:id/events", "routes/api.runs.$id.events.ts"),
] satisfies RouteConfig;
