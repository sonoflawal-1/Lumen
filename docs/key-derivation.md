# Key Derivation Architecture & Security Threat Model

This document outlines the cryptographic specifications, threat model, and key management practices for OAuth-based key derivation in the Lumen SDK.

---

## 1. Overview & Key Derivation Function (KDF)

Lumen uses **HKDF-SHA256** (RFC 5869) to derive 32-byte Ed25519 seed keys from OAuth provider authentication tokens and high-entropy secrets.

### Derivation Specifications

- **Input Keying Material (IKM)**: Raw byte representation of the OAuth token (`TextEncoder.encode(token)`).
- **Salt**: 16-byte cryptographically secure random value (`crypto.getRandomValues(new Uint8Array(16))`), uniquely generated per wallet and stored alongside `StoredKey.salt`.
- **Info String**: Structured domain separation string formatted as:
  ```
  lumen:ed25519:<provider>:<walletId>
  ```
  Example: `lumen:ed25519:google:wallet-usr-10492`
- **Hash Function**: SHA-256
- **Output Length**: 256 bits (32 bytes), consumed as raw Ed25519 seed via `Keypair.fromRawEd25519Seed(seed)`.

---

## 2. Threat Model & Security Mitigations

| Threat Scenario | Risk Level | Mitigation Strategy |
| :--- | :--- | :--- |
| **Cross-User Collisions** | High | Per-wallet unique random 16-byte salt persisted in key store ensures different users with identical provider inputs generate distinct Ed25519 keypairs. |
| **Cross-Wallet Replay / Ambiquity** | Medium | Domain separation `info` incorporating provider and `walletId` ensures keys derived for different wallet instances remain cryptographically isolated. |
| **Short-Lived OAuth Access Tokens** | Medium | For short-lived access tokens, applications must encapsulate a persistent master secret or user passphrase prior to HKDF invocation. |
| **Server Memory Inspection** | Low | Private keys derived via HKDF are scoped locally and wiped/garbage-collected immediately after transaction signing. |

---

## 3. Storage & Metadata Schema

When keys are stored via `KeyManager.store()`, the accompanying metadata captures salt and provider context:

```typescript
export interface StoredKey {
  publicKey: string;
  encryptedSecret: string;
  createdAt: Date;
  salt?: string;     // Hex-encoded 16-byte HKDF salt
  provider?: string; // OAuth provider identifier (e.g., "google", "github")
}
```
