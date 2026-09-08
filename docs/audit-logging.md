# Audit Logging

Lumen provides a structured audit logging system designed for incident response, compliance, and dispute resolution in custodial & co-signing environments.

---

## Overview

Every high-value server action (wallet creation, transaction co-signing, fee-bump sponsorship, and policy mutations) emits a structured audit log event. Each event contains:

- `timestamp`: ISO-8601 timestamp string
- `event`: Name of the event (e.g. `wallet.created`, `cosign.approved`)
- `requestId`: Unique correlation identifier stamped per HTTP request (via `X-Request-Id` header)

---

## Interface & Implementations

Audit logging is abstracted via the `AuditLogger` interface:

```ts
export interface AuditLogger {
  log(event: AuditEvent): void | Promise<void>;
}
```

### Implementations

- **`ConsoleAuditLogger`** (Default): Outputs JSON-lines to stdout (12-factor application compatible).
- **`NoopAuditLogger`**: In-memory logger used for unit and integration tests.

---

## Event Schemas

### 1. `wallet.created`
Emitted when a new sponsored 2-of-2 multisig wallet is created.
```json
{
  "timestamp": "2026-09-08T13:00:00.000Z",
  "event": "wallet.created",
  "address": "G...",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### 2. `cosign.approved`
Emitted when a transaction co-sign request passes policy evaluation and is signed by the server.
```json
{
  "timestamp": "2026-09-08T13:00:00.000Z",
  "event": "cosign.approved",
  "walletId": "G...",
  "txHash": "abc123...",
  "policyId": "uuid",
  "signerPublicKey": "G...",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "sourceIp": "127.0.0.1"
}
```

### 3. `cosign.rejected`
Emitted when a transaction co-sign request is denied by policy evaluation.
```json
{
  "timestamp": "2026-09-08T13:00:00.000Z",
  "event": "cosign.rejected",
  "walletId": "G...",
  "txHash": "abc123...",
  "signerPublicKey": "G...",
  "reason": "Transaction amount 150 exceeds per-tx limit 100",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "sourceIp": "127.0.0.1"
}
```

### 4. `fee_bump.submitted`
Emitted when a fee-bump transaction is wrapped and submitted to the Stellar network.
```json
{
  "timestamp": "2026-09-08T13:00:00.000Z",
  "event": "fee_bump.submitted",
  "innerHash": "def456...",
  "feeBumpHash": "def456...",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### 5. `fee_bump.failed`
Emitted when fee-bump wrapping or network submission fails.
```json
{
  "timestamp": "2026-09-08T13:00:00.000Z",
  "event": "fee_bump.failed",
  "innerHash": "def456...",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "error": "Fee-bump submission failed"
}
```

### 6. `policy.created` / `policy.updated` / `policy.deleted`
Emitted when a policy rule set is added or updated for a wallet.
```json
{
  "timestamp": "2026-09-08T13:00:00.000Z",
  "event": "policy.created",
  "policyId": "uuid",
  "walletId": "G...",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## Request Correlation (`X-Request-Id`)

Every request processed by the server is stamped with an `X-Request-Id` header (either passed in by the client or generated as a UUID v4). This header is set on the HTTP response and attached to all log events emitted during the lifecycle of that request.
