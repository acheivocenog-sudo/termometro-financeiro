import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { z } from 'zod'

const schema = z.object({
  description: z.string().min(1),
  category: z.string().default('Outros'),
  amount: z.number().positive(),
  date: z.string(),
})

export async function GET() {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const expenses = await prisma.variableExpense.findMany({
    where: { userId },
    orderBy: { date: 'desc' },
    take: 100,
  })

  return NextResponse.json(expenses.map(e => ({ ...e, amount: Number(e.amount) })))
}

export async function POST(req: Request) {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const body = await req.json()
  const data = schema.parse(body)

  const expense = await prisma.variableExpense.create({
    data: { ...data, userId, date: new Date(data.date) },
  })

  return NextResponse.json({ ...expense, amount: Number(expense.amount) }, { status: 201 })
}
