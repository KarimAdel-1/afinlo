// Tests that use Postgres share the database in .env.local but never its data: every browser they use starts with
// "test-", every plan is the fixture act's, and all of it is deleted when the test file is done.
import { existsSync } from "node:fs";
import { after } from "node:test";
import { closeDb, db } from "@/lib/db";

export const FIXTURE_ACT_ID = "AAAAAAAA-0000-4000-8000-000000000001";

/** A browser of the test's own. */
export const testBrowser = () => `test-${Math.random().toString(36).slice(2)}`;

export function testDatabase() {
  if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");
  after(async () => {
    for (const table of ["tour_saved", "tour_statuses", "tour_acts"]) await db().prepare(`DELETE FROM ${table} WHERE visitor LIKE 'test-%'`).run();
    await db().prepare("DELETE FROM tour_plans WHERE act_id = ?").run(FIXTURE_ACT_ID);
    await db().prepare("DELETE FROM tour_matches WHERE request_key LIKE 'test-%'").run();
    await closeDb();
  });
}
