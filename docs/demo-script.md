# Demo Script — Sentinel for Safe Execution (90 seconds)

## 30-second version

> "This is Sentinel — an execution safety system. When you want to swap tokens, Sentinel intercepts the route BEFORE it executes. It runs a risk assessment: comparing quoted vs expected output, checking failure rates, and analyzing pool risk. In this demo, route-b gets flagged as HIGH RISK with a score of 84 — Sentinel REJECTS it and suggests route-a instead. Without Sentinel, you'd lose 20% of your tokens. With Sentinel, you're protected."

## 90-second version

> "In DeFi, routing errors can cost users significant value. A bad route might quote $800 when it should be $1000, but the swap still goes through.
>
> Sentinel is an execution safety layer that sits between the route selection and the actual swap. It does three things:
>
> First, the **Quote Service** returns candidate routes. Here we have three: route-a is safe, route-b is risky, and route-c is moderate with a fallback option.
>
> Second, the **Safety Agent** evaluates each route using three rules: quote deviation (is the price too far from expected?), failure risk (has this pool failed often?), and pool risk (is the pool inherently unstable?). The agent outputs a 0-100 risk score.
>
> Third, the **Vault Contract** acts as the final gate. Even if the agent says ALLOW, the contract enforces hard limits: max loss, deadline, and pause functionality.
>
> Watch: I select route-b. The agent gives it a score of 84 — REJECT. It suggests falling back to route-a. Without Sentinel, I'd swap at a 20% loss. With Sentinel, I'm protected.
>
> The system outputs a full event timeline: route evaluated → decision made → execution attempted → result. Every step is auditable.
>
> This is our Week 3 MVP — a minimal, stable, demo-able execution safety loop."

## Demo Flow

1. Open frontend → see token input panel
2. Click "Get Quote" → 3 routes displayed with color-coded risk dots
3. Select route-b (red dot) → click "Run With Safety Agent"
4. Safety Panel shows: REJECT, risk score 84/100, reason text
5. Result Panel shows: Execution blocked by chain gate
6. Timeline shows full event chain
7. Switch to Safe Mode → system auto-fallback to route-a
8. Click "Run" → ALLOW, success execution shown

## Key talking points for judges

- **We don't optimize for profit — we optimize for safety**
- **Two-layer protection**: Agent (soft rules) + Contract (hard constraints)
- **Fully auditable event timeline**
- **Deterministic decisions — no black-box AI**
