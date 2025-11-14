import { useState } from 'react';
import { ethers } from 'ethers';
import Header from './components/Header';
import TokenBalance from './components/TokenBalance';
import GlobalModelViewer from './components/GlobalModelViewer';

function App() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);

  const handleWalletConnect = (address: string, signerInstance: ethers.Signer) => {
    setWalletAddress(address);
    setSigner(signerInstance);
  };

  return (
    <div className="min-h-screen bg-black">
      <Header onWalletConnect={handleWalletConnect} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Permissionless Federated Learning</h1>
          <p className="text-gray-400">Submit your local model updates and view the global model state.</p>
        </div>

        {/* Token Balance - Small box at top */}
        <div className="mb-6 max-w-sm">
          <TokenBalance walletAddress={walletAddress} signer={signer} />
        </div>

        {/* Global Model Viewer - Main component */}
        <GlobalModelViewer />

      </main>
    </div>
  );
}

export default App;
