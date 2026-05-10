import React, { useEffect } from 'react';
import { useSellerStore } from '../../stores/sellerStore';

export const SellerAttitudeReport: React.FC<{ sellerId: string }> = ({ sellerId }) => {
  const { report, loading, error, fetchSellerReport } = useSellerStore();

  useEffect(() => {
    if (sellerId) fetchSellerReport(sellerId);
  }, [sellerId]);

  if (loading) return <div>Loading seller report…</div>;
  if (error) return <div className="text-destructive">Error: {error}</div>;
  if (!report) return <div>No seller report available.</div>;

  return (
    <div className="p-4 rounded-md bg-white/80 shadow-sm">
      <h3 className="text-lg font-semibold">Seller Attitude Report</h3>
      <p className="text-sm text-muted-foreground mt-2">{report.aiGeneratedSummary}</p>

      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <strong>Sentiment:</strong>{' '}
          <span>{typeof report.sentimentScore === 'number' ? (report.sentimentScore * 10).toFixed(1) + '/10' : 'N/A'}</span>
        </div>
        <div>
          <strong>Grandma Score:</strong>{' '}
          <span>{typeof report.grandmaScore === 'number' ? `${report.grandmaScore}/10` : 'N/A'}</span>
        </div>
      </div>

      <div className="mt-3">
        <strong>Top Complaints:</strong>
        <ul className="list-disc ml-5 mt-1">
          {(report.topComplaintThemes || []).map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>

      <div className="mt-3 text-xs text-muted-foreground">Report generated at: {report.createdAt}</div>
    </div>
  );
};

export default SellerAttitudeReport;
