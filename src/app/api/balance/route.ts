export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { z } from 'zod'

const schema = z.object({
  amount: z.number().optional(),
  monthlyLivingCost: z.number().optional(),
})

export async function PUT(req: Request) {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const body = await req.json()
  const data = schema.parse(body)

  const balance = await prisma.balance.upsert({
    where: { userId },
    update: data,
    create: { userId, amount: data.amount ?? 0, ...data },
  })

  return NextResponse.json({
    amount: Number(balance.amount),
    monthlyLivingCost: balance.monthlyLivingCost ? Number(balance.monthlyLivingCost) : null,
  })
}

