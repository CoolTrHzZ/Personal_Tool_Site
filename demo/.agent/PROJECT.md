# Project Runtime Contract

Complete commands for this project. Keep secrets in environment variables; do
not put secret values, private hosts, or tokens in this file.

## Project

Name: sol-luna-auth-demo

Description: Minimal Node.js authentication helper used to exercise Sol + Luna FULL_DELIVERY.

## Technology Stack

Backend: Node.js ES modules

Frontend: N/A

Database: N/A

Other: Node.js built-in test runner

## Working Directory

```text
demo/
```

## Environment Variable Names

```text
None
```

## Preflight

```bash
node --version
npm --version
```

## Install

### Backend

```bash
npm install
```

### Frontend

```bash
# N/A: no frontend
```

## Build

```bash
# N/A: interpreted JavaScript with no build step
```

## Backend Start

```bash
npm start
```

Expected: process starts successfully with no fatal startup errors.

## Frontend Start

```bash
# N/A: no frontend
```

## Health

```bash
# N/A: the demo has no long-running HTTP health endpoint
```

## Expected Ports

```text
N/A: no long-running service
```

## Startup Timeout

```text
30 seconds
```

## Unit Test

```bash
npm test
```

## Integration Test

```bash
npm test
```

## Regression Test

```bash
npm test
```

## Database Migration

```bash
# N/A: no database
```

## Smoke Test

```bash
npm test
```

## External Dependencies

```text
None
```

## Cleanup

```bash
# N/A: tests do not start persistent services
```

## Runtime Policy

Local runtime validation: REQUIRED

Test environment deployment: DISABLED_BY_DEFAULT

Production deployment: NEVER_AUTOMATIC

## Git Policy

Auto commit after acceptance gate: false

Auto push: false
