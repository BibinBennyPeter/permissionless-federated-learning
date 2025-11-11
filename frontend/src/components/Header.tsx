import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Wallet } from 'lucide-react';

interface HeaderProps {
  onWalletConnect: (address: string, signer: ethers.Signer) => void;
}

export default function Header({ onWalletConnect }: HeaderProps) {
  const [address, setAddress] = useState<string>('');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    checkIfWalletIsConnected();
  }, []);

  const checkIfWalletIsConnected = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
          const signer = await provider.getSigner();
          const addr = await signer.getAddress();
          setAddress(addr);
          onWalletConnect(addr, signer);
        }
      } catch (error) {
        console.error('Error checking wallet connection:', error);
      }
    }
  };

  const connectWallet = async () => {
    if (typeof window.ethereum === 'undefined') {
      alert('MetaMask is not installed. Please install it to use this app.');
      return;
    }

    try {
      setConnecting(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      setAddress(addr);
      onWalletConnect(addr, signer);
    } catch (error) {
      console.error('Error connecting wallet:', error);
      alert('Failed to connect wallet');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
            <span className="text-white font-bold text-lg">FL</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Open Federated Learning</h1>
        </div>
        <button
          onClick={connectWallet}
          disabled={connecting || !!address}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          <Wallet size={18} />
          {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : connecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
      </div>
    </header>
  );
}
