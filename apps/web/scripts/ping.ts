import { closeDb } from "@tourbo/core/db/client.server.ts";
import { qlooGet } from "@tourbo/core/qloo/client.server.ts";

console.log(await qlooGet("/"));
await closeDb();
