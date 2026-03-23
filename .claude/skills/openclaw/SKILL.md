---
name: openclaw
description: Openclaw CLI skill for installation, onboarding, and daemon management.
version: 1.0.0
category: tooling
tags:
  - openclaw
  - daemon
  - onboarding
  - cli
author: Ruflo
---

# Openclaw Skill

## Installation

```bash
npm install -g openclaw@latest
```

## Onboarding

Run after install to set up openclaw and install the background daemon:

```bash
openclaw onboard --install-daemon
```

## Common Commands

```bash
# Install / update
npm install -g openclaw@latest

# Full onboarding with daemon
openclaw onboard --install-daemon

# Onboard without daemon
openclaw onboard
```

## Notes

- Requires Node.js / npm
- `--install-daemon` sets up a background service during onboarding
