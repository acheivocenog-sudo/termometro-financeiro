'use client'

import { FinancialSummary, formatCurrency, getThermometerLabel } from '@/lib/finance'

interface ThermometerProps {
  summary: FinancialSummary
}

const colors = {
  green: { fill: '#22c55e', bg: '#14532d', text: 'text-green-400', glow: 'shadow-green-500/30' },
  yellow: { fill: '#eab308', bg: '#713f12', text: 'text-yellow-400', glow: 'shadow-yellow-500/30' },
  red: { fill: '#ef4444', bg: '#7f1d1d', text: 'text-red-400', glow: 'shadow-red-500/30' },
  'dark-red': { fill: '#991b1b', bg: '#450a0a', text: 'text-red-600', glow: 'shadow-red-900/50' },
}

export default function Thermometer({ summary }: ThermometerProps) {
  const { thermometerStatus, thermometerPercentage, dailyBudget, todaySpent } = summary
  const color = colors[thermometerStatus]
  const fillPct = Math.min(thermometerPercentage, 100)
  const label = getThermometerLabel(thermometerStatus)
  const remaining = dailyBudget - todaySpent

  return (
    <div className="card flex flex-col items-center gap-4">
      <div className="text-center">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Termômetro Financeiro</h3>
        <p className={`text-sm font-semibold mt-1 ${color.text}`}>{label}</p>
      </div>

      {/* Thermometer SVG */}
      <div className="relative flex flex-col items-center">
        <svg width="60" height="200" viewBox="0 0 60 200" className="overflow-visible">
          {/* Tube background */}
          <rect x="22" y="10" width="16" height="150" rx="8" fill="#1f2937" stroke="#374151" strokeWidth="1.5" />

          {/* Fill */}
          <clipPath id="tube-clip">
            <rect x="22" y="10" width="16" height="150" rx="8" />
          </clipPath>
          <rect
            x="22"
            y={10 + 150 * (1 - fillPct / 100)}
            width="16"
            height={150 * (fillPct / 100)}
            fill={color.fill}
            clipPath="url(#tube-clip)"
            style={{ transition: 'all 1s ease-out' }}
          />

          {/* Bulb */}
          <circle cx="30" cy="178" r="18" fill={color.fill} style={{ transition: 'fill 0.5s ease' }} />
          <circle cx="30" cy="178" r="12" fill={color.fill} opacity="0.6" />

          {/* Scale marks */}
          {[0, 25, 50, 75, 100].map(pct => {
            const y = 10 + 150 * (1 - pct / 100)
            return (
              <g key={pct}>
                <line x1="38" y1={y} x2="44" y2={y} stroke="#4b5563" strokeWidth="1" />
                <text x="47" y={y + 4} fontSize="9" fill="#6b7280">{pct}%</text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Daily budget info */}
      <div className="w-full space-y-2">
        <div className="flex justify-between items-center bg-gray-800 rounded-xl px-3 py-2">
          <span className="text-xs text-gray-400">Limite diário</span>
          <span className="text-sm font-bold text-white">{formatCurrency(dailyBudget)}</span>
        </div>
        <div className="flex justify-between items-center bg-gray-800 rounded-xl px-3 py-2">
          <span className="text-xs text-gray-400">Gasto hoje</span>
          <span className={`text-sm font-bold ${color.text}`}>{formatCurrency(todaySpent)}</span>
        </div>
        <div className="flex justify-between items-center bg-gray-800 rounded-xl px-3 py-2">
          <span className="text-xs text-gray-400">Restante hoje</span>
          <span className={`text-sm font-bold ${remaining >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatCurrency(remaining)}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>0%</span>
          <span>{fillPct}% do limite</span>
          <span>100%</span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{ width: `${fillPct}%`, backgroundColor: color.fill }}
          />
        </div>
      </div>
    </div>
  )
}
