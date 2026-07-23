'use client'

import { useState } from 'react'
import { X, Heart } from 'lucide-react'

interface CustoDeVidaModalProps {
  open: boolean
  current: number | null
  onClose: () => void
  onSaved: () => void
}

export default function CustoDeVidaModal({ open, current, onClose, onSaved }: CustoDeVidaModalProps) {
  const [value, setValue] = useState(current ? String(current) : '')
  const [loading, setLoading] = useState(false)

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await fetch('/api/balance', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthlyLivingCost: parseFloat(value) }),
    })
    setLoading(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md card animate-in slide-in-from-bottom-4">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-pink-400" />
            <h2 className="text-lg font-semibold text-white">Custo de Vida Mensal</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Informe quanto você precisa por mês para manter seu padrão de vida (aluguel, comida, contas, lazer, etc.).
          Isso calcula quanto tempo você consegue se sustentar com o saldo atual.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Custo mensal (R$)</label>
            <input
              type="number"
              required
              min="1"
              step="0.01"
              value={value}
              onChange={e => setValue(e.target.value)}
              className="input"
              placeholder="Ex: 6000"
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={loading} className="flex-1 bg-pink-600 hover:bg-pink-500 text-white font-semibold py-2.5 px-4 rounded-xl transition-colors">
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
