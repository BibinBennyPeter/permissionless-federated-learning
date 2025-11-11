import { useState } from 'react';
import { ethers } from 'ethers';
import Header from './components/Header';
import ModelSubmission from './components/ModelSubmission';
import AggregatorPanel from './components/AggregatorPanel';
import GlobalModelViewer from './components/GlobalModelViewer';

function App() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const handleWalletConnect = (address: string, signerInstance: ethers.Signer) => {
    setWalletAddress(address);
    setSigner(signerInstance);
  };

  const addLog = (message: string) => {
    setLogs(prev => [...prev, message]);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header onWalletConnect={handleWalletConnect} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Permissionless Federated Learning</h1>
          <p className="text-gray-600">Submit your local model, participate in aggregation, and view the global model state.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <ModelSubmission
            walletAddress={walletAddress}
            signer={signer}
            onLog={addLog}
          />
          <AggregatorPanel logs={logs} />
        </div>

        <GlobalModelViewer />
      </main>
    </div>
  );
}

export default App;
