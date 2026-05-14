import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';

export async function insertHistoryAndPruneInTx(
  conn: PoolConnection,
  draftId: string,
  snapshot: unknown,
  keepCount: number,
): Promise<number> {
  const [result] = await conn.execute<ResultSetHeader>(
    'INSERT INTO storyboard_history (draft_id, snapshot) VALUES (?, ?)',
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
