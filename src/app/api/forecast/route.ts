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

  const monthsElapsedToTarget = (targetYear - today.getFullYear()) * 12 + (targetMonth - today.getMonth())

  const targetStart = startOfMonth(new Date(targetYear, targetMonth))
  const targetEnd = endOfMonth(new Date(targetYear, targetMonth))
  const currentStart = startOfMonth(today)
  const currentEnd = endOfMonth(today)

  const [balance, recurringIncomes, currentMonthIncomes, targetMonthIncomes, fixedExpenses, installments, currentVariableExpenses, targetVariableExpenses] = await Promise.all([
    prisma.balance.findUnique({ where: { userId } }),
    prisma.income.findMany({ where: { userId, recurring: true } }),
    prisma.income.findMany({ where: { userId, recurring: false, date: { gte: currentStart, lte: currentEnd } } }),
    isCurrentMonth ? Promise.resolve([]) : prisma.income.findMany({ where: { userId, recurring: false, date: { gte: targetStart, lte: targetEnd } } }),
    prisma.fixedExpense.findMany({ where: { userId } }),
    prisma.installment.findMany({ where: { userId, remainingInstallments: { gt: 0 } } }),
    prisma.variableExpense.findMany({ where: { userId, date: { gte: currentStart, lte: currentEnd } } }),
    isCurrentMonth ? Promise.resolve([]) : prisma.variableExpense.findMany({ where: { userId, date: { gte: targetStart, lte: targetEnd } } }),
  ])

  const currentBalance = Number(balance?.amount ?? 0)

  // --- CURRENT MONTH: reconstruct month-start balance ---
  // currentBalance already reflects all past transactions.
  // To find what the balance was on day 1, undo actual recorded transactions up to today.
  let monthStartBalance = currentBalance
  if (isCurrentMonth) {
    // Undo incomes recorded so far this month
    for (const inc of currentMonthIncomes) {
      monthStartBalance -= Number(inc.amount)
    }
    for (const inc of recurringIncomes) {
      const incDay = new Date(inc.date).getDate()
      if (incDay <= today.getDate()) {
        monthStartBalance -= Number(inc.amount)
      }
    }
    // Undo variable expenses recorded so far this month
    for (const exp of currentVariableExpenses) {
      monthStartBalance += Number(exp.amount)
    }
    // Undo fixed expenses and installments due before or on today
    for (const exp of fixedExpenses) {
      if (exp.dueDay <= today.getDate()) {
        monthStartBalance += Number(exp.amount)
      }
    }
    for (const inst of installments) {
      if (inst.dueDay <= today.getDate()) {
        monthStartBalance += Number(inst.amount)
      }
    }
  }

  // --- FUTURE MONTH: project forward from current balance ---
  let startingBalance = currentBalance
  if (isFuture) {
    // Finish current month from today onward
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

    // Intermediate months (monthly sum)
    for (let m = 1; m < monthsElapsedToTarget; m++) {
      const monthlyIn = recurringIncomes.reduce((s, i) => s + Number(i.amount), 0)
      const monthlyOut = fixedExpenses.reduce((s, e) => s + Number(e.amount), 0)
        + installments.filter(i => i.remainingInstallments > m).reduce((s, i) => s + Number(i.amount), 0)
      startingBalance += monthlyIn - monthlyOut
    }

    monthStartBalance = startingBalance
  }

  // --- BUILD DAY-BY-DAY TABLE (full month) ---
  const allTargetIncomes = isCurrentMonth
    ? [...recurringIncomes, ...currentMonthIncomes]
    : [...recurringIncomes, ...targetMonthIncomes]
  const allTargetVariables = isCurrentMonth ? currentVariableExpenses : targetVariableExpenses

  const totalDays = getDaysInMonth(new Date(targetYear, targetMonth))
  let runningBalance = isCurrentMonth ? monthStartBalance : startingBalance
  const days = []

  for (let d = 1; d <= totalDays; d++) {
    const date = new Date(targetYear, targetMonth, d)
    const isToday = isCurrentMonth && d === today.getDate()
    const isPast = isCurrentMonth && d < today.getDate()

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

    // Past days: only show actual recorded transactions (variable + incomes), not projected fixed/installments
    const entries = isPast
      ? [...dayIncomes, ...dayVariable]
      : [...dayIncomes, ...dayFixed, ...dayInstallments, ...dayVariable]

    const totalIn = entries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
    const totalOut = entries.filter(e => e.type !== 'income').reduce((s, e) => s + e.amount, 0)

    runningBalance = runningBalance + totalIn - totalOut

    days.push({
      day: d,
      date: date.toISOString(),
      isToday,
      isPast,
      entries,
      totalIn,
      totalOut,
      balance: runningBalance,
    })
  }

  return NextResponse.json({ days, currentBalance: isCurrentMonth ? monthStartBalance : startingBalance, isFuture, isCurrentMonth })
}
