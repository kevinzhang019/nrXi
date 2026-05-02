#!/usr/bin/env node
// Quick read-only inspector for the snapshot hash. Prints field-keys + count.
// Used during migration to confirm prune behaviour and zombie state.
//
// Usage: npx tsx bin/inspect-snapshot.ts

import "../services/lib/load-env";
import { redis } from "../lib/cache/redis";
import { k } from "../lib/cache/keys";

async function main() {
  const r = redis();
  const fields = await r.hkeys(k.snapshot());
  console.log(`snapshot fields: ${fields.length}`);
  for (const f of fields) console.log(`  ${f}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
