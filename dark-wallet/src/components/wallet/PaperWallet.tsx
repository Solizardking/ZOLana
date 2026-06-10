import React, { useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
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
import {
  stagePrivatePayment,
  type PrivatePaymentProofLayer,
  type PrivatePaymentRail,
  type PrivatePaymentReceipt,
  type PrivatePaymentSettlement,
} from '../../sdk/private-payment';

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
  const { publicKey } = useWallet();
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
      setLastPayment(receipt);
      setStatus(`Queued ${receipt.amountSol} SOL via ${receipt.rail.toUpperCase()} with ${receipt.proofLayer.toUpperCase()} proofing`);
    } catch (error: any) {
      setStatus(`Payment error: ${error.message}`);
    }
  };

  return (
    <div className="space-y-6 paper-wallet-print-root">
      <div>
        <h3 className="text-2xl font-bold mb-2 bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
          Solana Paper Wallet
        </h3>
        <p className="text-gray-400">
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
              <div className="rounded-lg border border-gray-800 bg-black/40 p-4">
                <p className="text-gray-500 uppercase tracking-widest text-xs mb-2">Public Key</p>
                <p className="break-all text-cyan-300">{paperWallet.publicKey}</p>
              </div>
              <div className="rounded-lg border border-gray-800 bg-black/40 p-4">
                <div className="flex items-center justify-between gap-3 mb-2 paper-wallet-controls">
                  <p className="text-gray-500 uppercase tracking-widest text-xs">Secret Key JSON</p>
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
                <div className="rounded-lg border border-gray-800 bg-black/40 p-4">
                  <p className="text-gray-500 uppercase tracking-widest text-xs">Seed Fingerprint</p>
                  <p className="text-emerald-300">{paperWallet.seedFingerprint}</p>
                </div>
                <div className="rounded-lg border border-gray-800 bg-black/40 p-4">
                  <p className="text-gray-500 uppercase tracking-widest text-xs">Public Fingerprint</p>
                  <p className="text-emerald-300">{paperWallet.publicFingerprint}</p>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="card paper-wallet-sidecar">
          <h4 className="font-semibold mb-3 text-gray-200">Dark Clawd Agent</h4>
          <textarea
            className="input min-h-[120px]"
            value={agentPrompt}
            onChange={(event) => setAgentPrompt(event.target.value)}
          />
          <button className="btn-primary mt-4 w-full" onClick={handleAskAgent} disabled={isBusy}>
            Ask Dark Clawd
          </button>
          <div className="mt-4 rounded-lg border border-gray-800 bg-black/40 p-4 min-h-[120px] text-sm text-gray-300 whitespace-pre-wrap">
            {agentResponse || 'xAI sidecar is ready when XAI_API_KEY is configured.'}
          </div>
        </section>
      </div>

      <section className="card paper-wallet-sidecar">
        <h4 className="font-semibold mb-3 text-gray-200">Private Payment Primitive</h4>
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
          <div className="mt-4 rounded-lg border border-gray-800 bg-black/40 p-4 text-sm text-gray-300">
            <p>Receipt: {lastPayment.id}</p>
            <p>Commitment: {lastPayment.commitment}</p>
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
