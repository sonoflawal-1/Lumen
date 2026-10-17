# Wallet Recovery Architecture & Guide

This document describes how Lumen handles wallet state recovery across server restarts, browser page reloads, and multi-session devices.

## The Recovery Problem

`LumenClient` keeps its wallets in a private in-memory `Map<string, Wallet>`. On page refresh that map is empty, so `getWallet(id)` returns `undefined` for every wallet the client hasn't seen in the current session. The user can still recover their device key (via OAuth or passphrase), but without server-side state there is no way to map that key back to the server's co-signer for the same 2-of-2 account.

Because Lumen implements 2-of-2 multisig accounts (where the user device holds one key and the server co-signer holds the second key), the server must persist a registry of the wallets it has sponsored.

## Server-Side Wallet Registry

The server persists a `WalletRecord` registry as part of the `PolicyStore`:

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique UUID identifier for the wallet. |
| `address` | `string` | Stellar public key (`G...`) of the 2-of-2 account. |
| `userDevicePublicKey` | `string` | User's device public key (`G...`), the other signer on the account. |
| `createdAt` | `string` | ISO-8601 timestamp of when the wallet was created. |

### Endpoints

All endpoints require the API key (`x-api-key` header).

- `GET /wallets` — returns the list of `WalletRecord`s the server has sponsored.
- `GET /wallets/:address` — returns a single `WalletRecord`, including `userDevicePublicKey`, so the client can verify the user holds the matching device key.

## SDK Recovery Flow

### 1. Rebuilding Client State (`recoverWallets`)

After a page reload or client reconstruction, invoke `LumenClient.recoverWallets()`. It fetches `GET /wallets` and rebuilds the client's in-memory wallet map from the returned records:

```typescript
import { LumenClient } from "@lumen/web-sdk";

// Initialize fresh client on page load
const client = new LumenClient({
  serverUrl: "http://localhost:3000",
  apiKey: "your-api-key",
  sponsorSecret: "...",
  serverPublicKey: "...",
});

// Recover sponsored wallet records from server and rebuild the in-memory map
const recoveredRecords = await client.recoverWallets();

console.log(`Recovered ${recoveredRecords.length} wallets`);

// getWallet(id) now resolves for recovered wallets
const wallet = client.getWallet(recoveredRecords[0].id);
```

### 2. Lookup by Address (`lookupByAddress`)

If the client application only holds the user's Stellar public key, query single wallet details via `lookupByAddress`, which calls `GET /wallets/:address`:

```typescript
const walletRecord = await client.lookupByAddress("GADDRESS...");

// Compare against the locally recovered device key before trusting the record
if (walletRecord.userDevicePublicKey !== localDevicePublicKey) {
  throw new Error("Device key mismatch — refusing to use this wallet");
}
```

### 3. SEP-10 Proof-of-Ownership Challenge (Optional Security)

For scenarios requiring strict proof of device key ownership before the server reveals any user-specific data:
1. `GET /wallets/:address/sign-challenge` returns a Stellar SEP-10-style challenge transaction XDR.
2. The client signs the challenge with its local device key.
3. `POST /wallets/:address/verify` submits the signed challenge to authenticate ownership.

## Removing Server Co-signer Control (Wallet Deletion)

If a user chooses to eject from the server co-signing model and revert to sole 1-of-1 key control:

```bash
DELETE /wallet/:id
Header: x-api-key: <API_KEY>
```

The server submits a Stellar `setOptions` transaction setting the server co-signer weight to `0` on-chain, transferring sole account control back to the user device key, and removing the record from the server store.
