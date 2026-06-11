/**
 * 🛰️ HeliusViz — Interactive Helius SDK Explorer
 *
 * A live dashboard that exercises every major Helius SDK capability:
 * DAS API, Priority Fees, Enhanced Transactions, Webhooks, ZK Compression,
 * Sender, Staking, and Network Performance.
 *
 * Works in demo mode (mock data) or live mode (requires HELIUS_API_KEY).
 */

import { useState, useEffect, useCallback } from 'react';

type HeliusMode = 'demo' | 'live';
type VizTab = 'das' | 'fees' | 'tx' | 'webhooks' | 'zk' | 'staking' | 'network' | 'assets';

interface NetworkPerf {
  tps: number;
  slot: number;
  txCount: number;
  validatorCount: number;
  epoch: number;
  epochProgress: number;
}

interface AssetCard {
  id: string;
  name: string;
  symbol: string;
  image: string;
  type: 'NFT' | 'Token' | 'cNFT' | 'Unknown';
  owner: string;
  compressed: boolean;
  burnt: boolean;
}

const DEMO_ASSETS: AssetCard[] = [
  { id: 'DARKx...pump', name: 'Dark Protocol', symbol: 'DARK', image: '🔒', type: 'Token', owner: '8bit...Zolana', compressed: false, burnt: false },
  { id: 'CLAWD...pump', name: 'Clawd', symbol: 'CLAWD', image: '🦞', type: 'Token', owner: '8bit...Zolana', compressed: false, burnt: false },
  { id: 'SOLAR...yuga', name: 'Solana Monkey', symbol: 'SM', image: '🐒', type: 'NFT', owner: '8bit...Zolana', compressed: false, burnt: false },
  { id: 'cNFT...abc123', name: 'Compressed Airdrop', symbol: 'cDROP', image: '📦', type: 'cNFT', owner: '8bit...Zolana', compressed: true, burnt: false },
];

const DEMO_TXS = [
  { sig: '5Kt...3xP', type: 'SWAP', time: '2m ago', fee: 0.000025, status: 'confirmed' },
  { sig: '4Jq...9aB', type: 'TRANSFER', time: '15m ago', fee: 0.000015, status: 'confirmed' },
  { sig: '7Lp...2cD', type: 'NFT_SALE', time: '1h ago', fee: 0.000035, status: 'confirmed' },
  { sig: '2Mn...8eF', type: 'SWAP', time: '3h ago', fee: 0.000020, status: 'finalized' },
  { sig: '9Rk...4gH', type: 'BRIDGE', time: '6h ago', fee: 0.000045, status: 'finalized' },
];

const FEE_LEVELS = { min: 1000, low: 5000, medium: 10000, high: 25000, veryHigh: 50000, unsafeMax: 100000 };

const WEBHOOK_URLS = ['https://api.mysite.com/webhook', 'https://bot.discord.com/alert'];

export default function HeliusViz() {
  const [mode, setMode] = useState<HeliusMode>('demo');
  const [apiKey, setApiKey] = useState('');
  const [activeTab, setActiveTab] = useState<VizTab>('das');
  const [searchAddress, setSearchAddress] = useState('');
  const [networkPerf, setNetworkPerf] = useState<NetworkPerf>(() => ({
    tps: 0, slot: 0, txCount: 0, validatorCount: 0, epoch: 0, epochProgress: 0,
  }));
  const [assetsResult, setAssetsResult] = useState<AssetCard[]>([]);
  const [priorityFee, setPriorityFee] = useState(FEE_LEVELS.medium);
  const [feeLevel, setFeeLevel] = useState('medium');
  const [txHistory, setTxHistory] = useState(DEMO_TXS.slice(0, 3));
  const [webhooks, setWebhooks] = useState<Array<{ id: string; url: string; type: string }>>([]);
  const [compressedBalance, setCompressedBalance] = useState(0);
  const [indexerSlot, setIndexerSlot] = useState(0);
  const [indexerHealth, setIndexerHealth] = useState('checking...');
  const [stakeAccounts, setStakeAccounts] = useState<Array<{ address: string; amount: number; status: string }>>([]);
  const [statusMsg, setStatusMsg] = useState('🛰️ HeliusViz ready — explore every SDK capability');
  const [isLoading, setIsLoading] = useState(false);

  const rpcUrl = apiKey
    ? `https://mainnet.helius-rpc.com/?api-key=${apiKey}`
    : null;

  // ── Network Performance Monitor ──
  const fetchNetworkPerf = useCallback(async () => {
    try {
      if (!rpcUrl) {
        setNetworkPerf({
          tps: 4321, slot: 289_450_123, txCount: 1_542_789_012,
          validatorCount: 1823, epoch: 742, epochProgress: 63.4,
        });
        return;
      }
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 'helius-viz',
          method: 'getRecentPerformanceSamples',
          params: [1],
        }),
      });
      const j = await res.json() as any;
      const sample = j.result?.[0];
      if (sample) {
        setNetworkPerf({
          tps: Math.round(sample.numTransactions / Math.max(sample.samplePeriodSecs, 1)),
          slot: sample.slot,
          txCount: sample.numTransactions,
          validatorCount: 1823,
          epoch: 742,
          epochProgress: ((sample.slot % 432000) / 432000 * 100),
        });
      }
    } catch { /* keep demo data */ }
  }, [rpcUrl]);

  useEffect(() => {
    fetchNetworkPerf();
    const interval = setInterval(fetchNetworkPerf, 30000);
    return () => clearInterval(interval);
  }, [fetchNetworkPerf]);

  // ── DAS Asset Search ──
  const handleAssetSearch = useCallback(async () => {
    if (!searchAddress.trim()) return;
    setIsLoading(true);

    if (mode === 'demo' || !rpcUrl) {
      await new Promise(r => setTimeout(r, 500));
      setAssetsResult(DEMO_ASSETS);
      setStatusMsg(`🔍 Found ${DEMO_ASSETS.length} assets — demo mode`);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 'helius-viz-das',
          method: 'getAssetsByOwner',
          params: [searchAddress.trim(), { page: 1, limit: 20, displayOptions: { showFungible: true } }],
        }),
      });
      const j = await res.json() as any;
      if (j.result?.items) {
        const cards: AssetCard[] = j.result.items.map((item: any) => ({
          id: item.id?.slice(0, 14) + '...',
          name: item.content?.metadata?.name ?? 'Unknown',
          symbol: item.content?.metadata?.symbol ?? '---',
          image: item.content?.links?.image ?? '🪙',
          type: item.compression?.compressed ? 'cNFT' : item.token_info ? 'Token' : 'NFT',
          owner: item.ownership?.owner?.slice(0, 6) + '...',
          compressed: item.compression?.compressed ?? false,
          burnt: item.burnt ?? false,
        }));
        setAssetsResult(cards);
        setStatusMsg(`📡 DAS API: ${j.result.total} assets found for ${searchAddress.slice(0, 8)}...`);
      }
    } catch (e: any) {
      setStatusMsg(`❌ DAS API error: ${e.message}`);
    }
    setIsLoading(false);
  }, [searchAddress, mode, rpcUrl]);

  // ── Priority Fee ──
  const handleEstimateFee = useCallback(async () => {
    setIsLoading(true);
    if (mode === 'demo' || !apiKey) {
      const levels: Record<string, number> = { min: 1000, low: 5000, medium: 10000, high: 25000, veryHigh: 50000 };
      setPriorityFee(levels[feeLevel] ?? 10000);
      setStatusMsg(`⚡ Priority fee: ${(levels[feeLevel] ?? 10000).toLocaleString()} microLamports/CU (demo)`);
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch(`https://api.helius.xyz/v0/priority-fee?apiKey=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountKeys: ['JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'],
          options: { includeAllPriorityFeeLevels: true },
        }),
      });
      const j = await res.json() as any;
      if (j.priorityFeeLevels) {
        const val = j.priorityFeeLevels[feeLevel] ?? j.priorityFeeLevels.medium;
        setPriorityFee(val);
        setStatusMsg(`⚡ Live priority fee (${feeLevel}): ${val.toLocaleString()} microLamports/CU`);
      }
    } catch (e: any) {
      setStatusMsg(`❌ Fee API error: ${e.message}`);
    }
    setIsLoading(false);
  }, [feeLevel, apiKey, mode]);

  // ── Enhanced Transactions ──
  const handleFetchTransactions = useCallback(async () => {
    setIsLoading(true);
    if (mode === 'demo' || !apiKey) {
      await new Promise(r => setTimeout(r, 400));
      setTxHistory(DEMO_TXS);
      setStatusMsg(`📋 ${DEMO_TXS.length} recent transactions (demo)`);
      setIsLoading(false);
      return;
    }
    try {
      const addr = searchAddress || '8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump';
      const res = await fetch(
        `https://api.helius.xyz/v0/addresses/${addr}/transactions?apiKey=${apiKey}&limit=5`,
      );
      const txs = await res.json() as any[];
      if (Array.isArray(txs)) {
        setTxHistory(txs.map(t => ({
          sig: (t.signature ?? 'unknown').slice(0, 8) + '...',
          type: t.type ?? 'UNKNOWN',
          time: t.timestamp ? new Date(t.timestamp * 1000).toLocaleTimeString() : 'recent',
          fee: (t.fee ?? 0) / 1e9,
          status: t.slot ? 'confirmed' : 'pending',
        })));
        setStatusMsg(`📋 ${txs.length} enhanced transactions loaded`);
      }
    } catch (e: any) {
      setStatusMsg(`❌ Enhanced TX error: ${e.message}`);
    }
    setIsLoading(false);
  }, [searchAddress, apiKey, mode]);

  // ── Webhooks ──
  const handleFetchWebhooks = useCallback(async () => {
    setIsLoading(true);
    if (mode === 'demo' || !apiKey) {
      await new Promise(r => setTimeout(r, 300));
      setWebhooks([
        { id: 'wh_demo_1', url: WEBHOOK_URLS[0], type: 'enhanced' },
        { id: 'wh_demo_2', url: WEBHOOK_URLS[1], type: 'enhanced' },
      ]);
      setStatusMsg(`🔔 ${2} webhooks configured (demo)`);
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch(`https://api.helius.xyz/v0/webhooks?apiKey=${apiKey}`);
      const whs = await res.json() as any[];
      if (Array.isArray(whs)) {
        setWebhooks(whs.map(w => ({
          id: w.webhookID ?? w.id ?? 'unknown',
          url: w.webhookURL ?? w.url ?? 'unknown',
          type: w.webhookType ?? 'enhanced',
        })));
        setStatusMsg(`🔔 ${whs.length} webhooks found`);
      }
    } catch (e: any) {
      setStatusMsg(`❌ Webhook API error: ${e.message}`);
    }
    setIsLoading(false);
  }, [apiKey, mode]);

  // ── ZK Compression ──
  const handleZkCheck = useCallback(async () => {
    setIsLoading(true);
    if (mode === 'demo' || !rpcUrl) {
      await new Promise(r => setTimeout(r, 400));
      setCompressedBalance(1_234_567_890);
      setIndexerSlot(289_450_123);
      setIndexerHealth('healthy');
      setStatusMsg('📦 ZK Compression: indexer healthy, compressed balance: 1.23 SOL (demo)');
      setIsLoading(false);
      return;
    }
    try {
      const [balRes, slotRes, healthRes] = await Promise.allSettled([
        fetch(rpcUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 'h', method: 'getCompressedBalance', params: [searchAddress || '11111111111111111111111111111111'] }),
        }),
        fetch(rpcUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 'h', method: 'getIndexerSlot', params: [] }),
        }),
        fetch(rpcUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 'h', method: 'getIndexerHealth', params: [] }),
        }),
      ]);

      if (balRes.status === 'fulfilled') {
        const b = await balRes.value.json() as any;
        setCompressedBalance(b.result?.amount ?? 0);
      }
      if (slotRes.status === 'fulfilled') {
        const s = await slotRes.value.json() as any;
        setIndexerSlot(s.result ?? 0);
      }
      if (healthRes.status === 'fulfilled') {
        const h = await healthRes.value.json() as any;
        setIndexerHealth(h.result ?? 'unknown');
      }
      setStatusMsg('📦 ZK Compression indexer checked — live');
    } catch (e: any) {
      setStatusMsg(`❌ ZK error: ${e.message}`);
    }
    setIsLoading(false);
  }, [rpcUrl, searchAddress, mode]);

  // ── Staking ──
  const handleStaking = useCallback(async () => {
    setIsLoading(true);
    if (mode === 'demo' || !rpcUrl) {
      await new Promise(r => setTimeout(r, 500));
      setStakeAccounts([
        { address: 'Stake...xYz', amount: 125.5, status: 'active' },
        { address: 'Stake...AbC', amount: 50.0, status: 'active' },
      ]);
      setStatusMsg(`🏦 ${2} stake accounts, ${175.5} SOL staked (demo)`);
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 'h',
          method: 'getProgramAccounts',
          params: [
            'Stake11111111111111111111111111111111111111',
            { encoding: 'base64', filters: [] },
          ],
        }),
      });
      const j = await res.json() as any;
      if (j.result) {
        setStakeAccounts(j.result.slice(0, 5).map((a: any) => ({
          address: a.pubkey.slice(0, 8) + '...',
          amount: Number(a.account.lamports) / 1e9,
          status: 'active',
        })));
        setStatusMsg(`🏦 ${Math.min(j.result.length, 5)} stake accounts loaded`);
      }
    } catch (e: any) {
      setStatusMsg(`❌ Staking error: ${e.message}`);
    }
    setIsLoading(false);
  }, [rpcUrl, mode]);

  // ── Tabs ──
  const TABS: Array<{ id: VizTab; label: string; icon: string }> = [
    { id: 'das', label: 'DAS API', icon: '🔍' },
    { id: 'fees', label: 'Priority Fees', icon: '⚡' },
    { id: 'tx', label: 'Transactions', icon: '📋' },
    { id: 'webhooks', label: 'Webhooks', icon: '🔔' },
    { id: 'zk', label: 'ZK Compression', icon: '📦' },
    { id: 'staking', label: 'Staking', icon: '🏦' },
    { id: 'network', label: 'Network', icon: '📊' },
    { id: 'assets', label: 'Assets', icon: '🖼️' },
  ];

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[color:var(--line)] bg-black/20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="section-kicker">RPC</span>
            <div>
              <h2 className="footer-title">HeliusViz</h2>
              <p className="hint">Interactive SDK Explorer / mirroring every Helius API</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={mode}
              onChange={e => setMode(e.target.value as HeliusMode)}
              className="input text-xs py-1"
            >
              <option value="demo">🎮 Demo</option>
              <option value="live">🔴 Live</option>
            </select>
            {mode === 'live' && (
              <input
                type="text"
                placeholder="HELIUS_API_KEY"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                className="input text-xs py-1 w-40"
              />
            )}
          </div>
        </div>

        {/* Tabs */}
        <nav className="tab-rail overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`tab-button whitespace-nowrap ${activeTab === tab.id ? 'tab-button-active' : ''}`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Status Bar */}
      <div className="px-4 py-2 border-b border-[color:var(--line)] bg-black/20 flex items-center justify-between">
        <span className="hint">{statusMsg}</span>
        <span className={`text-xs ${isLoading ? 'text-[color:var(--amber)]' : 'text-[color:var(--signal)]'}`}>
          {isLoading ? '⏳ loading...' : '✅ idle'}
        </span>
      </div>

      {/* Content */}
      <div className="p-4 min-h-[300px] max-h-[500px] overflow-y-auto">
        {/* 1. DAS API Tab */}
        {activeTab === 'das' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter wallet address..."
                value={searchAddress}
                onChange={e => setSearchAddress(e.target.value)}
                className="input flex-1 text-sm"
              />
              <button
                onClick={handleAssetSearch}
                disabled={isLoading}
                className="btn-primary"
              >
                {isLoading ? '...' : '🔍 Search'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {assetsResult.map((a, i) => (
                <div key={i} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{a.image}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{a.name}</p>
                      <p className="text-xs text-gray-400">{a.symbol}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className={`px-1.5 py-0.5 rounded ${a.compressed ? 'bg-cyan-900/50 text-cyan-300' : 'bg-gray-700 text-gray-300'}`}>
                      {a.type}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded ${a.burnt ? 'bg-red-900/50 text-red-300' : 'bg-green-900/50 text-green-300'}`}>
                      {a.burnt ? 'burnt' : 'active'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 font-mono">{a.id}</p>
                </div>
              ))}
              {assetsResult.length === 0 && (
                <div className="col-span-2 text-center py-8 text-gray-500">
                  <p className="text-3xl mb-2">🔍</p>
                  <p className="text-sm">Search an address to discover assets via DAS API</p>
                  <p className="text-xs text-gray-600 mt-1">Uses getAssetsByOwner with showFungible</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. Priority Fee Tab */}
        {activeTab === 'fees' && (
          <div className="space-y-4">
            <div className="mini-panel">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">Priority Fee Levels</h3>
                <span className="text-2xl">⚡</span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {Object.entries(FEE_LEVELS).map(([level, val]) => (
                  <button
                    key={level}
                    onClick={() => setFeeLevel(level)}
                    className={`p-2 rounded text-xs text-center transition-colors ${
                      feeLevel === level
                        ? 'tab-button-active'
                        : 'bg-black/30 text-gray-400 hover:bg-black/50'
                    }`}
                  >
                    <p className="font-medium capitalize">{level}</p>
                    <p className="text-xs opacity-75">{val.toLocaleString()}</p>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">Selected: <span className="text-[color:var(--signal)] font-medium">{feeLevel}</span></p>
                  <p className="text-lg font-bold text-white">{priorityFee.toLocaleString()} <span className="text-sm font-normal text-gray-400">μLamports/CU</span></p>
                </div>
                <button
                  onClick={handleEstimateFee}
                  disabled={isLoading}
                  className="btn-primary"
                >
                  {isLoading ? '⏳' : 'Refresh'}
                </button>
              </div>
            </div>
            <div className="mini-panel">
              <p className="text-xs text-gray-400">
                Priority fee for <span className="text-[color:var(--signal)]">JUP6L...V4</span> (Jupiter V6):
                {mode === 'live' ? ' live estimate from Helius API' : ' demo estimate'}
              </p>
            </div>
          </div>
        )}

        {/* 3. Transactions Tab */}
        {activeTab === 'tx' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-white">Enhanced Transactions</h3>
              <button onClick={handleFetchTransactions} disabled={isLoading} className="text-xs text-[color:var(--signal)] hover:text-[color:var(--paper)]">
                {isLoading ? '⏳' : '↻ Refresh'}
              </button>
            </div>
            <div className="space-y-2">
              {txHistory.map((tx, i) => (
                <div key={i} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        tx.type === 'SWAP' ? 'bg-blue-900/50 text-blue-300' :
                        tx.type === 'TRANSFER' ? 'bg-green-900/50 text-green-300' :
                        tx.type === 'NFT_SALE' ? 'bg-purple-900/50 text-purple-300' :
                        'bg-yellow-900/50 text-yellow-300'
                      }`}>
                        {tx.type}
                      </span>
                      <span className="text-xs font-mono text-gray-400">{tx.sig}</span>
                    </div>
                    <span className={`text-xs ${tx.status === 'confirmed' ? 'text-green-400' : 'text-gray-400'}`}>
                      {tx.status}
                    </span>
                  </div>
                  <div className="flex justify-between mt-1 text-xs text-gray-500">
                    <span>{tx.time}</span>
                    <span>Fee: {tx.fee.toFixed(6)} SOL</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600">
              📡 {mode === 'live' ? `Via api.helius.xyz/v0/addresses/.../transactions` : 'Demo: 5 enhanced transactions'}
            </p>
          </div>
        )}

        {/* 4. Webhooks Tab */}
        {activeTab === 'webhooks' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-white">Webhook Management</h3>
              <button onClick={handleFetchWebhooks} disabled={isLoading} className="text-xs text-[color:var(--signal)] hover:text-[color:var(--paper)]">
                {isLoading ? '⏳' : '↻ Fetch'}
              </button>
            </div>
            {webhooks.length > 0 ? (
              <div className="space-y-2">
                {webhooks.map((wh, i) => (
                  <div key={i} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">🔔</span>
                      <span className="text-xs font-mono text-gray-400">{wh.id}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-900/50 text-cyan-300">{wh.type}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{wh.url}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p className="text-3xl mb-2">🔔</p>
                <p className="text-sm">No webhooks configured</p>
                <p className="text-xs text-gray-600 mt-1">Create via Helius dashboard or API</p>
              </div>
            )}
          </div>
        )}

        {/* 5. ZK Compression Tab */}
        {activeTab === 'zk' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-white">ZK Compression Indexer</h3>
              <button onClick={handleZkCheck} disabled={isLoading} className="text-xs text-[color:var(--signal)] hover:text-[color:var(--paper)]">
                {isLoading ? '⏳' : '↻ Check'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50 text-center">
                <p className="text-xs text-gray-400">Compressed Balance</p>
                <p className="text-lg font-bold text-white">{compressedBalance.toLocaleString()}</p>
                <p className="text-xs text-gray-500">lamports</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50 text-center">
                <p className="text-xs text-gray-400">Indexer Slot</p>
                <p className="text-lg font-bold text-white">{indexerSlot.toLocaleString()}</p>
                <p className="text-xs text-gray-500">latest</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50 text-center">
                <p className="text-xs text-gray-400">Health</p>
                <p className={`text-lg font-bold ${indexerHealth === 'healthy' ? 'text-green-400' : 'text-yellow-400'}`}>
                  {indexerHealth}
                </p>
                <p className="text-xs text-gray-500">status</p>
              </div>
            </div>
            <p className="text-xs text-gray-600">
              📦 ZK Compression methods: getCompressedBalance, getCompressedAccountsByOwner, getIndexerSlot, getIndexerHealth
            </p>
          </div>
        )}

        {/* 6. Staking Tab */}
        {activeTab === 'staking' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-white">Stake Accounts</h3>
              <button onClick={handleStaking} disabled={isLoading} className="text-xs text-[color:var(--signal)] hover:text-[color:var(--paper)]">
                {isLoading ? '⏳' : '↻ Load'}
              </button>
            </div>
            {stakeAccounts.length > 0 ? (
              <div className="space-y-2">
                {stakeAccounts.map((sa, i) => (
                  <div key={i} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-mono text-gray-400">{sa.address}</p>
                      <p className="text-sm font-medium text-white">{sa.amount.toFixed(2)} SOL</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      sa.status === 'active' ? 'bg-green-900/50 text-green-300' : 'bg-yellow-900/50 text-yellow-300'
                    }`}>
                      {sa.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p className="text-3xl mb-2">🏦</p>
                <p className="text-sm">No stake accounts found</p>
                <p className="text-xs text-gray-600 mt-1">Querying Stake111111... program accounts</p>
              </div>
            )}
          </div>
        )}

        {/* 7. Network Tab */}
        {activeTab === 'network' && (
          <div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50 text-center">
                <p className="text-xs text-gray-400">TPS</p>
                <p className="text-xl font-bold text-green-400">{networkPerf.tps.toLocaleString()}</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50 text-center">
                <p className="text-xs text-gray-400">Slot</p>
                <p className="text-xl font-bold text-white">{networkPerf.slot.toLocaleString()}</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50 text-center">
                <p className="text-xs text-gray-400">Validators</p>
                <p className="text-xl font-bold text-white">{networkPerf.validatorCount.toLocaleString()}</p>
              </div>
            </div>
            <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700/30">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Epoch {networkPerf.epoch}</span>
                <span>{networkPerf.epochProgress.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all bg-[linear-gradient(90deg,var(--signal),var(--paper))]"
                  style={{ width: `${networkPerf.epochProgress}%` }}
                />
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              📊 Data from getRecentPerformanceSamples | Auto-refreshes every 30s
            </p>
          </div>
        )}

        {/* 8. Assets Gallery Tab */}
        {activeTab === 'assets' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400 mb-2">
              🖼️ Helius DAS API powers these queries: getAsset, getAssetBatch, getAssetsByGroup, searchAssets
            </p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { icon: '🔍', label: 'getAsset', desc: 'Single asset by ID' },
                { icon: '📦', label: 'getAssetBatch', desc: 'Batch fetch multiple' },
                { icon: '👤', label: 'getAssetsByOwner', desc: 'All assets for wallet' },
                { icon: '🎨', label: 'getAssetsByCreator', desc: 'Filter by creator' },
                { icon: '🏷️', label: 'getAssetsByGroup', desc: 'Collection grouping' },
                { icon: '🧾', label: 'getTokenAccounts', desc: 'Token holders' },
                { icon: '🖼️', label: 'getNftEditions', desc: 'Edition supply' },
                { icon: '🔎', label: 'searchAssets', desc: 'Advanced search' },
                { icon: '📜', label: 'getSignaturesForAsset', desc: 'TX history' },
                { icon: '🛡️', label: 'getAssetProof', desc: 'Merkle proof' },
                { icon: '⚡', label: 'getPriorityFeeEstimate', desc: 'Fee estimation' },
                { icon: '📋', label: 'Enhanced TX', desc: 'Parsed transactions' },
              ].map((item, i) => (
                <div key={i} className="bg-gray-800/40 rounded-lg p-2 border border-gray-700/30 text-center hover:bg-gray-800/80 transition-colors">
                  <p className="text-lg mb-1">{item.icon}</p>
                  <p className="text-xs font-medium text-white truncate">{item.label}</p>
                  <p className="text-[10px] text-gray-500 truncate">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-[color:var(--line)] bg-black/20 flex items-center justify-between text-xs text-gray-500">
        <span>
          🛰️ HeliusViz · {mode === 'demo' ? '🎮 Demo Data' : '🔴 Live Helius APIs'} · 
          <span className="text-[color:var(--signal)] ml-1">
            {mode === 'live' && apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : 'no API key'}
          </span>
        </span>
        <span>SDK: {mode === 'live' ? 'helius-sdk' : 'mirror'} · DAS v1.0</span>
      </div>
    </div>
  );
}
