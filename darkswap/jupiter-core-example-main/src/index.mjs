const BASE_URL = process.env.JUPITER_SWAP_API_URL || "https://api.jup.ag/swap/v2";
const API_KEY = process.env.JUPITER_API_KEY;

const INPUT_MINT_ADDRESS =
  process.env.INPUT_MINT_ADDRESS || "So11111111111111111111111111111111111111112";
const OUTPUT_MINT_ADDRESS =
  process.env.OUTPUT_MINT_ADDRESS || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const AMOUNT = process.env.AMOUNT || "100000000";
const TAKER_PUBLIC_KEY = process.env.TAKER_PUBLIC_KEY;

if (!API_KEY) {
  throw new Error("JUPITER_API_KEY must be set in the environment");
}

const params = new URLSearchParams({
  inputMint: INPUT_MINT_ADDRESS,
  outputMint: OUTPUT_MINT_ADDRESS,
  amount: AMOUNT,
});

if (TAKER_PUBLIC_KEY) {
  params.set("taker", TAKER_PUBLIC_KEY);
}

const response = await fetch(`${BASE_URL}/order?${params}`, {
  headers: {
    "x-api-key": API_KEY,
  },
});

if (!response.ok) {
  throw new Error(`/order failed: ${response.status} ${await response.text()}`);
}

const order = await response.json();
console.log(
  JSON.stringify(
    {
      inputMint: order.inputMint,
      outputMint: order.outputMint,
      inAmount: order.inAmount,
      outAmount: order.outAmount,
      router: order.router,
      mode: order.mode,
      requestId: order.requestId,
      transactionReturned: Boolean(order.transaction),
    },
    null,
    2,
  ),
);
