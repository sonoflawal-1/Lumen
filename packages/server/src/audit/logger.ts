export type AuditEventType =
  | "wallet.created"
  | "cosign.approved"
  | "cosign.rejected"
  | "fee_bump.submitted"
  | "fee_bump.failed"
  | "policy.created"
  | "policy.updated"
  | "policy.deleted";

export interface BaseAuditEvent {
  event: AuditEventType;
  timestamp?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface WalletCreatedEvent extends BaseAuditEvent {
  event: "wallet.created";
  walletId?: string;
  address: string;
  requestId: string;
}

export interface CosignApprovedEvent extends BaseAuditEvent {
  event: "cosign.approved";
  walletId: string;
  txHash: string;
  policyId?: string;
  signerPublicKey: string;
  reason?: string;
  requestId: string;
  sourceIp: string;
}

export interface CosignRejectedEvent extends BaseAuditEvent {
  event: "cosign.rejected";
  walletId: string;
  txHash?: string;
  policyId?: string;
  signerPublicKey: string;
  reason: string;
  requestId: string;
  sourceIp: string;
}

export interface FeeBumpSubmittedEvent extends BaseAuditEvent {
  event: "fee_bump.submitted";
  walletId?: string;
  innerHash?: string;
  feeBumpHash: string;
  requestId: string;
}

export interface FeeBumpFailedEvent extends BaseAuditEvent {
  event: "fee_bump.failed";
  walletId?: string;
  innerHash?: string;
  feeBumpHash?: string;
  requestId: string;
  error?: string;
}

export interface PolicyCreatedEvent extends BaseAuditEvent {
  event: "policy.created";
  policyId: string;
  walletId: string;
  requestId: string;
}

export interface PolicyUpdatedEvent extends BaseAuditEvent {
  event: "policy.updated";
  policyId: string;
  walletId: string;
  requestId: string;
}

export interface PolicyDeletedEvent extends BaseAuditEvent {
  event: "policy.deleted";
  policyId: string;
  walletId: string;
  requestId: string;
}

export type AuditEvent =
  | WalletCreatedEvent
  | CosignApprovedEvent
  | CosignRejectedEvent
  | FeeBumpSubmittedEvent
  | FeeBumpFailedEvent
  | PolicyCreatedEvent
  | PolicyUpdatedEvent
  | PolicyDeletedEvent;

export interface AuditLogger {
  log(event: AuditEvent): void | Promise<void>;
}

export class ConsoleAuditLogger implements AuditLogger {
  log(event: AuditEvent): void {
    const entry = {
      timestamp: event.timestamp ?? new Date().toISOString(),
      ...event,
    };
    console.log(JSON.stringify(entry));
  }
}

export class NoopAuditLogger implements AuditLogger {
  public readonly events: AuditEvent[] = [];

  log(event: AuditEvent): void {
    const entry = {
      timestamp: event.timestamp ?? new Date().toISOString(),
      ...event,
    };
    this.events.push(entry as AuditEvent);
  }

  clear(): void {
    this.events.length = 0;
  }
}
