export type DarkShieldedLedgerAction = 'shield' | 'unshield' | 'private_transfer';
export type DarkShieldedLedgerDirection = 'credit' | 'debit';

export interface DarkShieldedLedgerEntry {
  id: string;
  owner: string;
  action: DarkShieldedLedgerAction;
  direction: DarkShieldedLedgerDirection;
  amountLamports: string;
  commitment: string;
  createdAt: number;
  signature: string;
  memoHash?: string;
  recipient?: string;
  shieldedAddress?: string;
  nullifier?: string;
}

export const SHIELDED_LEDGER_STORAGE_KEY = 'zolana.dark.shielded-ledger.v1';
export const SHIELDED_LEDGER_EVENT = 'zolana:shielded-ledger-updated';

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isLamportString(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value);
}

function isLedgerAction(value: unknown): value is DarkShieldedLedgerAction {
  return value === 'shield' || value === 'unshield' || value === 'private_transfer';
}

function isLedgerDirection(value: unknown): value is DarkShieldedLedgerDirection {
  return value === 'credit' || value === 'debit';
}

function sanitizeLedgerEntry(value: unknown): DarkShieldedLedgerEntry | null {
  const entry = value as Partial<DarkShieldedLedgerEntry> | null;
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  if (
    typeof entry.id !== 'string' ||
    typeof entry.owner !== 'string' ||
    typeof entry.commitment !== 'string' ||
    typeof entry.signature !== 'string' ||
    typeof entry.createdAt !== 'number' ||
    !Number.isFinite(entry.createdAt) ||
    !isLamportString(entry.amountLamports)
  ) {
    return null;
  }

  if (!isLedgerAction(entry.action)) {
    return null;
  }

  if (!isLedgerDirection(entry.direction)) {
    return null;
  }

  return {
    id: entry.id,
    owner: entry.owner,
    action: entry.action,
    direction: entry.direction,
    amountLamports: entry.amountLamports,
    commitment: entry.commitment,
    createdAt: entry.createdAt,
    signature: entry.signature,
    memoHash: entry.memoHash,
    recipient: entry.recipient,
    shieldedAddress: entry.shieldedAddress,
    nullifier: entry.nullifier,
  };
}

export function loadShieldedLedger(): DarkShieldedLedgerEntry[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  try {
    const parsed = JSON.parse(storage.getItem(SHIELDED_LEDGER_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(sanitizeLedgerEntry)
      .filter((entry): entry is DarkShieldedLedgerEntry => Boolean(entry));
  } catch {
    return [];
  }
}

function saveShieldedLedger(entries: DarkShieldedLedgerEntry[]): DarkShieldedLedgerEntry[] {
  const storage = getStorage();
  if (!storage) {
    return entries;
  }

  const ordered = [...entries].sort((a, b) => b.createdAt - a.createdAt);
  storage.setItem(SHIELDED_LEDGER_STORAGE_KEY, JSON.stringify(ordered));
  window.dispatchEvent(new CustomEvent(SHIELDED_LEDGER_EVENT, { detail: { count: ordered.length } }));
  return ordered;
}

export function recordShieldedLedgerEntry(entry: DarkShieldedLedgerEntry): DarkShieldedLedgerEntry[] {
  const entries = loadShieldedLedger();
  const withoutDuplicate = entries.filter((candidate) => candidate.id !== entry.id);
  return saveShieldedLedger([entry, ...withoutDuplicate]);
}

export function getShieldedLedgerEntries(owner: string): DarkShieldedLedgerEntry[] {
  return loadShieldedLedger().filter((entry) => entry.owner === owner);
}

export function getShieldedBalanceLamports(owner: string): string {
  const balance = getShieldedLedgerEntries(owner).reduce((total, entry) => {
    const value = BigInt(entry.amountLamports);
    return entry.direction === 'credit' ? total + value : total - value;
  }, 0n);

  return balance > 0n ? balance.toString() : '0';
}

export function hasShieldedBalance(owner: string, amountLamports: string): boolean {
  return BigInt(getShieldedBalanceLamports(owner)) >= BigInt(amountLamports);
}

export function lamportsToSol(amountLamports: string): number {
  return Number(BigInt(amountLamports)) / 1_000_000_000;
}

export function getShieldedBalanceSol(owner: string): number {
  return lamportsToSol(getShieldedBalanceLamports(owner));
}
