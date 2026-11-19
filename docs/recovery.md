# Wallet Recovery

This document describes how a client can recover its wallets after a page refresh (or any other loss of in-memory state) and how the server supports that recovery.

## Background

`LumenClient` keeps its wallets in a private in-memory `Map<string, Wallet>`. That map is lost whenever the page is refreshed or the client is reconstructed, so `getWallet(id)` returns `undefined` for any wallet the current client instance has not seen.

To make recovery possible, the server persists a registry of the wallets it has sponsored. Each entry is a `WalletRecord`:

| Field                 | Type     | Description                                                       |
| --------------------- | -------- | ----------------------------------------------------------------- |
| `id`                  | `string` | Stable wallet identifier used by the SDK.                         |
| `address`             | `string` | Stellar account address of the 2-of-2 account.                    |
| `userDevicePublicKey` | `string` | Public key of the user's device key (the other half of the 2-of-2).|
| `createdAt`           | `string` | ISO-8601 timestamp of when the wallet was created.                |

The registry is part of the `PolicyStore` persistence layer, so it survives server restarts.

## Server endpoints

All endpoints below require the API key (see the API-key configuration in the README).

### `GET /wallets`

Returns the list of `WalletRecord`s the server has sponsored.

```json
[
  {
    "id": "wal_123",
    "address": "G...",
    "userDevicePublicKey": "G...",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

### `GET /wallets/:address`

Returns a single `WalletRecord` for the given Stellar address, including `userDevicePublicKey` so the client can verify that the user holds the matching device key.

```json
{
  "id": "wal_123",
  "address": "G...",
  "userDevicePublicKey": "G...",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

Returns `404` if no wallet is registered for that address.

## SDK-side recovery

### `LumenClient.recoverWallets()`

Fetches `GET /wallets` and rebuilds the client's in-memory wallet map from the returned records. After this call, `getWallet(id)` works for every wallet the server knows about.

```ts
const client = new LumenClient({ /* ... */ });
await client.recoverWallets();

const wallet = client.getWallet("wal_123");
```

### `LumenClient.lookupByAddress(address)`

Calls `GET /wallets/:address` and returns the matching `WalletRecord` (or `undefined` if the server has no record). Use this when you know the Stellar address but not the wallet id — for example, after recovering the device key via OAuth or a passphrase.

```ts
const record = await client.lookupByAddress("G...");
if (record) {
  // record.userDevicePublicKey can be compared against the recovered device key
}
```

## Ownership proof (optional)

The endpoints above reveal the device public key for an address. To prove that the caller actually holds the matching device private key before the server reveals any user-specific data, the server can expose a SEP-10-style challenge flow:

### `GET /wallets/:address/sign-challenge`

Returns a Stellar challenge transaction (SEP-10 style) scoped to the given address.

### `POST /wallets/:address/verify`

The client signs the challenge transaction with its device key and posts the signed envelope. On success the server treats the caller as the owner of the wallet and may reveal user-specific data.

```ts
const challenge = await client.getSignChallenge(address);
const signed = signWithDeviceKey(challenge, deviceKeypair);
await client.verifyWalletOwnership(address, signed);
```

This flow is optional; the basic `recoverWallets()` / `lookupByAddress()` flow works without it.

## Removing a co-signer

### `DELETE /wallet/:id`

Removes the server-side co-signer for the given wallet id. After this call the server no longer co-signs transactions for that wallet, and the wallet is removed from the registry returned by `GET /wallets`.

```ts
await client.deleteWallet("wal_123");
```

## End-to-end recovery example

```ts
// 1. User refreshes the page; the old LumenClient is gone.
const client = new LumenClient({ /* ... */ });

// 2. Rebuild the in-memory wallet map from the server registry.
await client.recoverWallets();

// 3. Look up a specific wallet by address if needed.
const record = await client.lookupByAddress("G...");

// 4. Continue using the wallet. Policies are still enforced by the server.
const wallet = client.getWallet(record!.id);
await wallet.sendPayment({ /* ... */ });
```

Because the server persists the `WalletRecord` registry and enforces policies server-side, a recovered wallet behaves exactly like one created in the current session — payments are still subject to the same policy checks.