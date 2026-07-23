export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { getDaysInMonth, startOfMonth, endOfMonth } from 'date-fns'

// Convert any UTC date to Brazil (UTC-3) date string "YYYY-MM-DD"
const toBrazilDateStr = (d: Date) =>
  new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)

const padZ = (n: number) => String(n).padStart(2, '0')

export async function GET(req: Request) {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const { searchParams } = new URL(req.url)

  // Determine today in Brazil timezone (UTC-3)
  const nowUTC = new Date()
  const todayBrazilStr = toBrazilDateStr(nowUTC)
  const todayYear = parseInt(todayBrazilStr.slice(0, 4))
  const todayMonth = parseInt(todayBrazilStr.slice(5, 7)) - 1  // 0-indexed
  const todayDay = parseInt(todayBrazilStr.slice(8, 10))

  const targetMonth = parseInt(searchParams.get('month') ?? String(todayMonth + 1)) - 1
  const targetYear = parseInt(searchParams.get('year') ?? String(todayYear))

  const isCurrentMonth = targetMonth === todayMonth && targetYear === todayYear
  const isFuture = targetYear > todayYear ||
    (targetYear === todayYear && targetMonth > todayMonth)
  const monthsElapsedToTarget = (targetYear - todayYear) * 12 + (targetMonth - todayMonth)

  const todayLocal = new Date(todayYear, todayMonth, todayDay)
  const currentStart = startOfMonth(todayLocal)
  const currentEnd = endOfMonth(todayLocal)
  const targetStart = startOfMonth(new Date(targetYear, targetMonth))
  const targetEnd = endOfMonth(new Date(targetYear, targetMonth))

  const [balance, recurringIncomes, currentMonthIncomes, targetMonthIncomes,
    fixedExpenses, installments, currentVariableExpenses, targetVariableExpenses,
    allTimeIncomes, caixinhaSpentAgg] = await Promise.all([
    prisma.balance.findUnique({ where: { userId } }),
    prisma.income.findMany({ where: { userId, recurring: true } }),
    prisma.income.findMany({ where: { userId, recurring: false, date: { gte: currentStart, lte: currentEnd } } }),
    isCurrentMonth ? Promise.resolve([]) : prisma.income.findMany({ where: { userId, recurring: false, date: { gte: targetStart, lte: targetEnd } } }),
    prisma.fixedExpense.findMany({ where: { userId } }),
    prisma.installment.findMany({ where: { userId, remainingInstallments: { gt: 0 } } }),
    // Exclude caixinha expenses from general balance
    prisma.variableExpense.findMany({ where: { userId, fromCaixinha: false, date: { gte: currentStart, lte: currentEnd } } }),
    isCurrentMonth ? Promise.resolve([]) : prisma.variableExpense.findMany({ where: { userId, fromCaixinha: false, date: { gte: targetStart, lte: targetEnd } } }),
    // Only count incomes already received (recurring always count; non-recurring only up to today)
    prisma.income.aggregate({ where: { userId, OR: [{ recurring: true }, { date: { lt: new Date(todayYear, todayMonth, todayDay + 1) } }] }, _sum: { amount: true } }),
    prisma.variableExpense.aggregate({ where: { userId, fromCaixinha: true }, _sum: { amount: true } }),
  ])

  // currentBalance = the balance the user manually set (treated as month-start anchor).
  // Deduct caixinha (10% of all incomes minus what was spent from it) from the start.
  const rawBalance = Number(balance?.amount ?? 0)
  const totalIncomesEver = Number(allTimeIncomes._sum.amount ?? 0)
  const caixinhaSpent = Number(caixinhaSpentAgg._sum.amount ?? 0)
  const caixinhaNet = totalIncomesEver * 0.10 - caixinhaSpent
  const currentBalance = rawBalance - caixinhaNet
  const monthStartBalance = currentBalance

  // ─── PROJECT START BALANCE FOR FUTURE MONTHS ────────────────────────────────
  // Current month keeps currentBalance as anchor (day-by-day loop replays all DB transactions).
  // Future months start from realCurrentBalance (what user actually has today), then
  // apply remaining current-month events, then simulate each intermediate month.
  let startingBalance = currentBalance

  if (isFuture) {
    // Step 1: compute realCurrentBalance = what the user has right now
    const variableSpentToDate = currentVariableExpenses
      .filter(e => toBrazilDateStr(new Date(e.date)) <= todayBrazilStr)
      .reduce((s, e) => s + Number(e.amount), 0)
    const incomesReceivedToDate = [
      ...currentMonthIncomes.filter(i => toBrazilDateStr(new Date(i.date)) <= todayBrazilStr),
      ...recurringIncomes.filter(i => new Date(i.date).getDate() <= todayDay),
    ].reduce((s, i) => s + Number(i.amount), 0)
    const paidFixed = fixedExpenses.filter(e => e.paid).reduce((s, e) => s + Number(e.amount), 0)
    startingBalance = rawBalance + incomesReceivedToDate - variableSpentToDate - paidFixed - caixinhaNet

    // Step 2: apply remaining current month days (tomorrow → end of current month)
    const daysInCurrent = getDaysInMonth(todayLocal)
    for (let d = todayDay + 1; d <= daysInCurrent; d++) {
      const dStr = `${todayYear}-${padZ(todayMonth + 1)}-${padZ(d)}`
      const dayIn = [
        ...recurringIncomes.filter(i => new Date(i.date).getDate() === d),
        ...currentMonthIncomes.filter(i => toBrazilDateStr(new Date(i.date)) === dStr),
      ].reduce((s, i) => s + Number(i.amount), 0)
      const dayOut = [
        ...fixedExpenses.filter(e => e.dueDay === d && !e.paid),
        ...installments.filter(i => {
          if (i.dueDay !== d) return false
          const instStart = new Date(i.startDate)
          const instStartM = instStart.getFullYear() * 12 + instStart.getMonth()
          const curM = todayYear * 12 + todayMonth
          const mFromStart = curM - instStartM
          return mFromStart >= 0 && mFromStart < i.remainingInstallments
        }),
        ...currentVariableExpenses.filter(e => toBrazilDateStr(new Date(e.date)) === dStr),
      ].reduce((s, e) => s + Number(e.amount), 0)
      startingBalance += dayIn - dayOut
    }

    // Step 3: simulate each intermediate full month between current and target
    for (let m = 1; m < monthsElapsedToTarget; m++) {
      const monthlyIn = recurringIncomes.reduce((s, i) => s + Number(i.amount), 0)
      const monthlyOut = fixedExpenses.reduce((s, e) => s + Number(e.amount), 0)
        + installments.filter(i => {
            const instStart = new Date(i.startDate)
            const instStartM = instStart.getFullYear() * 12 + instStart.getMonth()
            const interM = todayYear * 12 + todayMonth + m
            const mFromStart = interM - instStartM
            return mFromStart >= 0 && mFromStart < i.remainingInstallments
          }).reduce((s, i) => s + Number(i.amount), 0)
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
    const dayStr = `${targetYear}-${padZ(targetMonth + 1)}-${padZ(d)}`
    let dayIncomeEntries
    if (isFutureDay) {
      dayIncomeEntries = allTargetIncomes
        .filter(i => i.recurring
          ? new Date(i.date).getDate() === d
          : toBrazilDateStr(new Date(i.date)) === dayStr)
    } else {
      dayIncomeEntries = allTargetIncomes
        .filter(i => i.recurring
          ? new Date(i.date).getDate() === d
          : toBrazilDateStr(new Date(i.date)) === dayStr)
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
      .filter(i => {
        if (i.dueDay !== d) return false
        const instStart = new Date(i.startDate)
        const instStartMonthNum = instStart.getFullYear() * 12 + instStart.getMonth()
        const targetMonthNum = targetYear * 12 + targetMonth
        const monthsFromStart = targetMonthNum - instStartMonthNum
        return monthsFromStart >= 0 && monthsFromStart < i.remainingInstallments
      })
      .map(i => {
        const instStart = new Date(i.startDate)
        const instStartMonthNum = instStart.getFullYear() * 12 + instStart.getMonth()
        const targetMonthNum = targetYear * 12 + targetMonth
        const monthsFromStart = targetMonthNum - instStartMonthNum
        return {
          description: `${i.description} (${i.remainingInstallments - monthsFromStart}x restantes)`,
          amount: Number(i.amount), type: 'installment' as const,
        }
      })

    // ── Variable expenses: past/today = actual; future = explicitly registered by user ──
    const dayVariable = allTargetVariables
      .filter(e => toBrazilDateStr(new Date(e.date)) === dayStr)
      .map(e => ({
        description: e.description, amount: Number(e.amount),
        type: 'variable' as const, category: e.category,
      }))

    // For future days: deduct 10% caixinha from each income as it arrives
    const caixinha10pct = isFutureDay ? dayIncomes.reduce((s, e) => s + e.amount * 0.10, 0) : 0
    const caixinhaEntries = caixinha10pct > 0 ? [{ description: 'Caixinha (10%)', amount: caixinha10pct, type: 'variable' as const, category: 'Caixinha' }] : []

    const entries = [...dayIncomes, ...dayFixed, ...dayInstallments, ...dayVariable, ...caixinhaEntries]
    const totalIn = dayIncomes.reduce((s, e) => s + e.amount, 0)
    const totalOut = [...dayFixed, ...dayInstallments, ...dayVariable].reduce((s, e) => s + e.amount, 0) + caixinha10pct

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
