/**
 * Jupiter Ultra API Example with Dark Protocol
 * Complete implementation using Jupiter's Ultra Swap API
 */

import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  DarkProtocolClient,
  JupiterSwapClient,
  ZKProof,
} from '../src/index.js';
import fs from 'fs';

// TOKEN ADDRESSES (Mainnet)
const TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BTC: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',
  ETH: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
};

async function main() {
  console.log('🚀 Jupiter Ultra API + Dark Protocol Example\n');

  // Initialize connection and wallet
  const connection = new Connection(
    process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com',
    'confirmed'
  );

  // Load wallet from Solana CLI or environment
  const privateKeyArray = JSON.parse(
    fs.readFileSync(
      process.env.WALLET_PATH || '/Users/8bit/.config/solana/id.json',
      'utf8'
    ).trim()
  );
  const wallet = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));

  console.log(`Wallet: ${wallet.publicKey.toBase58()}\n`);

  // Initialize Dark Protocol client
  const darkClient = await DarkProtocolClient.create({
    heliusApiKey: process.env.HELIUS_API_KEY!,
    jupiterApiKey: process.env.JUPITER_API_KEY,
    commitment: 'confirmed',
  });

  // Initialize Jupiter Swap client
  const jupiterClient = new JupiterSwapClient(
    darkClient,
    process.env.JUPITER_API_KEY
  );

  // Example 1: Get Order (Quote)
  await getOrderExample(jupiterClient, wallet);

  // Example 2: Execute Standard Swap (No Privacy)
  // await executeStandardSwap(jupiterClient, wallet, connection);

  // Example 3: Execute Private Swap (With ZK Proof)
  // await executePrivateSwap(jupiterClient, wallet);

  console.log('\n✅ Examples completed!');
}

/**
 * Example 1: Get Order from Jupiter Ultra API
 */
async function getOrderExample(
  client: JupiterSwapClient,
  wallet: Keypair
) {
  console.log('=== Example 1: Get Order (Quote) ===\n');

  const order = await client.getOrder({
    inputMint: TOKENS.SOL,
    outputMint: TOKENS.USDC,
    amount: '100000000', // 0.1 SOL
    taker: wallet.publicKey.toBase58(),
    // Optional: Add referral fees
    // referralAccount: 'YOUR_REFERRAL_ACCOUNT',
    // referralFee: 50, // 0.5% in bps
  });

  console.log('Order Response:');
  console.log(`  Mode: ${order.mode}`);
  console.log(`  Swap Type: ${order.swapType}`);
  console.log(`  Router: ${order.router}`);
  console.log(`  Input Amount: ${order.inAmount} (${TOKENS.SOL})`);
  console.log(`  Output Amount: ${order.outAmount} (${TOKENS.USDC})`);
  console.log(`  Min Output: ${order.otherAmountThreshold}`);
  console.log(`  Price Impact: ${order.priceImpactPct}%`);
  console.log(`  Slippage: ${order.slippageBps} bps`);
  console.log(`  Platform Fee: ${order.feeBps} bps`);
  console.log(`  Fee Mint: ${order.feeMint}`);
  console.log(`  Gasless: ${order.gasless ? 'Yes' : 'No'}`);
  console.log(`  Request ID: ${order.requestId}`);
  console.log(`  Route Steps: ${order.routePlan?.length || 0}\n`);

  if (order.routePlan) {
    console.log('Route Plan:');
    order.routePlan.forEach((step: any, i: number) => {
      console.log(`  Step ${i + 1}:`);
      console.log(`    DEX: ${step.swapInfo?.label}`);
      console.log(`    Percent: ${step.percent}%`);
      console.log(`    In: ${step.swapInfo?.inputMint}`);
      console.log(`    Out: ${step.swapInfo?.outputMint}`);
    });
  }

  console.log('\n');
}

/**
 * Example 2: Execute Standard Swap (No Privacy)
 */
async function executeStandardSwap(
  client: JupiterSwapClient,
  wallet: Keypair,
  connection: Connection
) {
  console.log('=== Example 2: Execute Standard Swap ===\n');

  // Step 1: Get Order
  const order = await client.getOrder({
    inputMint: TOKENS.SOL,
    outputMint: TOKENS.USDC,
    amount: '10000000', // 0.01 SOL
    taker: wallet.publicKey.toBase58(),
  });

  console.log(`Got order with request ID: ${order.requestId}`);
  console.log(`Expected output: ${order.outAmount} USDC\n`);

  // Step 2: Deserialize and sign transaction
  const transactionBase64 = order.transaction;
  const transaction = VersionedTransaction.deserialize(
    Buffer.from(transactionBase64, 'base64')
  );

  transaction.sign([wallet]);

  const signedTransaction = Buffer.from(transaction.serialize()).toString('base64');

  console.log('Transaction signed\n');

  // Step 3: Execute via Jupiter Ultra API
  const executeResponse = await fetch(
    'https://lite-api.jup.ag/ultra/v1/execute',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.JUPITER_API_KEY && {
          Authorization: `Bearer ${process.env.JUPITER_API_KEY}`,
        }),
      },
      body: JSON.stringify({
        signedTransaction,
        requestId: order.requestId,
      }),
    }
  );

  const executeResult = await executeResponse.json();

  console.log('Execute Response:');
  console.log(`  Status: ${executeResult.status}`);
  console.log(`  Code: ${executeResult.code}`);

  if (executeResult.status === 'Success') {
    console.log(`  Signature: ${executeResult.signature}`);
    console.log(`  Slot: ${executeResult.slot}`);
    console.log(`  Input Amount: ${executeResult.inputAmountResult}`);
    console.log(`  Output Amount: ${executeResult.outputAmountResult}`);
    console.log(`\n  View on Solscan: https://solscan.io/tx/${executeResult.signature}`);
  } else {
    console.log(`  Error: ${executeResult.error}`);
    if (executeResult.signature) {
      console.log(`  Failed tx: https://solscan.io/tx/${executeResult.signature}`);
    }
  }

  console.log('\n');
}

/**
 * Example 3: Execute Private Swap with ZK Proof
 */
async function executePrivateSwap(
  client: JupiterSwapClient,
  wallet: Keypair
) {
  console.log('=== Example 3: Execute Private Swap (ZK Proof) ===\n');

  // Generate mock ZK proof (in production, use actual proof generation)
  const mockProof: ZKProof = {
    proofA: new Uint8Array(64).fill(0),
    proofB: new Uint8Array(128).fill(0),
    proofC: new Uint8Array(64).fill(0),
  };

  // Generate commitments and nullifier
  const inputCommitment = crypto.getRandomValues(new Uint8Array(32));
  const outputCommitment = crypto.getRandomValues(new Uint8Array(32));
  const nullifier = crypto.getRandomValues(new Uint8Array(32));

  console.log('Generated ZK Proof components:');
  console.log(`  Proof A: ${mockProof.proofA.length} bytes`);
  console.log(`  Proof B: ${mockProof.proofB.length} bytes`);
  console.log(`  Proof C: ${mockProof.proofC.length} bytes`);
  console.log(`  Input Commitment: ${inputCommitment.length} bytes`);
  console.log(`  Output Commitment: ${outputCommitment.length} bytes`);
  console.log(`  Nullifier: ${nullifier.length} bytes\n`);

  try {
    const signature = await client.executePrivateSwap(
      new PublicKey(TOKENS.SOL),
      new PublicKey(TOKENS.USDC),
      BigInt(100000000), // 0.1 SOL
      {
        inputCommitment,
        outputCommitment,
        nullifier,
        proof: mockProof,
        slippageBps: 50,
        priorityFee: 1000,
      }
    );

    console.log('Private swap executed successfully!');
    console.log(`  Signature: ${signature}`);
    console.log(`  View on Solscan: https://solscan.io/tx/${signature}\n`);
  } catch (error) {
    console.error('Private swap failed:', error);
    console.log('Note: This requires Dark Protocol program to be deployed\n');
  }
}

/**
 * Example 4: Search Token
 */
async function searchTokenExample() {
  console.log('=== Example 4: Search Token ===\n');

  const response = await fetch(
    'https://lite-api.jup.ag/ultra/v1/search?query=SOL'
  );

  const tokens = await response.json();

  console.log(`Found ${tokens.length} tokens:\n`);

  tokens.slice(0, 3).forEach((token: any) => {
    console.log(`  ${token.name} (${token.symbol})`);
    console.log(`    Mint: ${token.id}`);
    console.log(`    Price: $${token.usdPrice}`);
    console.log(`    Market Cap: $${(token.mcap / 1e6).toFixed(2)}M`);
    console.log(`    Holders: ${token.holderCount?.toLocaleString()}`);
    console.log(`    Organic Score: ${token.organicScore} (${token.organicScoreLabel})`);
    console.log(`    Verified: ${token.isVerified ? 'Yes' : 'No'}\n`);
  });
}

/**
 * Example 5: Get Holdings
 */
async function getHoldingsExample(address: string) {
  console.log('=== Example 5: Get Holdings ===\n');

  const response = await fetch(
    `https://lite-api.jup.ag/ultra/v1/holdings/${address}`
  );

  const holdings = await response.json();

  console.log(`Native SOL Balance: ${holdings.uiAmount} SOL\n`);

  if (holdings.tokens) {
    const tokenCount = Object.keys(holdings.tokens).length;
    console.log(`Token Holdings: ${tokenCount} tokens\n`);

    Object.entries(holdings.tokens).slice(0, 5).forEach(([mint, accounts]: [string, any]) => {
      const account = accounts[0];
      console.log(`  ${mint}:`);
      console.log(`    Amount: ${account.uiAmount}`);
      console.log(`    Decimals: ${account.decimals}`);
      console.log(`    Frozen: ${account.isFrozen ? 'Yes' : 'No'}`);
      console.log(`    ATA: ${account.isAssociatedTokenAccount ? 'Yes' : 'No'}\n`);
    });
  }
}

// Run examples
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

// Export for use in other files
export {
  getOrderExample,
  executeStandardSwap,
  executePrivateSwap,
  searchTokenExample,
  getHoldingsExample,
};
