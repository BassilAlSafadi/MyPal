import React from 'react';

interface ReportButtonProps {
  ticketId: string;
}

const ReportButton: React.FC<ReportButtonProps> = ({ ticketId }) => {
  const handleReport = () => {
    // Empty report logic
  };

  return (
    <button
      onClick={handleReport}
      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
    >
      Report Issue
    </button>
  );
};

export default ReportButton;
