import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

/**
 * Utility functions for Dark Protocol
 */

/**
 * Convert bytes to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to bytes
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Convert bytes to base58
 */
export function bytesToBase58(bytes: Uint8Array): string {
  return bs58.encode(bytes);
}

/**
 * Convert base58 to bytes
 */
export function base58ToBytes(base58: string): Uint8Array {
  return bs58.decode(base58);
}

/**
 * Format amount with decimals
 */
export function formatAmount(amount: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fractional = amount % divisor;

  return `${whole}.${fractional.toString().padStart(decimals, '0')}`;
}

/**
 * Parse amount from string
 */
export function parseAmount(amount: string, decimals: number): bigint {
  const [whole, fractional = '0'] = amount.split('.');
  const paddedFractional = fractional.padEnd(decimals, '0').slice(0, decimals);

  return BigInt(whole) * BigInt(10 ** decimals) + BigInt(paddedFractional);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await sleep(delayMs * Math.pow(2, i));
      }
    }
  }

  throw lastError!;
}

/**
 * Chunk array into smaller arrays
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Get explorer URL for transaction
 */
export function getExplorerUrl(signature: string, cluster: 'mainnet' | 'devnet' | 'testnet' = 'mainnet'): string {
  const clusterParam = cluster === 'mainnet' ? '' : `?cluster=${cluster}`;
  return `https://explorer.solana.com/tx/${signature}${clusterParam}`;
}

/**
 * Get explorer URL for address
 */
export function getAddressExplorerUrl(address: PublicKey | string, cluster: 'mainnet' | 'devnet' | 'testnet' = 'mainnet'): string {
  const addressStr = typeof address === 'string' ? address : address.toBase58();
  const clusterParam = cluster === 'mainnet' ? '' : `?cluster=${cluster}`;
  return `https://explorer.solana.com/address/${addressStr}${clusterParam}`;
}

/**
 * Validate Solana address
 */
export function isValidAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate random bytes
 */
export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Combine multiple Uint8Arrays
 */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }

  return result;
}

/**
 * Compare two Uint8Arrays for equality
 */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }

  return true;
}
