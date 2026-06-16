import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { z } from 'zod'

const schema = z.object({
  description: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  date: z.string().optional(),
  recurring: z.boolean().optional(),
})

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const income = await prisma.income.findFirst({ where: { id: params.id, userId } })
  if (!income) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })

  const body = await req.json()
  const data = schema.parse(body)

  const updated = await prisma.income.update({
    where: { id: params.id },
    data: { ...data, date: data.date ? new Date(data.date) : undefined },
  })

  return NextResponse.json({ ...updated, amount: Number(updated.amount) })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const income = await prisma.income.findFirst({ where: { id: params.id, userId } })
  if (!income) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })

  await prisma.income.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
