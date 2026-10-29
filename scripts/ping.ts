import { qlooGet } from "../server/core/qloo/client.server.ts";

console.log(await qlooGet("/"));
