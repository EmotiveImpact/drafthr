/**
 * A real drizzle instance over drizzle-orm/pg-proxy whose driver records every
 * statement and answers SELECT / RETURNING queries from canned rows, so the
 * marketplace handler tests check the SQL Postgres would actually receive.
 *
 * Canned rows are plain objects keyed by column name ("status") or, where two
 * joined tables share a column name, by "table.column".
 */
import { drizzle } from "drizzle-orm/pg-proxy";
import * as schema from "../../../src/db/schema.js";

export type Query = { sql: string; params: unknown[] };
type Responder = { match: RegExp; rows: Record<string, unknown>[] };

/** Column references in a select list or RETURNING clause, as [table, column]. */
function columnsOf(sql: string): [string | null, string][] {
  let list: string | null = null;
  const ret = sql.match(/ returning (.+)$/s);
  if (ret) list = ret[1];
  else {
    const sel = sql.match(/^select (.+?) from /s);
    if (sel) list = sel[1];
  }
  if (!list) return [];
  return list.split(", ").map((part) => {
    const qualified = part.match(/^"(\w+)"\."(\w+)"/);
    if (qualified) return [qualified[1], qualified[2]];
    const bare = part.match(/^"(\w+)"/);
    return [null, bare ? bare[1] : part];
  });
}

export function createFakeDb() {
  const queries: Query[] = [];
  const responders: Responder[] = [];

  const db = drizzle(
    async (sql, params) => {
      queries.push({ sql, params });
      const responder = responders.find((r) => r.match.test(sql));
      if (!responder) return { rows: [] };
      const cols = columnsOf(sql);
      const rows = responder.rows.map((obj) =>
        cols.map(([table, col]) => {
          if (table && `${table}.${col}` in obj) return obj[`${table}.${col}`];
          return col in obj ? obj[col] : null;
        }),
      );
      return { rows };
    },
    { schema },
  );

  return {
    db,
    queries,
    /** Answer every statement matching `match` with `rows`. First match wins. */
    respond(match: RegExp, rows: Record<string, unknown>[]) {
      responders.push({ match, rows });
    },
    reset() {
      queries.length = 0;
      responders.length = 0;
    },
    /** Statements whose SQL matches. */
    find(match: RegExp): Query[] {
      return queries.filter((q) => match.test(q.sql));
    },
  };
}

/** A consultant_bookings row with sensible defaults (snake_case columns). */
export function bookingRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    tenant_id: "22222222-2222-4222-8222-222222222222",
    requester_user_id: "hr-user",
    consultant_user_id: "consultant-user",
    consultant_profile_id: "33333333-3333-4333-8333-333333333333",
    draft_id: "44444444-4444-4444-8444-444444444444",
    matter_title: "Grievance outcome",
    message: null,
    status: "accepted",
    response_note: null,
    delivery_note: null,
    rating: null,
    price_amount: 15000,
    price_currency: "gbp",
    booked_at: new Date("2026-10-01T00:00:00Z"),
    expected_delivery_at: null,
    accepted_at: null,
    delivered_at: null,
    completed_at: null,
    share_token: null,
    share_token_expires_at: null,
    messages: [],
    ...over,
  };
}
