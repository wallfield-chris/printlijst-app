"use client"

interface ChangeBadgeProps {
  current: number
  previous: number
  /** true = hogere waarde is slechter (bijv. kosten, verwerkingstijd) */
  invertColor?: boolean
  /** Suffix na het percentage (bijv. "%" is default) */
  suffix?: string
}

/**
 * Badge die de procentuele verandering toont t.o.v. de vorige periode.
 * Groen = beter, Rood = slechter. invertColor flipt dit (voor kosten etc.)
 */
export default function ChangeBadge({ current, previous, invertColor = false, suffix = "%" }: ChangeBadgeProps) {
  if (previous === 0 && current === 0) return null
  if (previous === 0) {
    // Van 0 naar iets = nieuw
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
        nieuw
      </span>
    )
  }

  const pctChange = ((current - previous) / previous) * 100
  const rounded = Math.abs(pctChange) >= 10
    ? Math.round(pctChange)
    : Math.round(pctChange * 10) / 10

  if (rounded === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
        0{suffix}
      </span>
    )
  }

  const isPositive = rounded > 0
  // Normally positive = good (green), but if inverted, positive = bad (red)
  const isGood = invertColor ? !isPositive : isPositive

  const colorClasses = isGood
    ? "text-green-700 bg-green-50"
    : "text-red-700 bg-red-50"

  const arrow = isPositive ? "↑" : "↓"
  const sign = isPositive ? "+" : ""

  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${colorClasses} px-1.5 py-0.5 rounded-full`}>
      {arrow} {sign}{rounded}{suffix}
    </span>
  )
}
