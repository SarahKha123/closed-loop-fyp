export function OldWayPanel() {
  return (
    <div className="flex w-[320px] shrink-0 flex-col gap-3">
      <div className="text-[11px] font-semibold tracking-wide text-ink-faint uppercase">Old Way — Disjointed Tools</div>

      <div className="overflow-hidden rounded-lg border border-[#c9c6bd] bg-[#efece2]">
        <div className="flex items-center gap-1.5 border-b border-[#c9c6bd] bg-[#e2ded1] px-2.5 py-1.5">
          <span className="h-2 w-2 rounded-full bg-[#e0664a]" />
          <span className="h-2 w-2 rounded-full bg-[#e0b23f]" />
          <span className="h-2 w-2 rounded-full bg-[#6fae5c]" />
          <span className="ml-1 truncate text-[10px] text-[#5c584d]">historian.local — SCADA</span>
        </div>
        <div className="space-y-0.5 p-2.5 font-mono text-[10px] leading-relaxed text-[#4a473e]">
          <div>TAG_PS2 ..... 107.93</div>
          <div>TAG_TS1 ..... 044.67</div>
          <div>TAG_FS1 ..... 006.66</div>
          <div>TAG_VS1 ..... 000.62</div>
          <div className="text-[#a8431f]">TAG_ACC_P ... 090.00 *</div>
        </div>
      </div>
      <div className="-mt-1.5 text-[10.5px] text-ink-faint">Raw tags only — no thresholds, no context.</div>

      <div className="overflow-hidden rounded-lg border border-[#d8d5cc] bg-white">
        <div className="border-b border-[#d8d5cc] bg-[#f4f3ee] px-2.5 py-1.5 text-[10px] text-[#5c584d]">Ticketing Inbox (4 unread)</div>
        <div className="divide-y divide-[#eeece5] text-[11px]">
          <div className="flex items-start gap-1.5 px-2.5 py-1.5">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d03b3b]" />
            <span className="text-[#3f3e3a]">ALERT: PS_ACC threshold breach — unassigned</span>
          </div>
          <div className="flex items-start gap-1.5 px-2.5 py-1.5">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d03b3b]" />
            <span className="text-[#3f3e3a]">TICKET #4471: re: accumulator (3 days old)</span>
          </div>
        </div>
      </div>
      <div className="-mt-1.5 text-[10.5px] text-ink-faint">Alerts wait in a queue — no one's watching yet.</div>

      <div className="overflow-hidden rounded-lg border border-[#d8d5cc] bg-[#f7f7f5]">
        <div className="border-b border-[#d8d5cc] px-2.5 py-1.5 text-[10px] text-[#5c584d]">#maintenance-team</div>
        <div className="flex flex-col gap-1.5 p-2.5 text-[11px]">
          <div className="self-start rounded-md bg-white px-2 py-1 text-[#3f3e3a] shadow-sm">did anyone check the accumulator ticket?</div>
          <div className="self-start rounded-md bg-white px-2 py-1 text-[#3f3e3a] shadow-sm">not me, who owns #4471?</div>
          <div className="self-start rounded-md bg-white px-2 py-1 text-[#3f3e3a] shadow-sm">checking now, give me an hour</div>
        </div>
      </div>
      <div className="-mt-1.5 text-[10.5px] text-ink-faint">3 tools, no shared context — hours between detection and action.</div>
    </div>
  )
}
