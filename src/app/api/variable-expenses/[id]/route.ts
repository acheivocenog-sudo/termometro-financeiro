export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const expense = await prisma.variableExpense.findFirst({ where: { id: params.id, userId } })
  if (!expense) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })

  await prisma.variableExpense.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
