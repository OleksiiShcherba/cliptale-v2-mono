import mysql from 'mysql2/promise';

import { config } from '@/config.js';

/** Singleton mysql2 connection pool for the media-worker. */
export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
  waitForConnections: true,
  connectionLimit: 5,
});
