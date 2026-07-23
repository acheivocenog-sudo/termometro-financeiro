export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { calculateFinancials, buildCalendarData } from '@/lib/finance'
import { startOfMonth, endOfMonth, getDaysInMonth, addMonths } from 'date-fns'

function calculateRunway(
  realBalance: number,
  monthlyLivingCost: number,
  recurringIncomes: { amount: number; date: Date }[],
  fixedExpenses: { amount: number; dueDay: number }[],
  installments: { amount: number; dueDay: number; remainingInstallments: number }[],
  startDate: Date,
) {
  if (monthlyLivingCost <= 0) return null

  // Variable daily cost = living cost minus tracked fixed expenses and installments
  const monthlyFixed = fixedExpenses.reduce((s, e) => s + e.amount, 0)
  const monthlyInstallments = installments.reduce((s, i) => s + i.amount, 0)
  const monthlyRecurring = recurringIncomes.reduce((s, i) => s + i.amount, 0)
  // Net daily variable spending (living cost minus already-tracked bills)
  const netVariableCost = Math.max(0, monthlyLivingCost - monthlyFixed - monthlyInstallments - monthlyRecurring)

  let balance = realBalance
  const today = new Date(startDate)
  today.setHours(0, 0, 0, 0)

  // Project day by day for up to 36 months
  for (let monthOffset = 0; monthOffset < 36; monthOffset++) {
    const monthDate = addMonths(today, monthOffset)
    const year = monthDate.getFullYear()
    const month = monthDate.getMonth()
    const daysInMonth = getDaysInMonth(monthDate)
    const startDay = monthOffset === 0 ? today.getDate() : 1
    const dailyVariable = netVariableCost / daysInMonth

    for (let d = startDay; d <= daysInMonth; d++) {
      // Recurring incomes on this day
      for (const inc of recurringIncomes) {
        if (new Date(inc.date).getDate() === d) balance += inc.amount
      }
      // Fixed expenses on this day
      for (const exp of fixedExpenses) {
        if (exp.dueDay === d) {
          const prevBalance = balance
          balance -= exp.amount
          if (balance < 0) {
            return {
              date: new Date(year, month, d),
              shortfall: Math.abs(balance),
              lastPaidDescription: `Falta ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(balance))} para cobrir os gastos deste dia`,
            }
          }
        }
      }
      // Installments on this day
      for (let idx = 0; idx < installments.length; idx++) {
        const inst = installments[idx]
        if (inst.dueDay === d && inst.remainingInstallments > monthOffset) {
          balance -= inst.amount
          if (balance < 0) {
            return {
              date: new Date(year, month, d),
              shortfall: Math.abs(balance),
              lastPaidDescription: `Falta ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(balance))} para cobrir os gastos deste dia`,
            }
          }
        }
      }
      // Daily variable cost
      balance -= dailyVariable
      if (balance < 0) {
        return {
          date: new Date(year, month, d),
          shortfall: Math.abs(balance),
          lastPaidDescription: `Falta ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(balance))} para cobrir os gastos deste dia`,
        }
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
    prisma.income.aggregate({ where: { userId }, _sum: { amount: true } }),
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
        fixedExpenses.map(e => ({ amount: Number(e.amount), dueDay: e.dueDay })),
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

