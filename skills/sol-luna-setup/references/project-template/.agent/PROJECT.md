# Project Runtime Contract

Complete commands for this project. Keep secrets in environment variables; do
not put secret values, private hosts, or tokens in this file.

## Project

Name: TBD

Description: TBD

## Technology Stack

Backend: TBD

Frontend: TBD

Database: TBD

Other: TBD

## Working Directory

```text
# project root or service working directories
```

## Environment Variable Names

```text
# NAME_OF_REQUIRED_VARIABLE
```

## Preflight

```bash
# version, service, or environment checks
```

## Install

### Backend

```bash
# project backend dependency command
```

### Frontend

```bash
# project frontend dependency command
```

## Build

```bash
# project build command
```

## Backend Start

```bash
# backend start command
```

Expected: process starts successfully with no fatal startup errors.

## Frontend Start

```bash
# frontend start command
```

## Health

```bash
# health check command
```

## Expected Ports

```text
# service: port, or N/A with a reason
```

## Startup Timeout

```text
# seconds
```

## Unit Test

```bash
# project unit tests
```

## Integration Test

```bash
# project integration tests
```

## Regression Test

```bash
# project regression tests
```

## Database Migration

```bash
# migration command, or N/A with a reason
```

## Smoke Test

```bash
# primary workflow smoke test
```

## External Dependencies

```text
# service names and environment variable names only
```

## Cleanup

```bash
# stop temporary services and remove temporary data
```

## Runtime Policy

Local runtime validation: REQUIRED

Test environment deployment: DISABLED_BY_DEFAULT

Production deployment: NEVER_AUTOMATIC

## Git Policy

Auto commit after acceptance gate: false

Auto push: false
