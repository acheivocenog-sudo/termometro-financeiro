import { startOfMonth, endOfMonth, differenceInDays, isAfter, isBefore, isSameDay, format } from 'date-fns'

export interface FinancialData {
  currentBalance: number
  futureIncomes: Array<{ id: string; description: string; amount: number; date: Date }>
  futureFixedExpenses: Array<{ id: string; description: string; amount: number; dueDay: number; paid: boolean }>
  todayVariableExpenses: Array<{ id: string; description: string; category: string; amount: number; date: Date }>
  allVariableExpenses: Array<{ id: string; description: string; category: string; amount: number; date: Date }>
  allIncomesTotal?: number
}

export interface FinancialSummary {
  currentBalance: number
  futureIncomesTotal: number
  futureExpensesTotal: number
  variableExpensesTotalThisMonth: number
  projectedBalance: number
  availableBalance: number
  daysRemaining: number
  dailyBudget: number
  todaySpent: number
  thermometerStatus: 'green' | 'yellow' | 'red' | 'dark-red'
  thermometerPercentage: number
  caixinha: number
}

export function calculateFinancials(data: FinancialData, referenceDate: Date = new Date()): FinancialSummary {
  const today = referenceDate
  const startOfThisMonth = startOfMonth(today)
  const endOfThisMonth = endOfMonth(today)

  // Dias restantes (incluindo hoje)
  const daysRemaining = differenceInDays(endOfThisMonth, today) + 1

  // Todas as receitas do mês (passadas + futuras) — currentBalance é o saldo inicial, não o atual
  const futureIncomesTotal = data.futureIncomes
    .filter(i => {
      const d = new Date(i.date)
      return !isBefore(d, startOfThisMonth) && !isAfter(d, endOfThisMonth)
    })
    .reduce((sum, i) => sum + i.amount, 0)

  // Todas as despesas fixas do mês (pagas + a pagar)
  const futureExpensesTotal = data.futureFixedExpenses.reduce((sum, e) => sum + e.amount, 0)

  // Total de despesas variáveis já realizadas neste mês
  const variableExpensesTotalThisMonth = data.allVariableExpenses
    .filter(e => {
      const d = new Date(e.date)
      return !isBefore(d, startOfThisMonth) && !isAfter(d, endOfThisMonth)
    })
    .reduce((sum, e) => sum + e.amount, 0)

  // Saldo disponível = Saldo Atual + Receitas Futuras - Despesas Fixas Futuras
  const availableBalance = data.currentBalance + futureIncomesTotal - futureExpensesTotal

  // Saldo projetado = disponível - despesas variáveis já realizadas
  const projectedBalance = availableBalance - variableExpensesTotalThisMonth

  // Orçamento diário = saldo projetado / dias restantes
  const dailyBudget = daysRemaining > 0 ? projectedBalance / daysRemaining : projectedBalance

  // Gastos de hoje (comparação em UTC-3 para evitar divergência de timezone)
  const toLocalDateStr = (d: Date) => {
    const brazil = new Date(d.getTime() - 3 * 60 * 60 * 1000)
    return brazil.toISOString().slice(0, 10)
  }
  const todayStr = toLocalDateStr(today)
  const todaySpent = data.todayVariableExpenses
    .filter(e => toLocalDateStr(new Date(e.date)) === todayStr)
    .reduce((sum, e) => sum + e.amount, 0)

  // Termômetro
  let thermometerStatus: FinancialSummary['thermometerStatus'] = 'green'
  let thermometerPercentage = 0

  if (dailyBudget <= 0) {
    thermometerStatus = 'dark-red'
    thermometerPercentage = 100
  } else {
    const ratio = todaySpent / dailyBudget
    thermometerPercentage = Math.min(Math.round(ratio * 100), 100)

    if (ratio >= 1) {
      thermometerStatus = projectedBalance < 0 ? 'dark-red' : 'red'
    } else if (ratio >= 0.8) {
      thermometerStatus = 'yellow'
    } else {
      thermometerStatus = 'green'
    }
  }

  const caixinha = (data.allIncomesTotal ?? 0) * 0.10

  return {
    currentBalance: data.currentBalance,
    futureIncomesTotal,
    futureExpensesTotal,
    variableExpensesTotalThisMonth,
    projectedBalance,
    availableBalance,
    daysRemaining,
    dailyBudget,
    todaySpent,
    thermometerStatus,
    thermometerPercentage,
    caixinha,
  }
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function getThermometerColor(status: FinancialSummary['thermometerStatus']): string {
  switch (status) {
    case 'green': return '#22c55e'
    case 'yellow': return '#eab308'
    case 'red': return '#ef4444'
    case 'dark-red': return '#991b1b'
  }
}

export function getThermometerLabel(status: FinancialSummary['thermometerStatus']): string {
  switch (status) {
    case 'green': return 'Dentro do planejado'
    case 'yellow': return 'Próximo do limite'
    case 'red': return 'Acima do limite'
    case 'dark-red': return 'Comprometendo pagamentos'
  }
}

// Build calendar data for the current month
export interface CalendarDay {
  date: string
  incomes: Array<{ description: string; amount: number }>
  fixedExpenses: Array<{ description: string; amount: number }>
  variableExpenses: Array<{ description: string; amount: number; category: string }>
  totalIn: number
  totalOut: number
  balance: number
  isToday: boolean
  isPast: boolean
  dailyBudget: number
}

export function buildCalendarData(
  data: FinancialData,
  summary: FinancialSummary,
  referenceDate: Date = new Date()
): CalendarDay[] {
  const today = referenceDate
  const start = startOfMonth(today)
  const end = endOfMonth(today)
  const days: CalendarDay[] = []

  let runningBalance = data.currentBalance

  const totalDays = differenceInDays(end, start) + 1

  // Helper: compare dates by local date string in Brazil (UTC-3) to avoid server timezone issues
  const toLocalDateStr = (d: Date) => {
    const brazil = new Date(d.getTime() - 3 * 60 * 60 * 1000)
    return brazil.toISOString().slice(0, 10)
  }

  for (let i = 0; i < totalDays; i++) {
    const date = new Date(start)
    date.setDate(start.getDate() + i)

    const dayStr = format(date, 'yyyy-MM-dd') // YYYY-MM-DD of this calendar cell
    const dayNum = date.getDate()
    const isPast = isBefore(date, today) && !isSameDay(date, today)
    const isToday = isSameDay(date, today)

    const incomes = data.futureIncomes
      .filter(inc => toLocalDateStr(new Date(inc.date)) === dayStr)
      .map(inc => ({ description: inc.description, amount: inc.amount }))

    const fixedExpenses = data.futureFixedExpenses
      .filter(exp => exp.dueDay === dayNum)
      .map(exp => ({ description: exp.description, amount: exp.amount }))

    const variableExpenses = data.allVariableExpenses
      .filter(exp => toLocalDateStr(new Date(exp.date)) === dayStr)
      .map(exp => ({ description: exp.description, amount: exp.amount, category: exp.category }))

    const totalIn = incomes.reduce((s, i) => s + i.amount, 0)
    const totalOut = fixedExpenses.reduce((s, e) => s + e.amount, 0) + variableExpenses.reduce((s, e) => s + e.amount, 0)

    if (isToday || isPast) {
      runningBalance = runningBalance + totalIn - totalOut
    }

    days.push({
      date: format(date, 'yyyy-MM-dd'),
      incomes,
      fixedExpenses,
      variableExpenses,
      totalIn,
      totalOut,
      balance: runningBalance,
      isToday,
      isPast,
      dailyBudget: summary.dailyBudget,
    })
  }

  return days
}
