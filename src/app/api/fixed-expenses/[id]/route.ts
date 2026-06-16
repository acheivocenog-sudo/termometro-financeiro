import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { z } from 'zod'

const schema = z.object({
  description: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  dueDay: z.number().min(1).max(31).optional(),
  recurring: z.boolean().optional(),
  paid: z.boolean().optional(),
})

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const expense = await prisma.fixedExpense.findFirst({ where: { id: params.id, userId } })
  if (!expense) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })

  const body = await req.json()
  const data = schema.parse(body)

  const updated = await prisma.fixedExpense.update({
    where: { id: params.id },
    data: { ...data, paidAt: data.paid ? new Date() : undefined },
  })

  return NextResponse.json({ ...updated, amount: Number(updated.amount) })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const expense = await prisma.fixedExpense.findFirst({ where: { id: params.id, userId } })
  if (!expense) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })

  await prisma.fixedExpense.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
