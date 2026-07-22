export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { evolutionCheckStatus, evolutionGetQrCode } from '@/lib/evolution'

export async function GET() {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const configured = !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY)

  if (!configured) {
    return NextResponse.json({ configured: false, connected: false })
  }

  const status = await evolutionCheckStatus()

  let qrCode: string | null = null
  if (!status.connected) {
    qrCode = await evolutionGetQrCode()
  }

  return NextResponse.json({
    configured: true,
    connected: status.connected,
    phone: status.phone ?? null,
    qrCode,
    webhookUrl: `${process.env.NEXTAUTH_URL}/api/whatsapp`,
  })
}

