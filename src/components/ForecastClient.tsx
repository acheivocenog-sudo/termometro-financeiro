'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

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
  balance: number
}

interface ForecastData {
  days: ForecastDay[]
  currentBalance: number
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
  const [data, setData] = useState<ForecastData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedDay, setExpandedDay] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/forecast')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const today = new Date()
  const monthName = format(today, 'MMMM yyyy', { locale: ptBR }).toUpperCase()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-400" />
      </div>
    )
  }

  if (!data) return <div className="text-red-400 p-4">Erro ao carregar previsão.</div>

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Previsão do Mês</h1>
          <p className="text-zinc-400 text-sm mt-1">{monthName} — Saldo atual: <span className="text-green-400 font-semibold">{formatCurrency(data.currentBalance)}</span></p>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        {/* Cabeçalho */}
        <div className="grid grid-cols-5 bg-zinc-900 px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          <div>Dia</div>
          <div className="text-right">Entrada</div>
          <div className="text-right">Saída</div>
          <div className="text-right hidden sm:block">Saldo diário</div>
          <div className="text-right">Saldo</div>
        </div>

        {/* Linhas */}
        <div className="divide-y divide-zinc-800/50">
          {data.days.map((day) => {
            const isExpanded = expandedDay === day.day
            const hasEntries = day.entries.length > 0
            const date = new Date(day.date)
            const weekDay = format(date, 'EEE', { locale: ptBR })

            return (
              <div key={day.day} className={`border-l-2 ${day.isToday ? 'border-blue-500' : 'border-transparent'}`}>
                {/* Linha principal */}
                <div
                  className={`grid grid-cols-5 px-4 py-3 text-sm cursor-pointer hover:bg-zinc-800/30 transition-colors ${getBalanceBg(day.balance, day.isToday)}`}
                  onClick={() => hasEntries && setExpandedDay(isExpanded ? null : day.day)}
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

                  <div className={`text-right font-semibold ${getBalanceColor(day.balance)}`}>
                    {formatCurrency(day.balance)}
                  </div>
                </div>

                {/* Detalhes expandidos */}
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
    </div>
  )
}
