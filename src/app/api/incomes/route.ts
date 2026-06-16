import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { z } from 'zod'

const schema = z.object({
  description: z.string().min(1),
  amount: z.number().positive(),
  date: z.string(),
  recurring: z.boolean().optional().default(false),
})

export async function GET() {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const incomes = await prisma.income.findMany({
    where: { userId },
    orderBy: { date: 'asc' },
  })

  return NextResponse.json(incomes.map(i => ({ ...i, amount: Number(i.amount) })))
}

export async function POST(req: Request) {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const body = await req.json()
  const data = schema.parse(body)

  const income = await prisma.income.create({
    data: { ...data, userId, date: new Date(data.date) },
  })

  return NextResponse.json({ ...income, amount: Number(income.amount) }, { status: 201 })
}
