'use client'

import { useState, useEffect } from 'react'
import {
  MessageSquare, Database, Info, ChevronDown, ChevronUp,
  CheckCircle, XCircle, Loader2, RefreshCw, Copy, ExternalLink,
} from 'lucide-react'

interface ZApiStatus {
  configured: boolean
  connected: boolean
  phone?: string
  qrCode?: string
  webhookUrl?: string
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="ml-2 text-gray-500 hover:text-gray-300 transition-colors inline-flex items-center gap-1 text-xs"
    >
      <Copy className="w-3 h-3" />
      {copied ? 'Copiado!' : 'Copiar'}
    </button>
  )
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
      {ok ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </span>
  )
}

export default function SettingsClient() {
  const [zapiStatus, setZapiStatus] = useState<ZApiStatus | null>(null)
  const [zapiLoading, setZapiLoading] = useState(false)
  const [showZapi, setShowZapi] = useState(true)
  const [showSupabase, setShowSupabase] = useState(false)
  const [showFormula, setShowFormula] = useState(false)
  const [testMsg, setTestMsg] = useState('')
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testLoading, setTestLoading] = useState(false)

  const fetchZapiStatus = async () => {
    setZapiLoading(true)
    const res = await fetch('/api/zapi/status')
    if (res.ok) setZapiStatus(await res.json())
    setZapiLoading(false)
  }

  useEffect(() => { fetchZapiStatus() }, [])

  async function handleWhatsAppTest(e: React.FormEvent) {
    e.preventDefault()
    setTestLoading(true)
    setTestResult(null)
    try {
      // Test parser locally without sending to DB
      const res = await fetch('/api/whatsapp-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: testMsg }),
      })
      const data = await res.json()
      setTestResult(JSON.stringify(data, null, 2))
    } catch {
      setTestResult('Erro ao testar.')
    }
    setTestLoading(false)
  }

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Configurações</h1>
        <p className="text-sm text-gray-400">Integrações e conexões externas</p>
      </div>

      {/* ── Z-API WhatsApp ── */}
      <div className="card mb-4">
        <button onClick={() => setShowZapi(!showZapi)} className="flex items-center justify-between w-full text-left">
          <div className="flex items-center gap-3">
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-2.5">
              <MessageSquare className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">WhatsApp via Z-API</h3>
              <p className="text-xs text-gray-500">Registre gastos enviando mensagens</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {zapiStatus && <StatusBadge ok={zapiStatus.connected} label={zapiStatus.connected ? 'Conectado' : zapiStatus.configured ? 'Desconectado' : 'Não configurado'} />}
            {showZapi ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          </div>
        </button>

        {showZapi && (
          <div className="mt-5 space-y-5 border-t border-gray-800 pt-4">

            {/* Status card */}
            <div className="bg-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-white">Status da conexão</p>
                <button onClick={fetchZapiStatus} disabled={zapiLoading} className="text-gray-500 hover:text-gray-300">
                  <RefreshCw className={`w-4 h-4 ${zapiLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              {zapiLoading ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Verificando...
                </div>
              ) : zapiStatus ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Configurado</span>
                    <StatusBadge ok={zapiStatus.configured} label={zapiStatus.configured ? 'Sim' : 'Não'} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">WhatsApp conectado</span>
                    <StatusBadge ok={zapiStatus.connected} label={zapiStatus.connected ? 'Sim' : 'Não'} />
                  </div>
                  {zapiStatus.phone && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Número</span>
                      <span className="text-white">{zapiStatus.phone}</span>
                    </div>
                  )}
                </div>
              ) : null}

              {/* QR Code for connection */}
              {zapiStatus?.configured && !zapiStatus.connected && zapiStatus.qrCode && (
                <div className="mt-3 text-center">
                  <p className="text-xs text-gray-400 mb-2">Escaneie o QR Code no WhatsApp para conectar:</p>
                  <img src={zapiStatus.qrCode} alt="QR Code Z-API" className="w-40 h-40 mx-auto rounded-lg" />
                </div>
              )}
            </div>

            {/* Step-by-step setup */}
            <div>
              <p className="text-sm font-semibold text-white mb-3">Como configurar (5 minutos)</p>
              <ol className="space-y-3">
                {[
                  {
                    step: '1',
                    title: 'Criar conta na Z-API',
                    body: (
                      <a href="https://z-api.io" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-xs">
                        Acessar z-api.io <ExternalLink className="w-3 h-3" />
                      </a>
                    ),
                  },
                  {
                    step: '2',
                    title: 'Criar uma instância',
                    body: <p className="text-xs text-gray-400">Painel → Instâncias → Criar instância → Copie o <b className="text-gray-300">Instance ID</b> e o <b className="text-gray-300">Token</b></p>,
                  },
                  {
                    step: '3',
                    title: 'Adicionar no .env',
                    body: (
                      <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-gray-300 space-y-1">
                        <div>ZAPI_INSTANCE_ID=<span className="text-yellow-400">sua-instancia-id</span></div>
                        <div>ZAPI_TOKEN=<span className="text-yellow-400">seu-token</span></div>
                        <div>ZAPI_SECURITY_TOKEN=<span className="text-yellow-400">security-token</span></div>
                      </div>
                    ),
                  },
                  {
                    step: '4',
                    title: 'Configurar Webhook na Z-API',
                    body: (
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Instância → Webhooks → On Message Received</p>
                        {zapiStatus?.webhookUrl && (
                          <div className="bg-gray-900 rounded-lg px-3 py-2 flex items-center gap-2">
                            <code className="text-xs text-emerald-400 flex-1 break-all">{zapiStatus.webhookUrl}</code>
                            <CopyButton text={zapiStatus.webhookUrl} />
                          </div>
                        )}
                      </div>
                    ),
                  },
                  {
                    step: '5',
                    title: 'Conectar o WhatsApp',
                    body: <p className="text-xs text-gray-400">Instância → Conectar → Escaneie o QR Code com seu WhatsApp</p>,
                  },
                ].map(({ step, title, body }) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center justify-center">{step}</span>
                    <div>
                      <p className="text-sm font-medium text-white">{title}</p>
                      <div className="mt-1">{body}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* Message examples */}
            <div>
              <p className="text-sm font-semibold text-white mb-2">Exemplos de mensagens</p>
              <div className="grid grid-cols-1 gap-1.5">
                {[
                  '💸 "Gastei 50 no mercado"',
                  '⛽ "Paguei 80 de gasolina"',
                  '🍕 "Gastei 45 no iFood"',
                  '💰 "Recebi 1200 salário"',
                  '📊 "saldo" — ver resumo',
                ].map(ex => (
                  <div key={ex} className="bg-gray-800 rounded-lg px-3 py-2 text-sm text-gray-300 font-mono">
                    {ex}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Supabase ── */}
      <div className="card mb-4">
        <button onClick={() => setShowSupabase(!showSupabase)} className="flex items-center justify-between w-full text-left">
          <div className="flex items-center gap-3">
            <div className="bg-teal-500/10 border border-teal-500/30 rounded-xl p-2.5">
              <Database className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Banco de Dados — Supabase</h3>
              <p className="text-xs text-gray-500">PostgreSQL em produção</p>
            </div>
          </div>
          {showSupabase ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </button>

        {showSupabase && (
          <div className="mt-5 space-y-4 border-t border-gray-800 pt-4">
            <ol className="space-y-3">
              {[
                {
                  step: '1',
                  title: 'Criar projeto no Supabase',
                  body: (
                    <a href="https://supabase.com/dashboard" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-teal-400 hover:text-teal-300 text-xs">
                      Acessar supabase.com <ExternalLink className="w-3 h-3" />
                    </a>
                  ),
                },
                {
                  step: '2',
                  title: 'Copiar a Connection String',
                  body: <p className="text-xs text-gray-400">Projeto → Settings → Database → Connection string → <b className="text-gray-300">URI</b> → copie o link</p>,
                },
                {
                  step: '3',
                  title: 'Colar no .env',
                  body: (
                    <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-gray-300">
                      DATABASE_URL=<span className="text-yellow-400">&quot;postgresql://postgres:[SENHA]@db.xxx.supabase.co:5432/postgres&quot;</span>
                    </div>
                  ),
                },
                {
                  step: '4',
                  title: 'Criar as tabelas',
                  body: (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Execute no terminal do projeto:</p>
                      <div className="bg-gray-900 rounded-lg px-3 py-2 flex items-center gap-2">
                        <code className="text-xs text-emerald-400">npx prisma db push</code>
                        <CopyButton text="npx prisma db push" />
                      </div>
                    </div>
                  ),
                },
                {
                  step: '5',
                  title: 'Popular com dados de exemplo (opcional)',
                  body: (
                    <div className="bg-gray-900 rounded-lg px-3 py-2 flex items-center gap-2">
                      <code className="text-xs text-emerald-400">npm run prisma:seed</code>
                      <CopyButton text="npm run prisma:seed" />
                    </div>
                  ),
                },
              ].map(({ step, title, body }) => (
                <li key={step} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-400 text-xs font-bold flex items-center justify-center">{step}</span>
                  <div>
                    <p className="text-sm font-medium text-white">{title}</p>
                    <div className="mt-1">{body}</div>
                  </div>
                </li>
              ))}
            </ol>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-400">
              <b>Atenção:</b> a variável <code>NEXTAUTH_URL</code> também precisa ser atualizada para o domínio de produção (ex: <code>https://seuapp.vercel.app</code>).
            </div>
          </div>
        )}
      </div>

      {/* ── Fórmula ── */}
      <div className="card">
        <button onClick={() => setShowFormula(!showFormula)} className="flex items-center justify-between w-full text-left">
          <div className="flex items-center gap-3">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-2.5">
              <Info className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Como o Termômetro calcula</h3>
              <p className="text-xs text-gray-500">Fórmula e sistema de cores</p>
            </div>
          </div>
          {showFormula ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </button>

        {showFormula && (
          <div className="mt-5 space-y-3 border-t border-gray-800 pt-4 text-sm">
            {[
              { label: 'Saldo Disponível', formula: '(Saldo Atual + Receitas Futuras) − Despesas Fixas Pendentes', color: 'text-blue-400' },
              { label: 'Saldo Projetado', formula: 'Saldo Disponível − Gastos Variáveis do Mês', color: 'text-emerald-400' },
              { label: 'Saldo Diário', formula: 'Saldo Projetado ÷ Dias Restantes do Mês', color: 'text-amber-400' },
            ].map(({ label, formula, color }) => (
              <div key={label} className="bg-gray-800 rounded-xl p-3">
                <p className={`text-xs font-bold ${color} mb-1`}>{label}</p>
                <p className="text-gray-300 font-mono text-xs">{formula}</p>
              </div>
            ))}

            <div className="bg-gray-800 rounded-xl p-3">
              <p className="text-xs font-bold text-gray-300 mb-2">Sistema de cores (% do limite diário gasto):</p>
              <div className="space-y-1.5 text-xs">
                {[
                  { color: 'bg-green-500', label: 'Verde — abaixo de 80%' },
                  { color: 'bg-yellow-500', label: 'Amarelo — entre 80% e 100%' },
                  { color: 'bg-red-500', label: 'Vermelho — acima de 100%' },
                  { color: 'bg-red-900', label: 'Vermelho escuro — saldo projetado negativo' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${color}`} />
                    <span className="text-gray-400">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
