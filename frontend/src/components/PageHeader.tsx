// Page title + subtitle, used at the top of every route.

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <div className="text-[28px] font-bold">{title}</div>
      <div className="mt-1 text-[18px] text-ink-muted">{subtitle}</div>
    </div>
  )
}
