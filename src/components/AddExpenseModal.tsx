'use client'

import { useState } from 'react'
import { X, Plus, PiggyBank } from 'lucide-react'
import { format } from 'date-fns'

interface AddExpenseModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

const CATEGORIES = [
  'Alimentação', 'Transporte', 'Saúde', 'Lazer', 'Educação',
  'Moradia', 'Vestuário', 'Tecnologia', 'Serviços', 'Investimento', 'Outros',
]

export default function AddExpenseModal({ open, onClose, onSaved }: AddExpenseModalProps) {
  const [form, setForm] = useState({
    description: '',
    category: 'Outros',
    amount: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    fromCaixinha: false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Combine selected date with current local time to avoid UTC day-shift bug
    const now = new Date()
    const [year, month, day] = form.date.split('-').map(Number)
    const localDate = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds())

    const res = await fetch('/api/variable-expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, amount: parseFloat(form.amount), date: localDate.toISOString() }),
    })

    setLoading(false)

    if (!res.ok) {
      setError('Erro ao salvar. Tente novamente.')
      return
    }

    setForm({ description: '', category: 'Outros', amount: '', date: format(new Date(), 'yyyy-MM-dd'), fromCaixinha: false })
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md card animate-in slide-in-from-bottom-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Registrar Gasto</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Descrição</label>
            <input
              type="text"
              required
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="input"
              placeholder="Ex: Almoço no restaurante"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Valor (R$)</label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="input"
                placeholder="0,00"
              />
            </div>
            <div>
              <label className="label">Data</label>
              <input
                type="date"
                required
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="label">Categoria</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="input"
            >
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Toggle Caixinha */}
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, fromCaixinha: !f.fromCaixinha }))}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${
              form.fromCaixinha
                ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-400'
                : 'bg-gray-800/50 border-gray-700 text-gray-500 hover:border-gray-600'
            }`}
          >
            <PiggyBank className="w-4 h-4 flex-shrink-0" />
            <div className="text-left flex-1">
              <p className="text-sm font-medium">Pagar com Caixinha</p>
              <p className="text-xs opacity-70">Desconta da caixinha, não do saldo geral</p>
            </div>
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
              form.fromCaixinha ? 'bg-yellow-500 border-yellow-500' : 'border-gray-600'
            }`}>
              {form.fromCaixinha && <span className="text-white text-[10px] font-bold">✓</span>}
            </div>
          </button>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" />
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
