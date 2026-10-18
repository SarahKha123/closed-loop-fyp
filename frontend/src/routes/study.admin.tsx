// /study/admin — the researcher's side of the user study (M11). Not linked from the nav: open it in a
// second window; the participant uses the dashboard. Pick the participant number → the counterbalanced
// plan gives each block's condition and task set → start a task (loads its preset, clears the chat,
// starts the clock) → record the answer and end it. Everything is logged to tbl_StudyLog.

import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { PageHeader } from "../components/PageHeader"
import { Button } from "../components/ui/Button"
import { Card, CardHeader } from "../components/ui/Card"
import { EmptyState } from "../components/ui/EmptyState"
import { useLive } from "../context/LiveContext"
import { api } from "../lib/api"
import type { StudyCondition, StudyLogRow, StudyPlan, StudyTask } from "../lib/api"
import { subscribe } from "../lib/stream"
import { input } from "../lib/ui"

export const Route = createFileRoute("/study/admin")({
  component: StudyAdminPage,
})

const CONDITION_LABEL: Record<StudyCondition, string> = { dashboard_only: "Dashboard only", dashboard_ai: "Dashboard + AI" }

const seconds = (ms: number | null) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)} s`)

function StudyAdminPage() {
  const { settings } = useLive()
  const [taskSets, setTaskSets] = useState<Record<string, StudyTask[]>>({})
  const [active, setActive] = useState<StudyLogRow | null>(null)
  const [participantNo, setParticipantNo] = useState("")
  const [plan, setPlan] = useState<StudyPlan | null>(null)
  const [block, setBlock] = useState(0)
  const [log, setLog] = useState<StudyLogRow[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const [answer, setAnswer] = useState("")
  const [correct, setCorrect] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const participant = plan?.participant
  const reload = useCallback(() => {
    api.study
      .get()
      .then((s) => {
        setTaskSets(s.taskSets)
        setActive(s.active)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "could not load the study"))
    if (participant) api.study.log(participant).then((r) => setLog(r.log)).catch(() => {})
  }, [participant])

  useEffect(() => {
    reload()
    return subscribe((e) => {
      if (e.type === "study" || e.type === "reconnected") reload()
    })
  }, [reload])

  useEffect(() => {
    const n = Number(participantNo)
    if (!Number.isInteger(n) || n < 1) return
    api.study.plan(n).then(setPlan).catch(() => {})
  }, [participantNo])

  // The running task's clock.
  useEffect(() => {
    if (!active) return
    const t = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(t)
  }, [active])

  const current = plan?.blocks[block]
  const done = new Set(log.filter((r) => r.endedAt).map((r) => r.taskId))

  async function act(label: string, run: () => Promise<unknown>) {
    setLoading(label)
    setError(null)
    try {
      await run()
    } catch (err) {
      setError(err instanceof Error ? err.message : "the backend did not respond")
    } finally {
      setLoading(null)
      reload()
    }
  }

  const start = (task: StudyTask) =>
    act(task.id, () => api.study.start({ participant: participant!, condition: current!.condition, taskSet: current!.taskSet, taskId: task.id }))

  const end = () =>
    act("end", async () => {
      await api.study.end(answer, correct)
      setAnswer("")
      setCorrect(null)
    })

  const studyOn = settings?.study.enabled ?? false

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="User study"
        subtitle="Researcher controls. Open the dashboard for the participant in another window; this page is not linked from the menu."
        actions={
          <>
            <label className="flex items-center gap-2 text-base text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--accent)]"
                checked={studyOn}
                disabled={!settings}
                onChange={(e) => void act("mode", () => api.saveSettings({ study: { enabled: e.target.checked } }))}
              />
              Study mode
            </label>
            <a href={api.study.exportUrl()} className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-surface px-3 text-base font-medium text-ink hover:bg-surface-2">
              Export all (CSV)
            </a>
          </>
        }
      />

      {!studyOn && settings && (
        <p className="rounded-lg bg-warning-bg px-3 py-2 text-base text-warning-text">
          Study mode is off: participants would see the replay controls and the AI models page. Pin the study's model on the Models page first, then switch it on.
        </p>
      )}
      {error && <p className="rounded-lg bg-critical-bg px-3 py-2 text-base text-critical-text">{error}</p>}

      <div className="grid gap-4 @4xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader
            title="Participant"
            subtitle={plan ? `${plan.participant} · counterbalanced order` : "Enter the participant number to get their order of conditions and task sets"}
            actions={
              <input
                value={participantNo}
                onChange={(e) => {
                  setParticipantNo(e.target.value.replace(/\D/g, ""))
                  setBlock(0)
                  setLog([])
                }}
                placeholder="No."
                aria-label="Participant number"
                className={`${input} tabular w-20 py-1`}
                disabled={Boolean(active)}
              />
            }
          />
          {plan && (
            <div className="flex gap-2 px-4 pb-3">
              {plan.blocks.map((b, i) => (
                <Button key={i} size="sm" variant={i === block ? "primary" : "secondary"} onClick={() => setBlock(i)} disabled={Boolean(active)}>
                  Block {i + 1}: {CONDITION_LABEL[b.condition]} · Set {b.taskSet}
                </Button>
              ))}
            </div>
          )}
          {current ? (
            <ol className="divide-y divide-line border-t border-line">
              {(taskSets[current.taskSet] ?? []).map((task) => (
                <li key={task.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="tabular w-7 shrink-0 pt-0.5 text-sm font-semibold text-ink-muted">{task.id}</span>
                  <div className="min-w-0 grow">
                    <div className="text-base text-ink">{task.prompt}</div>
                    <div className="mt-0.5 text-sm text-ink-faint">
                      <span className="font-medium">Reference:</span> {task.answer}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-faint">
                      {task.level} · cycles {task.from}–{task.to}
                    </div>
                  </div>
                  {done.has(task.id) ? (
                    <span className="shrink-0 pt-0.5 text-sm font-medium text-good-text">Done</span>
                  ) : (
                    <Button size="sm" variant="primary" onClick={() => void start(task)} disabled={Boolean(active) || loading != null}>
                      {loading === task.id ? "Loading…" : "Start"}
                    </Button>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState icon="table" title="No participant yet">
              The task list for each block appears here.
            </EmptyState>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Running task" subtitle={active ? `${active.participantId} · ${CONDITION_LABEL[active.condition]} · Set ${active.taskSet}` : undefined} />
            {active ? (
              <div className="flex flex-col gap-3 px-4 pb-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-base font-semibold text-ink">{active.taskId}</span>
                  <span className="tabular text-3xl font-semibold text-ink">{seconds(now - Date.parse(active.startedAt))}</span>
                </div>
                <div className="text-base text-ink-muted">
                  {Object.values(taskSets).flat().find((t) => t.id === active.taskId)?.prompt}
                </div>
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="The participant's answer"
                  rows={3}
                  className={`${input} resize-none`}
                />
                <div className="flex gap-2" role="radiogroup" aria-label="Scored">
                  {([["Correct", true], ["Incorrect", false], ["Score later", null]] as const).map(([label, v]) => (
                    <Button key={label} size="sm" variant={correct === v ? "primary" : "secondary"} onClick={() => setCorrect(v)} aria-pressed={correct === v}>
                      {label}
                    </Button>
                  ))}
                </div>
                <Button variant="primary" onClick={() => void end()} disabled={loading != null}>
                  End task
                </Button>
              </div>
            ) : (
              <p className="px-4 pb-4 text-base text-ink-faint">
                {loading && loading !== "mode" ? "Loading the task's preset…" : "No task running. Start one from the list."}
              </p>
            )}
          </Card>

          <Card>
            <CardHeader
              title={participant ? `Log · ${participant}` : "Log"}
              actions={participant && log.length > 0 && (
                <a href={api.study.exportUrl(participant)} className="text-sm font-medium text-accent-text hover:underline">
                  CSV
                </a>
              )}
            />
            {log.length ? (
              <table className="w-full text-sm">
                <thead className="text-left text-ink-faint">
                  <tr className="border-y border-line">
                    <th className="px-4 py-1.5 font-medium">Task</th>
                    <th className="py-1.5 font-medium">Time</th>
                    <th className="py-1.5 font-medium">Correct</th>
                    <th className="py-1.5 pr-4 font-medium">Chat / insights</th>
                  </tr>
                </thead>
                <tbody className="tabular text-ink">
                  {log.map((r) => (
                    <tr key={r.logId} className="border-b border-line last:border-0">
                      <td className="px-4 py-1.5">{r.taskId}</td>
                      <td className="py-1.5">{r.endedAt ? seconds(r.durationMs) : "running"}</td>
                      <td className="py-1.5">{r.correct == null ? "—" : r.correct ? "yes" : "no"}</td>
                      <td className="py-1.5 pr-4">{r.endedAt ? `${r.chatTurns} / ${r.insightsShown}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-4 pb-4 text-base text-ink-faint">Nothing logged for this participant yet.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
