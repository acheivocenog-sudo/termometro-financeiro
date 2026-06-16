import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { evolutionSendText } from '@/lib/evolution'
import { parseWhatsAppMessage } from '@/lib/whatsapp-parser'
import { calculateFinancials } from '@/lib/finance'
import { startOfMonth, endOfMonth } from 'date-fns'

// Evolution API webhook payload
interface EvolutionWebhook {
  event: string
  instance: string
  data: {
    key: {
      remoteJid: string
      fromMe: boolean
      id: string
    }
    pushName?: string
    message?: {
      conversation?: string
      extendedTextMessage?: { text: string }
      imageMessage?: { caption?: string }
      videoMessage?: { caption?: string }
    }
    messageType: string
    messageTimestamp: number
    instanceId: string
    source: string
  }
}

function extractPhone(remoteJid: string): string {
  return remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '').replace(/\D/g, '')
}

function extractText(data: EvolutionWebhook['data']): string | null {
  const msg = data.message
  if (!msg) return null
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    null
  )
}

export async function POST(req: Request) {
  let body: EvolutionWebhook
  try {
    const raw = await req.text()
    console.log('[whatsapp] payload:', raw.slice(0, 500))
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Only process incoming messages
  if (body.event !== 'messages.upsert') {
    return NextResponse.json({ ok: true })
  }

  const { key, messageType } = body.data

  // Ignore group messages, fromMe, and non-text
  if (key.fromMe) return NextResponse.json({ ok: true })
  if (key.remoteJid.includes('@g.us')) return NextResponse.json({ ok: true })
  if (messageType === 'reactionMessage') return NextResponse.json({ ok: true })

  const phone = extractPhone(key.remoteJid)
  const text = extractText(body.data)

  console.log('[whatsapp] phone:', phone, 'text:', text)

  if (!text) return NextResponse.json({ ok: true })

  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!user) {
    await evolutionSendText(phone, '❌ Nenhuma conta encontrada. Acesse o app para se cadastrar.')
    return NextResponse.json({ ok: true })
  }

  const parsed = parseWhatsAppMessage(text)

  if (text.trim().toLowerCase() === 'saldo' || text.trim().toLowerCase() === 'resumo') {
    const reply = await buildSummaryMessage(user.id)
    await evolutionSendText(phone, reply)
    return NextResponse.json({ ok: true })
  }

  if (text.trim().toLowerCase() === 'ajuda' || text.trim().toLowerCase() === 'help') {
    await evolutionSendText(phone, HELP_MESSAGE)
    return NextResponse.json({ ok: true })
  }

  if (parsed.amount <= 0) {
    await evolutionSendText(phone, `❓ Não entendi o valor.\n\n${HELP_MESSAGE}`)
    return NextResponse.json({ ok: true })
  }

  if (parsed.type === 'income') {
    await prisma.income.create({
      data: {
        userId: user.id,
        description: parsed.description,
        amount: parsed.amount,
        date: new Date(),
        recurring: false,
      },
    })
    const reply = [
      `✅ *Receita registrada!*`,
      `💰 ${parsed.description}`,
      `💵 R$ ${parsed.amount.toFixed(2).replace('.', ',')}`,
      ``,
      `_Digite *saldo* para ver seu resumo_`,
    ].join('\n')
    await evolutionSendText(phone, reply)
    return NextResponse.json({ ok: true })
  }

  if (parsed.type === 'expense') {
    await prisma.variableExpense.create({
      data: {
        userId: user.id,
        description: parsed.description,
        category: parsed.category,
        amount: parsed.amount,
        date: new Date(),
      },
    })

    const summary = await fetchSummary(user.id)
    const emoji = summary.thermometerStatus === 'green' ? '🟢' : summary.thermometerStatus === 'yellow' ? '🟡' : '🔴'
    const remaining = summary.dailyBudget - summary.todaySpent

    const reply = [
      `✅ *Gasto registrado!*`,
      `🛒 ${parsed.description} _(${parsed.category})_`,
      `💸 R$ ${parsed.amount.toFixed(2).replace('.', ',')}`,
      ``,
      `${emoji} *Hoje:* R$ ${summary.todaySpent.toFixed(2).replace('.', ',')} de R$ ${summary.dailyBudget.toFixed(2).replace('.', ',')}`,
      `📊 *Restante hoje:* R$ ${Math.max(0, remaining).toFixed(2).replace('.', ',')}`,
    ].join('\n')
    await evolutionSendText(phone, reply)
    return NextResponse.json({ ok: true })
  }

  await evolutionSendText(phone, `❓ Não entendi. ${HELP_MESSAGE}`)
  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({ status: 'Termômetro Financeiro webhook ativo' })
}

const HELP_MESSAGE = [
  `📱 *Termômetro Financeiro*`,
  ``,
  `Envie uma mensagem assim:`,
  `• *Gastei 50 no mercado*`,
  `• *Paguei 30 de gasolina*`,
  `• *Recebi 500 de freelance*`,
  `• *Ganhei 1200 salário*`,
  ``,
  `Comandos:`,
  `• *saldo* — ver resumo financeiro`,
  `• *ajuda* — esta mensagem`,
].join('\n')

async function fetchSummary(userId: string) {
  const today = new Date()
  const [balance, incomes, fixedExpenses, variableExpenses] = await Promise.all([
    prisma.balance.findUnique({ where: { userId } }),
    prisma.income.findMany({ where: { userId, date: { gte: startOfMonth(today), lte: endOfMonth(today) } } }),
    prisma.fixedExpense.findMany({ where: { userId } }),
    prisma.variableExpense.findMany({ where: { userId, date: { gte: startOfMonth(today), lte: endOfMonth(today) } } }),
  ])
  return calculateFinancials({
    currentBalance: Number(balance?.amount ?? 0),
    futureIncomes: incomes.map(i => ({ ...i, amount: Number(i.amount) })),
    futureFixedExpenses: fixedExpenses.map(e => ({ ...e, amount: Number(e.amount) })),
    todayVariableExpenses: variableExpenses.map(e => ({ ...e, amount: Number(e.amount) })),
    allVariableExpenses: variableExpenses.map(e => ({ ...e, amount: Number(e.amount) })),
  }, today)
}

async function buildSummaryMessage(userId: string): Promise<string> {
  const s = await fetchSummary(userId)
  const emoji = s.thermometerStatus === 'green' ? '🟢' : s.thermometerStatus === 'yellow' ? '🟡' : s.thermometerStatus === 'red' ? '🔴' : '🚨'
  const label = s.thermometerStatus === 'green' ? 'Dentro do planejado' : s.thermometerStatus === 'yellow' ? 'Próximo do limite' : s.thermometerStatus === 'red' ? 'Acima do limite' : 'Comprometendo pagamentos!'

  return [
    `${emoji} *Resumo Financeiro*`,
    ``,
    `💰 *Saldo atual:* R$ ${s.currentBalance.toFixed(2).replace('.', ',')}`,
    `📈 *Receitas futuras:* R$ ${s.futureIncomesTotal.toFixed(2).replace('.', ',')}`,
    `📉 *Contas a pagar:* R$ ${s.futureExpensesTotal.toFixed(2).replace('.', ',')}`,
    ``,
    `💵 *Saldo projetado:* R$ ${s.projectedBalance.toFixed(2).replace('.', ',')}`,
    `📅 *Saldo diário:* R$ ${s.dailyBudget.toFixed(2).replace('.', ',')} _(${s.daysRemaining} dias)_`,
    ``,
    `🌡️ *Termômetro:* ${label}`,
    `🛒 *Gasto hoje:* R$ ${s.todaySpent.toFixed(2).replace('.', ',')}`,
  ].join('\n')
}
