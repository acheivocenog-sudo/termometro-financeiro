// Parse natural language financial messages from WhatsApp

export interface ParsedMessage {
  type: 'income' | 'expense' | 'unknown'
  amount: number
  description: string
  category: string
}

const INCOME_KEYWORDS = [
  'recebi', 'receber', 'salário', 'salario', 'renda', 'entrada', 'ganho',
  'ganhei', 'transferência', 'transferencia', 'pix recebido', 'depósito', 'deposito',
]

const EXPENSE_KEYWORDS = [
  'gastei', 'gasto', 'paguei', 'pagar', 'comprei', 'compra', 'despesa',
  'saiu', 'debitou', 'debitei', 'transferi', 'mandei', 'enviei',
]

const CATEGORY_MAP: Record<string, string[]> = {
  'Alimentação': [
    'mercado', 'supermercado', 'restaurante', 'ifood', 'comida', 'lanche',
    'padaria', 'almoço', 'jantar', 'café', 'cafe', 'pizza', 'hambúrguer',
    'hamburger', 'delivery', 'rappi', 'uber eats',
  ],
  'Transporte': [
    'gasolina', 'uber', 'ônibus', 'onibus', 'metrô', 'metro', 'combustível',
    'combustivel', 'posto', '99', 'táxi', 'taxi', 'estacionamento', 'pedágio',
    'pedagio', 'passagem',
  ],
  'Saúde': [
    'farmácia', 'farmacia', 'remédio', 'remedio', 'médico', 'medico', 'hospital',
    'consulta', 'exame', 'dentista', 'plano de saúde', 'academia', 'fisio',
  ],
  'Lazer': [
    'cinema', 'bar', 'festa', 'show', 'netflix', 'spotify', 'streaming',
    'disney', 'prime video', 'ingresso', 'teatro', 'parque',
  ],
  'Moradia': [
    'aluguel', 'condomínio', 'condominio', 'água', 'agua', 'luz', 'energia',
    'internet', 'gás', 'gas', 'iptu', 'seguro',
  ],
  'Educação': [
    'curso', 'faculdade', 'escola', 'livro', 'material', 'mensalidade',
    'aula', 'treinamento', 'udemy', 'coursera',
  ],
  'Vestuário': [
    'roupa', 'sapato', 'tênis', 'tenis', 'calçado', 'calcado', 'camisa',
    'calça', 'vestido', 'loja', 'shopping',
  ],
  'Tecnologia': [
    'celular', 'computador', 'notebook', 'tablet', 'fone', 'carregador',
    'software', 'app', 'apple', 'samsung',
  ],
}

// Remove noise words and extract clean description
const NOISE_WORDS = [
  'gastei', 'gasto', 'paguei', 'pagar', 'comprei', 'recebi', 'ganhei',
  'recebi', 'um', 'uma', 'de', 'no', 'na', 'do', 'da', 'em', 'com',
  'reais', 'real', 'r$', 'rs', 'pix',
]

function extractAmount(text: string): number {
  // Match patterns like: 50, 50.00, 50,00, R$50, R$ 50, 1.200,00
  const patterns = [
    /r\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)/i,
    /(\d{1,3}(?:\.\d{3})*,\d{2})/,     // 1.200,00
    /(\d+(?:[.,]\d{1,2})?)/,            // 50 or 50.00 or 50,00
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      return parseFloat(match[1].replace(/\./g, '').replace(',', '.'))
    }
  }
  return 0
}

function detectCategory(text: string): string {
  const lower = text.toLowerCase()
  for (const [cat, keywords] of Object.entries(CATEGORY_MAP)) {
    if (keywords.some(k => lower.includes(k))) return cat
  }
  return 'Outros'
}

function cleanDescription(text: string): string {
  let clean = text.toLowerCase()
  // Remove amount
  clean = clean.replace(/r\$\s*[\d.,]+/gi, '')
  clean = clean.replace(/[\d.,]+\s*reais?/gi, '')
  clean = clean.replace(/\b\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?\b/g, '')
  // Remove noise words
  NOISE_WORDS.forEach(w => {
    clean = clean.replace(new RegExp(`\\b${w}\\b`, 'gi'), '')
  })
  // Capitalise first letter
  clean = clean.replace(/\s+/g, ' ').trim()
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : 'Gasto'
}

export function parseWhatsAppMessage(text: string): ParsedMessage {
  const lower = text.toLowerCase().trim()
  const amount = extractAmount(lower)
  const category = detectCategory(lower)
  const description = cleanDescription(text) || category

  const isIncome = INCOME_KEYWORDS.some(k => lower.includes(k))
  const isExpense = EXPENSE_KEYWORDS.some(k => lower.includes(k))

  // If we have an amount but no explicit keyword, default to expense
  const type: ParsedMessage['type'] = isIncome
    ? 'income'
    : isExpense || amount > 0
    ? 'expense'
    : 'unknown'

  return { type, amount, description, category }
}
