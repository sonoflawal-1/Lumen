# Secret Key Lifecycle & Memory Security Guide

This document outlines key lifecycle management, in-memory reference handling, and disposal conventions within `@lumen/core` and `@lumen/web-sdk`.

## Overview

In JavaScript engines (V8, JavaScriptCore), native Ed25519 secret keys reside in standard JS heap buffers. Because JavaScript runtimes do not expose direct OS-level memory locking (`mlock`) or secure string zeroization, security relies on strict memory lifecycle hygiene:

1. **Short-Lived Key References**: Secret keys (`Keypair`) must only be retained in memory for as long as necessary.
2. **Explicit Disposal**: Call `.dispose()` on `Wallet` or `LumenClient` instances as soon as key operations complete.
3. **No Key Leaks**: Secret keys are never logged, never included in error messages, and never passed through serialisation layers.

## Key Disposal Patterns

### 1. Disposing Individual Wallets

Call `wallet.dispose()` or `client.disposeWallet(walletId)` to zero out internal references to the `Keypair` and mark the wallet as disposed:

```typescript
import { LumenClient } from "@lumen/web-sdk";

const client = new LumenClient({ ... });
const { id, address } = await client.createWallet();

// Perform operations...
await client.sendPayment(id, "GDESTINATION...", "XLM", "10");

// Dispose wallet key material when finished
client.disposeWallet(id);
```

### 2. Disposing Client Session

Call `client.close()` or `client.dispose()` to dispose all cached wallet instances and clear internal wallet maps:

```typescript
// When tearing down a user session or unmounting components:
client.close();
```

### 3. Global Uncaught Exception Protection

Register the SDK's global error handler to automatically purge in-memory wallet key pairs upon uncaught errors or unhandled promise rejections:

```typescript
import { LumenClient, setupGlobalErrorHandler } from "@lumen/web-sdk";

const client = new LumenClient({ ... });
const cleanupHandler = setupGlobalErrorHandler(client);

// When tearing down application:
cleanupHandler();
```

## Error Path Sanitization

All error throw sites in `@lumen/core` sanitise message strings to ensure secret keys (`S...` 56-character Ed25519 seed strings) are replaced with `[REDACTED_SECRET]` before throwing or logging.
