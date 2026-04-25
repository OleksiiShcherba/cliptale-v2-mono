import mysql from 'mysql2/promise';

import { config } from '../config.js';

/** The only file in apps/api that creates DB connections. Import `pool` everywhere else. */
export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
