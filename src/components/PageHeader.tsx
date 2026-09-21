export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <div className="text-[22px] font-bold">{title}</div>
      <div className="mt-1 text-[13px] text-ink-muted">{subtitle}</div>
    </div>
  )
}
