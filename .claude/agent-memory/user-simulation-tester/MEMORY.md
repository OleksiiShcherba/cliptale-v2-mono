# Memory Index

- [Playwright MCP not attached in /loop runs](project_playwright_mcp_unavailable.md) — recurring blocker (2x confirmed 2026-04-18/19); verify mcp__playwright__* in-session before proceeding; block and report if absent, do not curl-fallback
- [Docs path mismatch in agent spec](project_docs_path_mismatch.md) — real file is docs/general_idea.md (singular); general_ides/general_ideas/general_user_review referenced in spec do not exist
- [Docker stack layout](project_docker_stack.md) — six services, web-editor:5173, api:3001, redis host port 6380; safe to docker-ps directly before delegating to senior-developer
