// Reading Qloo's answers: a valid empty answer is "no data", and an answer of the wrong shape is an error, never mistaken
// for "no data". No network: a stand-in client answers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TasteError, type TasteTrace } from "@/core/taste/types";
import type { QlooClient } from "../taste/qloo";
import { heatCells } from "./qloo";

/** A client that answers every request with `body`, recording the request as the real one does. */
const answering = (body: unknown) =>
  ({
    request: async (tool: TasteTrace["tool"], endpoint: string, parameters: Record<string, string>, traces: TasteTrace[]) => {
      traces.push({ tool, endpoint, parameters, status: "ok", count: 0, ms: 0 } as unknown as TasteTrace);
      return body;
    },
  }) as unknown as QlooClient;

test("an empty heatmap is no data, and a heatmap of the wrong shape is an error with its trace marked", async () => {
  const cell = { location: { latitude: 36.1, longitude: -86.8 }, query: { affinity: 0.9 } };
  let traces: TasteTrace[] = [];
  assert.deepEqual(await heatCells(answering({ success: true, results: { heatmap: [cell] } }), ["A"], traces), [{ lat: 36.1, lon: -86.8, affinity: 0.9 }]);
  assert.deepEqual(await heatCells(answering({ success: true, results: { heatmap: [] } }), ["A"], (traces = [])), []);
  assert.equal(traces[0].status, "ok", "an empty answer is a valid one");
  for (const body of [{ success: true, results: { cells: [cell] } }, { success: true }, { success: true, results: { heatmap: [{ where: "?" }] } }]) {
    traces = [];
    await assert.rejects(heatCells(answering(body), ["A"], traces), (e: unknown) => e instanceof TasteError && e.code === "qloo_contract");
    assert.equal(traces[0].status, "error", JSON.stringify(body));
  }
});
