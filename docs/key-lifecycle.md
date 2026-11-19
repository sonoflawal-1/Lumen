# Key Lifecycle

This document describes how device key material flows through Lumen, how long it lives, and what callers must do to keep its lifetime short.

## Background: JavaScript cannot zeroize heap memory

The device keypair is an Ed25519 keypair. Its secret half is a 32-byte seed held in a JavaScript `Buffer`/`Uint8Array` on the JS heap. JavaScript provides **no** mechanism to reliably zero that memory:

- There is no `mlock`, no `SecureString`, and no way to pin a buffer.
- The garbage collector may copy objects; the original bytes may linger until the GC reclaims them.
- Strings are immutable and interned; a secret that ever becomes a string cannot be scrubbed.

Because we cannot zeroize, the only defence available is to **keep secrets short-lived**:

1. Drop references to the `Keypair` as soon as it is no longer needed.
2. Avoid keeping it in long-lived closures.
3. Never log it, never include it in error messages, never pass it through serialisation layers.

## Lifetime expectations

| Object | Holds secret? | Expected lifetime |
| --- | --- | --- |
| `Keypair` | Yes (secret seed) | Only while a `Wallet` is in use |
| `Wallet` | Yes (`_keypair`) | Until `dispose()` is called |
| `LumenClient` | Indirectly (via `wallets` map) | Until `close()` / `dispose()` is called |

A `Wallet` should not outlive the operation that needs it. When you are done with a wallet — after a `send`, after a balance check, or when the tab is being torn down — dispose it.

## `Wallet.dispose()`

`Wallet.dispose()` releases the secret:

- Sets `_keypair = null`.
- Clears the in-memory cached `_address`.
- Removes the wallet from the parent `LumenClient`'s wallet map (`delete this.wallets.get(id)`).

After `dispose()` the wallet is inert: any operation that needs the secret will throw rather than silently reusing stale key material. The wallet cannot be revived; create a new one if you need to sign again.

```ts
const wallet = await client.create();
try {
  await wallet.send({ to, amount });
} finally {
  wallet.dispose();
}
```

## `LumenClient.close()` / `dispose()`

`LumenClient.close()` (aliased as `dispose()`) disposes **every** wallet it created and clears the wallet map. Call it when the client is no longer needed, e.g. on logout or when unmounting the app shell.

```ts
const client = new LumenClient({ /* ... */ });
// ...
await client.close();
```

## Global error handler

Register `setupGlobalErrorHandler(client)` from `@lumen/web-sdk` at application start-up. It installs an uncaught-exception handler that disposes all wallets before rethrowing, so a crash does not leave secrets resident for the lifetime of the tab.

```ts
import { setupGlobalErrorHandler } from '@lumen/web-sdk';

const client = new LumenClient({ /* ... */ });
setupGlobalErrorHandler(client);
```

## Never log secrets

Do not log, `console.log`, interpolate into template strings, or attach secret seeds to `Error` messages. Error paths in `send`, `getBalance`, and `create` are audited to ensure no `Error` message ever includes the secret.

As a defence in depth, any string that looks like a secret seed (`S...`) is redacted to `[REDACTED_SECRET]` before it is emitted through the SDK's logging/error helpers. Redaction is a safety net, not a licence to log secrets.

## Checklist

- [ ] Call `wallet.dispose()` when a wallet is no longer needed.
- [ ] Call `client.close()` / `client.dispose()` when the client is torn down.
- [ ] Register `setupGlobalErrorHandler(client)` at start-up.
- [ ] Never log or interpolate secret seeds; rely on `[REDACTED_SECRET]` redaction only as a fallback.
- [ ] Do not hold `Keypair` references in long-lived closures or module-level state.