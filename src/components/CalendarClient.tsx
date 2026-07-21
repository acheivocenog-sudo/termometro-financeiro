'use client'

import { useEffect, useState } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { formatCurrency } from '@/lib/finance'

interface CalendarDay {
  date: string
  incomes: Array<{ description: string; amount: number }>
  fixedExpenses: Array<{ description: string; amount: number }>
  variableExpenses: Array<{ description: string; amount: number; category: string }>
  totalIn: number
  totalOut: number
  balance: number
  isToday: boolean
  isPast: boolean
  dailyBudget: number
}

interface DashboardData {
  calendar: CalendarDay[]
  summary: { dailyBudget: number }
}

export default function CalendarClient() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<CalendarDay | null>(null)

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }

  const calendar = data?.calendar ?? []
  const today = new Date()
  const monthLabel = format(today, "MMMM 'de' yyyy", { locale: ptBR })
  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  // Pad start of month
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).getDay()
  const padStart = Array(firstDay).fill(null)

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white capitalize">{monthLabel}</h1>
          <p className="text-sm text-gray-400">Calendário financeiro</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-4 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          Receita
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          Despesa
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          Hoje
        </div>
      </div>

      {/* Calendar grid */}
      <div className="card overflow-hidden p-0">
        {/* Week headers */}
        <div className="grid grid-cols-7 border-b border-gray-800">
          {weekDays.map(d => (
            <div key={d} className="text-center text-xs text-gray-500 font-medium py-3">
              {d}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7">
          {padStart.map((_, i) => (
            <div key={`pad-${i}`} className="border-r border-b border-gray-800/50 h-20 md:h-24" />
          ))}
          {calendar.map(day => {
            // Parse as local noon to avoid UTC midnight timezone shift
            const d = new Date(day.date + 'T12:00:00')
            const isT = isToday(d)
            const hasTx = day.totalIn > 0 || day.totalOut > 0
            const isSelected = selected && isSameDay(new Date(selected.date + 'T12:00:00'), d)

            return (
              <button
                key={day.date}
                onClick={() => setSelected(isSelected ? null : day)}
                className={`border-r border-b border-gray-800/50 h-20 md:h-24 p-1.5 text-left hover:bg-gray-800/50 transition-colors relative ${
                  isSelected ? 'bg-gray-800 ring-1 ring-inset ring-emerald-500/50' : ''
                }`}
              >
                <span className={`text-xs font-semibold rounded-full w-5 h-5 flex items-center justify-center ${
                  isT
                    ? 'bg-amber-500 text-black'
                    : day.isPast ? 'text-gray-500' : 'text-gray-300'
                }`}>
                  {d.getDate()}
                </span>

                <div className="mt-1 space-y-0.5">
                  {day.totalIn > 0 && (
                    <div className="text-[9px] md:text-[10px] text-emerald-400 font-medium truncate">
                      +{formatCurrency(day.totalIn)}
                    </div>
                  )}
                  {day.totalOut > 0 && (
                    <div className="text-[9px] md:text-[10px] text-red-400 font-medium truncate">
                      -{formatCurrency(day.totalOut)}
                    </div>
                  )}
                </div>

                {hasTx && (
                  <div className="absolute bottom-1 right-1 flex gap-0.5">
                    {day.totalIn > 0 && <div className="w-1 h-1 rounded-full bg-emerald-500" />}
                    {day.totalOut > 0 && <div className="w-1 h-1 rounded-full bg-red-500" />}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Day detail */}
      {selected && (
        <div className="card mt-4 animate-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">
              {format(new Date(selected.date + 'T12:00:00'), "EEEE, d 'de' MMMM", { locale: ptBR })}
            </h3>
            <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-300 text-sm">
              Fechar
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-emerald-500/10 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400">Entradas</p>
              <p className="text-sm font-bold text-emerald-400">{formatCurrency(selected.totalIn)}</p>
            </div>
            <div className="bg-red-500/10 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400">Saídas</p>
              <p className="text-sm font-bold text-red-400">{formatCurrency(selected.totalOut)}</p>
            </div>
            <div className={`rounded-xl p-3 text-center ${(selected.totalIn - selected.totalOut) >= 0 ? 'bg-blue-500/10' : 'bg-red-500/10'}`}>
              <p className="text-xs text-gray-400">Saldo</p>
              <p className={`text-sm font-bold ${(selected.totalIn - selected.totalOut) >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                {formatCurrency(selected.totalIn - selected.totalOut)}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {selected.incomes.map((inc, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm text-gray-300">{inc.description}</span>
                </div>
                <span className="text-sm font-medium text-emerald-400">{formatCurrency(inc.amount)}</span>
              </div>
            ))}
            {selected.fixedExpenses.map((exp, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500" />
                  <span className="text-sm text-gray-300">{exp.description}</span>
                  <span className="text-xs text-gray-600">Fixa</span>
                </div>
                <span className="text-sm font-medium text-red-400">{formatCurrency(exp.amount)}</span>
              </div>
            ))}
            {selected.variableExpenses.map((exp, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-sm text-gray-300">{exp.description}</span>
                  <span className="text-xs text-gray-600">{exp.category}</span>
                </div>
                <span className="text-sm font-medium text-red-400">{formatCurrency(exp.amount)}</span>
              </div>
            ))}
            {selected.incomes.length === 0 && selected.fixedExpenses.length === 0 && selected.variableExpenses.length === 0 && (
              <p className="text-center text-sm text-gray-600 py-4">Nenhuma movimentação neste dia.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
