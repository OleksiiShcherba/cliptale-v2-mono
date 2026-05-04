---
name: sql-pro
description: Provide SQL expertise for schema design, query optimization, migrations, analytics, indexes, and cloud-native database work.
---

# SQL Pro

Use this skill for database and SQL-heavy work.

Workflow:
1. Identify the database engine, ORM/query layer, migration system, and runtime constraints.
2. Inspect existing schemas, migrations, repositories, and query patterns.
3. Prefer parameterized queries, explicit transactions, and indexes justified by access patterns.
4. For performance work, reason from query shape and available indexes; use `EXPLAIN` only when a database is available and safe to query.
5. For migrations, preserve backwards compatibility where deployed services may run mixed versions.
6. Add tests around data contracts and edge cases when feasible.

Escalate before destructive migrations or data-loss operations.

