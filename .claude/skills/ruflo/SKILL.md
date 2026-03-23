---
name: ruflo
description: Ruflo CLI skill for initializing, configuring, and managing Ruflo (AI agent orchestration platform). Covers init wizard, swarm setup, memory, hooks, MCP, and publishing.
version: 3.5.0
category: platform
tags:
  - ruflo
  - claude-flow
  - init
  - swarm
  - agents
  - mcp
  - orchestration
author: Ruflo
---

# Ruflo Skill

## Overview

Ruflo is an AI agent orchestration platform (formerly Claude Flow). This skill covers common Ruflo CLI workflows: initialization, swarm coordination, memory, hooks, and publishing.

---

## Initialization

```bash
# Interactive wizard (both forms work)
npx ruflo@latest init wizard
npx ruflo@latest init --wizard

# Quick presets
npx ruflo@latest init              # default
npx ruflo@latest init --minimal    # core only
npx ruflo@latest init --full       # all components
npx ruflo@latest init --force      # overwrite existing

# Targeted init
npx ruflo@latest init --only-claude   # .claude/ only
npx ruflo@latest init --skip-claude   # runtime only
npx ruflo@latest init --with-embeddings  # include ONNX embeddings

# Upgrade existing install (preserves data)
npx ruflo@latest init upgrade
npx ruflo@latest init upgrade --settings  # also merge new settings
```

---

## Swarm Coordination

```bash
# Initialize a swarm
npx ruflo@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized

# Check swarm status
npx ruflo@latest swarm status
```

**Topologies:** `hierarchical` (default, anti-drift), `mesh`, `hierarchical-mesh`, `adaptive`

---

## Agent Management

```bash
npx ruflo@latest agent spawn -t coder --name my-coder
npx ruflo@latest agent list
npx ruflo@latest agent status --name my-coder
npx ruflo@latest agent stop --name my-coder
```

---

## Memory

```bash
# Store
npx ruflo@latest memory store --key "my-key" --value "my-value" --namespace patterns

# Search (semantic/HNSW)
npx ruflo@latest memory search --query "authentication patterns"

# Retrieve
npx ruflo@latest memory retrieve --key "my-key" --namespace patterns

# List
npx ruflo@latest memory list --namespace patterns
```

---

## Hooks

```bash
npx ruflo@latest hooks pre-task --description "task description"
npx ruflo@latest hooks post-task --task-id "id" --success true
npx ruflo@latest hooks session-start --session-id "id"
npx ruflo@latest hooks session-end --export-metrics true
npx ruflo@latest hooks route --task "task description"
npx ruflo@latest hooks worker list
npx ruflo@latest hooks worker dispatch --trigger audit
```

---

## MCP Setup

```bash
# Add ruflo as an MCP server in Claude Code
claude mcp add ruflo -- npx -y ruflo@latest
```

---

## Daemon & Diagnostics

```bash
npx ruflo@latest daemon start
npx ruflo@latest daemon status
npx ruflo@latest doctor --fix
```

---

## Publishing (all three packages required)

```bash
# 1. @claude-flow/cli
cd v3/@claude-flow/cli
npm version 3.x.x --no-git-tag-version && npm run build && npm publish --tag alpha
npm dist-tag add @claude-flow/cli@3.x.x latest

# 2. claude-flow umbrella
cd /path/to/repo
npm version 3.x.x --no-git-tag-version && npm publish --tag v3alpha
npm dist-tag add claude-flow@3.x.x latest
npm dist-tag add claude-flow@3.x.x alpha

# 3. ruflo umbrella
cd ruflo
npm version 3.x.x --no-git-tag-version && npm publish --tag alpha
npm dist-tag add ruflo@3.x.x latest
```

---

## Key Directories

| Path | Purpose |
|------|---------|
| `.claude/` | Claude Code integration (settings, skills, agents) |
| `.claude-flow/` | Ruflo V3 runtime config |
| `v3/@claude-flow/cli/` | CLI source (TypeScript) |
| `ruflo/` | ruflo npm package (thin wrapper) |
| `ruflo/bin/ruflo.js` | CLI entry point |
