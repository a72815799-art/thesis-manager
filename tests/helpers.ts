import { db } from '../src/db/db';
import { CHILD_TABLES } from '../src/db/db';

export async function resetDb() {
  await db.projects.clear();
  for (const t of CHILD_TABLES) await db[t].clear();
}
