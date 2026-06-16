// Evolution API client — https://doc.evolution-api.com/

const BASE_URL = process.env.EVOLUTION_API_URL ?? ''
const API_KEY = process.env.EVOLUTION_API_KEY ?? ''
const INSTANCE = process.env.EVOLUTION_INSTANCE ?? 'termometro'

function headers() {
  return {
    'Content-Type': 'application/json',
    'apikey': API_KEY,
  }
}

export async function evolutionSendText(phone: string, message: string): Promise<boolean> {
  if (!BASE_URL || !API_KEY) {
    console.warn('[Evolution] EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurados.')
    return false
  }

  const url = `${BASE_URL}/message/sendText/${INSTANCE}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        number: phone,
        text: message,
      }),
    })
    if (!res.ok) {
      console.error('[Evolution] Erro ao enviar:', res.status, await res.text())
      return false
    }
    return true
  } catch (err) {
    console.error('[Evolution] Falha:', err)
    return false
  }
}

export async function evolutionCheckStatus(): Promise<{ connected: boolean; phone?: string }> {
  if (!BASE_URL || !API_KEY) return { connected: false }

  const url = `${BASE_URL}/instance/connectionState/${INSTANCE}`
  try {
    const res = await fetch(url, { headers: headers() })
    if (!res.ok) return { connected: false }
    const data = await res.json()
    const connected = data?.instance?.state === 'open'
    return { connected, phone: data?.instance?.owner }
  } catch {
    return { connected: false }
  }
}

export async function evolutionGetQrCode(): Promise<string | null> {
  if (!BASE_URL || !API_KEY) return null

  const url = `${BASE_URL}/instance/connect/${INSTANCE}`
  try {
    const res = await fetch(url, { headers: headers() })
    if (!res.ok) return null
    const data = await res.json()
    return data?.base64 ?? null
  } catch {
    return null
  }
}
