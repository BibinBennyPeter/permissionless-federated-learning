import { useState, useEffect } from 'react';

interface AggregationStatusProps {
  logs: string[];
}

interface GlobalModelStatus {
  round?: number;
  cid?: string;
  sha256?: string;
  publishedAt?: string;
}

export default function AggregationStatus({ logs }: AggregationStatusProps) {
  const [status, setStatus] = useState<GlobalModelStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/global');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error('Error fetching status:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Aggregation Status</h2>

      {loading ? (
        <div className="text-center py-4 text-gray-500">Loading status...</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-600 mb-1">Last Round</div>
            <div className="font-semibold text-gray-900">{status?.round || 0}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-600 mb-1">Model CID</div>
            <div className="font-mono text-xs text-gray-900 truncate">
              {status?.cid ? `${status.cid.slice(0, 12)}...` : 'N/A'}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 col-span-2">
            <div className="text-xs text-gray-600 mb-1">SHA256</div>
            <div className="font-mono text-xs text-gray-900 truncate">
              {status?.sha256 ? `${status.sha256.slice(0, 16)}...${status.sha256.slice(-16)}` : 'N/A'}
            </div>
          </div>
          {status?.publishedAt && (
            <div className="bg-gray-50 rounded-lg p-3 col-span-2">
              <div className="text-xs text-gray-600 mb-1">Published At</div>
              <div className="text-xs text-gray-900">{status.publishedAt}</div>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Activity Logs
        </label>
        <div className="bg-gray-900 text-green-400 rounded-lg p-4 h-48 overflow-y-auto font-mono text-xs">
          {logs.length === 0 ? (
            <div className="text-gray-500">[INFO] Waiting for activity...</div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="mb-1">{log}</div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
