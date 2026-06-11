import React, { useMemo, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  generateSolanaPaperWallet,
  paperWalletFileName,
  serializeSolanaPaperWallet,
  type SolanaPaperWallet,
} from '../../utils/paper-wallet';
import {
  formatNetworkLabel,
  getDarkRuntimeConfig,
} from '../../utils/runtime';
import { createDarkClawdAgent } from '../../utils/dark-clawd-agent';
import { createDarkProtocolClient } from '../../sdk/dark-protocol';
import {
  appendPrivatePaymentReceipt,
  createPrivatePaymentProofPayload,
  loadPrivatePaymentReceipts,
  markPrivatePaymentAnchored,
  markPrivatePaymentFailed,
  markPrivatePaymentRailFailed,
  markPrivatePaymentRailStatus,
  markPrivatePaymentRailSubmitted,
  markPrivatePaymentVerificationFailed,
  markPrivatePaymentVerified,
  serializePrivatePaymentProofPayload,
  stagePrivatePayment,
  updatePrivatePaymentReceipt,
  verifyPrivatePaymentProofPayload,
  type PrivatePaymentProofLayer,
  type PrivatePaymentRail,
  type PrivatePaymentReceipt,
  type PrivatePaymentSettlement,
} from '../../sdk/private-payment';
import {
  createRailAuthorizationEnvelope,
  serializeRailAuthorizationEnvelope,
  verifyRailAuthorizationEnvelope,
} from '../../sdk/rail-authorization';
import {
  getRailWorkerSettlement,
  railWorkerStatusFromAuthorizeResult,
  railWorkerStatusFromLedgerEntry,
  submitRailAuthorizationToWorker,
} from '../../sdk/rail-worker-client';

function downloadFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

const PaperWallet: React.FC = () => {
  const wallet = useWallet();
  const { publicKey } = wallet;
  const { connection } = useConnection();
  const runtime = useMemo(() => getDarkRuntimeConfig(), []);
  const agent = useMemo(
    () =>
      createDarkClawdAgent(runtime.xaiApiKey, {
        baseUrl: runtime.xaiBaseUrl,
        model: runtime.xaiModel,
        temperature: 0.2,
      }),
    [runtime],
  );

  const [label, setLabel] = useState('ZOLana paper wallet');
  const [entropy, setEntropy] = useState('');
  const [paperWallet, setPaperWallet] = useState<SolanaPaperWallet | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [status, setStatus] = useState('');
  const [agentPrompt, setAgentPrompt] = useState('Review this cold-storage setup and payment posture.');
  const [agentResponse, setAgentResponse] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [rail, setRail] = useState<PrivatePaymentRail>('x402');
  const [settlement, setSettlement] = useState<PrivatePaymentSettlement>('solana');
  const [proofLayer, setProofLayer] = useState<PrivatePaymentProofLayer>('evm');
  const [durableReceipt, setDurableReceipt] = useState(true);
  const [paymentAmount, setPaymentAmount] = useState('0.25');
  const [paymentRecipient, setPaymentRecipient] = useState('');
  const [paymentMemo, setPaymentMemo] = useState('private settlement');
  const [lastPayment, setLastPayment] = useState<PrivatePaymentReceipt | null>(null);
  const [paymentReceipts, setPaymentReceipts] = useState<PrivatePaymentReceipt[]>(() => loadPrivatePaymentReceipts());
  const [anchoringReceiptId, setAnchoringReceiptId] = useState<string | null>(null);
  const [verifyingReceiptId, setVerifyingReceiptId] = useState<string | null>(null);
  const [checkingProofId, setCheckingProofId] = useState<string | null>(null);
  const [checkingRailId, setCheckingRailId] = useState<string | null>(null);
  const [submittingRailId, setSubmittingRailId] = useState<string | null>(null);
  const [refreshingRailId, setRefreshingRailId] = useState<string | null>(null);

  const railOptionsForReceipt = (receipt: PrivatePaymentReceipt) => ({
    evmChainId: runtime.evmChainId,
    evmVerifyingContract: runtime.evmPrivatePaymentVerifier,
    machinePayer: receipt.solanaAnchor?.payer ?? publicKey?.toBase58(),
    machinePayee: receipt.recipient,
  });

  const handleGenerate = async () => {
    setIsBusy(true);
    setStatus('Generating local Solana paper wallet...');
    try {
      const next = await generateSolanaPaperWallet({
        label,
        entropy,
        network: runtime.defaultNetwork,
      });
      setPaperWallet(next);
      setShowSecret(false);
      setStatus(`Generated ${next.publicKey.slice(0, 8)}... on ${formatNetworkLabel(next.network)}`);
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDownload = () => {
    if (!paperWallet) return;
    downloadFile(paperWalletFileName(paperWallet), serializeSolanaPaperWallet(paperWallet));
    setStatus('Paper wallet JSON downloaded');
  };

  const handlePrint = () => {
    if (!paperWallet) {
      setStatus('Generate a paper wallet before printing');
      return;
    }
    setShowSecret(true);
    window.requestAnimationFrame(() => window.print());
  };

  const handleAskAgent = async () => {
    if (!agent) {
      setStatus('Set XAI_API_KEY to enable the Dark Clawd sidecar');
      return;
    }

    setIsBusy(true);
    setAgentResponse('');
    try {
      const response = paperWallet
        ? await agent.reviewWallet(paperWallet, {
            paymentRail: rail,
            settlement,
            durable: durableReceipt,
            proofLayer,
            prompt: agentPrompt,
          })
        : await agent.chat([
            'Review a planned Solana paper-wallet setup.',
            `Network: ${formatNetworkLabel(runtime.defaultNetwork)}`,
            `Payment rail: ${rail}`,
            `Settlement: ${settlement}`,
            `Proof layer: ${proofLayer}`,
            agentPrompt,
          ].join('\n'));

      setAgentResponse(response || 'No response returned');
      setStatus('Dark Clawd review complete');
    } catch (error: any) {
      setStatus(`Agent error: ${error.message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleStagePayment = () => {
    try {
      const receipt = stagePrivatePayment({
        amountSol: Number(paymentAmount),
        recipient: paymentRecipient.trim() || publicKey?.toBase58() || 'private-counterparty',
        rail,
        settlement,
        proofLayer,
        durableReceipt,
        memo: paymentMemo,
      });
      const receipts = appendPrivatePaymentReceipt(receipt);
      setLastPayment(receipt);
      setPaymentReceipts(receipts);
      setStatus(`Queued ${receipt.amountSol} SOL via ${receipt.rail.toUpperCase()} with ${receipt.proofLayer.toUpperCase()} proofing; durable receipt stored locally`);
    } catch (error: any) {
      setStatus(`Payment error: ${error.message}`);
    }
  };

  const handleExportPaymentProof = (receipt: PrivatePaymentReceipt) => {
    const payload = createPrivatePaymentProofPayload(receipt, {
      evmChainId: runtime.evmChainId,
      evmVerifyingContract: runtime.evmPrivatePaymentVerifier,
    });
    downloadFile(
      `zolana-private-payment-proof-${receipt.id}.json`,
      serializePrivatePaymentProofPayload(payload),
    );
    setStatus(`Exported EVM proof payload for ${receipt.id} on chain ${runtime.evmChainId}`);
  };

  const handleCheckEvmProof = (receipt: PrivatePaymentReceipt) => {
    setCheckingProofId(receipt.id);
    try {
      const options = {
        evmChainId: runtime.evmChainId,
        evmVerifyingContract: runtime.evmPrivatePaymentVerifier,
      };
      const payload = createPrivatePaymentProofPayload(receipt, options);
      const verification = verifyPrivatePaymentProofPayload(payload, receipt, options);
      if (!verification.ok) {
        setStatus(`EVM proof payload mismatch: ${verification.mismatches.join('; ')}`);
        return;
      }

      setStatus(`EVM proof payload verified for ${receipt.id}: ${verification.actualDigest.slice(0, 18)}...`);
    } finally {
      setCheckingProofId(null);
    }
  };

  const handleExportRailAuthorization = (receipt: PrivatePaymentReceipt) => {
    try {
      const envelope = createRailAuthorizationEnvelope(receipt, {
        evmChainId: runtime.evmChainId,
        evmVerifyingContract: runtime.evmPrivatePaymentVerifier,
        machinePayer: receipt.solanaAnchor?.payer ?? publicKey?.toBase58(),
        machinePayee: receipt.recipient,
      });
      downloadFile(
        `zolana-rail-authorization-${receipt.id}.json`,
        serializeRailAuthorizationEnvelope(envelope),
      );
      setStatus(`Exported ${receipt.rail.toUpperCase()} rail authorization ${envelope.authorizationId}`);
    } catch (error: any) {
      setStatus(`Rail authorization error: ${error.message}`);
    }
  };

  const handleCheckRailAuthorization = (receipt: PrivatePaymentReceipt) => {
    setCheckingRailId(receipt.id);
    try {
      const options = railOptionsForReceipt(receipt);
      const envelope = createRailAuthorizationEnvelope(receipt, options);
      const verification = verifyRailAuthorizationEnvelope(envelope, receipt, options);
      if (!verification.ok) {
        setStatus(`Rail authorization mismatch: ${verification.mismatches.join('; ')}`);
        return;
      }

      setStatus(`Rail authorization verified: ${verification.actualAuthorizationId}`);
    } catch (error: any) {
      setStatus(`Rail authorization check error: ${error.message}`);
    } finally {
      setCheckingRailId(null);
    }
  };

  const handleSubmitRailAuthorization = async (receipt: PrivatePaymentReceipt) => {
    if (!runtime.railWorkerUrl) {
      setStatus('Set RAIL_WORKER_URL or VITE_RAIL_WORKER_URL to submit rail authorizations');
      return;
    }

    if (!receipt.solanaAnchor?.signature) {
      setStatus('Anchor the private-payment receipt on Solana before submitting it to the rail worker');
      return;
    }

    setSubmittingRailId(receipt.id);
    setStatus(`Submitting ${receipt.id} to the ${receipt.rail.toUpperCase()} rail worker...`);
    try {
      const result = await submitRailAuthorizationToWorker(receipt, {
        ...railOptionsForReceipt(receipt),
        workerUrl: runtime.railWorkerUrl,
        requireSolanaAnchor: true,
      });

      if (!result.ok) {
        const reason = result.errors?.join('; ') || `rail worker returned HTTP ${result.status}`;
        const failedReceipt = markPrivatePaymentRailFailed(receipt, reason, {
          authorizationId: result.authorizationId,
          workerUrl: result.workerUrl,
          responseStatus: result.status,
        });
        const receipts = updatePrivatePaymentReceipt(failedReceipt);
        setPaymentReceipts(receipts);
        setLastPayment((current) => current?.id === receipt.id ? failedReceipt : current);
        setStatus(`Rail worker rejected ${receipt.id}: ${reason}`);
        return;
      }

      const submittedReceipt = markPrivatePaymentRailSubmitted(
        receipt,
        railWorkerStatusFromAuthorizeResult(result),
      );
      const receipts = updatePrivatePaymentReceipt(submittedReceipt);
      setPaymentReceipts(receipts);
      setLastPayment((current) => current?.id === receipt.id ? submittedReceipt : current);
      setStatus(
        `Rail worker accepted ${result.authorizationId} in ${result.mode ?? 'unknown'} mode; settlement ${result.settlement?.status ?? 'pending'}`,
      );
    } catch (error: any) {
      const failedReceipt = markPrivatePaymentRailFailed(receipt, error.message, {
        workerUrl: runtime.railWorkerUrl,
      });
      const receipts = updatePrivatePaymentReceipt(failedReceipt);
      setPaymentReceipts(receipts);
      setLastPayment((current) => current?.id === receipt.id ? failedReceipt : current);
      setStatus(`Rail worker submit error: ${error.message}`);
    } finally {
      setSubmittingRailId(null);
    }
  };

  const handleRefreshRailStatus = async (receipt: PrivatePaymentReceipt) => {
    const authorizationId = receipt.railWorker?.authorizationId;
    const workerUrl = receipt.railWorker?.workerUrl ?? runtime.railWorkerUrl;
    if (!authorizationId || !workerUrl) {
      setStatus('Submit this receipt to the rail worker before refreshing status');
      return;
    }

    setRefreshingRailId(receipt.id);
    setStatus(`Refreshing rail settlement ${authorizationId}...`);
    try {
      const result = await getRailWorkerSettlement(workerUrl, authorizationId);
      if (!result.ok || !result.settlement) {
        const reason = result.error ?? `rail worker returned HTTP ${result.status}`;
        const failedReceipt = markPrivatePaymentRailFailed(receipt, reason, {
          authorizationId,
          workerUrl: result.workerUrl,
          responseStatus: result.status,
        });
        const receipts = updatePrivatePaymentReceipt(failedReceipt);
        setPaymentReceipts(receipts);
        setLastPayment((current) => current?.id === receipt.id ? failedReceipt : current);
        setStatus(`Rail status refresh failed: ${reason}`);
        return;
      }

      const updatedReceipt = markPrivatePaymentRailStatus(
        receipt,
        railWorkerStatusFromLedgerEntry(result.workerUrl, result.settlement),
      );
      const receipts = updatePrivatePaymentReceipt(updatedReceipt);
      setPaymentReceipts(receipts);
      setLastPayment((current) => current?.id === receipt.id ? updatedReceipt : current);
      setStatus(`Rail status: ${result.settlement.settlementStatus ?? 'pending'} for ${authorizationId}`);
    } catch (error: any) {
      const failedReceipt = markPrivatePaymentRailFailed(receipt, error.message, {
        authorizationId,
        workerUrl,
      });
      const receipts = updatePrivatePaymentReceipt(failedReceipt);
      setPaymentReceipts(receipts);
      setLastPayment((current) => current?.id === receipt.id ? failedReceipt : current);
      setStatus(`Rail status error: ${error.message}`);
    } finally {
      setRefreshingRailId(null);
    }
  };

  const handleAnchorPaymentReceipt = async (receipt: PrivatePaymentReceipt) => {
    if (!publicKey) {
      setStatus('Connect a wallet to anchor the private-payment intent on Solana');
      return;
    }

    setAnchoringReceiptId(receipt.id);
    setStatus(`Anchoring ${receipt.id} on Solana via Memo intent...`);
    try {
      const darkClient = createDarkProtocolClient(connection, wallet);
      const signature = await darkClient.anchorPrivatePayment(receipt);
      const anchoredReceipt = markPrivatePaymentAnchored(receipt, {
        signature,
        cluster: runtime.defaultNetwork,
        payer: publicKey.toBase58(),
        commitment: 'confirmed',
      });
      const receipts = updatePrivatePaymentReceipt(anchoredReceipt);
      setPaymentReceipts(receipts);
      setLastPayment((current) => current?.id === receipt.id ? anchoredReceipt : current);
      setStatus(`Anchored ${receipt.id} on Solana: ${signature.slice(0, 20)}...`);
    } catch (error: any) {
      const failedReceipt = markPrivatePaymentFailed(receipt, error.message);
      const receipts = updatePrivatePaymentReceipt(failedReceipt);
      setPaymentReceipts(receipts);
      setLastPayment((current) => current?.id === receipt.id ? failedReceipt : current);
      setStatus(`Payment anchor error: ${error.message}`);
    } finally {
      setAnchoringReceiptId(null);
    }
  };

  const handleVerifyPaymentReceipt = async (receipt: PrivatePaymentReceipt) => {
    if (!receipt.solanaAnchor?.signature) {
      setStatus('Anchor the private-payment receipt before verifying it');
      return;
    }

    setVerifyingReceiptId(receipt.id);
    setStatus(`Verifying ${receipt.id} against Solana Memo payload...`);
    try {
      const darkClient = createDarkProtocolClient(connection, wallet);
      const result = await darkClient.verifyPrivatePaymentAnchor(receipt);
      if (!result.ok) {
        const reason = result.mismatches?.length
          ? result.mismatches.join('; ')
          : result.reason ?? 'Unknown verification failure';
        const failedReceipt = markPrivatePaymentVerificationFailed(receipt, reason);
        const receipts = updatePrivatePaymentReceipt(failedReceipt);
        setPaymentReceipts(receipts);
        setLastPayment((current) => current?.id === receipt.id ? failedReceipt : current);
        setStatus(`Verification failed for ${receipt.id}: ${reason}`);
        return;
      }

      const verifiedReceipt = markPrivatePaymentVerified(receipt, {
        signature: result.signature,
        slot: result.slot ?? 0,
        blockTime: result.blockTime,
        payer: result.payer ?? receipt.solanaAnchor.payer ?? '',
        memoMatched: true,
      });
      const receipts = updatePrivatePaymentReceipt(verifiedReceipt);
      setPaymentReceipts(receipts);
      setLastPayment((current) => current?.id === receipt.id ? verifiedReceipt : current);
      setStatus(`Verified ${receipt.id} on Solana slot ${result.slot}`);
    } catch (error: any) {
      const failedReceipt = markPrivatePaymentVerificationFailed(receipt, error.message);
      const receipts = updatePrivatePaymentReceipt(failedReceipt);
      setPaymentReceipts(receipts);
      setLastPayment((current) => current?.id === receipt.id ? failedReceipt : current);
      setStatus(`Verification error: ${error.message}`);
    } finally {
      setVerifyingReceiptId(null);
    }
  };

  return (
    <div className="space-y-6 paper-wallet-print-root">
      <div className="section-header">
        <p className="section-kicker">Cold Storage</p>
        <h3 className="section-title">
          Solana Paper Wallet
        </h3>
        <p className="section-copy">
          Local Solana key generation adapted from the Zcash Sapling paper-wallet flow.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="card paper-wallet-print-sheet">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 paper-wallet-controls">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Label</label>
              <input className="input" value={label} onChange={(event) => setLabel(event.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Network</label>
              <input className="input" value={formatNetworkLabel(runtime.defaultNetwork)} readOnly />
            </div>
          </div>

          <div className="mt-4 paper-wallet-controls">
            <label className="block text-sm font-medium text-gray-300 mb-2">Extra Entropy</label>
            <textarea
              className="input min-h-[110px]"
              value={entropy}
              onChange={(event) => setEntropy(event.target.value)}
              placeholder="Type random characters before generation"
            />
          </div>

          <div className="surface-actions flex flex-wrap gap-3 mt-4 paper-wallet-controls">
            <button className="btn-primary" onClick={handleGenerate} disabled={isBusy}>
              Generate
            </button>
            <button className="btn-secondary" onClick={handlePrint} disabled={!paperWallet}>
              Print
            </button>
            <button className="btn-secondary" onClick={handleDownload} disabled={!paperWallet}>
              Download JSON
            </button>
          </div>

          {paperWallet && (
            <div className="mt-6 space-y-4 font-mono text-sm">
              <div className="mini-panel">
                <p className="metric-label mb-2">Public Key</p>
                <p className="break-all text-cyan-300">{paperWallet.publicKey}</p>
              </div>
              <div className="mini-panel">
                <div className="flex items-center justify-between gap-3 mb-2 paper-wallet-controls">
                  <p className="metric-label">Secret Key JSON</p>
                  <button className="text-xs text-cyan-300 hover:text-cyan-200" onClick={() => setShowSecret((value) => !value)}>
                    {showSecret ? 'Hide' : 'Reveal'}
                  </button>
                </div>
                <textarea
                  className="input min-h-[180px] font-mono text-xs"
                  readOnly
                  value={showSecret ? paperWallet.secretKeyJson : '[hidden until reveal]'}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="mini-panel">
                  <p className="metric-label">Seed Fingerprint</p>
                  <p className="text-emerald-300">{paperWallet.seedFingerprint}</p>
                </div>
                <div className="mini-panel">
                  <p className="metric-label">Public Fingerprint</p>
                  <p className="text-emerald-300">{paperWallet.publicFingerprint}</p>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="card paper-wallet-sidecar">
          <p className="section-kicker mb-2">Agent Sidecar</p>
          <h4 className="footer-title">Dark Clawd Agent</h4>
          <textarea
            className="input min-h-[120px]"
            value={agentPrompt}
            onChange={(event) => setAgentPrompt(event.target.value)}
          />
          <button className="btn-primary mt-4 w-full" onClick={handleAskAgent} disabled={isBusy}>
            Ask Dark Clawd
          </button>
          <div className="mini-panel mt-4 min-h-[120px] text-sm text-gray-300 whitespace-pre-wrap">
            {agentResponse || 'xAI sidecar is ready when XAI_API_KEY is configured.'}
          </div>
        </section>
      </div>

      <section className="card paper-wallet-sidecar">
        <p className="section-kicker mb-2">Rail Primitive</p>
        <h4 className="footer-title">Private Payment Primitive</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <select className="input" value={rail} onChange={(event) => setRail(event.target.value as PrivatePaymentRail)}>
            <option value="x402">x402</option>
            <option value="ap2">AP2</option>
            <option value="m2m">M2M</option>
          </select>
          <select className="input" value={settlement} onChange={(event) => setSettlement(event.target.value as PrivatePaymentSettlement)}>
            <option value="solana">Solana settlement</option>
            <option value="evm">EVM settlement</option>
          </select>
          <select className="input" value={proofLayer} onChange={(event) => setProofLayer(event.target.value as PrivatePaymentProofLayer)}>
            <option value="evm">EVM proof</option>
            <option value="solana">Solana proof</option>
          </select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <input className="input" type="number" min="0.001" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
          <input className="input" value={paymentRecipient} onChange={(event) => setPaymentRecipient(event.target.value)} placeholder={publicKey?.toBase58() || 'private-counterparty'} />
          <input className="input" value={paymentMemo} onChange={(event) => setPaymentMemo(event.target.value)} />
        </div>
        <label className="mt-4 flex items-center gap-3 text-sm text-gray-300">
          <input type="checkbox" checked={durableReceipt} onChange={(event) => setDurableReceipt(event.target.checked)} />
          Durable non-ephemeral receipt
        </label>
        <button className="btn-primary mt-4" onClick={handleStagePayment}>
          Stage Private Payment
        </button>
        {lastPayment && (
          <div className="mini-panel mt-4 text-sm text-gray-300">
            <p>Receipt: {lastPayment.id}</p>
            <p>Amount: {lastPayment.amountLamports} lamports</p>
            <p>Commitment: {lastPayment.commitmentHex}</p>
          </div>
        )}
        {paymentReceipts.length > 0 && (
          <div className="mini-panel mt-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="footer-title">Local Receipt History</p>
                <p className="hint">
                  Kept in this browser only; export payloads for EVM chain {runtime.evmChainId}
                  {runtime.evmPrivatePaymentVerifier ? ` verifier ${runtime.evmPrivatePaymentVerifier.slice(0, 10)}...` : ''}
                  {' '}or anchor the intent on Solana.
                  {runtime.railWorkerUrl ? ` Rail worker: ${runtime.railWorkerUrl}` : ' Set RAIL_WORKER_URL to submit rails directly.'}
                </p>
              </div>
              <span className="section-kicker">{paymentReceipts.length} stored</span>
            </div>
            <div className="space-y-3">
              {paymentReceipts.slice(0, 5).map((receipt) => (
                <div key={receipt.id} className="rounded-lg border border-gray-800 bg-gray-950/70 p-3 text-sm text-gray-300">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-cyan-300 break-all">{receipt.id}</p>
                      <p className="text-xs text-gray-500">
                        {receipt.rail.toUpperCase()} / {receipt.settlement.toUpperCase()} settlement / {receipt.proofLayer.toUpperCase()} proof
                      </p>
                      <p className={`mt-1 text-xs ${
                        receipt.status === 'anchored'
                          ? 'text-emerald-300'
                          : receipt.status === 'failed'
                            ? 'text-red-300'
                            : 'text-amber-300'
                      }`}>
                        {receipt.status.toUpperCase()}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-secondary text-xs" onClick={() => handleExportPaymentProof(receipt)}>
                        Export Proof Payload
                      </button>
                      <button className="btn-secondary text-xs" onClick={() => handleCheckEvmProof(receipt)} disabled={checkingProofId === receipt.id}>
                        {checkingProofId === receipt.id ? 'Checking...' : 'Check EVM Proof'}
                      </button>
                      <button className="btn-secondary text-xs" onClick={() => handleExportRailAuthorization(receipt)}>
                        Export Rail Auth
                      </button>
                      <button className="btn-secondary text-xs" onClick={() => handleCheckRailAuthorization(receipt)} disabled={checkingRailId === receipt.id}>
                        {checkingRailId === receipt.id ? 'Checking...' : 'Check Rail Auth'}
                      </button>
                      <button
                        className="btn-primary text-xs"
                        onClick={() => handleSubmitRailAuthorization(receipt)}
                        disabled={
                          !runtime.railWorkerUrl
                            || !receipt.solanaAnchor
                            || submittingRailId === receipt.id
                            || Boolean(receipt.railWorker?.authorizationId && !receipt.railWorker.lastError)
                        }
                      >
                        {receipt.railWorker?.authorizationId && !receipt.railWorker.lastError
                          ? 'Rail Submitted'
                          : submittingRailId === receipt.id
                            ? 'Submitting...'
                            : 'Submit Rail'}
                      </button>
                      <button
                        className="btn-secondary text-xs"
                        onClick={() => handleRefreshRailStatus(receipt)}
                        disabled={!receipt.railWorker?.authorizationId || refreshingRailId === receipt.id}
                      >
                        {refreshingRailId === receipt.id ? 'Refreshing...' : 'Rail Status'}
                      </button>
                      <button
                        className="btn-primary text-xs"
                        onClick={() => handleAnchorPaymentReceipt(receipt)}
                        disabled={!publicKey || anchoringReceiptId === receipt.id || receipt.status === 'anchored'}
                      >
                        {receipt.status === 'anchored'
                          ? 'Anchored'
                          : anchoringReceiptId === receipt.id
                            ? 'Anchoring...'
                            : 'Anchor on Solana'}
                      </button>
                      <button
                        className="btn-secondary text-xs"
                        onClick={() => handleVerifyPaymentReceipt(receipt)}
                        disabled={!receipt.solanaAnchor || verifyingReceiptId === receipt.id}
                      >
                        {receipt.solanaVerification
                          ? 'Verified'
                          : verifyingReceiptId === receipt.id
                            ? 'Verifying...'
                            : 'Verify Anchor'}
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 font-mono text-xs text-gray-400 break-all">{receipt.commitmentHex}</p>
                  {receipt.solanaAnchor && (
                    <a
                      className="mt-2 inline-block text-xs text-cyan-300 hover:text-cyan-200"
                      href={receipt.solanaAnchor.explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Solana anchor: {receipt.solanaAnchor.signature.slice(0, 20)}...
                    </a>
                  )}
                  {receipt.solanaVerification && (
                    <p className="mt-2 text-xs text-emerald-300">
                      Verified on slot {receipt.solanaVerification.slot} by {receipt.solanaVerification.payer.slice(0, 8)}...
                    </p>
                  )}
                  {receipt.railWorker && (
                    <div className="mt-2 rounded-md border border-cyan-900/60 bg-cyan-950/20 p-2 text-xs text-cyan-100">
                      <p className="font-mono break-all">Rail auth: {receipt.railWorker.authorizationId || 'not recorded'}</p>
                      <p>
                        Worker: {receipt.railWorker.workerUrl || runtime.railWorkerUrl || 'not configured'} / {receipt.railWorker.mode ?? 'unsubmitted'}
                      </p>
                      <p>
                        Settlement: {receipt.railWorker.settlementStatus ?? 'pending'}
                        {receipt.railWorker.settled ? ' / settled' : ' / not settled'}
                        {receipt.railWorker.ledgerDurable ? ' / durable ledger' : ''}
                      </p>
                      {receipt.railWorker.settlementId && (
                        <p className="font-mono break-all">Settlement ID: {receipt.railWorker.settlementId}</p>
                      )}
                      {receipt.railWorker.transactionId && (
                        <p className="font-mono break-all">Transaction ID: {receipt.railWorker.transactionId}</p>
                      )}
                      {receipt.railWorker.lastError && (
                        <p className="text-red-300">Rail error: {receipt.railWorker.lastError}</p>
                      )}
                    </div>
                  )}
                  {receipt.lastError && (
                    <p className="mt-2 text-xs text-red-300">{receipt.lastError}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {status && (
        <div className={`p-4 rounded-lg ${
          status.startsWith('Error') || status.includes('error')
            ? 'bg-red-500/20 border border-red-500/50 text-red-400'
            : 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-300'
        }`}>
          {status}
        </div>
      )}
    </div>
  );
};

export default PaperWallet;
