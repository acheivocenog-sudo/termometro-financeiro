export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { startOfMonth, endOfMonth } from 'date-fns'

export async function GET(req: Request) {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const { searchParams } = new URL(req.url)
  const today = new Date()
  const month = parseInt(searchParams.get('month') ?? String(today.getMonth() + 1)) - 1
  const year = parseInt(searchParams.get('year') ?? String(today.getFullYear()))

  const start = startOfMonth(new Date(year, month))
  const end = endOfMonth(new Date(year, month))

  const [variableExpenses, incomes, fixedExpenses] = await Promise.all([
    prisma.variableExpense.findMany({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: { date: 'desc' },
    }),
    prisma.income.findMany({
      where: {
        userId,
        OR: [
          { recurring: false, date: { gte: start, lte: end } },
          { recurring: true },
        ],
      },
      orderBy: { date: 'asc' },
    }),
    prisma.fixedExpense.findMany({
      where: { userId },
      orderBy: { dueDay: 'asc' },
    }),
  ])

  return NextResponse.json({
    variableExpenses: variableExpenses.map(e => ({ ...e, amount: Number(e.amount) })),
    incomes: incomes.map(i => ({ ...i, amount: Number(i.amount) })),
    fixedExpenses: fixedExpenses.map(e => ({ ...e, amount: Number(e.amount) })),
  })
}
