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
  const todayDay = today.getDate()

  // --- STARTING BALANCE ---
  // For current month: currentBalance is the user's manually-set balance (right now).
  // We use it as the anchor for TODAY and project forward.
  // For future months: project forward from current month end.
  let startingBalance = currentBalance

  if (isFuture) {
    // Finish current month from today onward
    const daysInCurrentMonth = getDaysInMonth(today)
    for (let d = todayDay; d <= daysInCurrentMonth; d++) {
      const date = new Date(today.getFullYear(), today.getMonth(), d)
      const dayIn = [
        ...recurringIncomes.filter(i => new Date(i.date).getDate() === d),
        ...currentMonthIncomes.filter(i => isSameDay(new Date(i.date), date)),
      ].reduce((s, i) => s + Number(i.amount), 0)
      const dayOut = [
        ...fixedExpenses.filter(e => e.dueDay === d && !e.paid),
        ...installments.filter(i => i.dueDay === d && i.remainingInstallments > 0),
      ].reduce((s, e) => s + Number(e.amount), 0)
      startingBalance += dayIn - dayOut
    }

    // Intermediate months (monthly sum)
    for (let m = 1; m < monthsElapsedToTarget; m++) {
      const monthlyIn = recurringIncomes.reduce((s, i) => s + Number(i.amount), 0)
      const monthlyOut = fixedExpenses.reduce((s, e) => s + Number(e.amount), 0)
        + installments.filter(i => i.remainingInstallments > m).reduce((s, i) => s + Number(i.amount), 0)
      startingBalance += monthlyIn - monthlyOut
    }
  }

  // --- BUILD DAY-BY-DAY TABLE ---
  const allTargetIncomes = isCurrentMonth
    ? [...recurringIncomes, ...currentMonthIncomes]
    : [...recurringIncomes, ...targetMonthIncomes]
  const allTargetVariables = isCurrentMonth ? currentVariableExpenses : targetVariableExpenses

  const totalDays = getDaysInMonth(new Date(targetYear, targetMonth))

  // For current month: runningBalance starts at currentBalance (user's balance right now = end of today).
  // Past days get their entries listed but balance = null (we don't track historical daily balances).
  // Today and future: project from currentBalance.
  // runningBalance starts at currentBalance (user's actual account balance right now).
  // currentBalance already reflects ALL past and today's transactions.
  // We project FORWARD from today: only future fixed expenses, installments, and scheduled incomes.
  let runningBalance = startingBalance
  const days = []

  for (let d = 1; d <= totalDays; d++) {
    const date = new Date(targetYear, targetMonth, d)
    const isToday = isCurrentMonth && d === todayDay
    const isPast = isCurrentMonth && d < todayDay

    // Past days: show recorded entries for context but no projected balance
    if (isPast) {
      const dayIncomes = allTargetIncomes
        .filter(i => i.recurring ? new Date(i.date).getDate() === d : isSameDay(new Date(i.date), date))
        .map(i => ({ description: i.description, amount: Number(i.amount), type: 'income' as const }))
      const dayFixed = fixedExpenses
        .filter(e => e.dueDay === d)
        .map(e => ({ description: e.description, amount: Number(e.amount), type: 'fixed' as const, paid: e.paid }))
      const dayInstallments = installments
        .filter(i => i.dueDay === d)
        .map(i => ({ description: i.description, amount: Number(i.amount), type: 'installment' as const }))
      const dayVariable = allTargetVariables
        .filter(e => isSameDay(new Date(e.date), date))
        .map(e => ({ description: e.description, amount: Number(e.amount), type: 'variable' as const, category: e.category }))
      const entries = [...dayIncomes, ...dayFixed, ...dayInstallments, ...dayVariable]
      const totalIn = dayIncomes.reduce((s, e) => s + e.amount, 0)
      const totalOut = [...dayFixed, ...dayInstallments, ...dayVariable].reduce((s, e) => s + e.amount, 0)
      days.push({ day: d, date: date.toISOString(), isToday: false, isPast: true, entries, totalIn, totalOut, balance: null })
      continue
    }

    // Today: currentBalance IS the real balance right now (already includes today's events).
    // Show today's entries for context but don't re-apply them to the balance.
    if (isToday) {
      const dayIncomes = allTargetIncomes
        .filter(i => i.recurring ? new Date(i.date).getDate() === d : isSameDay(new Date(i.date), date))
        .map(i => ({ description: i.description, amount: Number(i.amount), type: 'income' as const }))
      const dayVariable = allTargetVariables
        .filter(e => isSameDay(new Date(e.date), date))
        .map(e => ({ description: e.description, amount: Number(e.amount), type: 'variable' as const, category: e.category }))
      const dayFixed = fixedExpenses
        .filter(e => e.dueDay === d)
        .map(e => ({ description: e.description, amount: Number(e.amount), type: 'fixed' as const, paid: e.paid }))
      const dayInstallments = installments
        .filter(i => i.dueDay === d && i.remainingInstallments > monthsElapsedToTarget)
        .map(i => ({ description: `${i.description}`, amount: Number(i.amount), type: 'installment' as const }))
      const entries = [...dayIncomes, ...dayFixed, ...dayInstallments, ...dayVariable]
      const totalIn = dayIncomes.reduce((s, e) => s + e.amount, 0)
      const totalOut = [...dayFixed, ...dayInstallments, ...dayVariable].reduce((s, e) => s + e.amount, 0)
      days.push({ day: d, date: date.toISOString(), isToday: true, isPast: false, entries, totalIn, totalOut, balance: runningBalance })
      continue
    }

    // Future days: apply only unpaid fixed expenses, pending installments, and scheduled incomes.
    const dayIncomes = allTargetIncomes
      .filter(i => {
        if (i.recurring) return new Date(i.date).getDate() === d
        // Non-recurring: only if date is strictly after today
        const incDate = new Date(i.date)
        return incDate > new Date(targetYear, targetMonth, todayDay, 23, 59, 59)
          && isSameDay(incDate, date)
      })
      .map(i => ({ description: i.description, amount: Number(i.amount), type: 'income' as const }))

    const dayFixed = fixedExpenses
      .filter(e => e.dueDay === d && !e.paid)
      .map(e => ({ description: e.description, amount: Number(e.amount), type: 'fixed' as const, paid: false }))

    const dayInstallments = installments
      .filter(i => i.dueDay === d && i.remainingInstallments > monthsElapsedToTarget)
      .map(i => ({
        description: `${i.description} (${i.remainingInstallments - monthsElapsedToTarget}x restantes)`,
        amount: Number(i.amount),
        type: 'installment' as const,
        remainingInstallments: i.remainingInstallments - monthsElapsedToTarget,
      }))

    const entries = [...dayIncomes, ...dayFixed, ...dayInstallments]
    const totalIn = dayIncomes.reduce((s, e) => s + e.amount, 0)
    const totalOut = [...dayFixed, ...dayInstallments].reduce((s, e) => s + e.amount, 0)

    runningBalance = runningBalance + totalIn - totalOut

    days.push({ day: d, date: date.toISOString(), isToday: false, isPast: false, entries, totalIn, totalOut, balance: runningBalance })
  }

  return NextResponse.json({ days, currentBalance, isFuture, isCurrentMonth })
}
