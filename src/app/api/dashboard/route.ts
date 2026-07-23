export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { calculateFinancials, buildCalendarData } from '@/lib/finance'
import { startOfMonth, endOfMonth, getDaysInMonth, addMonths } from 'date-fns'

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

function calculateRunway(
  realBalance: number,
  monthlyLivingCost: number,
  recurringIncomes: { amount: number; date: Date }[],
  fixedExpenses: { amount: number; dueDay: number; paid: boolean }[],
  installments: { amount: number; dueDay: number; remainingInstallments: number }[],
  startDate: Date,
) {
  if (monthlyLivingCost <= 0) return null

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

  for (let monthOffset = 0; monthOffset < 36; monthOffset++) {
    const monthDate = addMonths(today, monthOffset)
    const year = monthDate.getFullYear()
    const month = monthDate.getMonth()
    const daysInMonth = getDaysInMonth(monthDate)
    const isCurrentMonth = monthOffset === 0
    const startDay = isCurrentMonth ? todayDay + 1 : 1

    if (isCurrentMonth) {
      // Current month: realCurrentBalance already reflects this month's spending.
      // Only apply UNPAID fixed expenses and installments still due this month,
      // plus recurring incomes not yet received. No daily variable cost.
      for (let d = startDay; d <= daysInMonth; d++) {
        // Recurring incomes
        for (const inc of recurringIncomes) {
          if (new Date(inc.date).getDate() === d) balance += inc.amount
        }
        // Only UNPAID fixed expenses
        for (const exp of fixedExpenses) {
          if (exp.dueDay === d && !exp.paid) {
            balance -= exp.amount
            const neg = checkNegative(year, month, d); if (neg) return neg
          }
        }
        // Installments (offset 0 = this month)
        for (const inst of installments) {
          if (inst.dueDay === d) {
            balance -= inst.amount
            const neg = checkNegative(year, month, d); if (neg) return neg
          }
        }
      }
    } else {
      // Future months: full monthly living cost spread daily, plus precise bill dates
      const monthlyFixed = fixedExpenses.reduce((s, e) => s + e.amount, 0)
      const monthlyInst = installments
        .filter(i => i.remainingInstallments > monthOffset)
        .reduce((s, i) => s + i.amount, 0)
      const monthlyRec = recurringIncomes.reduce((s, i) => s + i.amount, 0)
      const netDailyVariable = Math.max(0, monthlyLivingCost - monthlyFixed - monthlyInst - monthlyRec) / daysInMonth

      for (let d = 1; d <= daysInMonth; d++) {
        // Recurring incomes
        for (const inc of recurringIncomes) {
          if (new Date(inc.date).getDate() === d) balance += inc.amount
        }
        // Fixed expenses
        for (const exp of fixedExpenses) {
          if (exp.dueDay === d) {
            balance -= exp.amount
            const neg = checkNegative(year, month, d); if (neg) return neg
          }
        }
        // Installments
        for (const inst of installments) {
          if (inst.dueDay === d && inst.remainingInstallments > monthOffset) {
            balance -= inst.amount
            const neg = checkNegative(year, month, d); if (neg) return neg
          }
        }
        // Daily variable living cost
        balance -= netDailyVariable
        const neg = checkNegative(year, month, d); if (neg) return neg
      }
    }
  }

  return { date: addMonths(today, 36), shortfall: 0, lastPaidDescription: 'Mais de 3 anos de runway!' }
}

export async function GET() {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const today = new Date()
  const monthStart = startOfMonth(today)
  const monthEnd = endOfMonth(today)

  const [balance, monthIncomes, recurringIncomes, fixedExpenses, variableExpenses, allTimeIncomes, caixinhaSpentAgg, installments] = await Promise.all([
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

  const monthlyLivingCost = balance?.monthlyLivingCost ? Number(balance.monthlyLivingCost) : null
  const runway = monthlyLivingCost
    ? calculateRunway(
        summary.realCurrentBalance,
        monthlyLivingCost,
        recurringIncomes.map(i => ({ amount: Number(i.amount), date: i.date })),
        fixedExpenses.map(e => ({ amount: Number(e.amount), dueDay: e.dueDay, paid: e.paid })),
        installments.map(i => ({ amount: Number(i.amount), dueDay: i.dueDay, remainingInstallments: i.remainingInstallments })),
        today,
      )
    : null

  return NextResponse.json({
    summary,
    monthlyLivingCost,
    runway,
    incomes: allIncomes.map(i => ({ ...i, amount: Number(i.amount) })),
    fixedExpenses: fixedExpenses.map(e => ({ ...e, amount: Number(e.amount) })),
    variableExpenses: variableExpenses.map(e => ({ ...e, amount: Number(e.amount) })),
    calendar,
  })
}

