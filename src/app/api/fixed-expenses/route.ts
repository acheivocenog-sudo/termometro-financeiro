export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { z } from 'zod'

const schema = z.object({
  description: z.string().min(1),
  amount: z.number().positive(),
  dueDay: z.number().min(1).max(31),
  recurring: z.boolean().optional().default(true),
})

export async function GET() {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const expenses = await prisma.fixedExpense.findMany({
    where: { userId },
    orderBy: { dueDay: 'asc' },
  })

  return NextResponse.json(expenses.map(e => ({ ...e, amount: Number(e.amount) })))
}

export async function POST(req: Request) {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const body = await req.json()
  const data = schema.parse(body)

  const expense = await prisma.fixedExpense.create({ data: { ...data, userId } })
  return NextResponse.json({ ...expense, amount: Number(expense.amount) }, { status: 201 })
}

