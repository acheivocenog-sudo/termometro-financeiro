export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const data = await req.json()

  const installment = await prisma.installment.update({
    where: { id: params.id, userId },
    data,
  })

  return NextResponse.json(installment)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  await prisma.installment.delete({ where: { id: params.id, userId } })
  return NextResponse.json({ ok: true })
}
