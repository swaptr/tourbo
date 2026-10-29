import postgres from "postgres";

import { getEnv } from "../env.server.ts";
import { SCHEMA } from "./schema.server.ts";

let client: postgres.Sql | undefined;
let ready: Promise<void> | undefined;

// Lazy pool; schema is applied once per process before the first query.
export async function db(): Promise<postgres.Sql> {
  client ??= postgres(getEnv().DATABASE_URL, {
    max: 5,
    idle_timeout: 30,
    onnotice: () => {},
  });
  ready ??= client.unsafe(SCHEMA).then(
    () => undefined,
    (error) => {
      ready = undefined;
      throw error;
    },
  );
  await ready;
  return client;
}

export async function closeDb() {
  await client?.end({ timeout: 5 });
  client = undefined;
  ready = undefined;
}
