// Hardware tab: what this machine has, and which installed chat models it can run well.

import { useCallback, useEffect, useState } from "react"
import { Button } from "../../components/ui/Button"
import { useModels } from "../../context/ModelsContext"
import { formatSize } from "../../lib/format"
import { request } from "../../lib/http"
import { card } from "../../lib/ui"

interface HardwareInfo {
  cpu: { model?: string | null; arch?: string | null; cores_physical: number | null; cores_logical: number | null; load_percent?: number | null }
  ram: { total_bytes: number | null; available_bytes: number | null }
  gpu: {
    name: string
    vram_bytes: number | null
    vram_used_bytes: number | null
    driver_version: string | null
    load_percent: number | null
  } | null
  disk: { path: string; total_bytes: number | null; free_bytes: number | null }
  host: { os: string | null; release: string | null; wsl: boolean; container: boolean }
  ollama: { reachable: boolean; version: string | null }
  safe_ram_fraction: number
}

// Same rule of thumb as the backend's catalogue estimate: Q4_K_M ≈ 0.62 GB per billion parameters.
const Q4_GB_PER_B = 0.62
// Leave headroom for the KV cache and the CUDA context.
const VRAM_USABLE = 0.9
const GB = 1024 ** 3

function Meter({ pct, tone = "bg-accent" }: { pct: number | null | undefined; tone?: string }) {
  const value = Math.max(0, Math.min(100, pct ?? 0))
  const color = value >= 90 ? "bg-critical" : value >= 75 ? "bg-warning" : tone
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-track">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
    </div>
  )
}

function Stat({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className={`${card} p-4 flex min-w-0 flex-col gap-1.5`}>
      <div className="text-[12px] tracking-wide text-ink-faint uppercase">{label}</div>
      <div className="truncate text-[18px] font-semibold" title={value}>
        {value}
      </div>
      {sub && <div className="truncate text-[12px] text-ink-muted" title={sub}>{sub}</div>}
      {children}
    </div>
  )
}

const pct = (used: number | null | undefined, total: number | null | undefined) =>
  used != null && total ? (used / total) * 100 : null

const paramsAtQ4 = (bytes: number) => `≈${(bytes / GB / Q4_GB_PER_B).toFixed(1)}B params`

export function HardwareTab() {
  const models = useModels().models.filter((m) => !m.embedding)
  const [hw, setHw] = useState<HardwareInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setHw(await request<HardwareInfo>("/api/hardware"))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not read hardware")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!hw) return <div className="text-[13px] text-ink-faint">{error ?? "Reading hardware…"}</div>

  const ramTotal = hw.ram.total_bytes
  const ramUsed = ramTotal != null && hw.ram.available_bytes != null ? ramTotal - hw.ram.available_bytes : null
  const ramBudget = ramTotal ? ramTotal * hw.safe_ram_fraction : null
  const vramBudget = hw.gpu?.vram_bytes ? hw.gpu.vram_bytes * VRAM_USABLE : null
  const diskUsed = hw.disk.total_bytes != null && hw.disk.free_bytes != null ? hw.disk.total_bytes - hw.disk.free_bytes : null

  function runsOn(size: number | null): { label: string; cls: string } {
    if (!size) return { label: "unknown size", cls: "bg-track text-ink-faint" }
    if (vramBudget && size <= vramBudget) return { label: "GPU — fast", cls: "bg-good-bg text-good-text" }
    if (ramBudget && size <= ramBudget)
      return vramBudget
        ? { label: "GPU + CPU split — slower", cls: "bg-warning-bg text-warning-text" }
        : { label: "CPU — OK", cls: "bg-warning-bg text-warning-text" }
    return { label: "too big for this machine", cls: "bg-critical-bg text-critical-text" }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="text-[12.5px] text-ink-faint">
          {hw.host.os} {hw.host.release}
          {hw.host.container && " · in a container"}
          {" · "}Ollama {hw.ollama.reachable ? `${hw.ollama.version ?? ""} running` : "not reachable"}
        </div>
        <Button
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {hw.host.wsl && (
        <div className="rounded-xl border border-warning/40 bg-warning-bg px-4 py-3 text-[12.5px] text-warning-text">
          Running inside WSL: the CPU threads and RAM below are what WSL is allowed to use, not your whole PC. To give it
          more, set <code className="font-mono">memory=</code> and <code className="font-mono">processors=</code> in{" "}
          <code className="font-mono">%UserProfile%\.wslconfig</code>, then run{" "}
          <code className="font-mono">wsl --shutdown</code>.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 @5xl:grid-cols-4">
        <Stat
          label="CPU"
          value={`${hw.cpu.cores_logical ?? "?"} threads`}
          sub={`${hw.cpu.model ?? "unknown CPU"}${hw.cpu.cores_physical ? ` · ${hw.cpu.cores_physical} cores` : ""}`}
        >
          <Meter pct={hw.cpu.load_percent} />
          <div className="text-[12px] text-ink-faint">load {hw.cpu.load_percent?.toFixed(0) ?? "?"}%</div>
        </Stat>
        <Stat label="Memory" value={formatSize(ramTotal)} sub={`${formatSize(hw.ram.available_bytes)} free right now`}>
          <Meter pct={pct(ramUsed, ramTotal)} />
          <div className="text-[12px] text-ink-faint">{pct(ramUsed, ramTotal)?.toFixed(0) ?? "?"}% in use</div>
        </Stat>
        {hw.gpu ? (
          <Stat
            label="GPU"
            value={formatSize(hw.gpu.vram_bytes) + " VRAM"}
            sub={`${hw.gpu.name}${hw.gpu.driver_version ? ` · driver ${hw.gpu.driver_version}` : ""}`}
          >
            <Meter pct={pct(hw.gpu.vram_used_bytes, hw.gpu.vram_bytes)} />
            <div className="text-[12px] text-ink-faint">
              {formatSize(hw.gpu.vram_used_bytes)} used · load {hw.gpu.load_percent?.toFixed(0) ?? "?"}%
            </div>
          </Stat>
        ) : (
          <Stat label="GPU" value="None found" sub="No NVIDIA GPU (nvidia-smi) — models run on the CPU" />
        )}
        <Stat label="Disk (models)" value={`${formatSize(hw.disk.free_bytes)} free`} sub={hw.disk.path}>
          <Meter pct={pct(diskUsed, hw.disk.total_bytes)} />
          <div className="text-[12px] text-ink-faint">of {formatSize(hw.disk.total_bytes)}</div>
        </Stat>
      </div>

      <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
        <div className={`${card} p-4 flex flex-col gap-1`}>
          <div className="text-[14px] font-semibold">Fully on the GPU</div>
          {vramBudget ? (
            <div className="text-[13px] text-ink-muted">
              Models up to <b>{formatSize(vramBudget)}</b> ({paramsAtQ4(vramBudget)} at Q4) fit in VRAM and answer fastest.
            </div>
          ) : (
            <div className="text-[13px] text-ink-muted">No GPU detected, so everything runs on the CPU.</div>
          )}
        </div>
        <div className={`${card} p-4 flex flex-col gap-1`}>
          <div className="text-[14px] font-semibold">Comfortably in RAM</div>
          {ramBudget ? (
            <div className="text-[13px] text-ink-muted">
              Models up to <b>{formatSize(ramBudget)}</b> ({paramsAtQ4(ramBudget)} at Q4) —{" "}
              {Math.round(hw.safe_ram_fraction * 100)}% of RAM, leaving room for everything else. This is the limit
              Auto picks within.
            </div>
          ) : (
            <div className="text-[13px] text-ink-muted">RAM size unavailable.</div>
          )}
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold">Your chat models on this hardware</h2>
        {models.length === 0 ? (
          <div className={`${card} p-4 border-dashed text-[13px] text-ink-faint`}>No chat models installed.</div>
        ) : (
          <div className="divide-y divide-line rounded-xl border border-line bg-surface">
            {models.map((m) => {
              // Ollama's "-cloud" tags run on Ollama's servers; local hardware doesn't matter.
              const where = m.name.endsWith("-cloud")
                ? { label: "runs on Ollama's cloud", cls: "bg-accent-bg text-accent-text" }
                : runsOn(m.size_bytes)
              return (
                <div key={m.name} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 grow truncate font-mono text-[13px] font-medium">{m.name}</span>
                  <span className="text-[12px] text-ink-faint">{formatSize(m.size_bytes)}</span>
                  <span className={`w-[200px] shrink-0 rounded-full px-2.5 py-0.5 text-center text-[11.5px] font-semibold ${where.cls}`}>
                    {where.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
        <div className="text-[12px] text-ink-faint">
          Estimates from file size: longer conversations need extra memory on top, so a model right at the limit may
          spill from GPU to CPU.
        </div>
      </section>
    </div>
  )
}
