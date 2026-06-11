import type { SolanaPaperWallet } from "./paper-wallet";

export type DarkClawdPaymentRail = "x402" | "ap2" | "m2m";
export type DarkClawdPaymentSettlement = "solana" | "evm";
export type DarkClawdPaymentProofLayer = "solana" | "evm";
export type DarkClawdPlanRisk = "low" | "medium" | "high";

export interface DarkClawdAgentConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
}

export interface DarkClawdReviewContext {
  label: string;
  network: string;
  publicKey: string;
  publicFingerprint: string;
  seedFingerprint: string;
  paymentRail: string;
  settlement: string;
  durable: boolean;
  proofLayer: string;
  prompt?: string;
}

export interface DarkClawdRailPlanContext {
  network: string;
  amountSol: number;
  recipientFingerprint: string;
  memoFingerprint?: string;
  rail: DarkClawdPaymentRail;
  settlement: DarkClawdPaymentSettlement;
  proofLayer: DarkClawdPaymentProofLayer;
  durableReceipt: boolean;
  heliusConfigured: boolean;
  evmChainId: number;
  evmVerifierConfigured: boolean;
  railWorkerConfigured: boolean;
  hasSolanaAnchor?: boolean;
  solanaAnchorVerified?: boolean;
  railWorkerMode?: string;
  railWorkerSettlementStatus?: string;
  operatorPrompt?: string;
}

export interface DarkClawdRailPlan {
  recommendedRail: DarkClawdPaymentRail;
  recommendedSettlement: DarkClawdPaymentSettlement;
  recommendedProofLayer: DarkClawdPaymentProofLayer;
  requireDurableReceipt: boolean;
  risk: DarkClawdPlanRisk;
  summary: string;
  actionItems: string[];
  cautions: string[];
}

const DEFAULT_BASE_URL = "https://api.x.ai/v1";
const DEFAULT_MODEL = "grok-4.20-beta-latest-non-reasoning";

function buildReviewPrompt(context: DarkClawdReviewContext): string {
  return [
    "You are Dark Clawd, the wallet-side agent for a Solana paper wallet.",
    "Do not request, repeat, or infer the secret key. Review only the public metadata and operational posture.",
    "Keep the response concise and practical.",
    "",
    `Wallet label: ${context.label}`,
    `Network: ${context.network}`,
    `Public key: ${context.publicKey}`,
    `Public fingerprint: ${context.publicFingerprint}`,
    `Seed fingerprint: ${context.seedFingerprint}`,
    `Payment rail: ${context.paymentRail}`,
    `Settlement: ${context.settlement}`,
    `Durable settlement: ${context.durable ? "yes" : "no"}`,
    `Proof layer: ${context.proofLayer}`,
    context.prompt ? `Operator note: ${context.prompt}` : "",
    "",
    "Return:",
    "1. A short risk summary.",
    "2. Any operational cautions for printing, storage, and transport.",
    "3. A recommendation on whether the wallet is ready for cold storage.",
  ]
    .filter(Boolean)
    .join("\n");
}

function scoreRisk(actionItems: string[], cautions: string[]): DarkClawdPlanRisk {
  if (actionItems.length >= 3 || cautions.some((caution) => caution.includes("Do not submit"))) {
    return "high";
  }

  if (actionItems.length > 0 || cautions.length > 1) {
    return "medium";
  }

  return "low";
}

export function fingerprintPublicValue(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return "empty";
  }

  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `${normalized.slice(0, 4)}...${normalized.slice(-4)}#${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createDarkClawdRailPlan(context: DarkClawdRailPlanContext): DarkClawdRailPlan {
  const actionItems: string[] = [];
  const cautions: string[] = [];
  let recommendedRail = context.rail;
  let recommendedSettlement = context.settlement;
  let recommendedProofLayer = context.proofLayer;

  if (!context.durableReceipt) {
    actionItems.push("Enable durable non-ephemeral receipt storage before anchoring or exporting rail auth.");
  }

  if (!context.heliusConfigured) {
    actionItems.push("Configure HELIUS_RPC_URL or HELIUS_API_KEY before mainnet-beta use.");
  }

  if (!context.hasSolanaAnchor) {
    actionItems.push("Anchor the receipt as a wallet-signed Solana Memo before rail submission.");
  } else if (!context.solanaAnchorVerified) {
    actionItems.push("Verify the Solana Memo anchor before EVM proof signing or rail-worker submission.");
  }

  if (!context.railWorkerConfigured) {
    actionItems.push("Set RAIL_WORKER_URL for direct x402/AP2/M2M authorization submission.");
  }

  if (!context.evmVerifierConfigured) {
    actionItems.push("Set EVM_PRIVATE_PAYMENT_VERIFIER before relying on EVM consume-once intent proofing.");
  }

  if (context.amountSol >= 1 || context.network === "mainnet-beta") {
    recommendedProofLayer = "evm";
    recommendedSettlement = "evm";
    recommendedRail = context.rail === "x402" ? "ap2" : context.rail;
    cautions.push("High-value or mainnet flow should use AP2/M2M-style mandates plus EVM consume-once proofing.");
  }

  if (context.amountSol < 0.05 && context.network !== "mainnet-beta") {
    recommendedRail = "x402";
    recommendedSettlement = "solana";
    cautions.push("Small devnet test flow can stay on x402/Solana intent mode until backend settlement is configured.");
  }

  if (context.rail === "m2m" && !context.railWorkerConfigured) {
    cautions.push("Do not submit M2M sessions without a reachable rail worker and replay ledger.");
  }

  if (context.settlement === "evm" && !context.evmVerifierConfigured) {
    cautions.push("EVM settlement/proof mode is incomplete until the verifier contract address is configured.");
  }

  if (context.railWorkerMode === "intent-only") {
    cautions.push("Rail worker is in intent-only mode; this proves authorization but does not claim final settlement.");
  }

  if (context.railWorkerSettlementStatus && context.railWorkerSettlementStatus !== "settled") {
    cautions.push(`Rail settlement status is ${context.railWorkerSettlementStatus}; keep the receipt queued.`);
  }

  if (actionItems.length === 0) {
    actionItems.push("Proceed: stage receipt, anchor on Solana, verify Memo, export/sign EVM proof, then submit rail auth.");
  }

  const risk = scoreRisk(actionItems, cautions);

  return {
    recommendedRail,
    recommendedSettlement,
    recommendedProofLayer,
    requireDurableReceipt: true,
    risk,
    summary: `Use ${recommendedRail.toUpperCase()} with ${recommendedSettlement.toUpperCase()} settlement and ${recommendedProofLayer.toUpperCase()} proofing on ${context.network}.`,
    actionItems,
    cautions,
  };
}

export function formatDarkClawdRailPlan(plan: DarkClawdRailPlan): string {
  return [
    `Risk: ${plan.risk.toUpperCase()}`,
    plan.summary,
    `Recommended: rail=${plan.recommendedRail}, settlement=${plan.recommendedSettlement}, proof=${plan.recommendedProofLayer}, durable=${plan.requireDurableReceipt ? "yes" : "no"}`,
    "",
    "Action items:",
    ...plan.actionItems.map((item) => `- ${item}`),
    "",
    "Cautions:",
    ...(plan.cautions.length > 0 ? plan.cautions.map((item) => `- ${item}`) : ["- No additional cautions from deterministic policy."]),
  ].join("\n");
}

function buildRailPlanPrompt(context: DarkClawdRailPlanContext, plan: DarkClawdRailPlan): string {
  return [
    "You are Dark Clawd, an agentic policy sidecar for a Solana privacy wallet.",
    "Review only public/private-payment metadata. Never request or infer secret keys, seed phrases, full paper-wallet JSON, or plaintext private memos.",
    "The local deterministic policy has already produced this plan; critique it and add operational guidance.",
    "",
    `Network: ${context.network}`,
    `Amount SOL: ${context.amountSol}`,
    `Recipient fingerprint: ${context.recipientFingerprint}`,
    context.memoFingerprint ? `Memo fingerprint: ${context.memoFingerprint}` : "",
    `Selected rail: ${context.rail}`,
    `Selected settlement: ${context.settlement}`,
    `Selected proof layer: ${context.proofLayer}`,
    `Durable receipt: ${context.durableReceipt ? "yes" : "no"}`,
    `Helius configured: ${context.heliusConfigured ? "yes" : "no"}`,
    `EVM chain ID: ${context.evmChainId}`,
    `EVM verifier configured: ${context.evmVerifierConfigured ? "yes" : "no"}`,
    `Rail worker configured: ${context.railWorkerConfigured ? "yes" : "no"}`,
    `Solana anchor exists: ${context.hasSolanaAnchor ? "yes" : "no"}`,
    `Solana anchor verified: ${context.solanaAnchorVerified ? "yes" : "no"}`,
    context.railWorkerMode ? `Rail worker mode: ${context.railWorkerMode}` : "",
    context.railWorkerSettlementStatus ? `Rail settlement status: ${context.railWorkerSettlementStatus}` : "",
    context.operatorPrompt ? `Operator note: ${context.operatorPrompt}` : "",
    "",
    "Deterministic plan:",
    formatDarkClawdRailPlan(plan),
    "",
    "Return exactly:",
    "1. Go/no-go decision.",
    "2. Best rail choice and why.",
    "3. Next three steps for Solana anchor, EVM intent proof, and x402/AP2/M2M handoff.",
  ]
    .filter(Boolean)
    .join("\n");
}

export class DarkClawdAgent {
  constructor(private readonly config: DarkClawdAgentConfig) {}

  get available(): boolean {
    return Boolean(this.config.apiKey.trim());
  }

  async chat(prompt: string, systemPrompt?: string): Promise<string> {
    const response = await fetch(`${this.config.baseUrl ?? DEFAULT_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model ?? DEFAULT_MODEL,
        temperature: this.config.temperature ?? 0.2,
        messages: [
          ...(systemPrompt
            ? [{ role: "system", content: systemPrompt }]
            : []),
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`xAI request failed (${response.status}): ${await response.text()}`);
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return payload.choices?.[0]?.message?.content?.trim() || "";
  }

  async reviewPaperWallet(context: DarkClawdReviewContext): Promise<string> {
    return this.chat(buildReviewPrompt(context));
  }

  async reviewPrivatePaymentRail(context: DarkClawdRailPlanContext): Promise<string> {
    const plan = createDarkClawdRailPlan(context);
    return this.chat(buildRailPlanPrompt(context, plan));
  }

  async reviewWallet(wallet: SolanaPaperWallet, context?: Partial<DarkClawdReviewContext>): Promise<string> {
    return this.reviewPaperWallet({
      label: wallet.label,
      network: wallet.network,
      publicKey: wallet.publicKey,
      publicFingerprint: wallet.publicFingerprint,
      seedFingerprint: wallet.seedFingerprint,
      paymentRail: context?.paymentRail ?? "x402",
      settlement: context?.settlement ?? "solana",
      durable: context?.durable ?? true,
      proofLayer: context?.proofLayer ?? "evm",
      prompt: context?.prompt,
    });
  }
}

export function createDarkClawdAgent(apiKey?: string, config?: Omit<DarkClawdAgentConfig, "apiKey">): DarkClawdAgent | null {
  if (!apiKey?.trim()) {
    return null;
  }

  return new DarkClawdAgent({
    apiKey,
    baseUrl: config?.baseUrl,
    model: config?.model,
    temperature: config?.temperature,
  });
}
