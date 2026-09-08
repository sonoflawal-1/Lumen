import fs from "node:fs";
import path from "node:path";
import type { WalletRecord } from "@lumen/types";

export interface WalletStoreOpts {
  filePath?: string;
}

export class WalletStore {
  private filePath: string;
  private wallets: Map<string, WalletRecord> = new Map();

  constructor(opts?: WalletStoreOpts) {
    this.filePath = opts?.filePath ?? path.join(process.cwd(), "data", "wallets.json");
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        const parsed: WalletRecord[] = JSON.parse(raw);
        for (const w of parsed) {
          this.wallets.set(w.id, w);
        }
      }
    } catch {
      // Ignore errors on initial read (file might not exist yet)
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.wallets.values());
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch {
      // Ignore write errors in memory fallback environments
    }
  }

  add(wallet: WalletRecord): void {
    this.wallets.set(wallet.id, wallet);
    this.save();
  }

  get(id: string): WalletRecord | undefined {
    return this.wallets.get(id);
  }

  getByAddress(address: string): WalletRecord | undefined {
    for (const w of this.wallets.values()) {
      if (w.address === address) return w;
    }
    return undefined;
  }

  list(page = 1, limit = 10): { data: WalletRecord[]; total: number; page: number; limit: number } {
    const all = Array.from(this.wallets.values());
    const total = all.length;
    const startIndex = (page - 1) * limit;
    const data = all.slice(startIndex, startIndex + limit);
    return { data, total, page, limit };
  }

  delete(id: string): boolean {
    const exists = this.wallets.has(id);
    if (exists) {
      this.wallets.delete(id);
      this.save();
    }
    return exists;
  }

  clear(): void {
    this.wallets.clear();
    this.save();
  }
}
