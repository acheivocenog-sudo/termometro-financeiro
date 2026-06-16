import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { zapiSendText } from '@/lib/zapi'
import { parseWhatsAppMessage } from '@/lib/whatsapp-parser'
import { calculateFinancials } from '@/lib/finance'
import { startOfMonth, endOfMonth } from 'date-fns'

// Z-API webhook payload (receive messages)
// https://developer.z-api.io/webhooks/on-message-received
interface ZApiWebhook {
  instanceId: string
  messageId: string
  phone: string        // "5511999999999"
  fromMe: boolean
  momment: number      // timestamp ms (typo is from Z-API)
  status: string
  chatName: string
  senderName: string
  senderPhoto?: string
  isGroup: boolean
  type: 'ReceivedCallback'
  text?: { message: string }
  image?: { caption?: string }
  audio?: unknown
  video?: { caption?: string }
  document?: unknown
  sticker?: unknown
  waitingMessage?: boolean
}

// Security token validation
function isValidZApiRequest(req: Request): boolean {
  const securityToken = process.env.ZAPI_SECURITY_TOKEN
  if (!securityToken) return true // not configured, allow all (dev mode)
  return req.headers.get('client-token') === securityToken
}

// Extract text from any message type
function extractText(body: ZApiWebhook): string | null {
  if (body.text?.message) return body.text.message
  if (body.image?.caption) return body.image.caption
  if (body.video?.caption) return body.video.caption
  return null
}

export async function POST(req: Request) {
  // Security: validate Z-API token
  if (!isValidZApiRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: ZApiWebhook
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Ignore messages sent by us or group messages
  if (body.fromMe || body.isGroup || body.waitingMessage) {
    return NextResponse.json({ ok: true })
  }

  const rawPhone = body.phone.replace('@c.us', '').replace(/\D/g, '')
  const text = extractText(body)

  if (!text) return NextResponse.json({ ok: true })

  // Find user by WhatsApp phone number
  // Phone is stored as the user's registered email prefix or in a future phone field
  // For now: look up the user that registered with this phone linked to their account
  // Strategy: match by a "whatsapp_phone" metadata or fall back to first user (single-tenant)
  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!user) {
    await zapiSendText(rawPhone, '❌ Nenhuma conta encontrada. Acesse o app para se cadastrar.')
    return NextResponse.json({ ok: true })
  }

  const parsed = parseWhatsAppMessage(text)

  // Commands
  if (text.trim().toLowerCase() === 'saldo' || text.trim().toLowerCase() === 'resumo') {
    const reply = await buildSummaryMessage(user.id)
    await zapiSendText(rawPhone, reply)
    return NextResponse.json({ ok: true })
  }

  if (text.trim().toLowerCase() === 'ajuda' || text.trim().toLowerCase() === 'help') {
    await zapiSendText(rawPhone, HELP_MESSAGE)
    return NextResponse.json({ ok: true })
  }

  if (parsed.amount <= 0) {
    await zapiSendText(rawPhone, `❓ Não entendi o valor.\n\n${HELP_MESSAGE}`)
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
    await zapiSendText(rawPhone, reply)
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

    // Recalculate to show updated daily budget
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
    await zapiSendText(rawPhone, reply)
    return NextResponse.json({ ok: true })
  }

  await zapiSendText(rawPhone, `❓ Não entendi. ${HELP_MESSAGE}`)
  return NextResponse.json({ ok: true })
}

// GET — Z-API webhook validation (some providers ping GET on setup)
export async function GET() {
  return NextResponse.json({ status: 'Termômetro Financeiro webhook ativo' })
}

// ─────────────────────────────────────────────────────────────────────────────

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
