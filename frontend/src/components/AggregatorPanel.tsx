interface AggregatorPanelProps {
  logs: string[];
}

export default function AggregatorPanel({ logs }: AggregatorPanelProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Aggregator Panel</h2>

      <div className="flex gap-3 mb-6">
        <button
          disabled
          className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium cursor-not-allowed opacity-50"
        >
          Aggregate Round
        </button>
        <button
          disabled
          className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-medium cursor-not-allowed"
        >
          Publish to Chain
        </button>
      </div>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Aggregated Model CID
          </label>
          <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-400 text-sm">
            Not available
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Transaction Hash
          </label>
          <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-400 text-sm">
            Not available
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Server Logs
        </label>
        <div className="bg-gray-900 text-green-400 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm">
          {logs.length === 0 ? (
            <div className="text-gray-500">[INFO] Waiting for submissions...</div>
          ) : (
            logs.map((log, index) => (
              <div key={index}>{log}</div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
