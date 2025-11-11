import { useState } from 'react';
import { ethers } from 'ethers';
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

      const { cid } = await uploadResponse.json();
      onLog(`[INFO] File uploaded successfully. CID: ${cid}`);

      const roundNumber = 1;
      const message = `round:${roundNumber}|cid:${cid}|examples:${numExamples}|quality:${quality}`;

      onLog('[INFO] Signing message with MetaMask...');
      const signature = await signer.signMessage(message);
      onLog('[INFO] Message signed successfully');

      const payload = {
        address: walletAddress,
        cid,
        roundNumber,
        numExamples: parseInt(numExamples),
        quality,
        signature,
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
