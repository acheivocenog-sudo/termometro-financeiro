import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { zapiCheckStatus, zapiGetQrCode } from '@/lib/zapi'

export async function GET() {
  const { userId, response } = await requireAuth()
  if (!userId) return response!

  const configured = !!(process.env.ZAPI_INSTANCE_ID && process.env.ZAPI_TOKEN)

  if (!configured) {
    return NextResponse.json({ configured: false, connected: false })
  }

  const status = await zapiCheckStatus()

  let qrCode: string | null = null
  if (!status.connected) {
    qrCode = await zapiGetQrCode()
  }

  return NextResponse.json({
    configured: true,
    connected: status.connected,
    phone: status.phone ?? null,
    qrCode,
    webhookUrl: `${process.env.NEXTAUTH_URL}/api/whatsapp`,
  })
}
