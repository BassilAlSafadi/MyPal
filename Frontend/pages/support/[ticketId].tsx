import { useRouter } from 'next/router';
import React from 'react';
import ChatInterface from '../../components/Support/ChatInterface';

const TicketPage = () => {
  const router = useRouter();
  const { ticketId } = router.query;

  if (!ticketId) return <div>Loading...</div>;

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Support Ticket: {ticketId}</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[600px]">
          <ChatInterface ticketId={ticketId as string} />
        </div>
        <div className="bg-white p-4 border rounded-lg">
          <h2 className="text-lg font-semibold mb-4">Ticket Details</h2>
          {/* Metadata here */}
        </div>
      </div>
    </div>
  );
};

export default TicketPage;
