import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { getDaysInMonth, isSameDay } from 'date-fns'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const { searchParams } = new URL(req.url)
  const today = new Date()

  const targetMonth = parseInt(searchParams.get('month') ?? String(today.getMonth() + 1)) - 1 // 0-indexed
  const targetYear = parseInt(searchParams.get('year') ?? String(today.getFullYear()))

  const isCurrentMonth = targetMonth === today.getMonth() && targetYear === today.getFullYear()
  const isFuture = targetYear > today.getFullYear() || (targetYear === today.getFullYear() && targetMonth > today.getMonth())

  const [balance, allIncomes, fixedExpenses, installments, variableExpenses] = await Promise.all([
    prisma.balance.findUnique({ where: { userId } }),
    prisma.income.findMany({ where: { userId } }),
    prisma.fixedExpense.findMany({ where: { userId } }),
    prisma.installment.findMany({ where: { userId, remainingInstallments: { gt: 0 } } }),
    prisma.variableExpense.findMany({ where: { userId } }),
  ])

  const currentBalance = Number(balance?.amount ?? 0)

  // For future months: calculate projected starting balance by chaining months
  let startingBalance = currentBalance
  if (isFuture) {
    let simMonth = today.getMonth()
    let simYear = today.getFullYear()

    // finish current month first (from today to end of month)
    const daysInCurrentMonth = getDaysInMonth(new Date(simYear, simMonth))
    for (let d = today.getDate(); d <= daysInCurrentMonth; d++) {
      const date = new Date(simYear, simMonth, d)
      const monthIncomes = allIncomes.filter(i => isSameDay(new Date(i.date), date))
      const dayFixed = fixedExpenses.filter(e => e.dueDay === d)
      // months elapsed from now = 0 for current month
      const dayInst = installments.filter(i => i.dueDay === d && i.remainingInstallments > 0)
      const dayVar = variableExpenses.filter(e => isSameDay(new Date(e.date), date))
      const totalIn = monthIncomes.reduce((s, i) => s + Number(i.amount), 0)
      const totalOut = [...dayFixed, ...dayInst].reduce((s, e) => s + Number(e.amount), 0)
        + dayVar.reduce((s, e) => s + Number(e.amount), 0)
      startingBalance += totalIn - totalOut
    }

    // advance month by month until target
    simMonth++
    if (simMonth > 11) { simMonth = 0; simYear++ }

    let monthsElapsed = 1
    while (simMonth !== targetMonth || simYear !== targetYear) {
      const daysInMonth = getDaysInMonth(new Date(simYear, simMonth))
      for (let d = 1; d <= daysInMonth; d++) {
        const dayFixed = fixedExpenses.filter(e => e.dueDay === d)
        const dayInst = installments.filter(i => i.dueDay === d && i.remainingInstallments > monthsElapsed)
        const recurringIncomes = allIncomes.filter(i => i.recurring && new Date(i.date).getDate() === d)
        const totalIn = recurringIncomes.reduce((s, i) => s + Number(i.amount), 0)
        const totalOut = [...dayFixed, ...dayInst].reduce((s, e) => s + Number(e.amount), 0)
        startingBalance += totalIn - totalOut
      }
      simMonth++
      if (simMonth > 11) { simMonth = 0; simYear++ }
      monthsElapsed++
    }
  }

  // months elapsed from current month to target (for installment remaining check)
  const monthsElapsedToTarget = (targetYear - today.getFullYear()) * 12 + (targetMonth - today.getMonth())

  // Get incomes for the target month
  const targetMonthStart = new Date(targetYear, targetMonth, 1)
  const targetMonthEnd = new Date(targetYear, targetMonth + 1, 0)
  const monthIncomes = allIncomes.filter(i => {
    const d = new Date(i.date)
    if (i.recurring) return true // recurring incomes appear every month
    return d >= targetMonthStart && d <= targetMonthEnd
  })
  const monthVariableExpenses = isFuture ? [] : variableExpenses.filter(e => {
    const d = new Date(e.date)
    return d >= targetMonthStart && d <= targetMonthEnd
  })

  const totalDays = getDaysInMonth(new Date(targetYear, targetMonth))
  const startDay = isCurrentMonth ? today.getDate() : 1
  let runningBalance = startingBalance
  const days = []

  for (let d = startDay; d <= totalDays; d++) {
    const date = new Date(targetYear, targetMonth, d)
    const isToday = isCurrentMonth && d === today.getDate()

    const dayIncomes = monthIncomes
      .filter(i => {
        if (i.recurring) return new Date(i.date).getDate() === d
        return isSameDay(new Date(i.date), date)
      })
      .map(i => ({ description: i.description, amount: Number(i.amount), type: 'income' as const }))

    const dayFixed = fixedExpenses
      .filter(e => e.dueDay === d)
      .map(e => ({ description: e.description, amount: Number(e.amount), type: 'fixed' as const, paid: isCurrentMonth ? e.paid : false }))

    const dayInstallments = installments
      .filter(i => i.dueDay === d && i.remainingInstallments > monthsElapsedToTarget)
      .map(i => ({
        description: `${i.description} (${i.remainingInstallments - monthsElapsedToTarget}x restantes)`,
        amount: Number(i.amount),
        type: 'installment' as const,
        remainingInstallments: i.remainingInstallments - monthsElapsedToTarget,
      }))

    const dayVariable = monthVariableExpenses
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
      isPast: false,
      entries: [...dayIncomes, ...dayFixed, ...dayInstallments, ...dayVariable],
      totalIn,
      totalOut,
      balance: runningBalance,
    })
  }

  return NextResponse.json({ days, currentBalance: startingBalance, isFuture, isCurrentMonth })
}
