// Human-readable byte sizes ("1.3 GB", "593 MB").

export function formatSize(bytes: number | null | undefined): string {
  if (bytes == null) return "—"
  const gb = bytes / 1024 ** 3
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`
}
