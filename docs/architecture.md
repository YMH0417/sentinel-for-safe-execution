# Sentinel for Safe Execution — System Architecture

## Overview

A minimal Execution Safety MVP that intercepts swap routes before they execute, evaluates risk via a rule-based agent, and gates execution through a smart contract.

## System Flow

```
User (Frontend)
    ↓ [GET /api/quote]
Backend (Route Service)
    ↓ [routes.json]
    ↓ [POST /api/evaluate]
    ↓ [Agent Service]
Safety Agent (Rule Engine)
    ↓ [Decision: ALLOW/REJECT/FALLBACK]
    ↓ [POST /api/execute]
    ↓ [VaultService]
Contract (VaultExecution.sol on Anvil)
    ↓ [executeRoute() gate check]
    ↓ [Events: VaultExecuted / VaultRejected]
```

## Module Boundaries

### Frontend (React + Vite)
- Single-page Demo App
- Consumes 4 backend APIs
- Displays: Input → Routes → Agent Decision → Result → Timeline
- No direct contract interaction (all via backend proxy)

### Backend (Express)
- **Quote Service**: Reads shared/demo-data/routes.json
- **Agent Service**: Implements risk scoring rules (quote deviation, failure risk, pool risk)
- **Vault Service**: Calls contract executeRoute() via cast
- **Event Service**: In-memory event log with timeline API

### Contracts (Foundry)
- **VaultExecution.sol**: Chain-side gate enforcement
  - Hard constraints: paused, maxLossBps, deadline
  - Accepts agent's riskScore as input (agent is the real decision maker)
  - Emits VaultExecuted / VaultRejected / VaultPaused events

### Shared
- **types/**: Route, Decision, Event TypeScript interfaces
- **demo-data/routes.json**: 3 fixed mock routes for demo
- **config/risk-config.json**: Default thresholds, 3 profiles

## Key Design Decisions

1. **Agent is the decision maker, contract is the gate** — Agent does the risk math, contract enforces hard limits
2. **All flows through backend** — Frontend never talks to contract directly, simplifies Week 3 MVP
3. **Deterministic rules, not LLM** — Rule-based scoring ensures reproducible demo
4. **In-memory events** — No database, events stored in backend service memory
