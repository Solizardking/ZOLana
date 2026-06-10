/**
 * Dark Protocol SDK
 * Privacy-first DeFi protocol on Solana with AI agents
 */

export * from './client';
export * from './types';
export * from './jupiter-swap';
export * from './config';
export * from './ai-agent';
export * from './private-payment';
export * from './helius-dev-tools';

// Re-export commonly used Solana types
export { 
  Connection, 
  PublicKey, 
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';

// Version
export const VERSION = '0.1.0';