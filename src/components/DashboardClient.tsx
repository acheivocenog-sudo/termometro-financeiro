'use client'

import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, TrendingUp, ShoppingCart, Wallet, RefreshCw, Trash2 } from 'lucide-react'
import Thermometer from './Thermometer'
import SummaryCards from './SummaryCards'
import AddExpenseModal from './AddExpenseModal'
import AddIncomeModal from './AddIncomeModal'
import AddFixedExpenseModal from './AddFixedExpenseModal'
import BalanceModal from './BalanceModal'
import { FinancialSummary, formatCurrency } from '@/lib/finance'

interface DashboardData {
  summary: FinancialSummary
  incomes: Array<{ id: string; description: string; amount: number; date: string; recurring: boolean }>
  fixedExpenses: Array<{ id: string; description: string; amount: number; dueDay: number; recurring: boolean; paid: boolean }>
  variableExpenses: Array<{ id: string; description: string; category: string; amount: number; date: string }>
}

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
  'Outros': 'bg-gray-500/20 text-gray-400',
}

export default function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'expense' | 'income' | 'fixed' | 'balance' | null>(null)
  const today = new Date()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/dashboard')
    if (res.ok) {
      const json = await res.json()
      setData(json)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function deleteVariableExpense(id: string) {
    await fetch(`/api/variable-expenses/${id}`, { method: 'DELETE' })
    fetchData()
  }

  async function deleteIncome(id: string) {
    await fetch(`/api/incomes/${id}`, { method: 'DELETE' })
    fetchData()
  }

  async function deleteFixedExpense(id: string) {
    await fetch(`/api/fixed-expenses/${id}`, { method: 'DELETE' })
    fetchData()
  }

  async function toggleFixedPaid(id: string, paid: boolean) {
    await fetch(`/api/fixed-expenses/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid: !paid }),
    })
    fetchData()
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex items-center gap-3 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Carregando dados...</span>
        </div>
      </div>
    )
  }

  const summary = data?.summary

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {format(today, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModal('balance')}
            className="btn-secondary flex items-center gap-2 text-sm py-1.5 px-3"
          >
            <Wallet className="w-4 h-4" />
            <span className="hidden sm:inline">Atualizar Saldo</span>
          </button>
          <button
            onClick={fetchData}
            className="btn-secondary p-1.5 rounded-xl"
            title="Atualizar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {summary && (
        <>
          {/* Summary cards */}
          <SummaryCards summary={summary} />

          {/* Main content grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
            {/* Thermometer */}
            <div className="lg:col-span-1">
              <Thermometer summary={summary} />
            </div>

            {/* Recent variable expenses */}
            <div className="lg:col-span-2 card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white">Gastos do Mês</h3>
                <button
                  onClick={() => setModal('expense')}
                  className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  Registrar Gasto
                </button>
              </div>

              {data?.variableExpenses.length === 0 ? (
                <div className="text-center py-8 text-gray-600">
                  <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum gasto registrado ainda.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin pr-1">
                  {data?.variableExpenses.slice(0, 20).map(exp => (
                    <div key={exp.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-800 transition-colors group">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{exp.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded-md ${CATEGORY_COLORS[exp.category] ?? CATEGORY_COLORS['Outros']}`}>
                            {exp.category}
                          </span>
                          <span className="text-xs text-gray-500">
                            {format(new Date(exp.date), 'dd/MM')}
                          </span>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-red-400">{formatCurrency(exp.amount)}</span>
                      <button
                        onClick={() => deleteVariableExpense(exp.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Incomes + Fixed expenses */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {/* Incomes */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white">Receitas do Mês</h3>
                <button
                  onClick={() => setModal('income')}
                  className="text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              {data?.incomes.length === 0 ? (
                <div className="text-center py-6 text-gray-600">
                  <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma receita cadastrada.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data?.incomes.map(inc => (
                    <div key={inc.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-800 group">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{inc.description}</p>
                        <p className="text-xs text-gray-500">{format(new Date(inc.date), 'dd/MM/yyyy')}</p>
                      </div>
                      <span className="text-sm font-bold text-emerald-400">{formatCurrency(inc.amount)}</span>
                      <button
                        onClick={() => deleteIncome(inc.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Fixed Expenses */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white">Despesas Fixas</h3>
                <button
                  onClick={() => setModal('fixed')}
                  className="text-red-400 hover:text-red-300 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              {data?.fixedExpenses.length === 0 ? (
                <div className="text-center py-6 text-gray-600">
                  <p className="text-sm">Nenhuma despesa fixa cadastrada.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data?.fixedExpenses.map(exp => (
                    <div key={exp.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-800 group">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${exp.paid ? 'line-through text-gray-600' : 'text-white'}`}>
                          {exp.description}
                        </p>
                        <p className="text-xs text-gray-500">Dia {exp.dueDay}</p>
                      </div>
                      <span className={`text-sm font-bold ${exp.paid ? 'text-gray-600' : 'text-red-400'}`}>
                        {formatCurrency(exp.amount)}
                      </span>
                      <button
                        onClick={() => toggleFixedPaid(exp.id, exp.paid)}
                        title={exp.paid ? 'Marcar como não pago' : 'Marcar como pago'}
                        className={`w-4 h-4 rounded border flex-shrink-0 border-gray-600 flex items-center justify-center transition-colors ${
                          exp.paid ? 'bg-emerald-500 border-emerald-500' : 'hover:border-emerald-400'
                        }`}
                      >
                        {exp.paid && <span className="text-white text-[10px] font-bold">✓</span>}
                      </button>
                      <button
                        onClick={() => deleteFixedExpense(exp.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* FAB for mobile */}
      <button
        onClick={() => setModal('expense')}
        className="md:hidden fixed bottom-20 right-4 z-30 bg-emerald-500 hover:bg-emerald-400 text-white rounded-full p-4 shadow-lg shadow-emerald-500/30 transition-colors"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Modals */}
      <AddExpenseModal
        open={modal === 'expense'}
        onClose={() => setModal(null)}
        onSaved={fetchData}
      />
      <AddIncomeModal
        open={modal === 'income'}
        onClose={() => setModal(null)}
        onSaved={fetchData}
      />
      <AddFixedExpenseModal
        open={modal === 'fixed'}
        onClose={() => setModal(null)}
        onSaved={fetchData}
      />
      {summary && (
        <BalanceModal
          open={modal === 'balance'}
          currentBalance={summary.currentBalance}
          onClose={() => setModal(null)}
          onSaved={fetchData}
        />
      )}
    </div>
  )
}
