export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { getDaysInMonth, isSameDay, startOfMonth, endOfMonth } from 'date-fns'

export async function GET(req: Request) {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const { searchParams } = new URL(req.url)
  const today = new Date()
  const todayDay = today.getDate()

  const targetMonth = parseInt(searchParams.get('month') ?? String(today.getMonth() + 1)) - 1
  const targetYear = parseInt(searchParams.get('year') ?? String(today.getFullYear()))

  const isCurrentMonth = targetMonth === today.getMonth() && targetYear === today.getFullYear()
  const isFuture = targetYear > today.getFullYear() ||
    (targetYear === today.getFullYear() && targetMonth > today.getMonth())
  const monthsElapsedToTarget = (targetYear - today.getFullYear()) * 12 + (targetMonth - today.getMonth())

  const currentStart = startOfMonth(today)
  const currentEnd = endOfMonth(today)
  const targetStart = startOfMonth(new Date(targetYear, targetMonth))
  const targetEnd = endOfMonth(new Date(targetYear, targetMonth))

  const [balance, recurringIncomes, currentMonthIncomes, targetMonthIncomes,
    fixedExpenses, installments, currentVariableExpenses, targetVariableExpenses] = await Promise.all([
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

  // ─── RECONSTRUCT MONTH-START BALANCE ────────────────────────────────────────
  // currentBalance = user's actual account balance right now (after all past transactions).
  // To find what the balance was on day 1 of this month, we reverse everything that happened:
  //   + add back variable expenses (undo spending)
  //   - subtract received incomes (undo receiving)
  //   + add back paid fixed expenses (undo bill payments)
  // This gives us the clean month-start balance to replay from.
  let monthStartBalance = currentBalance

  if (isCurrentMonth) {
    // Undo all variable expenses recorded this month
    for (const exp of currentVariableExpenses) {
      monthStartBalance += Number(exp.amount)
    }
    // Undo non-recurring incomes received this month
    for (const inc of currentMonthIncomes) {
      monthStartBalance -= Number(inc.amount)
    }
    // Undo recurring incomes whose due day fell on or before today
    for (const inc of recurringIncomes) {
      const dueDay = new Date(inc.date).getDate()
      if (dueDay <= todayDay) {
        monthStartBalance -= Number(inc.amount)
      }
    }
    // Undo PAID fixed expenses (only paid ones were actually deducted from account)
    for (const exp of fixedExpenses) {
      if (exp.paid && exp.dueDay <= todayDay) {
        monthStartBalance += Number(exp.amount)
      }
    }
    // Undo installment payments for this month (due day passed, still has remaining)
    for (const inst of installments) {
      if (inst.dueDay <= todayDay) {
        monthStartBalance += Number(inst.amount)
      }
    }
  }

  // ─── PROJECT START BALANCE FOR FUTURE MONTHS ────────────────────────────────
  let startingBalance = isCurrentMonth ? monthStartBalance : currentBalance

  if (isFuture) {
    // Finish current month (today → end of month)
    const daysInCurrent = getDaysInMonth(today)
    for (let d = todayDay; d <= daysInCurrent; d++) {
      const date = new Date(today.getFullYear(), today.getMonth(), d)
      const dayIn = [
        ...recurringIncomes.filter(i => new Date(i.date).getDate() === d),
        ...currentMonthIncomes.filter(i => isSameDay(new Date(i.date), date)),
      ].reduce((s, i) => s + Number(i.amount), 0)
      const dayOut = [
        ...fixedExpenses.filter(e => e.dueDay === d && !e.paid),
        ...installments.filter(i => i.dueDay === d),
      ].reduce((s, e) => s + Number(e.amount), 0)
      startingBalance += dayIn - dayOut
    }
    // Skip intermediate full months
    for (let m = 1; m < monthsElapsedToTarget; m++) {
      const monthlyIn = recurringIncomes.reduce((s, i) => s + Number(i.amount), 0)
      const monthlyOut = fixedExpenses.reduce((s, e) => s + Number(e.amount), 0)
        + installments.filter(i => i.remainingInstallments > m).reduce((s, i) => s + Number(i.amount), 0)
      startingBalance += monthlyIn - monthlyOut
    }
  }

  // ─── BUILD DAY-BY-DAY TABLE ─────────────────────────────────────────────────
  // Simple running balance: start from day-1 balance, apply every entry day by day.
  // Past days  → actual DB data (what really happened)
  // Today      → actual DB data (transactions so far today)
  // Future     → scheduled events (fixed expenses, installments, future incomes)
  const allTargetIncomes = isCurrentMonth
    ? [...recurringIncomes, ...currentMonthIncomes]
    : [...recurringIncomes, ...targetMonthIncomes]
  const allTargetVariables = isCurrentMonth ? currentVariableExpenses : targetVariableExpenses

  const totalDays = getDaysInMonth(new Date(targetYear, targetMonth))
  let runningBalance = startingBalance
  const days = []

  for (let d = 1; d <= totalDays; d++) {
    const date = new Date(targetYear, targetMonth, d)
    const isToday = isCurrentMonth && d === todayDay
    const isPast = isCurrentMonth && d < todayDay
    const isFutureDay = !isToday && !isPast

    // ── Incomes ──
    let dayIncomeEntries
    if (isFutureDay) {
      // Future: recurring on this day + non-recurring explicitly scheduled for this future date
      dayIncomeEntries = allTargetIncomes
        .filter(i => {
          if (i.recurring) return new Date(i.date).getDate() === d
          return isSameDay(new Date(i.date), date)
        })
    } else {
      // Past / today: actual DB incomes
      dayIncomeEntries = allTargetIncomes
        .filter(i => i.recurring
          ? new Date(i.date).getDate() === d
          : isSameDay(new Date(i.date), date))
    }
    const dayIncomes = dayIncomeEntries.map(i => ({
      description: i.description, amount: Number(i.amount), type: 'income' as const,
    }))

    // ── Fixed expenses ──
    const dayFixed = fixedExpenses
      .filter(e => {
        if (e.dueDay !== d) return false
        if (isFutureDay) return !e.paid  // future: only unpaid
        return true                       // past/today: show regardless (paid or not)
      })
      .map(e => ({
        description: e.description, amount: Number(e.amount),
        type: 'fixed' as const, paid: e.paid,
      }))

    // ── Installments ──
    const dayInstallments = installments
      .filter(i => i.dueDay === d && i.remainingInstallments > monthsElapsedToTarget)
      .map(i => ({
        description: `${i.description} (${i.remainingInstallments - monthsElapsedToTarget}x restantes)`,
        amount: Number(i.amount), type: 'installment' as const,
      }))

    // ── Variable expenses (only past / today — future is unpredictable) ──
    const dayVariable = isFutureDay ? [] : allTargetVariables
      .filter(e => isSameDay(new Date(e.date), date))
      .map(e => ({
        description: e.description, amount: Number(e.amount),
        type: 'variable' as const, category: e.category,
      }))

    const entries = [...dayIncomes, ...dayFixed, ...dayInstallments, ...dayVariable]
    const totalIn = dayIncomes.reduce((s, e) => s + e.amount, 0)
    const totalOut = [...dayFixed, ...dayInstallments, ...dayVariable].reduce((s, e) => s + e.amount, 0)

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

  return NextResponse.json({ days, currentBalance: monthStartBalance, isFuture, isCurrentMonth })
}
