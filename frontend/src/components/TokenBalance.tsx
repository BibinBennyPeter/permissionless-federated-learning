import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Coins, RefreshCw } from 'lucide-react';

// Mock ERC20 ABI - replace with your actual token ABI
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

interface TokenBalanceProps {
  walletAddress: string | null;
  signer: ethers.Signer | null;
}

export default function TokenBalance({ walletAddress, signer }: TokenBalanceProps) {
  const [balance, setBalance] = useState<string | null>(null);
  const [symbol, setSymbol] = useState<string>('TOKENS');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = async () => {
    if (!walletAddress || !signer) {
      setBalance(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const tokenAddress = import.meta.env.VITE_TOKEN_ADDRESS;
      
      if (!tokenAddress) {
        // Fallback: show ETH balance if no token configured
        const provider = signer.provider;
        if (provider) {
          const ethBalance = await provider.getBalance(walletAddress);
          setBalance(ethers.formatEther(ethBalance));
          setSymbol('ETH');
        }
        return;
      }

      // Get token contract
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

      // Fetch balance, decimals, and symbol
      const [rawBalance, decimals, tokenSymbol] = await Promise.all([
        tokenContract.balanceOf(walletAddress),
        tokenContract.decimals(),
        tokenContract.symbol()
      ]);

      // Format balance with proper decimals
      const formattedBalance = ethers.formatUnits(rawBalance, decimals);
      setBalance(formattedBalance);
      setSymbol(tokenSymbol);

    } catch (err) {
      console.error('Error fetching token balance:', err);
      setError('Failed to load balance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();
  }, [walletAddress, signer]);

  if (!walletAddress) {
    return (
      <div className="bg-gradient-to-br from-gray-900/90 via-gray-800/80 to-gray-900/90 backdrop-blur-md border border-white/10 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <Coins className="text-gray-400" size={20} />
          <h3 className="text-sm font-medium text-gray-400">Token Balance</h3>
        </div>
        <p className="text-gray-500 text-sm">Connect wallet to view balance</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-blue-900/40 via-blue-800/30 to-purple-900/40 backdrop-blur-md border border-blue-500/20 rounded-xl p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <Coins className="text-blue-400" size={20} />
          <h3 className="text-sm font-medium text-white">Your Balance</h3>
        </div>
        <button
          onClick={fetchBalance}
          disabled={loading}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-blue-400 hover:text-blue-300 disabled:opacity-50"
          title="Refresh balance"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && !balance ? (
        <div className="flex items-center gap-2 text-gray-400">
          <RefreshCw className="animate-spin" size={16} />
          <span className="text-sm">Loading...</span>
        </div>
      ) : error ? (
        <div className="text-red-400 text-sm">{error}</div>
      ) : balance !== null ? (
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-white">
            {parseFloat(balance).toLocaleString(undefined, { 
              maximumFractionDigits: 4,
              minimumFractionDigits: 0 
            })}
          </span>
          <span className="text-lg font-medium text-blue-300">{symbol}</span>
        </div>
      ) : (
        <div className="text-gray-400 text-sm">No balance available</div>
      )}

      <div className="mt-3 pt-3 border-t border-white/10">
        <div className="text-xs text-gray-400">
          Wallet: <span className="font-mono text-gray-300">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
        </div>
      </div>
    </div>
  );
}
