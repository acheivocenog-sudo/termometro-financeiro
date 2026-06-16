import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return { userId: null, response: NextResponse.json({ error: 'Não autorizado.' }, { status: 401 }) }
  }
  return { userId: (session.user as { id: string }).id, response: null }
}
