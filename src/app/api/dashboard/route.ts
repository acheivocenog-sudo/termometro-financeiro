export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { calculateFinancials, buildCalendarData } from '@/lib/finance'
import { startOfMonth, endOfMonth, getDaysInMonth, addMonths } from 'date-fns'

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

// Mirrors the forecast projection exactly: same events, same logic, finds first negative day.
// monthlyLivingCost adds a daily variable estimate for untracked spending in future months.
function calculateRunway(
  realBalance: number,
  monthlyLivingCost: number | null,
  recurringIncomes: { amount: number; date: Date }[],
  fixedExpenses: { amount: number; dueDay: number; paid: boolean }[],
  installments: { amount: number; dueDay: number; remainingInstallments: number; startDate: Date }[],
  futureOneTimeIncomes: { amount: number; date: Date }[],
  futureVariableExpenses: { amount: number; date: Date }[],
  startDate: Date,
) {
  const toBrazilStr = (d: Date) => new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const pad = (n: number) => String(n).padStart(2, '0')

  let balance = realBalance
  const today = new Date(startDate)
  today.setHours(0, 0, 0, 0)
  const todayDay = today.getDate()

  const checkNegative = (year: number, month: number, d: number) => {
    if (balance < 0) {
      return {
        date: new Date(year, month, d),
        shortfall: Math.abs(balance),
        lastPaidDescription: `Falta ${fmt(Math.abs(balance))} para cobrir os gastos deste dia`,
      }
    }
    return null
  }

  for (let monthOffset = 0; monthOffset < 24; monthOffset++) {
    const monthDate = addMonths(today, monthOffset)
    const year = monthDate.getFullYear()
    const month = monthDate.getMonth()
    const daysInMonth = getDaysInMonth(monthDate)
    const isCurrentMonth = monthOffset === 0
    const startDay = isCurrentMonth ? todayDay + 1 : 1


    for (let d = startDay; d <= daysInMonth; d++) {
      const dayStr = `${year}-${pad(month + 1)}-${pad(d)}`

      // Recurring incomes (same as forecast: matched by day-of-month)
      for (const inc of recurringIncomes) {
        if (new Date(inc.date).getDate() === d) balance += inc.amount
      }

      // One-time future incomes registered in DB (same as forecast)
      for (const inc of futureOneTimeIncomes) {
        if (toBrazilStr(new Date(inc.date)) === dayStr) balance += inc.amount
      }

      // Fixed expenses (current month: only unpaid; future months: all — same as forecast)
      for (const exp of fixedExpenses) {
        if (exp.dueDay === d) {
          if (isCurrentMonth && exp.paid) continue
          balance -= exp.amount
          const neg = checkNegative(year, month, d); if (neg) return neg
        }
      }

      // Installments (same as forecast)
      for (const inst of installments) {
        if (inst.dueDay === d) {
          const instStart = new Date(inst.startDate)
          const instStartM = instStart.getFullYear() * 12 + instStart.getMonth()
          const curM = year * 12 + month
          const mFromStart = curM - instStartM
          if (mFromStart >= 0 && mFromStart < inst.remainingInstallments) {
            balance -= inst.amount
            const neg = checkNegative(year, month, d); if (neg) return neg
          }
        }
      }

      // Future variable expenses registered in DB (same as forecast — e.g. Aluguel on Jul 26)
      for (const exp of futureVariableExpenses) {
        if (toBrazilStr(new Date(exp.date)) === dayStr) {
          balance -= exp.amount
          const neg = checkNegative(year, month, d); if (neg) return neg
        }
      }

    }
  }

  return { date: addMonths(today, 24), shortfall: 0, lastPaidDescription: 'Contas cobertas pelos próximos 2 anos!' }
}

const toBrazilDateStr = (d: Date) =>
  new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)

export async function GET() {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  // Compute today in Brazil timezone (UTC-3) to avoid midnight rollover issues
  const nowUTC = new Date()
  const brazilStr = toBrazilDateStr(nowUTC)
  const brazilYear = parseInt(brazilStr.slice(0, 4))
  const brazilMonth = parseInt(brazilStr.slice(5, 7)) - 1
  const brazilDay = parseInt(brazilStr.slice(8, 10))
  const today = new Date(brazilYear, brazilMonth, brazilDay)
  const monthStart = startOfMonth(today)
  const monthEnd = endOfMonth(today)

  // Fetch balance first — its updatedAt tells us when the user last set their balance snapshot.
  // We only accumulate transactions from that month onward to avoid double-counting expenses
  // that were already reflected in the rawBalance at the time it was set.
  const balance = await prisma.balance.findUnique({ where: { userId } })
  const balanceHistoryStart = balance?.updatedAt
    ? startOfMonth(balance.updatedAt)
    : new Date(0)

  const [currentMonthIncomes, recurringIncomes, fixedExpenses,
    currentMonthVariableExpenses, allPastVariableExpenses, allPastNonRecurringIncomes,
    allTimeIncomes, caixinhaSpentAgg, installments, futureOneTimeIncomes, futureVariableExpenses] = await Promise.all([
    // Current month incomes — used for display ("Receitas do Mês") and calendar
    prisma.income.findMany({
      where: { userId, recurring: false, date: { gte: monthStart, lte: monthEnd } },
      orderBy: { date: 'asc' },
    }),
    prisma.income.findMany({
      where: { userId, recurring: true },
      orderBy: { date: 'asc' },
    }),
    prisma.fixedExpense.findMany({ where: { userId }, orderBy: { dueDay: 'asc' } }),
    // Current month variable expenses — used for display ("Gastos Variáveis") and calendar
    prisma.variableExpense.findMany({
      where: { userId, date: { gte: monthStart, lte: monthEnd } },
      orderBy: { date: 'desc' },
    }),
    // Historical variable expenses (non-caixinha, from balance month onward) — used for realCurrentBalance
    prisma.variableExpense.findMany({
      where: { userId, fromCaixinha: false, date: { gte: balanceHistoryStart, lte: nowUTC } },
      orderBy: { date: 'desc' },
    }),
    // Historical non-recurring incomes (from balance month onward) — used for realCurrentBalance
    prisma.income.findMany({
      where: { userId, recurring: false, date: { gte: balanceHistoryStart, lte: nowUTC } },
      orderBy: { date: 'asc' },
    }),
    prisma.income.aggregate({ where: { userId, OR: [{ recurring: true }, { date: { gte: balanceHistoryStart, lte: nowUTC } }] }, _sum: { amount: true } }),
    prisma.variableExpense.aggregate({ where: { userId, fromCaixinha: true }, _sum: { amount: true } }),
    prisma.installment.findMany({ where: { userId, remainingInstallments: { gt: 0 } } }),
    // Future one-time incomes (not recurring, date > now) — needed for runway projection
    prisma.income.findMany({ where: { userId, recurring: false, date: { gt: nowUTC } } }),
    // Future variable expenses registered in DB — mirrors what forecast shows for future days
    prisma.variableExpense.findMany({ where: { userId, fromCaixinha: false, date: { gt: nowUTC } } }),
  ])

  const allIncomesTotal = Number(allTimeIncomes._sum.amount ?? 0)
  const caixinhaSpent = Number(caixinhaSpentAgg._sum.amount ?? 0)

  // futureIncomes for calculateFinancials:
  //   - allPastNonRecurringIncomes: all history → receivedIncomesTotal accumulates correctly cross-month
  //   - recurringIncomes: matched by day-of-month inside calculateFinancials
  //   - futureOneTimeIncomes: future-dated so excluded from receivedIncomesTotal but counted in futureIncomesTotal display
  const allHistoricalIncomes = [...allPastNonRecurringIncomes, ...recurringIncomes, ...futureOneTimeIncomes]

  const data = {
    currentBalance: Number(balance?.amount ?? 0),
    futureIncomes: allHistoricalIncomes.map(i => ({ ...i, amount: Number(i.amount) })),
    futureFixedExpenses: fixedExpenses.map(e => ({ ...e, amount: Number(e.amount) })),
    todayVariableExpenses: currentMonthVariableExpenses.map(e => ({ ...e, amount: Number(e.amount) })),
    allVariableExpenses: allPastVariableExpenses.map(e => ({ ...e, amount: Number(e.amount) })),
    installments: installments.map(i => ({ amount: Number(i.amount), dueDay: i.dueDay, remainingInstallments: i.remainingInstallments, startDate: i.startDate })),
    allIncomesTotal,
    caixinhaSpent,
  }

  const summary = calculateFinancials(data, today)
  // Calendar uses current-month data only — pass current-month incomes/expenses
  const calendarData = {
    ...data,
    futureIncomes: [...currentMonthIncomes, ...recurringIncomes].map(i => ({ ...i, amount: Number(i.amount) })),
    allVariableExpenses: currentMonthVariableExpenses.map(e => ({ ...e, amount: Number(e.amount) })),
  }
  const calendar = buildCalendarData(calendarData, summary, today)

  const runway = calculateRunway(
    summary.realCurrentBalance,
    null,
    recurringIncomes.map(i => ({ amount: Number(i.amount), date: i.date })),
    fixedExpenses.map(e => ({ amount: Number(e.amount), dueDay: e.dueDay, paid: e.paid })),
    installments.map(i => ({ amount: Number(i.amount), dueDay: i.dueDay, remainingInstallments: i.remainingInstallments, startDate: i.startDate })),
    futureOneTimeIncomes.map(i => ({ amount: Number(i.amount), date: i.date })),
    futureVariableExpenses.map(e => ({ amount: Number(e.amount), date: e.date })),
    today,
  )

  return NextResponse.json({
    summary,
    runway,
    incomes: [...currentMonthIncomes, ...recurringIncomes].map(i => ({ ...i, amount: Number(i.amount) })),
    fixedExpenses: fixedExpenses.map(e => ({ ...e, amount: Number(e.amount) })),
    variableExpenses: currentMonthVariableExpenses.map(e => ({ ...e, amount: Number(e.amount) })),
    calendar,
  })
}

