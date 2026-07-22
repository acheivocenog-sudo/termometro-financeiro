'use client'

import { useEffect, useState } from 'react'
import { format, addMonths, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface ForecastEntry {
  description: string
  amount: number
  type: 'income' | 'fixed' | 'installment' | 'variable'
  paid?: boolean
  category?: string
  remainingInstallments?: number
}

interface ForecastDay {
  day: number
  date: string
  isToday: boolean
  isPast: boolean
  entries: ForecastEntry[]
  totalIn: number
  totalOut: number
  balance: number | null
}

interface ForecastData {
  days: ForecastDay[]
  currentBalance: number
  isFuture: boolean
  isCurrentMonth: boolean
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function getBalanceColor(balance: number) {
  if (balance < 0) return 'text-red-400'
  if (balance < 500) return 'text-yellow-400'
  return 'text-green-400'
}

function getBalanceBg(balance: number, isToday: boolean) {
  if (isToday) return 'bg-blue-500/10 border-blue-500/30'
  if (balance < 0) return 'bg-red-500/10 border-red-500/20'
  if (balance < 500) return 'bg-yellow-500/10 border-yellow-500/20'
  return 'bg-green-500/5 border-green-500/10'
}

function getTypeColor(type: ForecastEntry['type']) {
  switch (type) {
    case 'income': return 'text-green-400'
    case 'fixed': return 'text-orange-400'
    case 'installment': return 'text-purple-400'
    case 'variable': return 'text-red-400'
  }
}

function getTypeLabel(type: ForecastEntry['type']) {
  switch (type) {
    case 'income': return 'Receita'
    case 'fixed': return 'Fixa'
    case 'installment': return 'Parcela'
    case 'variable': return 'Variável'
  }
}

export default function ForecastClient() {
  const today = new Date()
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [data, setData] = useState<ForecastData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedDay, setExpandedDay] = useState<number | null>(null)

  useEffect(() => {
    setLoading(true)
    setExpandedDay(null)
    const month = viewDate.getMonth() + 1
    const year = viewDate.getFullYear()
    fetch(`/api/forecast?month=${month}&year=${year}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [viewDate])

  const canGoBack = viewDate.getMonth() === today.getMonth() && viewDate.getFullYear() === today.getFullYear()
  const monthName = format(viewDate, 'MMMM yyyy', { locale: ptBR })

  return (
    <div className="space-y-4">
      {/* Header com navegação */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Previsão Financeira</h1>
          {data && (
            <p className="text-zinc-400 text-sm mt-1">
              Saldo inicial do mês: <span className="text-green-400 font-semibold">{formatCurrency(data.currentBalance)}</span>
              {data.isFuture && <span className="ml-2 text-zinc-500 text-xs">(projetado)</span>}
            </p>
          )}
        </div>
      </div>

      {/* Navegação de mês */}
      <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
        <button
          onClick={() => setViewDate(d => subMonths(d, 1))}
          disabled={canGoBack}
          className="p-1.5 rounded-lg hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-zinc-400" />
        </button>
        <span className="font-semibold text-white capitalize">{monthName}</span>
        <button
          onClick={() => setViewDate(d => addMonths(d, 1))}
          className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
        >
          <ChevronRight className="w-5 h-5 text-zinc-400" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-400" />
        </div>
      ) : !data ? (
        <div className="text-red-400 p-4">Erro ao carregar previsão.</div>
      ) : (
        <>
          {data.isFuture && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-sm text-blue-300">
              Previsão baseada em receitas recorrentes, despesas fixas e parcelas. Gastos variáveis não incluídos.
            </div>
          )}

          {/* Tabela */}
          <div className="rounded-xl border border-zinc-800 overflow-hidden">
            <div className="grid grid-cols-5 bg-zinc-900 px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              <div>Dia</div>
              <div className="text-right">Entrada</div>
              <div className="text-right">Saída</div>
              <div className="text-right hidden sm:block">Saldo diário</div>
              <div className="text-right">Saldo</div>
            </div>

            <div className="divide-y divide-zinc-800/50">
              {data.days.map((day) => {
                const isExpanded = expandedDay === day.day
                const hasEntries = day.entries.length > 0
                const date = new Date(day.date)
                const weekDay = format(date, 'EEE', { locale: ptBR })

                return (
                  <div key={day.day} className={`border-l-2 ${day.isToday ? 'border-blue-500' : 'border-transparent'}`}>
                    <div
                      className={`grid grid-cols-5 px-4 py-3 text-sm ${day.isPast ? 'opacity-50' : 'cursor-pointer hover:bg-zinc-800/30'} transition-colors ${day.balance !== null ? getBalanceBg(day.balance, day.isToday) : ''}`}
                      onClick={() => !day.isPast && hasEntries && setExpandedDay(isExpanded ? null : day.day)}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <span className={`font-bold ${day.isToday ? 'text-blue-400' : 'text-white'}`}>{day.day}</span>
                          <span className="text-zinc-500 text-xs capitalize">{weekDay}</span>
                        </div>
                        {hasEntries && (
                          <span className="text-zinc-500 text-xs ml-1">{isExpanded ? '▲' : '▼'}</span>
                        )}
                      </div>

                      <div className="text-right">
                        {day.totalIn > 0 ? (
                          <span className="text-green-400 font-medium">{formatCurrency(day.totalIn)}</span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </div>

                      <div className="text-right">
                        {day.totalOut > 0 ? (
                          <span className="text-red-400 font-medium">{formatCurrency(day.totalOut)}</span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </div>

                      <div className="text-right hidden sm:block">
                        {day.totalIn > 0 || day.totalOut > 0 ? (
                          <span className={day.totalIn - day.totalOut >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {day.totalIn - day.totalOut >= 0 ? '+' : ''}{formatCurrency(day.totalIn - day.totalOut)}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </div>

                      <div className={`text-right font-semibold ${day.balance !== null ? getBalanceColor(day.balance) : 'text-zinc-600'}`}>
                        {day.balance !== null ? formatCurrency(day.balance) : '—'}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="bg-zinc-900/50 px-4 py-3 space-y-2 border-t border-zinc-800/50">
                        {day.entries.map((entry, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full bg-zinc-800 ${getTypeColor(entry.type)}`}>
                                {getTypeLabel(entry.type)}
                              </span>
                              <span className="text-zinc-300">{entry.description}</span>
                              {entry.category && (
                                <span className="text-zinc-500 text-xs">({entry.category})</span>
                              )}
                            </div>
                            <span className={entry.type === 'income' ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                              {entry.type === 'income' ? '+' : '-'}{formatCurrency(entry.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
