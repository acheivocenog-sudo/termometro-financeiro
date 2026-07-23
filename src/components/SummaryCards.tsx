'use client'

import { FinancialSummary, formatCurrency } from '@/lib/finance'
import { Wallet, TrendingUp, TrendingDown, Calendar, DollarSign, Clock, PiggyBank } from 'lucide-react'

interface SummaryCardsProps {
  summary: FinancialSummary
}

export default function SummaryCards({ summary }: SummaryCardsProps) {
  const cards = [
    {
      label: 'Saldo Atual',
      value: formatCurrency(summary.realCurrentBalance),
      icon: Wallet,
      color: summary.realCurrentBalance >= 0 ? 'text-blue-400' : 'text-red-400',
      bg: summary.realCurrentBalance >= 0 ? 'bg-blue-500/10' : 'bg-red-500/10',
      border: summary.realCurrentBalance >= 0 ? 'border-blue-500/20' : 'border-red-500/20',
      subtitle: 'Valor em conta agora',
    },
    {
      label: 'Receitas do Mês',
      value: formatCurrency(summary.futureIncomesTotal),
      icon: TrendingUp,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      subtitle: 'Recebidas e a receber hoje+',
    },
    {
      label: 'Contas a Pagar',
      value: formatCurrency(summary.futureExpensesTotal),
      icon: TrendingDown,
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      subtitle: 'Despesas fixas pendentes',
    },
    {
      label: 'Saldo Projetado',
      value: formatCurrency(summary.projectedBalance),
      icon: DollarSign,
      color: summary.projectedBalance >= 0 ? 'text-emerald-400' : 'text-red-400',
      bg: summary.projectedBalance >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10',
      border: summary.projectedBalance >= 0 ? 'border-emerald-500/20' : 'border-red-500/20',
      subtitle: 'Previsão até fim do mês',
    },
    {
      label: 'Saldo Diário',
      value: formatCurrency(summary.dailyBudget),
      icon: Calendar,
      color: summary.dailyBudget >= 0 ? 'text-amber-400' : 'text-red-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      subtitle: `Por dia (${summary.daysRemaining} dias restantes)`,
    },
    {
      label: 'Gastos Variáveis',
      value: formatCurrency(summary.variableExpensesTotalThisMonth),
      icon: Clock,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20',
      subtitle: 'Total gasto no mês',
    },
    {
      label: 'Caixinha 10%',
      value: formatCurrency(summary.caixinha),
      icon: PiggyBank,
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/20',
      subtitle: '10% de todas as receitas',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {cards.map(card => (
        <div key={card.label} className={`card border ${card.border} flex flex-col gap-2`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">{card.label}</span>
            <div className={`${card.bg} rounded-lg p-1.5`}>
              <card.icon className={`w-3.5 h-3.5 ${card.color}`} />
            </div>
          </div>
          <p className={`text-lg font-bold ${card.color}`}>{card.value}</p>
          <p className="text-xs text-gray-600">{card.subtitle}</p>
        </div>
      ))}
    </div>
  )
}
