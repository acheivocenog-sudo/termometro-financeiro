import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { startOfMonth, endOfMonth, isSameDay, isBefore } from 'date-fns'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const today = new Date()
  const start = startOfMonth(today)
  const end = endOfMonth(today)

  const [balance, incomes, fixedExpenses, installments, variableExpenses] = await Promise.all([
    prisma.balance.findUnique({ where: { userId } }),
    prisma.income.findMany({ where: { userId, date: { gte: start, lte: end } } }),
    prisma.fixedExpense.findMany({ where: { userId } }),
    prisma.installment.findMany({ where: { userId, remainingInstallments: { gt: 0 } } }),
    prisma.variableExpense.findMany({ where: { userId, date: { gte: start, lte: end } } }),
  ])

  const totalDays = end.getDate()
  const currentBalance = Number(balance?.amount ?? 0)
  const days = []

  let runningBalance = currentBalance

  // Calculate running balance up to yesterday
  for (let d = 1; d < today.getDate(); d++) {
    const date = new Date(today.getFullYear(), today.getMonth(), d)
    const dayIncomes = incomes.filter(i => isSameDay(new Date(i.date), date))
    const dayFixed = fixedExpenses.filter(e => e.dueDay === d)
    const dayInstallments = installments.filter(i => i.dueDay === d)
    const dayVariable = variableExpenses.filter(e => isSameDay(new Date(e.date), date))

    const totalIn = dayIncomes.reduce((s, i) => s + Number(i.amount), 0)
    const totalOut = [...dayFixed, ...dayInstallments].reduce((s, e) => s + Number(e.amount), 0)
      + dayVariable.reduce((s, e) => s + Number(e.amount), 0)

    runningBalance = runningBalance + totalIn - totalOut
  }

  // Build forecast from today to end of month
  for (let d = today.getDate(); d <= totalDays; d++) {
    const date = new Date(today.getFullYear(), today.getMonth(), d)
    const isToday = d === today.getDate()
    const isPast = isBefore(date, today) && !isToday

    const dayIncomes = incomes
      .filter(i => isSameDay(new Date(i.date), date))
      .map(i => ({ description: i.description, amount: Number(i.amount), type: 'income' as const }))

    const dayFixed = fixedExpenses
      .filter(e => e.dueDay === d)
      .map(e => ({ description: e.description, amount: Number(e.amount), type: 'fixed' as const, paid: e.paid }))

    const dayInstallments = installments
      .filter(i => i.dueDay === d)
      .map(i => ({
        description: `${i.description} (${i.remainingInstallments}x restantes)`,
        amount: Number(i.amount),
        type: 'installment' as const,
        remainingInstallments: i.remainingInstallments,
      }))

    const dayVariable = variableExpenses
      .filter(e => isSameDay(new Date(e.date), date))
      .map(e => ({ description: e.description, amount: Number(e.amount), type: 'variable' as const, category: e.category }))

    const totalIn = dayIncomes.reduce((s, i) => s + i.amount, 0)
    const totalOut = [...dayFixed, ...dayInstallments].reduce((s, e) => s + e.amount, 0)
      + dayVariable.reduce((s, e) => s + e.amount, 0)

    runningBalance = runningBalance + totalIn - totalOut

    days.push({
      day: d,
      date: date.toISOString(),
      isToday,
      isPast,
      entries: [...dayIncomes, ...dayFixed, ...dayInstallments, ...dayVariable],
      totalIn,
      totalOut,
      balance: runningBalance,
    })
  }

  return NextResponse.json({ days, currentBalance })
}
