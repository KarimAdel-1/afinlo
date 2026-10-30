// The Qloo client: its cache only ever saves quota. A cache that fails (the database is down, say) is skipped, so
// Qloo's answer still comes back and the failure is never reported as Qloo's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { QlooClient } from "./qloo";

test("a cache that can't be read or written is skipped: Qloo still answers", async () => {
  let asked = 0;
  const broken = { get: async () => Promise.reject(new Error("role \"USER\" does not exist")), set: async () => Promise.reject(new Error("still down")) };
  const client = new QlooClient({
    key: "fixture-only",
    cache: broken,
    wait: async () => {},
    fetcher: async () => {
      asked++;
      return Response.json({ results: [{ entity_id: "AAAAAAAA-0000-4000-8000-000000000001", name: "Fixture Star" }] });
    },
  });
  const quiet = console.error;
  console.error = () => {};
  try {
    const traces: Parameters<QlooClient["request"]>[3] = [];
    const body = (await client.request("qloo_search", "/search", { query: "Fixture" }, traces)) as { results: { name: string }[] };
    assert.equal(body.results[0].name, "Fixture Star");
    assert.equal(asked, 1);
    assert.equal(traces[0].status, "ok");
  } finally {
    console.error = quiet;
  }
});
