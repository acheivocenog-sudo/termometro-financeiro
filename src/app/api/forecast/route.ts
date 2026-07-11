import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { getDaysInMonth, isSameDay, startOfMonth, endOfMonth } from 'date-fns'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const { searchParams } = new URL(req.url)
  const today = new Date()

  const targetMonth = parseInt(searchParams.get('month') ?? String(today.getMonth() + 1)) - 1
  const targetYear = parseInt(searchParams.get('year') ?? String(today.getFullYear()))

  const isCurrentMonth = targetMonth === today.getMonth() && targetYear === today.getFullYear()
  const isFuture = targetYear > today.getFullYear() ||
    (targetYear === today.getFullYear() && targetMonth > today.getMonth())

  // Months elapsed from current month to target
  const monthsElapsedToTarget = (targetYear - today.getFullYear()) * 12 + (targetMonth - today.getMonth())

  // Fetch only what's needed
  const targetStart = startOfMonth(new Date(targetYear, targetMonth))
  const targetEnd = endOfMonth(new Date(targetYear, targetMonth))
  const currentStart = startOfMonth(today)
  const currentEnd = endOfMonth(today)

  const [balance, recurringIncomes, currentMonthIncomes, targetMonthIncomes, fixedExpenses, installments, currentVariableExpenses, targetVariableExpenses] = await Promise.all([
    prisma.balance.findUnique({ where: { userId } }),
    // Recurring incomes (needed for projections)
    prisma.income.findMany({ where: { userId, recurring: true } }),
    // Non-recurring incomes in current month (for current month remainder projection)
    prisma.income.findMany({ where: { userId, recurring: false, date: { gte: currentStart, lte: currentEnd } } }),
    // Non-recurring incomes in target month
    isCurrentMonth ? Promise.resolve([]) : prisma.income.findMany({ where: { userId, recurring: false, date: { gte: targetStart, lte: targetEnd } } }),
    prisma.fixedExpense.findMany({ where: { userId } }),
    prisma.installment.findMany({ where: { userId, remainingInstallments: { gt: 0 } } }),
    // Variable expenses for current month only
    prisma.variableExpense.findMany({ where: { userId, date: { gte: currentStart, lte: currentEnd } } }),
    // Variable expenses for target month (if different)
    isCurrentMonth ? Promise.resolve([]) : prisma.variableExpense.findMany({ where: { userId, date: { gte: targetStart, lte: targetEnd } } }),
  ])

  const currentBalance = Number(balance?.amount ?? 0)
  let startingBalance = currentBalance

  if (isFuture) {
    // Project balance from today to end of current month
    const daysInCurrentMonth = getDaysInMonth(today)
    for (let d = today.getDate(); d <= daysInCurrentMonth; d++) {
      const date = new Date(today.getFullYear(), today.getMonth(), d)
      const dayIn = [
        ...recurringIncomes.filter(i => new Date(i.date).getDate() === d),
        ...currentMonthIncomes.filter(i => isSameDay(new Date(i.date), date)),
      ].reduce((s, i) => s + Number(i.amount), 0)
      const dayOut = [
        ...fixedExpenses.filter(e => e.dueDay === d),
        ...installments.filter(i => i.dueDay === d && i.remainingInstallments > 0),
      ].reduce((s, e) => s + Number(e.amount), 0)
        + currentVariableExpenses.filter(e => isSameDay(new Date(e.date), date))
          .reduce((s, e) => s + Number(e.amount), 0)
      startingBalance += dayIn - dayOut
    }

    // Project each intermediate month as a monthly sum (fast)
    for (let m = 1; m < monthsElapsedToTarget; m++) {
      const monthlyIn = recurringIncomes.reduce((s, i) => s + Number(i.amount), 0)
      const monthlyOut = fixedExpenses.reduce((s, e) => s + Number(e.amount), 0)
        + installments
            .filter(i => i.remainingInstallments > m)
            .reduce((s, i) => s + Number(i.amount), 0)
      startingBalance += monthlyIn - monthlyOut
    }
  }

  // Build day-by-day forecast for target month
  const allTargetIncomes = isCurrentMonth
    ? [...recurringIncomes, ...currentMonthIncomes]
    : [...recurringIncomes, ...targetMonthIncomes]

  const allTargetVariables = isCurrentMonth ? currentVariableExpenses : targetVariableExpenses

  const totalDays = getDaysInMonth(new Date(targetYear, targetMonth))
  const startDay = isCurrentMonth ? today.getDate() : 1
  let runningBalance = startingBalance
  const days = []

  for (let d = startDay; d <= totalDays; d++) {
    const date = new Date(targetYear, targetMonth, d)
    const isToday = isCurrentMonth && d === today.getDate()

    const dayIncomes = allTargetIncomes
      .filter(i => i.recurring ? new Date(i.date).getDate() === d : isSameDay(new Date(i.date), date))
      .map(i => ({ description: i.description, amount: Number(i.amount), type: 'income' as const }))

    const dayFixed = fixedExpenses
      .filter(e => e.dueDay === d)
      .map(e => ({
        description: e.description,
        amount: Number(e.amount),
        type: 'fixed' as const,
        paid: isCurrentMonth ? e.paid : false,
      }))

    const dayInstallments = installments
      .filter(i => i.dueDay === d && i.remainingInstallments > monthsElapsedToTarget)
      .map(i => ({
        description: `${i.description} (${i.remainingInstallments - monthsElapsedToTarget}x restantes)`,
        amount: Number(i.amount),
        type: 'installment' as const,
        remainingInstallments: i.remainingInstallments - monthsElapsedToTarget,
      }))

    const dayVariable = allTargetVariables
      .filter(e => isSameDay(new Date(e.date), date))
      .map(e => ({ description: e.description, amount: Number(e.amount), type: 'variable' as const, category: e.category }))

    const totalIn = dayIncomes.reduce((s, i) => s + i.amount, 0)
    const totalOut = [...dayFixed, ...dayInstallments, ...dayVariable].reduce((s, e) => s + e.amount, 0)

    runningBalance = runningBalance + totalIn - totalOut

    days.push({
      day: d,
      date: date.toISOString(),
      isToday,
      isPast: false,
      entries: [...dayIncomes, ...dayFixed, ...dayInstallments, ...dayVariable],
      totalIn,
      totalOut,
      balance: runningBalance,
    })
  }

  return NextResponse.json({ days, currentBalance: startingBalance, isFuture, isCurrentMonth })
}
