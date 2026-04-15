import { useMemo, useState } from 'react';
import { HiOutlineChatAlt2, HiOutlinePaperAirplane, HiOutlineX } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { aiQueryApi } from '../services/api';

const EXAMPLES = [
  'How many students are inside?',
  'Show late returns today',
  'Which hostellers are outside?',
  'Unauthorized attempts today?',
];

export default function DashboardChatWidget() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState(() => [
    {
      id: 'welcome',
      role: 'bot',
      text: 'Ask me about inside count, late returns, hostellers outside, or unauthorized attempts.',
    },
  ]);

  const canSend = useMemo(() => message.trim().length >= 3 && !loading, [message, loading]);

  const onAsk = async (inputMessage) => {
    const text = String(inputMessage || '').trim();
    if (text.length < 3 || loading) return;

    setLoading(true);
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', text },
    ]);
    setMessage('');

    try {
      const response = await aiQueryApi(text);
      const answer = response.data?.answer || 'I could not process that request right now.';
      setMessages((prev) => [
        ...prev,
        { id: `b-${Date.now()}`, role: 'bot', text: answer },
      ]);
    } catch (error) {
      const fallback =
        error.response?.data?.message ||
        'AI assistant is temporarily unavailable. Please try again.';
      setMessages((prev) => [
        ...prev,
        { id: `b-${Date.now()}`, role: 'bot', text: fallback },
      ]);
      toast.error('Chat request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-40">
      {open ? (
        <div className="w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <div>
              <p className="font-semibold text-gray-800">Campus AI Assistant</p>
              <p className="text-xs text-gray-500">Intent-based monitoring queries</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"
            >
              <HiOutlineX className="h-5 w-5" />
            </button>
          </div>

          <div className="max-h-[360px] space-y-2 overflow-y-auto px-3 py-3">
            {messages.map((item) => (
              <div
                key={item.id}
                className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                  item.role === 'user'
                    ? 'ml-auto bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {item.text}
              </div>
            ))}
            {loading && (
              <div className="max-w-[90%] rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-600">
                Analyzing...
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 px-3 py-3">
            <div className="mb-2 flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => onAsk(example)}
                  className="rounded-full border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                  disabled={loading}
                >
                  {example}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && canSend) onAsk(message);
                }}
                placeholder="Ask campus status..."
                maxLength={300}
                className="h-10 flex-1 rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                type="button"
                onClick={() => onAsk(message)}
                disabled={!canSend}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary-600 text-white disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                <HiOutlinePaperAirplane className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-primary-700 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-primary-800"
        >
          <HiOutlineChatAlt2 className="h-5 w-5" />
          Ask AI
        </button>
      )}
    </div>
  );
}

