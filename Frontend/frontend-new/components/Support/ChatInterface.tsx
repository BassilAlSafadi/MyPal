import React, { useState } from 'react';

interface ChatInterfaceProps {
  ticketId: string;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ ticketId }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const sendMessage = () => {
    // Empty send logic
  };

  return (
    <div className="flex flex-col h-full border rounded-lg overflow-hidden">
      <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
        {/* Messages will appear here */}
      </div>
      <div className="p-4 border-t flex gap-2">
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          className="flex-1 p-2 border rounded"
        />
        <button 
          onClick={sendMessage}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatInterface;
