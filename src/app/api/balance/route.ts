import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { z } from 'zod'

const schema = z.object({ amount: z.number() })

export async function PUT(req: Request) {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const body = await req.json()
  const { amount } = schema.parse(body)

  const balance = await prisma.balance.upsert({
    where: { userId },
    update: { amount },
    create: { userId, amount },
  })

  return NextResponse.json({ amount: Number(balance.amount) })
}
