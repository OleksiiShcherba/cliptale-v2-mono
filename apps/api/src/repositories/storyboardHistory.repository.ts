import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';

/**
 * Transaction-scoped history insert used by the plan-apply flow.
 *
 * The server-side safety snapshot is stamped origin='checkpoint' with
 * preview_kind='minimap' (task T5 default, storyboard-autosave-checkpoints):
 * the History panel lists only origin=checkpoint rows (AC-08), so a 'legacy'
 * stamp would make these pre-plan-apply restore points invisible. No layout
 * screenshot exists server-side — hence the minimap preview kind.
 */
export async function insertHistoryAndPruneInTx(
  conn: PoolConnection,
  draftId: string,
  snapshot: unknown,
  keepCount: number,
): Promise<number> {
  const [result] = await conn.execute<ResultSetHeader>(
    `INSERT INTO storyboard_history (draft_id, snapshot, origin, preview_kind)
     VALUES (?, ?, 'checkpoint', 'minimap')`,
    [draftId, JSON.stringify(snapshot)],
  );

  await conn.query(
    `DELETE FROM storyboard_history
     WHERE draft_id = ?
       AND id NOT IN (
         SELECT id FROM (
           SELECT id FROM storyboard_history
           WHERE draft_id = ?
           ORDER BY id DESC
           LIMIT ?
         ) AS kept
       )`,
    [draftId, draftId, keepCount],
  );

  return result.insertId;
}
