# Wallet Recovery Architecture & Guide

This document describes how Lumen handles wallet state recovery across server restarts, browser page reloads, and multi-session devices.

## The Recovery Problem

Because Lumen implements 2-of-2 multisig accounts (where the user device holds one key and the server co-signer holds the second key), an in-memory client state loses track of active wallets on page refresh or browser restart.

The server persists a `WalletRecord` registry mapping:
- `id`: Unique UUID identifier for the wallet.
- `address`: Stellar public key (`G...`).
- `userDevicePublicKey`: User's device public key (`G...`).
- `createdAt`: Timestamp.

## SDK Recovery Flow

### 1. Rebuilding Client State (`recoverWallets`)

After a page reload or client reconstruction, invoke `LumenClient.recoverWallets()`:

```typescript
import { LumenClient } from "@lumen/web-sdk";

// Initialize fresh client on page load
const client = new LumenClient({
  serverUrl: "http://localhost:3000",
  apiKey: "your-api-key",
  sponsorSecret: "...",
  serverPublicKey: "...",
});

// Recover sponsored wallet records from server
const recoveredRecords = await client.recoverWallets();

console.log(`Recovered ${recoveredRecords.length} wallets`);
```

### 2. Lookup by Address (`lookupByAddress`)

If the client application only holds the user's Stellar public key, query single wallet details via `lookupByAddress`:

```typescript
const walletRecord = await client.lookupByAddress("GADDRESS...");
```

### 3. SEP-10 Proof-of-Ownership Challenge (Optional Security)

For scenarios requiring strict proof of device key ownership before server metadata disclosure:
1. `GET /wallets/:address/sign-challenge` returns a Stellar challenge transaction XDR.
2. The client signs the challenge with its local device key.
3. `POST /wallets/:address/verify` submits the signed challenge to authenticate ownership.

## Removing Server Co-signer Control (Wallet Deletion)

If a user chooses to eject from the server co-signing model and revert to sole 1-of-1 key control:

```bash
DELETE /wallet/:id
Header: x-api-key: <API_KEY>
```

The server submits a Stellar `setOptions` transaction setting the server co-signer weight to `0` on-chain, transferring sole account control back to the user device key, and removing the record from the server store.
