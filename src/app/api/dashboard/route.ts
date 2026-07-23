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

export async function GET() {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const today = new Date()
  const monthStart = startOfMonth(today)
  const monthEnd = endOfMonth(today)

  const [balance, monthIncomes, recurringIncomes, fixedExpenses, variableExpenses, allTimeIncomes, caixinhaSpentAgg, installments, futureOneTimeIncomes, futureVariableExpenses] = await Promise.all([
    prisma.balance.findUnique({ where: { userId } }),
    prisma.income.findMany({
      where: { userId, recurring: false, date: { gte: monthStart, lte: monthEnd } },
      orderBy: { date: 'asc' },
    }),
    prisma.income.findMany({
      where: { userId, recurring: true },
      orderBy: { date: 'asc' },
    }),
    prisma.fixedExpense.findMany({ where: { userId }, orderBy: { dueDay: 'asc' } }),
    prisma.variableExpense.findMany({
      where: { userId, date: { gte: monthStart, lte: monthEnd } },
      orderBy: { date: 'desc' },
    }),
    prisma.income.aggregate({ where: { userId, OR: [{ recurring: true }, { date: { lte: today } }] }, _sum: { amount: true } }),
    prisma.variableExpense.aggregate({ where: { userId, fromCaixinha: true }, _sum: { amount: true } }),
    prisma.installment.findMany({ where: { userId, remainingInstallments: { gt: 0 } } }),
    // Future one-time incomes (not recurring, date > today) — needed for runway projection
    prisma.income.findMany({ where: { userId, recurring: false, date: { gt: today } } }),
    // Future variable expenses registered in DB — mirrors what forecast shows for future days
    prisma.variableExpense.findMany({ where: { userId, fromCaixinha: false, date: { gt: today } } }),
  ])

  const allIncomes = [...monthIncomes, ...recurringIncomes]
  const allIncomesTotal = Number(allTimeIncomes._sum.amount ?? 0)
  const caixinhaSpent = Number(caixinhaSpentAgg._sum.amount ?? 0)

  const data = {
    currentBalance: Number(balance?.amount ?? 0),
    futureIncomes: allIncomes.map(i => ({ ...i, amount: Number(i.amount) })),
    futureFixedExpenses: fixedExpenses.map(e => ({ ...e, amount: Number(e.amount) })),
    todayVariableExpenses: variableExpenses.map(e => ({ ...e, amount: Number(e.amount) })),
    allVariableExpenses: variableExpenses.map(e => ({ ...e, amount: Number(e.amount) })),
    allIncomesTotal,
    caixinhaSpent,
  }

  const summary = calculateFinancials(data, today)
  const calendar = buildCalendarData(data, summary, today)

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
    incomes: allIncomes.map(i => ({ ...i, amount: Number(i.amount) })),
    fixedExpenses: fixedExpenses.map(e => ({ ...e, amount: Number(e.amount) })),
    variableExpenses: variableExpenses.map(e => ({ ...e, amount: Number(e.amount) })),
    calendar,
  })
}

