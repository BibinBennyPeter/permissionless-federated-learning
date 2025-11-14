import { useState } from 'react';
import { ethers } from 'ethers';
import { AlertCircle } from 'lucide-react';
import FileUpload from './FileUpload';

interface ModelSubmissionProps {
  walletAddress: string | null;
  signer: ethers.Signer | null;
  onLog: (message: string) => void;
}

export default function ModelSubmission({ walletAddress, signer, onLog }: ModelSubmissionProps) {
  const [file, setFile] = useState<File | null>(null);
  const [numExamples, setNumExamples] = useState('');
  const [quality, setQuality] = useState(75);
  const [submitting, setSubmitting] = useState(false);
  const [commitOnChain, setCommitOnChain] = useState(false);

  const computeSHA256 = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const handleSubmit = async () => {
    if (!walletAddress || !signer) {
      alert('Please connect your wallet first');
      return;
    }

    if (!file) {
      alert('Please upload a .npz file');
      return;
    }

    if (!numExamples || parseInt(numExamples) <= 0) {
      alert('Please enter a valid number of examples');
      return;
    }

    try {
      setSubmitting(true);
      onLog('[INFO] Uploading delta file...');

      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await fetch('/upload-delta', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      const uploadData = await uploadResponse.json();
      const cid = uploadData.cid;
      onLog(`[INFO] File uploaded successfully. CID: ${cid}`);

      // Compute SHA256 if not returned by backend
      const sha256 = uploadData.sha256 || await computeSHA256(file);
      onLog(`[INFO] SHA256: ${sha256}`);

      const roundNumber = 1;
      
      // EXACT canonical message format as per spec
      const canonical = `${cid}|round:${roundNumber}|examples:${numExamples}|quality:${quality}`;

      onLog('[INFO] Signing message with MetaMask...');
      const signature = await signer.signMessage(canonical);
      onLog('[INFO] Message signed successfully');

      // Payload matching backend expectations
      const payload = {
        cid: cid,
        sha256: sha256,
        round: roundNumber,
        num_examples: parseInt(numExamples),
        quality: quality,
        submitter: walletAddress,
        message: canonical,
        signature: signature
      };

      onLog('[INFO] Submitting payload to backend...');
      const submitResponse = await fetch('/submit-payload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!submitResponse.ok) {
        throw new Error('Failed to submit payload');
      }

      onLog('[SUCCESS] Model update submitted successfully!');

      // Optional on-chain commit
      if (commitOnChain) {
        try {
          onLog('[INFO] Committing to blockchain...');
          
          // Check network and signer
          const network = await signer.provider?.getNetwork();
          onLog(`[INFO] Connected to chainId: ${network?.chainId}`);

          const commitHash = ethers.keccak256(ethers.toUtf8Bytes(canonical));
          onLog(`[INFO] Commit hash: ${commitHash}`);
          
          // This would call the actual contract - placeholder for demo
          // const modelRegistry = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
          // const tx = await modelRegistry.registerRoundCommit(commitHash, roundNumber);
          // await tx.wait();
          
          onLog('[INFO] Note: Contract call would happen here');
          onLog('[INFO] modelRegistry.registerRoundCommit(commitHash, round)');
          onLog('[SUCCESS] On-chain commit completed (simulated)');
        } catch (chainError) {
          onLog(`[ERROR] On-chain commit failed: ${chainError instanceof Error ? chainError.message : 'Unknown error'}`);
        }
      }

      setFile(null);
      setNumExamples('');
      setQuality(75);
    } catch (error) {
      console.error('Error submitting update:', error);
      onLog(`[ERROR] Failed to submit update: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Submit Your Local Model Update</h2>

      <FileUpload onFileSelect={setFile} />

      <div className="mt-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Number of Examples
        </label>
        <input
          type="number"
          value={numExamples}
          onChange={(e) => setNumExamples(e.target.value)}
          placeholder="e.g., 1000"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div className="mt-6">
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium text-gray-700">
            Quality (Optional)
          </label>
          <span className="text-sm font-medium text-gray-900">{quality}</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={quality}
          onChange={(e) => setQuality(parseInt(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
      </div>

      <div className="mt-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={commitOnChain}
            onChange={(e) => setCommitOnChain(e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Also commit on-chain (optional)</span>
        </label>
        {commitOnChain && (
          <div className="mt-2 flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <AlertCircle size={16} className="text-yellow-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-yellow-800">
              This will create an on-chain transaction. Ensure you have sufficient gas and are on the correct network.
            </p>
          </div>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting || !walletAddress || !file || !numExamples}
        className="w-full mt-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
      >
        {submitting ? 'Submitting...' : 'Submit Update'}
      </button>
    </div>
  );
}
