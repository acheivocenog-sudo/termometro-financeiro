'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Trash2, TrendingUp, TrendingDown, RefreshCw, Filter, CreditCard, Plus } from 'lucide-react'
import { formatCurrency } from '@/lib/finance'
import AddInstallmentModal from './AddInstallmentModal'

type TabType = 'variable' | 'incomes' | 'fixed' | 'installments'

const CATEGORY_COLORS: Record<string, string> = {
  'Alimentação': 'bg-orange-500/20 text-orange-400',
  'Transporte': 'bg-blue-500/20 text-blue-400',
  'Saúde': 'bg-red-500/20 text-red-400',
  'Lazer': 'bg-purple-500/20 text-purple-400',
  'Educação': 'bg-cyan-500/20 text-cyan-400',
  'Moradia': 'bg-yellow-500/20 text-yellow-400',
  'Vestuário': 'bg-pink-500/20 text-pink-400',
  'Tecnologia': 'bg-indigo-500/20 text-indigo-400',
  'Serviços': 'bg-teal-500/20 text-teal-400',
  'Investimento': 'bg-emerald-500/20 text-emerald-400',
  'Outros': 'bg-gray-500/20 text-gray-400',
}

export default function TransactionsClient() {
  const [data, setData] = useState<any>(null)
  const [installments, setInstallments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabType>('variable')
  const [categoryFilter, setCategoryFilter] = useState<string>('Todas')
  const [showInstallmentModal, setShowInstallmentModal] = useState(false)

  const fetchData = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/dashboard').then(r => r.json()),
      fetch('/api/installments').then(r => r.json()),
    ]).then(([d, inst]) => {
      setData(d)
      setInstallments(inst)
      setLoading(false)
    })
  }

  useEffect(() => { fetchData() }, [])

  async function deleteExpense(id: string) {
    await fetch(`/api/variable-expenses/${id}`, { method: 'DELETE' })
    fetchData()
  }

  async function deleteIncome(id: string) {
    await fetch(`/api/incomes/${id}`, { method: 'DELETE' })
    fetchData()
  }

  async function deleteFixed(id: string) {
    await fetch(`/api/fixed-expenses/${id}`, { method: 'DELETE' })
    fetchData()
  }

  async function deleteInstallment(id: string) {
    await fetch(`/api/installments/${id}`, { method: 'DELETE' })
    fetchData()
  }

  const tabs: Array<{ key: TabType; label: string; icon: typeof TrendingUp }> = [
    { key: 'variable', label: 'Gastos', icon: TrendingDown },
    { key: 'incomes', label: 'Receitas', icon: TrendingUp },
    { key: 'fixed', label: 'Fixas', icon: Filter },
    { key: 'installments', label: 'Parcelas', icon: CreditCard },
  ]

  // Category breakdown for variable expenses
  const categorySummary = data?.variableExpenses.reduce((acc: Record<string, number>, e: any) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount
    return acc
  }, {}) ?? {}

  const sortedCategories = Object.entries(categorySummary)
    .sort(([, a], [, b]) => (b as number) - (a as number))

  const totalVariable = data?.variableExpenses.reduce((s: number, e: any) => s + e.amount, 0) ?? 0
  const totalIncome = data?.incomes.reduce((s: number, i: any) => s + i.amount, 0) ?? 0

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Transações</h1>
          <p className="text-sm text-gray-400">Histórico do mês atual</p>
        </div>
        <button onClick={fetchData} className="btn-secondary p-1.5 rounded-xl">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Category breakdown (only for variable) */}
      {tab === 'variable' && sortedCategories.length > 0 && (
        <div className="card mb-4">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Por Categoria</h3>
          <div className="space-y-2">
            {sortedCategories.map(([cat, amount]) => {
              const pct = totalVariable > 0 ? ((amount as number) / totalVariable) * 100 : 0
              return (
                <div key={cat}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-300">{cat}</span>
                    <span className="text-gray-400">{formatCurrency(amount as number)} ({Math.round(pct)}%)</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex justify-between mt-3 pt-3 border-t border-gray-800">
            <span className="text-sm text-gray-400">Total</span>
            <span className="text-sm font-bold text-red-400">{formatCurrency(totalVariable)}</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 p-1 rounded-xl mb-4 border border-gray-800">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-gray-800 text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="card">
        {tab === 'variable' && (
          <>
            {/* Filtro de categoria */}
            {data?.variableExpenses.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-3">
                {['Todas', ...Object.keys(CATEGORY_COLORS)].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      categoryFilter === cat
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                        : 'border-gray-700 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
            {(() => {
              const filtered = categoryFilter === 'Todas'
                ? data?.variableExpenses ?? []
                : (data?.variableExpenses ?? []).filter((e: any) => e.category === categoryFilter)
              return filtered.length === 0 ? (
              <p className="text-center text-gray-600 py-8">Nenhum gasto registrado.</p>
            ) : (
              <div className="divide-y divide-gray-800">
                {filtered.map((exp: any) => (
                  <div key={exp.id} className="flex items-center gap-3 py-3 group">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{exp.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded-md ${CATEGORY_COLORS[exp.category] ?? CATEGORY_COLORS['Outros']}`}>
                          {exp.category}
                        </span>
                        <span className="text-xs text-gray-500">
                          {format(new Date(exp.date), "d 'de' MMM 'às' HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-red-400">{formatCurrency(exp.amount)}</span>
                    <button
                      onClick={() => deleteExpense(exp.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )
            })()}
          </>
        )}

        {tab === 'incomes' && (
          <>
            {data?.incomes.length === 0 ? (
              <p className="text-center text-gray-600 py-8">Nenhuma receita cadastrada.</p>
            ) : (
              <div className="divide-y divide-gray-800">
                {data?.incomes.map((inc: any) => (
                  <div key={inc.id} className="flex items-center gap-3 py-3 group">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{inc.description}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {format(new Date(inc.date), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                        {inc.recurring && <span className="ml-2 text-emerald-600">Recorrente</span>}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-emerald-400">{formatCurrency(inc.amount)}</span>
                    <button
                      onClick={() => deleteIncome(inc.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <div className="flex justify-between pt-3 text-sm font-semibold">
                  <span className="text-gray-400">Total</span>
                  <span className="text-emerald-400">{formatCurrency(totalIncome)}</span>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'fixed' && (
          <>
            {data?.fixedExpenses.length === 0 ? (
              <p className="text-center text-gray-600 py-8">Nenhuma despesa fixa cadastrada.</p>
            ) : (
              <div className="divide-y divide-gray-800">
                {data?.fixedExpenses.map((exp: any) => (
                  <div key={exp.id} className="flex items-center gap-3 py-3 group">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${exp.paid ? 'line-through text-gray-600' : 'text-white'}`}>
                        {exp.description}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Vence dia {exp.dueDay}
                        {exp.paid && <span className="ml-2 text-emerald-500">Pago</span>}
                      </p>
                    </div>
                    <span className={`text-sm font-bold ${exp.paid ? 'text-gray-600' : 'text-red-400'}`}>
                      {formatCurrency(exp.amount)}
                    </span>
                    <button
                      onClick={() => deleteFixed(exp.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <div className="flex justify-between pt-3 text-sm font-semibold">
                  <span className="text-gray-400">Total</span>
                  <span className="text-red-400">
                    {formatCurrency(data?.fixedExpenses.reduce((s: number, e: any) => s + e.amount, 0) ?? 0)}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'installments' && (
          <>
            <div className="flex justify-end mb-3">
              <button
                onClick={() => setShowInstallmentModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Adicionar
              </button>
            </div>
            {installments.length === 0 ? (
              <p className="text-center text-gray-600 py-8">Nenhuma parcela cadastrada.</p>
            ) : (
              <div className="divide-y divide-gray-800">
                {installments.map((inst: any) => (
                  <div key={inst.id} className="flex items-center gap-3 py-3 group">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{inst.description}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Vence dia {inst.dueDay} · {inst.remainingInstallments}/{inst.totalInstallments} parcelas restantes
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-purple-400">{formatCurrency(Number(inst.amount))}</span>
                      <p className="text-xs text-gray-500">por parcela</p>
                    </div>
                    <button
                      onClick={() => deleteInstallment(inst.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <div className="flex justify-between pt-3 text-sm font-semibold">
                  <span className="text-gray-400">Total mensal</span>
                  <span className="text-purple-400">
                    {formatCurrency(installments.reduce((s: number, i: any) => s + Number(i.amount), 0))}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showInstallmentModal && (
        <AddInstallmentModal
          onClose={() => setShowInstallmentModal(false)}
          onSuccess={fetchData}
        />
      )}
    </div>
  )
}
