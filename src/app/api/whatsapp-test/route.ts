export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { parseWhatsAppMessage } from '@/lib/whatsapp-parser'

export async function POST(req: Request) {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const { message } = await req.json()
  const parsed = parseWhatsAppMessage(message)

  return NextResponse.json({
    input: message,
    type: parsed.type,
    amount: parsed.amount,
    description: parsed.description,
    category: parsed.category,
    preview:
      parsed.type === 'income'
        ? `âœ… Receita: ${parsed.description} â€” R$ ${parsed.amount.toFixed(2)}`
        : parsed.type === 'expense'
        ? `âœ… Gasto (${parsed.category}): ${parsed.description} â€” R$ ${parsed.amount.toFixed(2)}`
        : `â“ NÃ£o identificado`,
  })
}

