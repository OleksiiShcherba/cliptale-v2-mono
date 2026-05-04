---
name: arch-standards
description: Generate or update architecture and code standards documentation for an app idea, stack, or existing project. Use for architecture docs, coding standards, folder structure, developer guidelines, and business-logic placement rules.
---

# Architecture Standards

Use this skill to create precise architecture guidance for agents and developers.

Workflow:
1. Gather the app idea, stack, product constraints, deployment context, and target repo structure.
2. Inspect existing docs and code if the project already exists.
3. Write explicit rules with allowed locations, forbidden locations, examples, and validation commands.
4. Cover layers: routing, UI, services, domain logic, repositories, schemas, tests, configuration, security, and observability as applicable.
5. Prefer imperative, testable language over vague principles.
6. Save to the requested docs path, usually `docs/architecture-rules.md`, only when the user wants a file written.

Good rule shape:
- Rule statement
- Why it exists
- Correct example
- Forbidden example
- How to verify

