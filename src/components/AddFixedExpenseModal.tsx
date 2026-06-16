'use client'

import { useState } from 'react'
import { X, Plus } from 'lucide-react'

interface AddFixedExpenseModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

export default function AddFixedExpenseModal({ open, onClose, onSaved }: AddFixedExpenseModalProps) {
  const [form, setForm] = useState({ description: '', amount: '', dueDay: '', recurring: true })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/fixed-expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, amount: parseFloat(form.amount), dueDay: parseInt(form.dueDay) }),
    })

    setLoading(false)

    if (!res.ok) {
      setError('Erro ao salvar.')
      return
    }

    setForm({ description: '', amount: '', dueDay: '', recurring: true })
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md card">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Despesa Fixa</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
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
              placeholder="Ex: Aluguel, Internet, Academia..."
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
              <label className="label">Dia de Vencimento</label>
              <input
                type="number"
                required
                min="1"
                max="31"
                value={form.dueDay}
                onChange={e => setForm(f => ({ ...f, dueDay: e.target.value }))}
                className="input"
                placeholder="Ex: 10"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="recurring-fixed"
              checked={form.recurring}
              onChange={e => setForm(f => ({ ...f, recurring: e.target.checked }))}
              className="w-4 h-4 accent-emerald-500"
            />
            <label htmlFor="recurring-fixed" className="text-sm text-gray-400">Recorrente</label>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
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
