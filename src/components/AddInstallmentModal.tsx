'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export default function AddInstallmentModal({ onClose, onSuccess }: Props) {
  const [form, setForm] = useState({
    description: '',
    amount: '',
    totalInstallments: '',
    remainingInstallments: '',
    dueDay: '',
  })
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const dueDay = parseInt(form.dueDay)
      const now = new Date()
      const todayDay = now.getDate()
      // If dueDay already passed this month, first installment is next month
      let startYear = now.getFullYear()
      let startMonth = now.getMonth()
      if (dueDay < todayDay) {
        startMonth += 1
        if (startMonth > 11) { startMonth = 0; startYear += 1 }
      }
      const startDate = `${startYear}-${String(startMonth + 1).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`

      await fetch('/api/installments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: form.description,
          amount: parseFloat(form.amount.replace(',', '.')),
          totalInstallments: parseInt(form.totalInstallments),
          remainingInstallments: parseInt(form.remainingInstallments),
          dueDay,
          startDate,
        }),
      })
      onSuccess()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl w-full max-w-md border border-zinc-800">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">Adicionar Empréstimo/Parcela</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-sm text-zinc-400 block mb-1">Descrição</label>
            <input
              required
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
              placeholder="Ex: Financiamento carro"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400 block mb-1">Valor da parcela (R$)</label>
            <input
              required
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
              placeholder="Ex: 850,00"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-zinc-400 block mb-1">Total de parcelas</label>
              <input
                required
                type="number"
                min="1"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                placeholder="Ex: 48"
                value={form.totalInstallments}
                onChange={e => setForm(f => ({ ...f, totalInstallments: e.target.value, remainingInstallments: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 block mb-1">Parcelas restantes</label>
              <input
                required
                type="number"
                min="1"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                placeholder="Ex: 36"
                value={form.remainingInstallments}
                onChange={e => setForm(f => ({ ...f, remainingInstallments: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-zinc-400 block mb-1">Dia de vencimento (1-31)</label>
            <input
              required
              type="number"
              min="1"
              max="31"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
              placeholder="Ex: 15"
              value={form.dueDay}
              onChange={e => setForm(f => ({ ...f, dueDay: e.target.value }))}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Salvando...' : 'Adicionar Parcela'}
          </button>
        </form>
      </div>
    </div>
  )
}
