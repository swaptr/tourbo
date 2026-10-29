import { closeDb } from "../server/core/db/client.server.ts";
import { qlooGet } from "../server/core/qloo/client.server.ts";

console.log(await qlooGet("/"));
await closeDb();
