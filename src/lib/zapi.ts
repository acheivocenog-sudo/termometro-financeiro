// Z-API client — https://developer.z-api.io/

const BASE_URL = process.env.ZAPI_BASE_URL ?? 'https://api.z-api.io'
const INSTANCE_ID = process.env.ZAPI_INSTANCE_ID ?? ''
const TOKEN = process.env.ZAPI_TOKEN ?? ''
const SECURITY_TOKEN = process.env.ZAPI_SECURITY_TOKEN ?? ''

function zapiHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(SECURITY_TOKEN ? { 'client-token': SECURITY_TOKEN } : {}),
  }
}

// Send a plain-text WhatsApp message
// phone: "5511999999999" (DDI + DDD + número, sem @)
export async function zapiSendText(phone: string, message: string): Promise<boolean> {
  if (!INSTANCE_ID || !TOKEN) {
    console.warn('[Z-API] ZAPI_INSTANCE_ID ou ZAPI_TOKEN não configurados — mensagem não enviada.')
    return false
  }

  const url = `${BASE_URL}/instances/${INSTANCE_ID}/token/${TOKEN}/send-text`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: zapiHeaders(),
      body: JSON.stringify({ phone, message }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error('[Z-API] Erro ao enviar mensagem:', res.status, err)
      return false
    }
    return true
  } catch (err) {
    console.error('[Z-API] Falha na requisição:', err)
    return false
  }
}

// Check if the instance is connected
export async function zapiCheckStatus(): Promise<{ connected: boolean; phone?: string }> {
  if (!INSTANCE_ID || !TOKEN) return { connected: false }

  const url = `${BASE_URL}/instances/${INSTANCE_ID}/token/${TOKEN}/status`
  try {
    const res = await fetch(url, { headers: zapiHeaders() })
    if (!res.ok) return { connected: false }
    const data = await res.json()
    // Z-API returns { value: { type: 'BusinessAccount' | 'Connected' | 'qrCode', ... } }
    const connected = data?.value?.type === 'Connected' || data?.value?.type === 'BusinessAccount'
    return { connected, phone: data?.value?.phone }
  } catch {
    return { connected: false }
  }
}

// Get QR Code for connecting the instance
export async function zapiGetQrCode(): Promise<string | null> {
  if (!INSTANCE_ID || !TOKEN) return null

  const url = `${BASE_URL}/instances/${INSTANCE_ID}/token/${TOKEN}/qr-code/image`
  try {
    const res = await fetch(url, { headers: zapiHeaders() })
    if (!res.ok) return null
    const data = await res.json()
    return data?.value ?? null // base64 image or URL
  } catch {
    return null
  }
}
