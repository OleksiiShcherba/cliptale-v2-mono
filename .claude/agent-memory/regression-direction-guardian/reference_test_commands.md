---
name: Reliable test commands for the three workspaces
description: Docker Compose stack + direct Vitest invocation paths confirmed working 2026-04-19
type: reference
---

The docker compose stack (`docker compose ps`) must show `api`, `db`, `redis`, `web-editor` as Up before API integration tests run.

**apps/api** (unit + integration — integration tests require live db + redis):
```bash
cd /home/oleksii/Work/ClipTale/cliptale.com-v2/apps/api && \
  APP_DB_PASSWORD=cliptale ./node_modules/.bin/vitest run --reporter=default
```
Runtime ~9s. 84 files / 865 tests expected total.

**apps/web-editor** (unit only, no infra needed):
```bash
cd /home/oleksii/Work/ClipTale/cliptale.com-v2/apps/web-editor && \
  ./node_modules/.bin/vitest run --reporter=default
```
Runtime ~31s. 178 files / 2006 tests expected total. All green as of 2026-04-19.

**apps/media-worker** (unit only, no infra needed):
```bash
cd /home/oleksii/Work/ClipTale/cliptale.com-v2/apps/media-worker && \
  ./node_modules/.bin/vitest run --reporter=default
```
Runtime ~2.4s. 14 files / 136 tests expected total. All green as of 2026-04-19.

**Inspect live DB schema** (to detect migration drift):
```bash
docker compose exec -T db mysql -u cliptale -pcliptale cliptale -e "DESCRIBE <table>;"
docker compose exec -T db mysql -u cliptale -pcliptale cliptale -e "SHOW TABLES;"
```

**Why:** The output of `vitest run` is long (~500+ lines); when using Bash tool it often truncates to 120 lines. Pipe to a file instead: `> /tmp/api-full-test.log` so the full list of failing files is preserved for grep-based triage.
