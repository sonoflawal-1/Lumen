import type { WalletRecord } from "@lumen/types";

/**
 * Minimal persistence interface for the wallet registry.
 *
 * This is intentionally compatible with the `PolicyStore` work in #27: any
 * store that can persist and retrieve wallet records can be plugged in here.
 * When no store is supplied, the registry operates purely in memory.
 */
export interface WalletPersistence {
  loadWallets?(): WalletRecord[] | Promise<WalletRecord[]>;
  saveWallet?(record: WalletRecord): void | Promise<void>;
  removeWallet?(id: string): void | Promise<void>;
}

export class WalletStore {
  private wallets: Map<string, WalletRecord> = new Map();
  private addressIndex: Map<string, string> = new Map();
  private persistence?: WalletPersistence;

  constructor(persistence?: WalletPersistence) {
    this.persistence = persistence;
    if (persistence?.loadWallets) {
      // Best-effort synchronous hydration. If the persistence layer returns a
      // promise, callers should await `hydrate()` instead.
      const loaded = persistence.loadWallets();
      if (Array.isArray(loaded)) {
        for (const record of loaded) {
          this.indexRecord(record);
        }
      }
    }
  }

  /**
   * Hydrate the in-memory registry from the backing persistence layer.
   * Safe to call multiple times; existing records are overwritten by id.
   */
  async hydrate(): Promise<void> {
    if (!this.persistence?.loadWallets) return;
    const records = await this.persistence.loadWallets();
    for (const record of records) {
      this.indexRecord(record);
    }
  }

  addWallet(record: WalletRecord): WalletRecord {
    this.indexRecord(record);
    if (this.persistence?.saveWallet) {
      void this.persistence.saveWallet(record);
    }
    return record;
  }

  getWallet(id: string): WalletRecord | undefined {
    return this.wallets.get(id);
  }

  getWalletByAddress(address: string): WalletRecord | undefined {
    const id = this.addressIndex.get(address);
    if (!id) return undefined;
    return this.wallets.get(id);
  }

  listWallets(limit = 50, cursor?: string): { items: WalletRecord[]; nextCursor?: string } {
    const all = Array.from(this.wallets.values()).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    let startIndex = 0;
    if (cursor) {
      const idx = all.findIndex((w) => w.id === cursor);
      if (idx !== -1) {
        startIndex = idx + 1;
      }
    }

    const items = all.slice(startIndex, startIndex + limit);
    const nextCursor =
      items.length === limit && startIndex + limit < all.length
        ? items[items.length - 1].id
        : undefined;

    return { items, nextCursor };
  }

  deleteWallet(id: string): boolean {
    const wallet = this.wallets.get(id);
    if (!wallet) return false;
    this.addressIndex.delete(wallet.address);
    const deleted = this.wallets.delete(id);
    if (deleted && this.persistence?.removeWallet) {
      void this.persistence.removeWallet(id);
    }
    return deleted;
  }

  private indexRecord(record: WalletRecord): void {
    const existing = this.wallets.get(record.id);
    if (existing && existing.address !== record.address) {
      this.addressIndex.delete(existing.address);
    }
    this.wallets.set(record.id, record);
    this.addressIndex.set(record.address, record.id);
  }
}