import { useSocket } from '../context/SocketContext';

export default function LiveScanTicker() {
  const { liveTickerItems } = useSocket();

  const content =
    liveTickerItems.length > 0
      ? liveTickerItems.map((item) => item.text).join('   •   ')
      : 'Live scan ticker ready. Events will appear here as soon as emitters are wired in upcoming prompts.';

  return (
    <div className="border-t border-gray-200 bg-slate-950 px-4 py-2 text-white dark:border-slate-800">
      <div className="flex items-center gap-3 overflow-hidden">
        <span className="whitespace-nowrap rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
          Live Feed
        </span>
        <div className="ticker-mask flex-1 overflow-hidden">
          <div className="ticker-track whitespace-nowrap text-sm text-slate-200">{content}</div>
        </div>
      </div>
    </div>
  );
}
