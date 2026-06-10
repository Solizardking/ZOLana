/**
 * Dark Swap Example
 * Demonstrates how to execute private swaps using Jupiter integration
 */

import {
  DarkProtocolClient,
  JupiterSwapClient,
  JupiterPerpetualsClient,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
} from '../src';

// Token mints (Mainnet)
const TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BTC: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',
  ETH: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
};

async function main() {
  // Initialize Dark Protocol client
  const darkClient = await DarkProtocolClient.create({
    heliusApiKey: process.env.HELIUS_API_KEY!,
    jupiterApiKey: process.env.JUPITER_API_KEY,
    commitment: 'confirmed',
  });

  console.log('Dark Protocol client initialized');

  // Initialize Jupiter Swap client
  const jupiterClient = new JupiterSwapClient(
    darkClient,
    process.env.JUPITER_API_KEY
  );

  console.log('Jupiter Swap client initialized');

  // Example 1: Get a swap quote
  await getSwapQuote(jupiterClient);

  // Example 2: Execute a private swap (requires ZK proof)
  // await executePrivateSwap(jupiterClient);

  // Example 3: Get token price
  await getTokenPrice(jupiterClient);

  // Example 4: Find best route
  await findBestRoute(jupiterClient);

  // Example 5: Jupiter Perpetuals
  await jupiterPerpetualsExample(darkClient);
}

/**
 * Example 1: Get a swap quote from Jupiter
 */
async function getSwapQuote(client: JupiterSwapClient) {
  console.log('\n=== Getting Swap Quote ===');

  const quote = await client.getQuote({
    inputMint: TOKENS.SOL,
    outputMint: TOKENS.USDC,
    amount: (1 * LAMPORTS_PER_SOL).toString(), // 1 SOL
    slippageBps: 50, // 0.5% slippage
  });

  console.log('Quote received:');
  console.log(`  Input: ${quote.inputAmount} lamports SOL`);
  console.log(`  Output: ${quote.outputAmount} USDC`);
  console.log(`  Min output: ${quote.otherAmountThreshold} USDC`);
  console.log(`  Price impact: ${quote.priceImpactPct}%`);
  console.log(`  Route steps: ${quote.routePlan.length}`);
  console.log(`  Platform fee: ${quote.platformFeeBps} bps`);
}

/**
 * Example 2: Execute a private swap (requires ZK proof generation)
 */
async function executePrivateSwap(client: JupiterSwapClient) {
  console.log('\n=== Executing Private Swap ===');

  // In production, you would generate these using the ZK proving system
  const mockProof = {
    proofA: new Uint8Array(64).fill(0),
    proofB: new Uint8Array(128).fill(0),
    proofC: new Uint8Array(64).fill(0),
  };

  const mockCommitment = new Uint8Array(32).fill(1);
  const mockNullifier = new Uint8Array(32).fill(2);

  try {
    const signature = await client.executePrivateSwap(
      new PublicKey(TOKENS.SOL),
      new PublicKey(TOKENS.USDC),
      BigInt(1 * LAMPORTS_PER_SOL),
      {
        inputCommitment: mockCommitment,
        outputCommitment: mockCommitment,
        nullifier: mockNullifier,
        proof: mockProof,
        slippageBps: 50,
        priorityFee: 1000, // micro-lamports
      }
    );

    console.log('Private swap executed successfully!');
    console.log(`Transaction signature: ${signature}`);
  } catch (error) {
    console.error('Private swap failed:', error);
  }
}

/**
 * Example 3: Get token price from Jupiter
 */
async function getTokenPrice(client: JupiterSwapClient) {
  console.log('\n=== Getting Token Prices ===');

  const solPrice = await client.getTokenPrice(TOKENS.SOL);
  const usdcPrice = await client.getTokenPrice(TOKENS.USDC);
  const btcPrice = await client.getTokenPrice(TOKENS.BTC);

  console.log(`SOL price: $${solPrice}`);
  console.log(`USDC price: $${usdcPrice}`);
  console.log(`BTC price: $${btcPrice}`);
}

/**
 * Example 4: Find best route with constraints
 */
async function findBestRoute(client: JupiterSwapClient) {
  console.log('\n=== Finding Best Route ===');

  const route = await client.findBestRoute(
    TOKENS.SOL,
    TOKENS.USDC,
    BigInt(5 * LAMPORTS_PER_SOL), // 5 SOL
    {
      maxSlippage: 100, // 1% max slippage
      maxPriceImpact: 1.0, // 1% max price impact
      onlyDirectRoutes: false,
    }
  );

  if (route) {
    console.log('Best route found:');
    console.log(`  Input: ${route.inputAmount} SOL`);
    console.log(`  Output: ${route.outputAmount} USDC`);
    console.log(`  Price impact: ${route.priceImpactPct}%`);
    console.log(`  Steps: ${route.routePlan.length}`);
  } else {
    console.log('No suitable route found within constraints');
  }
}

/**
 * Example 5: Jupiter Perpetuals integration
 */
async function jupiterPerpetualsExample(darkClient: DarkProtocolClient) {
  console.log('\n=== Jupiter Perpetuals ===');

  const perpsClient = new JupiterPerpetualsClient(darkClient);

  // Get JLP pool state
  try {
    const poolState = await perpsClient.getPoolState();
    console.log('JLP Pool state retrieved');
  } catch (error) {
    console.log('Note: JLP pool data parsing not yet implemented');
  }

  // Get custody states
  console.log('\nCustody accounts:');
  const custodyTokens = ['SOL', 'ETH', 'BTC', 'USDC', 'USDT'] as const;
  
  for (const token of custodyTokens) {
    try {
      const custody = await perpsClient.getCustodyState(token);
      console.log(`  ${token} custody: Found`);
    } catch (error) {
      console.log(`  ${token} custody: Not available or parsing needed`);
    }
  }

  // Example position opening (would require ZK proof in production)
  console.log('\nNote: Position opening requires ZK proof generation');
  console.log('Position parameters example:');
  console.log('  Token: SOL');
  console.log('  Collateral: USDC');
  console.log('  Size: $1000');
  console.log('  Leverage: 5x');
  console.log('  Side: Long');
}

/**
 * Advanced Example: Multi-hop swap with price comparison
 */
async function compareRoutes(client: JupiterSwapClient) {
  console.log('\n=== Comparing Routes ===');

  const amount = BigInt(10 * LAMPORTS_PER_SOL);

  // Direct route
  const directRoute = await client.getQuote({
    inputMint: TOKENS.SOL,
    outputMint: TOKENS.USDC,
    amount: amount.toString(),
    onlyDirectRoutes: true,
  });

  // Any route (may include multi-hop)
  const bestRoute = await client.getQuote({
    inputMint: TOKENS.SOL,
    outputMint: TOKENS.USDC,
    amount: amount.toString(),
    onlyDirectRoutes: false,
  });

  console.log('Direct route:');
  console.log(`  Output: ${directRoute.outputAmount} USDC`);
  console.log(`  Price impact: ${directRoute.priceImpactPct}%`);
  console.log(`  Steps: ${directRoute.routePlan.length}`);

  console.log('\nBest route (any):');
  console.log(`  Output: ${bestRoute.outputAmount} USDC`);
  console.log(`  Price impact: ${bestRoute.priceImpactPct}%`);
  console.log(`  Steps: ${bestRoute.routePlan.length}`);

  const improvement = Number(bestRoute.outputAmount - directRoute.outputAmount) / 1e6;
  console.log(`\nImprovement: ${improvement.toFixed(2)} USDC`);
}

/**
 * Advanced Example: Estimate price impact for large trades
 */
async function estimateLargeTradeImpact(client: JupiterSwapClient) {
  console.log('\n=== Large Trade Impact Analysis ===');

  const sizes = [1, 10, 100, 1000]; // SOL amounts

  for (const size of sizes) {
    const impact = await client.estimatePriceImpact(
      TOKENS.SOL,
      TOKENS.USDC,
      BigInt(size * LAMPORTS_PER_SOL)
    );

    console.log(`${size} SOL → USDC: ${impact.toFixed(4)}% price impact`);
  }
}

// Run examples
main()
  .then(() => {
    console.log('\n✅ All examples completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
