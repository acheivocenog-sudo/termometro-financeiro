import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'

export async function GET() {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const installments = await prisma.installment.findMany({
    where: { userId, remainingInstallments: { gt: 0 } },
    orderBy: { dueDay: 'asc' },
  })

  return NextResponse.json(installments)
}

export async function POST(req: Request) {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const { description, amount, totalInstallments, remainingInstallments, dueDay, startDate } = await req.json()

  const installment = await prisma.installment.create({
    data: {
      userId,
      description,
      amount,
      totalInstallments,
      remainingInstallments,
      dueDay,
      startDate: new Date(startDate),
    },
  })

  return NextResponse.json(installment)
}
