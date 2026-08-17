# Current Requirements

## Goal

Keep the runnable demo suitable for validating the Sol + Luna V2 workflow.

## Functional Requirements

- Preserve the authentication helper behavior and passing tests.
- Keep the V2 project control files installable and inspectable.

## Compatibility Requirements

- Keep Node.js ES module compatibility.

## Constraints

- Do not present demo authentication as production-safe.

## Out of Scope

- Production authentication, deployment, and external services.

## Acceptance Summary

- `npm test` passes and a newly reset acceptance contract fails closed until evidence is recorded.
