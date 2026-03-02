"use client"

import { useState, useRef } from "react"

interface ChangeBadgeProps {
  current: number
  previous: number
  /** true = hogere waarde is slechter (bijv. kosten, verwerkingstijd) */
  invertColor?: boolean
  /** Suffix na het percentage (bijv. "%" is default) */
  suffix?: string
  /** Label voor de waarde in de tooltip (bijv. "zendingen", "uur") */
  label?: string
  /** Formatteer de waarden (bijv. afronding, valuta) */
  formatValue?: (v: number) => string
}

/**
 * Badge die de procentuele verandering toont t.o.v. de vorige periode.
 * Groen = beter, Rood = slechter. invertColor flipt dit (voor kosten etc.)
 * Hover toont een tooltip met de exacte berekening.
 */
export default function ChangeBadge({ current, previous, invertColor = false, suffix = "%", label, formatValue }: ChangeBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const badgeRef = useRef<HTMLSpanElement>(null)
  const fmt = formatValue || ((v: number) => {
    if (Number.isInteger(v)) return v.toString()
    return v.toFixed(1)
  })

  if (previous === 0 && current === 0) return null
  if (previous === 0) {
    return (
      <span
        ref={badgeRef}
        className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full relative cursor-help"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        nieuw
        {showTooltip && (
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-[11px] rounded-lg shadow-lg whitespace-nowrap z-50 font-normal">
            Vorige periode: 0{label ? ` ${label}` : ""} → Nu: {fmt(current)}{label ? ` ${label}` : ""}
            <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
          </span>
        )}
      </span>
    )
  }

  const pctChange = ((current - previous) / previous) * 100
  const rounded = Math.abs(pctChange) >= 10
    ? Math.round(pctChange)
    : Math.round(pctChange * 10) / 10

  if (rounded === 0) {
    return (
      <span
        ref={badgeRef}
        className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full relative cursor-help"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        0{suffix}
        {showTooltip && (
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-[11px] rounded-lg shadow-lg whitespace-nowrap z-50 font-normal">
            {fmt(previous)}{label ? ` ${label}` : ""} → {fmt(current)}{label ? ` ${label}` : ""} (geen verschil)
            <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
          </span>
        )}
      </span>
    )
  }

  const isPositive = rounded > 0
  const isGood = invertColor ? !isPositive : isPositive

  const colorClasses = isGood
    ? "text-green-700 bg-green-50"
    : "text-red-700 bg-red-50"

  const arrow = isPositive ? "↑" : "↓"
  const sign = isPositive ? "+" : ""
  const diff = current - previous
  const diffSign = diff >= 0 ? "+" : ""

  return (
    <span
      ref={badgeRef}
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${colorClasses} px-1.5 py-0.5 rounded-full relative cursor-help`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {arrow} {sign}{rounded}{suffix}
      {showTooltip && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-[11px] rounded-lg shadow-lg whitespace-nowrap z-50 font-normal leading-relaxed">
          <span className="block">Vorige periode: <strong>{fmt(previous)}</strong>{label ? ` ${label}` : ""}</span>
          <span className="block">Huidige periode: <strong>{fmt(current)}</strong>{label ? ` ${label}` : ""}</span>
          <span className="block border-t border-gray-700 mt-1 pt-1">Verschil: <strong>{diffSign}{fmt(Math.abs(diff))}</strong>{label ? ` ${label}` : ""} ({sign}{rounded}%)</span>
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </span>
      )}
    </span>
  )
}
