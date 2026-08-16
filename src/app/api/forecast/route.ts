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

  // Fetch balance first to determine history start (month rawBalance was last set).
  // Only count transactions from that month onward — avoids double-counting expenses
  // already reflected in rawBalance at the time it was last updated.
  const balance = await prisma.balance.findUnique({ where: { userId } })
  const balanceHistoryStart = balance?.updatedAt
    ? startOfMonth(balance.updatedAt)
    : new Date(0)

  const [recurringIncomes, currentMonthIncomes, targetMonthIncomes,
    fixedExpenses, installments, currentVariableExpenses, targetVariableExpenses,
    allTimeIncomes, allCaixinhaExpenses,
    allPastVariableExpenses, allPastNonRecurringIncomes] = await Promise.all([
    prisma.income.findMany({ where: { userId, recurring: true } }),
    prisma.income.findMany({ where: { userId, recurring: false, date: { gte: currentStart, lte: currentEnd } } }),
    isCurrentMonth ? Promise.resolve([]) : prisma.income.findMany({ where: { userId, recurring: false, date: { gte: targetStart, lte: targetEnd } } }),
    prisma.fixedExpense.findMany({ where: { userId } }),
    prisma.installment.findMany({ where: { userId, remainingInstallments: { gt: 0 } } }),
    prisma.variableExpense.findMany({ where: { userId, fromCaixinha: false, date: { gte: currentStart, lte: currentEnd } } }),
    isCurrentMonth ? Promise.resolve([]) : prisma.variableExpense.findMany({ where: { userId, fromCaixinha: false, date: { gte: targetStart, lte: targetEnd } } }),
    prisma.income.aggregate({ where: { userId, excludeFromCaixinha: false, OR: [{ recurring: true }, { date: { gte: balanceHistoryStart, lte: new Date(todayYear, todayMonth, todayDay + 1) } }] }, _sum: { amount: true } }),
    prisma.variableExpense.findMany({ where: { userId, fromCaixinha: true } }),
    // Historical data from balance month onward — avoids double-counting pre-balance expenses
    prisma.variableExpense.findMany({ where: { userId, fromCaixinha: false, date: { gte: balanceHistoryStart, lte: nowUTC } } }),
    prisma.income.findMany({ where: { userId, recurring: false, date: { gte: balanceHistoryStart, lte: nowUTC } } }),
  ])

  const rawBalance = Number(balance?.amount ?? 0)
  const totalIncomesEver = Number(allTimeIncomes._sum.amount ?? 0)
  const caixinhaGross = totalIncomesEver * 0.10

  // Caixinha balance (current snapshot — same formula as dashboard)
  const allCaixinhaSpentTotal = allCaixinhaExpenses.reduce((s, e) => s + Number(e.amount), 0)
  const caixinhaCurrentBalance = caixinhaGross - allCaixinhaSpentTotal

  // Caixinha expenses for target month (shown day-by-day separately from main balance)
  const targetCaixinhaExpenses = allCaixinhaExpenses.filter(e => {
    const d = new Date(e.date)
    return d >= targetStart && d <= targetEnd
  })

  // Caixinha balance at the START of the target month
  // = 10% of all incomes before target month - all caixinha expenses before target month
  const caixinhaAtTargetStart = (() => {
    const tmStart = new Date(targetYear, targetMonth, 1)
    const incBefore = allPastNonRecurringIncomes
      .filter(i => new Date(i.date) < tmStart && !i.excludeFromCaixinha)
      .reduce((s, i) => s + Number(i.amount), 0)
    const spentBefore = allCaixinhaExpenses
      .filter(e => new Date(e.date) < tmStart)
      .reduce((s, e) => s + Number(e.amount), 0)
    return incBefore * 0.10 - spentBefore
  })()

  // realCurrentBalance: same formula as dashboard — accumulates full transaction history
  const allReceivedToDate = [
    ...allPastNonRecurringIncomes,
    ...recurringIncomes.filter(i => new Date(i.date).getDate() <= todayDay),
  ].reduce((s, i) => s + Number(i.amount), 0)
  const allVariableSpentToDate = allPastVariableExpenses.reduce((s, e) => s + Number(e.amount), 0)
  const paidFixedTotal = fixedExpenses.filter(e => e.paid).reduce((s, e) => s + Number(e.amount), 0)
  // Caixinha é calculada de forma isolada — não impacta o saldo principal
  const realCurrentBalance = rawBalance + allReceivedToDate - allVariableSpentToDate - paidFixedTotal

  // startOfMonthBalance = balance at the END of the day before month started (day 0).
  // = realCurrentBalance minus what has already happened this month,
  //   so the day-by-day loop can replay this month's transactions without double-counting.
  const currentMonthReceivedSoFar = [
    ...currentMonthIncomes.filter(i => toBrazilDateStr(new Date(i.date)) <= todayBrazilStr),
    ...recurringIncomes.filter(i => new Date(i.date).getDate() <= todayDay),
  ].reduce((s, i) => s + Number(i.amount), 0)
  const currentMonthSpentSoFar = currentVariableExpenses
    .filter(e => toBrazilDateStr(new Date(e.date)) <= todayBrazilStr)
    .reduce((s, e) => s + Number(e.amount), 0)

  // Undo current-month transactions from realCurrentBalance to get the prior-month-end balance.
  // Add back the current month's caixinha contribution (10% of current month incomes) so that
  // the month-start balance is not reduced by caixinha that hasn't been "collected" yet at month start.
  // The day loop then re-deducts 10% on each income day for consistency.
  const currentBalance = realCurrentBalance - currentMonthReceivedSoFar + currentMonthSpentSoFar + paidFixedTotal
  const monthStartBalance = currentBalance

  const isPastTarget = targetYear < todayYear || (targetYear === todayYear && targetMonth < todayMonth)

  // ─── PROJECT START BALANCE ───────────────────────────────────────────────────
  // Current month: replay all DB transactions from currentBalance anchor.
  // Future months: forward-project from realCurrentBalance.
  // Past months: back-calculate from realCurrentBalance by reversing the target month's transactions.
  let startingBalance = currentBalance

  if (isPastTarget) {
    // Compute the balance at the END of the target month independently,
    // using only data available through that date. This keeps past-month balances
    // stable and unaffected by current/future month activities (e.g. caixinha from
    // August incomes should not affect July's computed balance).

    const targetMonthNum = targetYear * 12 + targetMonth

    // Sum all non-recurring incomes from balanceHistoryStart up to end of target month
    const incThroughTarget = allPastNonRecurringIncomes
      .filter(i => new Date(i.date) <= targetEnd)
      .reduce((s, i) => s + Number(i.amount), 0)

    // Recurring incomes: count how many months they've been active through target month
    const balHistStartMonthNum = balanceHistoryStart.getFullYear() * 12 + balanceHistoryStart.getMonth()
    const recurringMonthsCount = Math.max(0, targetMonthNum - balHistStartMonthNum + 1)
    const recurringThroughTarget = recurringIncomes.reduce((s, i) => s + Number(i.amount), 0) * recurringMonthsCount

    // Sum all variable expenses from balanceHistoryStart up to end of target month
    const varThroughTarget = allPastVariableExpenses
      .filter(e => new Date(e.date) <= targetEnd)
      .reduce((s, e) => s + Number(e.amount), 0)

    // Caixinha: only on incomes through target month (not inflated by future months)
    const caixinhaAtTargetEnd = (incThroughTarget + recurringThroughTarget) * 0.10

    // Real balance at end of target month (caixinha not included in main balance)
    const realBalAtTargetEnd = rawBalance + incThroughTarget + recurringThroughTarget
      - varThroughTarget - paidFixedTotal

    // Reverse the target month's own transactions to get the starting balance
    const targetMonthStart = new Date(targetYear, targetMonth, 1)

    const targetMonthNonRecInc = allPastNonRecurringIncomes
      .filter(i => { const d = new Date(i.date); return d >= targetMonthStart && d <= targetEnd })
      .reduce((s, i) => s + Number(i.amount), 0)

    const targetMonthRecInc = recurringIncomes.reduce((s, i) => s + Number(i.amount), 0)

    const targetMonthVar = allPastVariableExpenses
      .filter(e => { const d = new Date(e.date); return d >= targetMonthStart && d <= targetEnd })
      .reduce((s, e) => s + Number(e.amount), 0)

    // Installments active in target month (the day loop deducts them, so reverse them here)
    const targetInstallmentTotal = installments
      .filter(i => {
        const instStartM = new Date(i.startDate).getFullYear() * 12 + new Date(i.startDate).getMonth()
        const mFromStart = targetMonthNum - instStartM
        return mFromStart >= 0 && mFromStart < i.remainingInstallments
      })
      .reduce((s, i) => s + Number(i.amount), 0)

    const targetMonthTotalInc = targetMonthNonRecInc + targetMonthRecInc
    startingBalance = realBalAtTargetEnd - targetMonthTotalInc
      + targetMonthVar + targetInstallmentTotal
  } else if (isFuture) {
    // Step 1: start from realCurrentBalance (already computed above — full history including all past months)
    startingBalance = realCurrentBalance

    // Deduct current-month installments already paid (dueDay ≤ today).
    // realCurrentBalance doesn't include installments; the current-month day loop handles them for
    // isCurrentMonth view, but for isFuture we only simulate todayDay+1 onward, missing past-due installments.
    const paidInstallmentsCurrentMonth = installments
      .filter(i => {
        if (i.dueDay > todayDay) return false
        const instStartM = new Date(i.startDate).getFullYear() * 12 + new Date(i.startDate).getMonth()
        const mFromStart = (todayYear * 12 + todayMonth) - instStartM
        return mFromStart >= 0 && mFromStart < i.remainingInstallments
      })
      .reduce((s, i) => s + Number(i.amount), 0)
    startingBalance -= paidInstallmentsCurrentMonth

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
  let caixinhaRunning = caixinhaAtTargetStart
  const days = []

  for (let d = 1; d <= totalDays; d++) {
    const date = new Date(targetYear, targetMonth, d)
    const isPastMonth = targetYear < todayYear || (targetYear === todayYear && targetMonth < todayMonth)
    const isToday = isCurrentMonth && d === todayDay
    const isPast = isPastMonth || (isCurrentMonth && d < todayDay)
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
        return true  // always include: paid ones still left the account
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

    const entries = [...dayIncomes, ...dayFixed, ...dayInstallments, ...dayVariable]
    const totalIn = dayIncomes.reduce((s, e) => s + e.amount, 0)
    const totalOut = [...dayFixed, ...dayInstallments, ...dayVariable].reduce((s, e) => s + e.amount, 0)
    runningBalance = runningBalance + totalIn - totalOut

    // ── Caixinha section: tracked independently from main balance ──
    const dayCaixinha10pct = dayIncomeEntries.reduce((s, i) => i.excludeFromCaixinha ? s : s + Number(i.amount) * 0.10, 0)
    const dayCaixinhaExpenses = targetCaixinhaExpenses
      .filter(e => toBrazilDateStr(new Date(e.date)) === dayStr)
      .map(e => ({ description: e.description, amount: Number(e.amount), type: 'caixinha_expense' as const }))
    const dayCaixinhaOut = dayCaixinhaExpenses.reduce((s, e) => s + e.amount, 0)
    caixinhaRunning += dayCaixinha10pct - dayCaixinhaOut
    const caixinhaDayEntries = [
      ...(dayCaixinha10pct > 0 ? [{ description: 'Depósito (10% da receita)', amount: dayCaixinha10pct, type: 'caixinha_income' as const }] : []),
      ...dayCaixinhaExpenses,
    ]

    days.push({
      day: d,
      date: date.toISOString(),
      isToday,
      isPast,
      entries,
      totalIn,
      totalOut,
      balance: runningBalance,
      caixinha: {
        entries: caixinhaDayEntries,
        totalIn: dayCaixinha10pct,
        totalOut: dayCaixinhaOut,
        balance: caixinhaRunning,
      },
    })
  }

  return NextResponse.json({ days, currentBalance: monthStartBalance, isFuture, isCurrentMonth, caixinhaBalance: caixinhaCurrentBalance })
}
