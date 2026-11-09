/**
 * Utilitários de aritmética monetária determinística em centavos inteiros.
 * Convenção interna:
 * - Valores absolutos de colunas (Proventos, Descontos, Débito, Crédito): inteiro >= 0 em centavos.
 * - Saldos e movimentos com sinal contábil: Débito = +centavos (positivo), Crédito = -centavos (negativo).
 */

export function parseBRLToCents(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return 0;
    return Math.round(raw * 100);
  }
  const str = String(raw).trim();
  if (!str || str === '-' || str === '–' || str === '—') return 0;

  const isNegative = str.includes('-') || (str.startsWith('(') && str.endsWith(')'));
  // Remove tudo exceto dígitos, vírgula e ponto
  const cleaned = str.replace(/[^\d.,]/g, '');
  if (!cleaned) return 0;

  let normalizedNumberStr = cleaned;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma > lastDot) {
    // Formato brasileiro: 1.234.567,89
    normalizedNumberStr = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma && lastComma !== -1) {
    // Formato inglês com vírgula de milhar: 1,234,567.89
    normalizedNumberStr = cleaned.replace(/,/g, '');
  } else if (lastDot !== -1 && lastComma === -1) {
    // Apenas ponto: verificar se tem 2 casas decimais exatas no fim
    const parts = cleaned.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      normalizedNumberStr = cleaned.replace(/\./g, '');
    }
  }

  const parsed = Number.parseFloat(normalizedNumberStr);
  if (Number.isNaN(parsed)) return 0;
  const cents = Math.round(parsed * 100);
  return isNegative ? -cents : cents;
}

export function parseSignedBalanceCents(raw: string | number | null | undefined): {
  signedCents: number;
  absCents: number;
  dc: 'D' | 'C' | '';
} {
  if (raw === null || raw === undefined) {
    return { signedCents: 0, absCents: 0, dc: '' };
  }
  const str = String(raw).trim().toUpperCase();
  const absCents = Math.abs(parseBRLToCents(str));
  if (absCents === 0) {
    return { signedCents: 0, absCents: 0, dc: '' };
  }
  if (str.endsWith('C') || str.includes(' C')) {
    return { signedCents: -absCents, absCents, dc: 'C' };
  }
  if (str.endsWith('D') || str.includes(' D')) {
    return { signedCents: absCents, absCents, dc: 'D' };
  }
  // Caso não tenha D/C explícito mas tenha sinal negativo
  if (str.startsWith('-')) {
    return { signedCents: -absCents, absCents, dc: 'C' };
  }
  return { signedCents: absCents, absCents, dc: 'D' };
}

export function formatCentsBRL(cents: number, includeCurrency = false): string {
  const abs = Math.abs(Math.round(cents));
  const reais = Math.floor(abs / 100);
  const centavos = abs % 100;
  const reaisFormatted = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const centavosFormatted = centavos.toString().padStart(2, '0');
  const sign = cents < 0 ? '-' : '';
  const prefix = includeCurrency ? 'R$ ' : '';
  return `${sign}${prefix}${reaisFormatted},${centavosFormatted}`;
}

export function formatSignedCentsDC(signedCents: number, includeCurrency = false): string {
  const rounded = Math.round(signedCents);
  if (rounded === 0) {
    return includeCurrency ? 'R$ 0,00' : '0,00';
  }
  const dc = rounded > 0 ? 'D' : 'C';
  return `${formatCentsBRL(Math.abs(rounded), includeCurrency)} ${dc}`;
}

export function normalizeAccountCode(code: string | null | undefined): string {
  if (!code) return '';
  return String(code).replace(/\D/g, '');
}

export function formatAccountMask(rawCode: string | null | undefined): string {
  if (!rawCode) return '';
  const digits = normalizeAccountCode(rawCode);
  if (digits.length === 11) {
    // Ex: 21010400003 -> 2.1.0.10.400.003
    return `${digits[0]}.${digits[1]}.${digits[2]}.${digits.slice(3, 5)}.${digits.slice(5, 8)}.${digits.slice(8, 11)}`;
  }
  if (digits.length === 8) {
    // Ex: 21010400 -> 2.1.0.10.400
    return `${digits[0]}.${digits[1]}.${digits[2]}.${digits.slice(3, 5)}.${digits.slice(5, 8)}`;
  }
  if (digits.length === 6) {
    // Ex: 210104 -> 2.1.0.10.4
    return `${digits[0]}.${digits[1]}.${digits[2]}.${digits.slice(3, 5)}.${digits[5]}`;
  }
  return String(rawCode).trim();
}

/**
 * Higieniza e mascara CPF, CNPJ e nomes próprios em descrições de adiantamentos ou históricos
 * quando o modo de privacidade/anonimização LGPD está ativo.
 */
export function anonymizePII(text: string): string {
  if (!text) return '';
  let result = text;
  // Mascara CNPJ: 00.000.000/0000-00 ou 14 dígitos
  result = result.replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '***.***.***/****-**');
  // Mascara CPF: 000.000.000-00 ou 11 dígitos isolados que não sejam contas
  result = result.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '***.***.***-**');
  // Mascara nomes após "PAGTO <num> - <NOME> - BANCO" ou "ADIANT. <NOME>"
  result = result.replace(
    /(PAGTO\s+\d+\s*-\s*)([A-ZÀ-Ú\s.]+?)(\s*-\s*(?:CAIXA|BANCO|ITAU|BRADESCO|BB|SANTANDER|SICOOB))/gi,
    '$1[FAVORECIDO ANONIMIZADO]$3'
  );
  result = result.replace(
    /(ADIANT(?:AMENTO)?(?:\s+DE\s+SALARIO)?\s*-\s*)([A-ZÀ-Ú\s.]{5,})/gi,
    '$1[COLABORADOR ANONIMIZADO]'
  );
  return result;
}
