import { useState, useEffect } from 'react';
import { Download, ExternalLink } from 'lucide-react';

interface GlobalModel {
  fileName: string;
  sha256: string;
  cid: string;
  fileUrl: string;
}

export default function GlobalModelViewer() {
  const [model, setModel] = useState<GlobalModel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGlobalModel();
  }, []);

  const fetchGlobalModel = async () => {
    try {
      const response = await fetch('/api/global');
      if (response.ok) {
        const data = await response.json();
        console.log('Fetched global model data:', data);
        setModel(data);
      }
    } catch (error) {
      console.error('Error fetching global model:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (model?.fileUrl) {
      const link = document.createElement('a');
      link.href = model.fileUrl;
      link.download = model.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleViewIPFS = () => {
    if (model?.cid) {
      window.open(`https://ipfs.io/ipfs/${model.cid}`, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Global Model Viewer</h2>
        <div className="text-center py-8 text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!model) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Global Model Viewer</h2>
        <div className="text-center py-8 text-gray-500">No global model available</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Global Model Viewer</h2>
        <div className="flex gap-3">
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <Download size={18} />
            Download Model
          </button>
          <button
            onClick={handleViewIPFS}
            className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:text-blue-700 transition-colors"
          >
            View on IPFS
            <ExternalLink size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Model File Name</div>
          <div className="font-mono text-sm text-gray-900">{model.fileName}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">SHA256 Hash</div>
          <div className="font-mono text-sm text-gray-900">
            {model.sha256.slice(0, 8)}...{model.sha256.slice(-6)}
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">CID</div>
          <div className="font-mono text-sm text-gray-900">
            {model.cid.slice(0, 8)}...{model.cid.slice(-4)}
          </div>
        </div>
      </div>
    </div>
  );
}
