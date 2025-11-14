import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { ExternalLink, RefreshCw, Copy, Upload, ChevronLeft, ChevronRight } from 'lucide-react';

const ModelRegistryABI = {
  abi: [
    "function totalModels() view returns (uint256)",
    "function getModel(uint256) view returns (uint256 modelId, string ipfsCID, bytes32 metadataHash, uint256 qualityScore, uint256 dpEpsilon, address[] contributors, uint256[] rewards, uint256 publishTimestamp, address publisher, uint256 roundId)",
    "function registerRoundCommit(bytes32 commitHash, uint256 round)",
    "event ModelPublished(uint256 indexed modelId, string ipfsCID, bytes32 metadataHash, uint256 qualityScore, uint256 dpEpsilon, address publisher, uint256 roundId)",
    "event BatchCommitsRegistered(uint256 indexed firstCommitId, uint256 count, uint256 indexed roundId)"
  ]
};

interface ModelData {
  id: number;
  cid: string;
  qualityScore: number;
  contributorCount: number;
  round: number;
  dpEpsilon: number;
  publisher: string;
  contributors: string[];
  rewards: bigint[];
  timestamp: number;
  metadataHash: string;
}

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File, numExamples: number, quality: number, round: number) => Promise<void>;
  modelId?: number;
}

function UploadDeltaModal({ isOpen, onClose, onUpload, modelId }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [numExamples, setNumExamples] = useState('100');
  const [quality, setQuality] = useState('0.95');
  const [round, setRound] = useState('1');
  const [uploading, setUploading] = useState(false);

  const handleSubmit = async () => {
    if (!file) return;
    setUploading(true);
    try {
      await onUpload(file, parseInt(numExamples), parseFloat(quality), parseInt(round));
      onClose();
      setFile(null);
      setNumExamples('100');
      setQuality('0.95');
      setRound('1');
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-white/10 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <h3 className="text-xl font-semibold text-white mb-4">
          Upload Delta {modelId !== undefined && `for Model #${modelId}`}
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-2">Model Delta File (.npz)</label>
            <input type="file" accept=".npz" onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-2">Round Number</label>
            <input type="number" value={round} onChange={(e) => setRound(e.target.value)} min="1"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-2">Number of Examples</label>
            <input type="number" value={numExamples} onChange={(e) => setNumExamples(e.target.value)} min="1"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-2">Quality Score (0-1)</label>
            <input type="number" step="0.01" value={quality} onChange={(e) => setQuality(e.target.value)} min="0" max="1"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} disabled={uploading}
              className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white text-sm transition-colors">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={uploading || !file}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {uploading ? 'Uploading...' : 'Upload & Sign'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GlobalModelViewer() {
  const [models, setModels] = useState<ModelData[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalModels, setTotalModels] = useState(0);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadModelId, setUploadModelId] = useState<number | undefined>();
  const [contract, setContract] = useState<ethers.Contract | null>(null);

  const pageSize = 10;
  const totalPages = Math.ceil(totalModels / pageSize);

  useEffect(() => {
    const initContract = async () => {
      try {
        const contractAddress = import.meta.env.VITE_MODEL_REGISTRY_ADDRESS;
        const rpcUrl = import.meta.env.VITE_RPC_URL || 'http://127.0.0.1:8545';
        if (!contractAddress) {
          throw new Error('VITE_MODEL_REGISTRY_ADDRESS not configured');
        }
        const newProvider = new ethers.JsonRpcProvider(rpcUrl);
        const newContract = new ethers.Contract(contractAddress, ModelRegistryABI.abi, newProvider);
        setContract(newContract);
        newContract.on('ModelPublished', () => fetchPage(currentPage));
        newContract.on('BatchCommitsRegistered', () => fetchPage(currentPage));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize contract');
      }
    };
    initContract();
    return () => { if (contract) contract.removeAllListeners(); };
  }, []);

  const fetchPage = useCallback(async (page: number) => {
    if (!contract) return;
    setLoading(true);
    setError(null);
    try {
      const total = await contract.totalModels();
      const totalCount = Number(total);
      setTotalModels(totalCount);
      if (totalCount === 0) { setModels([]); setLoading(false); return; }
      const startId = Math.max(0, totalCount - 1 - page * pageSize);
      const endId = Math.max(0, startId - pageSize + 1);
      const pageModels: ModelData[] = [];
      for (let i = startId; i >= endId && i >= 0; i--) {
        try {
          const modelData = await contract.getModel(i);
          pageModels.push({
            id: i, cid: modelData[1], qualityScore: Number(modelData[3]),
            contributorCount: modelData[5].length, dpEpsilon: Number(modelData[4]),
            publisher: modelData[8], contributors: modelData[5], rewards: modelData[6],
            timestamp: Number(modelData[7]), round: Number(modelData[9]), metadataHash: modelData[2]
          });
        } catch (err) { console.warn(`Failed to fetch model ${i}:`, err); }
      }
      setModels(pageModels);
      if (!selectedModel && pageModels.length > 0) setSelectedModel(pageModels[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch models');
    } finally { setLoading(false); }
  }, [contract, selectedModel]);

  useEffect(() => { if (contract) fetchPage(currentPage); }, [contract, currentPage, fetchPage]);

  const handleCopy = (text: string) => { navigator.clipboard.writeText(text); alert('Copied!'); };
  const handleOpenIPFS = (cid: string) => {
    const gateway = import.meta.env.VITE_IPFS_GATEWAY || 'http://127.0.0.1:8080';
    window.open(`${gateway}/ipfs/${cid}`, '_blank');
  };

  const handleUploadDelta = async (file: File, numExamples: number, quality: number, round: number) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploadResponse = await fetch('/upload-delta', { method: 'POST', body: formData });
      if (!uploadResponse.ok) throw new Error('File upload failed');
      const { cid } = await uploadResponse.json();
      if (!window.ethereum) throw new Error('MetaMask not installed');
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      await browserProvider.send('eth_requestAccounts', []);
      const signer = await browserProvider.getSigner();
      const address = await signer.getAddress();
      const message = `${cid}|round:${round}|examples:${numExamples}|quality:${quality}`;
      const signature = await signer.signMessage(message);
      const sha256 = ethers.keccak256(ethers.toUtf8Bytes(cid)).slice(0, 66);
      const manifestResponse = await fetch('/submit-payload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid, sha256, round, num_examples: numExamples, quality, submitter: address, message, signature })
      });
      if (!manifestResponse.ok) throw new Error('Manifest submission failed');
      if (contract) {
        const commitHash = ethers.keccak256(ethers.toUtf8Bytes(cid));
        const contractWithSigner = contract.connect(signer);
        const tx = await contractWithSigner.registerRoundCommit(commitHash, round);
        await tx.wait();
      }
      alert('Delta uploaded successfully!');
      fetchPage(currentPage);
    } catch (error) { console.error('Upload workflow error:', error); throw error; }
  };

  if (error && !contract) {
    return (
      <div className="min-h-screen bg-black p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-br from-red-900/40 via-red-800/30 to-red-900/40 backdrop-blur-md border border-red-500/20 rounded-xl p-6">
            <div className="text-red-400 mb-2 font-semibold">⚠️ Configuration Error</div>
            <p className="text-gray-300 text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-6">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
      `}</style>
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-8">
            <div className="bg-gradient-to-br from-black/40 via-black/30 to-white/5 backdrop-blur-md border border-white/6 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b border-white/6">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold text-white">Global Models</h2>
                  <span className="px-2 py-1 text-xs font-medium text-green-400 bg-green-500/10 rounded border border-green-500/20">On-chain</span>
                  {totalModels > 0 && <span className="text-sm text-gray-400">{totalModels} model{totalModels !== 1 ? 's' : ''}</span>}
                </div>
                <button onClick={() => fetchPage(currentPage)} disabled={loading}
                  className="p-2 hover:bg-white/5 rounded-lg transition-colors text-gray-400 hover:text-white">
                  <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>
              {loading && models.length === 0 ? (
                <div className="p-12 text-center">
                  <RefreshCw className="animate-spin mx-auto mb-3 text-gray-400" size={32} />
                  <p className="text-gray-400">Loading models from blockchain...</p>
                </div>
              ) : totalModels === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-gray-400 mb-2">No models published yet</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/6">
                          <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase">Round</th>
                          <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase">IPFS CID</th>
                          <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase">Quality</th>
                          <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase">DP ε</th>
                          <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase">Contributors</th>
                          <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase">Published</th>
                        </tr>
                      </thead>
                      <tbody>
                        {models.map((model) => (
                          <tr key={model.id} onClick={() => setSelectedModel(model)}
                            className={`border-b border-white/4 hover:bg-white/6 cursor-pointer transition-colors ${selectedModel?.id === model.id ? 'bg-white/8' : 'bg-white/2'}`}>
                            <td className="p-4"><span className="text-sm font-medium text-white">#{model.round}</span></td>
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                <button onClick={(e) => { e.stopPropagation(); handleOpenIPFS(model.cid); }} title={model.cid}
                                  className="font-mono text-sm text-blue-400 hover:text-blue-300">
                                  {model.cid.slice(0, 6)}...{model.cid.slice(-4)}
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); handleCopy(model.cid); }}
                                  className="p-1 hover:bg-white/10 rounded"><Copy size={14} className="text-gray-400" /></button>
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-green-400"></div>
                                <span className="text-sm text-white font-medium">{(model.qualityScore / 100).toFixed(2)}%</span>
                              </div>
                            </td>
                            <td className="p-4"><span className="text-sm text-purple-300">{(model.dpEpsilon / 100).toFixed(2)}</span></td>
                            <td className="p-4">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm text-white font-medium">{model.contributorCount}</span>
                                <span className="text-xs text-gray-400">users</span>
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="text-xs text-gray-400">
                                <div>{new Date(model.timestamp * 1000).toLocaleDateString()}</div>
                                <div className="text-gray-500">
                                  {new Date(model.timestamp * 1000).toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })} UTC
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between p-4 border-t border-white/6">
                      <div className="text-sm text-gray-400">Page {currentPage + 1} of {totalPages}</div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setCurrentPage(Math.max(0, currentPage - 1))} disabled={currentPage === 0}
                          className="p-2 hover:bg-white/5 rounded-lg transition-colors text-gray-400 hover:text-white disabled:opacity-30">
                          <ChevronLeft size={18} />
                        </button>
                        <input type="number" value={currentPage + 1} min={1} max={totalPages}
                          onChange={(e) => { const page = parseInt(e.target.value) - 1; if (page >= 0 && page < totalPages) setCurrentPage(page); }}
                          className="w-16 px-2 py-1 bg-white/5 border border-white/10 rounded text-center text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <button onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))} disabled={currentPage >= totalPages - 1}
                          className="p-2 hover:bg-white/5 rounded-lg transition-colors text-gray-400 hover:text-white disabled:opacity-30">
                          <ChevronRight size={18} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="col-span-4">
            <div className="bg-gradient-to-br from-gray-900/90 via-gray-800/80 to-gray-900/90 backdrop-blur-md border border-white/10 rounded-xl p-6 sticky top-6">
              {selectedModel ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">Round #{selectedModel.round}</h3>
                    <span className="text-xs text-gray-400">Model #{selectedModel.id}</span>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <div className="text-xs text-gray-400 mb-1">IPFS CID</div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 font-mono text-xs text-white break-all bg-white/5 p-2 rounded border border-white/10">{selectedModel.cid}</div>
                        <button onClick={() => handleCopy(selectedModel.cid)} title="Copy CID"
                          className="p-2 hover:bg-white/10 rounded transition-colors flex-shrink-0">
                          <Copy size={14} className="text-gray-400" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Metadata Hash</div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 font-mono text-xs text-gray-500 break-all bg-white/5 p-2 rounded border border-white/10">{selectedModel.metadataHash}</div>
                        <button onClick={() => handleCopy(selectedModel.metadataHash)} title="Copy Hash"
                          className="p-2 hover:bg-white/10 rounded transition-colors flex-shrink-0">
                          <Copy size={14} className="text-gray-400" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                        <div className="text-xs text-green-400 mb-1">Quality Score</div>
                        <div className="text-lg font-semibold text-white">{(selectedModel.qualityScore / 100).toFixed(2)}%</div>
                      </div>
                      <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                        <div className="text-xs text-purple-400 mb-1">DP Epsilon</div>
                        <div className="text-lg font-semibold text-white">{(selectedModel.dpEpsilon / 100).toFixed(2)}</div>
                      </div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                      <div className="text-xs text-gray-400 mb-2">Published By</div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="font-mono text-xs text-gray-300">{selectedModel.publisher.slice(0, 6)}...{selectedModel.publisher.slice(-4)}</div>
                        <button onClick={() => handleCopy(selectedModel.publisher)} title="Copy Address"
                          className="p-1 hover:bg-white/10 rounded transition-colors">
                          <Copy size={12} className="text-gray-400" />
                        </button>
                      </div>
                      <div className="text-xs text-gray-400">
                        {new Date(selectedModel.timestamp * 1000).toLocaleDateString()} at {new Date(selectedModel.timestamp * 1000).toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit' })} UTC
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-2">Contributors ({selectedModel.contributorCount})</div>
                      <div className="space-y-2 h-48 overflow-y-auto pr-2 custom-scrollbar">
                        {selectedModel.contributors.map((addr, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 bg-white/5 p-2 rounded border border-white/10">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="font-mono text-xs text-gray-300 truncate">{addr.slice(0, 6)}...{addr.slice(-4)}</div>
                              <button onClick={() => handleCopy(addr)} title="Copy Address"
                                className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0">
                                <Copy size={12} className="text-gray-400" />
                              </button>
                            </div>
                            {selectedModel.rewards[i] && (
                              <div className="text-xs text-green-400 font-medium flex-shrink-0">
                                {parseFloat(ethers.formatEther(selectedModel.rewards[i])).toFixed(2)} RWD
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {selectedModel.rewards.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/10">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-400">Total Rewards</span>
                            <span className="text-green-400 font-semibold">
                              {selectedModel.rewards.reduce((sum, r) => sum + parseFloat(ethers.formatEther(r)), 0).toFixed(2)} RWD
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="pt-2 space-y-2">
                      <button onClick={() => { setUploadModelId(selectedModel.id); setUploadModalOpen(true); }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm font-medium transition-colors">
                        <Upload size={16} /> Upload Delta for Next Round
                      </button>
                      <button onClick={() => handleOpenIPFS(selectedModel.cid)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white text-sm transition-colors">
                        View Model on IPFS <ExternalLink size={16} />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-sm">Select a model to view details</p>
                  <p className="text-xs text-gray-500 mt-2">Click any row in the table</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <UploadDeltaModal isOpen={uploadModalOpen} onClose={() => setUploadModalOpen(false)} onUpload={handleUploadDelta} modelId={uploadModelId} />
    </div>
  );
}
