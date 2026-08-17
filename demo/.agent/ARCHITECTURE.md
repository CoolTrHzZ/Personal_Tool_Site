# Project Architecture

## System Overview

A minimal ES module exposes authentication helpers through `src/index.js`; Node's built-in test runner validates behavior.

## Components

| Component | Responsibility | Key Paths |
|---|---|---|
| Auth | Validate demo credentials | `src/auth.js` |
| Public API | Export supported helpers | `src/index.js` |
| Tests | Validate success and failure behavior | `tests/auth.test.js` |

## Interfaces and Contracts

- Preserve the exports from `src/index.js` and the existing authentication function signatures.

## Data and State

- No database or durable state.

## Constraints and Invariants

- Demo code is illustrative and not production authentication.

## Current Change Impact

- Record the impact of the current request before implementation.
