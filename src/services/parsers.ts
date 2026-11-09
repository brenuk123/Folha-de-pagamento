import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { WorkerMessageHandler } from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';
import * as XLSX from 'xlsx';
import {
  BalanceteData,
  BalanceteLinha,
  CT2AcceptanceTestResult,
  CT2AccountBalanceCheck,
  CT2DocumentBalanceCheck,
  CT2ImportSummary,
  DeParaRule,
  FolhaData,
  FolhaFilialResumo,
  FolhaRubrica,
  FolhaValidationWarning,
  LancamentoTipoHistorico,
  LoteClassificacao,
  LoteConfig,
  OrigemEstruturadaCT2,
  PlanoContaItem,
  PlanoContasData,
  RazaoData,
  RazaoLancamento,
  VerbaNaturezaGPER,
} from '../types/reconciliation';
import {
  anonymizePII,
  formatAccountMask,
  normalizeAccountCode,
  parseBRLToCents,
  parseSignedBalanceCents,
} from '../utils/money';
import { CT2_ACCEPTANCE_FIXTURE_TSV, DEFAULT_LOTE_CONFIGS } from '../data/defaultDeParaAndTestCases';

// Polyfill de segurança para Promise.try e Promise.withResolvers exigidos pelo pdfjs-dist v6+
function ensurePromisePolyfillsAndPdfWorker() {
  const P = Promise as unknown as {
    try?: <T>(fn: (...args: unknown[]) => T | PromiseLike<T>, ...args: unknown[]) => Promise<T>;
    withResolvers?: <T>() => {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    };
  };

  if (typeof P.try !== 'function') {
    P.try = function <T>(fn: (...args: unknown[]) => T | PromiseLike<T>, ...args: unknown[]): Promise<T> {
      return new Promise<T>((resolve) => {
        resolve(fn(...args));
      });
    };
  }

  if (typeof P.withResolvers !== 'function') {
    P.withResolvers = function <T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }

  const g = globalThis as unknown as { pdfjsWorker?: { WorkerMessageHandler: unknown } };
  if (!g.pdfjsWorker || !g.pdfjsWorker.WorkerMessageHandler) {
    g.pdfjsWorker = { WorkerMessageHandler };
  }
}

function ensurePdfWorkerConfigured() {
  ensurePromisePolyfillsAndPdfWorker();
}

interface PdfTextItemPos {
  str: string;
  x: number;
  y: number;
  page: number;
}

interface PdfLineGroup {
  page: number;
  y: number;
  items: PdfTextItemPos[];
  text: string;
}

/**
 * Extrai linhas agrupadas por coordenada vertical (Y) e ordenadas horizontalmente (X) de um PDF.
 */
async function extractPdfVisualLines(buffer: ArrayBuffer): Promise<PdfLineGroup[]> {
  ensurePdfWorkerConfigured();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const allLines: PdfLineGroup[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const items: PdfTextItemPos[] = [];

    for (const rawItem of content.items) {
      if ('str' in rawItem && rawItem.str.trim().length > 0) {
        const transform = rawItem.transform as number[];
        items.push({
          str: rawItem.str,
          x: Math.round(transform[4] * 10) / 10,
          y: Math.round(transform[5] * 10) / 10,
          page: pageNum,
        });
      }
    }

    // Ordenar do topo para a base (Y decrescente no PDF) e da esquerda para a direita (X crescente)
    items.sort((a, b) => {
      if (Math.abs(b.y - a.y) > 2.8) return b.y - a.y;
      return a.x - b.x;
    });

    const pageLines: PdfLineGroup[] = [];
    for (const it of items) {
      const last = pageLines[pageLines.length - 1];
      if (last && Math.abs(last.y - it.y) <= 2.8) {
        last.items.push(it);
      } else {
        pageLines.push({
          page: pageNum,
          y: it.y,
          items: [it],
          text: '',
        });
      }
    }

    for (const ln of pageLines) {
      ln.items.sort((a, b) => a.x - b.x);
      ln.text = ln.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
      allLines.push(ln);
    }
  }

  return allLines;
}

/**
 * Identifica se uma verba do bloco Bases é apenas base de cálculo pura (BS..., BASE..., DED...)
 * que nunca deve ser usada diretamente como valor contábil, exceto encargos reais e líquido (808, 809, 810, 826, 827, 829, 832, 999).
 */
export function isPureCalculationBase(codigo: string, _descricao: string): boolean {
  const codigosContabilizaveisBases = new Set(['808', '809', '810', '826', '827', '829', '832', '999']);
  if (codigosContabilizaveisBases.has(codigo)) return false;
  return true;
}

/**
 * 1. Parser determinístico do PDF GPER106 (Folha de Pagamento Sintético - TOTVS Protheus)
 */
export async function parseFolhaGPER106Pdf(
  file: File | { name: string; arrayBuffer: () => Promise<ArrayBuffer> }
): Promise<FolhaData> {
  const buffer = await file.arrayBuffer();
  const lines = await extractPdfVisualLines(buffer);

  let competencia = '202609';
  let periodoRef = '01/09/2026 - 30/09/2026';
  let dataPagamento = '06/10/2026';
  let empresa = 'PRAMAR CARIOCA / MATRIZ';

  for (const ln of lines.slice(0, 40)) {
    const mPeriodo = ln.text.match(/Periodo:\s*(\d{6})/i);
    if (mPeriodo) competencia = mPeriodo[1];

    const mRef = ln.text.match(/(\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4})/i);
    if (mRef) periodoRef = mRef[1];

    const mPagto = ln.text.match(/Dt\.?\s*Pagto:\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (mPagto) dataPagamento = mPagto[1];

    const mEmp = ln.text.match(/Grupo de Empresa:\s*(.+?)(?:Hora:|Emiss|$)/i);
    if (mEmp && mEmp[1].trim()) empresa = mEmp[1].trim();
  }

  interface RawSectionAccumulator {
    filial: string;
    nomeFilial: string;
    detailedRubricas: Map<string, FolhaRubrica>;
    topTableRubricas: Map<string, FolhaRubrica>;
    printedProventosCents?: number;
    printedDescontosCents?: number;
  }

  const sectionsMap = new Map<string, RawSectionAccumulator>();
  let currentKey = '0101';
  let inDetailedBottomBlock = false;
  let inBasesSubBlock = false;
  let pendingTotalLineForKey: string | null = null;

  const ensureSection = (key: string, nome?: string): RawSectionAccumulator => {
    if (!sectionsMap.has(key)) {
      sectionsMap.set(key, {
        filial: key,
        nomeFilial: nome || (key === 'TOTAL' ? 'TOTAL EMPRESA' : `Filial ${key}`),
        detailedRubricas: new Map(),
        topTableRubricas: new Map(),
      });
    } else if (nome && !sectionsMap.get(key)!.nomeFilial.includes('-')) {
      sectionsMap.get(key)!.nomeFilial = nome;
    }
    return sectionsMap.get(key)!;
  };

  for (const ln of lines) {
    const t = ln.text;

    const mFilial = t.match(/^Filial:?\s*(\d{4})(?:\s*-\s*(.+?))?(?:\s{2,}|Total|$)/i);
    if (mFilial) {
      currentKey = mFilial[1];
      const descFilial = mFilial[2]?.trim();
      ensureSection(currentKey, descFilial ? `${mFilial[1]} - ${descFilial}` : `Filial ${mFilial[1]}`);
      inDetailedBottomBlock = false;
      inBasesSubBlock = false;
      continue;
    }

    if (/Total\s+(?:da\s+)?Filial/i.test(t)) {
      pendingTotalLineForKey = currentKey;
      continue;
    }

    if (/Total\s+Empresa/i.test(t)) {
      currentKey = 'TOTAL';
      ensureSection('TOTAL', 'TOTAL EMPRESA');
      pendingTotalLineForKey = 'TOTAL';
      inDetailedBottomBlock = false;
      inBasesSubBlock = false;
      continue;
    }

    if (pendingTotalLineForKey) {
      // Formato completo com LÍQUIDO: "4.402,14 291.444,81 3.219,53 91.752,16 LÍQUIDO: 199.692,65"
      const mTotLiquido = t.match(
        /(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+L[IÍ]QUIDO:\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})/i
      );
      if (mTotLiquido) {
        const sec = ensureSection(pendingTotalLineForKey);
        sec.printedProventosCents = parseBRLToCents(mTotLiquido[2]);
        sec.printedDescontosCents = parseBRLToCents(mTotLiquido[4]);
        pendingTotalLineForKey = null;
        continue;
      }

      const mTotValues = t.match(/(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})$/);
      if (mTotValues) {
        const sec = ensureSection(pendingTotalLineForKey);
        sec.printedProventosCents = parseBRLToCents(mTotValues[1]);
        sec.printedDescontosCents = parseBRLToCents(mTotValues[2]);
        pendingTotalLineForKey = null;
      }
    }

    if (/^Proventos\s+(?:Valor\s+)?Descontos/i.test(t)) {
      inDetailedBottomBlock = true;
      inBasesSubBlock = false;
      continue;
    }

    if (inDetailedBottomBlock && /^Bases(?:\s+Valor)?$/i.test(t)) {
      inBasesSubBlock = true;
      continue;
    }

    const sec = ensureSection(currentKey);

    if (inDetailedBottomBlock) {
      if (inBasesSubBlock) {
        const baseColonRegex = /(\d{3})\s+([^:]+?):\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})/g;
        let mBase: RegExpExecArray | null;
        while ((mBase = baseColonRegex.exec(t)) !== null) {
          const [, cod, rawDesc, valStr] = mBase;
          const desc = rawDesc.trim();
          const valCents = parseBRLToCents(valStr);
          sec.detailedRubricas.set(cod, {
            codigo: cod,
            descricao: desc,
            referencia: 0,
            valorCents: valCents,
            colunaGPER: 'base',
            isBaseCalculoPura: isPureCalculationBase(cod, desc),
            filial: currentKey,
          });
        }
      } else {
        const provDescColonRegex =
          /(\d{3})\s+([^:]+?):\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+\1:\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})/g;
        const matches: {
          cod: string;
          desc: string;
          ref: number;
          valCents: number;
          index: number;
        }[] = [];
        let mCol: RegExpExecArray | null;
        while ((mCol = provDescColonRegex.exec(t)) !== null) {
          const [, cod, rawDesc, refStr, valStr] = mCol;
          matches.push({
            cod,
            desc: rawDesc.trim(),
            ref: parseBRLToCents(refStr) / 100,
            valCents: parseBRLToCents(valStr),
            index: mCol.index,
          });
        }

        if (matches.length > 0) {
          for (let idx = 0; idx < matches.length; idx++) {
            const item = matches[idx];
            const codNum = parseInt(item.cod, 10);
            let colunaGPER: VerbaNaturezaGPER = 'provento';
            if (matches.length === 2) {
              colunaGPER = idx === 1 ? 'desconto' : 'provento';
            } else {
              // Quando há apenas 1 item na linha, verificar coordenada X do código no PDF
              const matchingPosItem = ln.items.find((it) => it.str.trim().startsWith(item.cod));
              if (matchingPosItem) {
                colunaGPER = matchingPosItem.x >= 240 ? 'desconto' : 'provento';
              } else if (codNum >= 400 && codNum < 700) {
                colunaGPER = 'desconto';
              }
            }
            sec.detailedRubricas.set(item.cod, {
              codigo: item.cod,
              descricao: item.desc,
              referencia: item.ref,
              valorCents: item.valCents,
              colunaGPER,
              isBaseCalculoPura: false,
              filial: currentKey,
            });
          }
          continue;
        }
      }
    }

    // Evitar capturar linhas de cabeçalho de empresa ou sumário líquido como verba
    if (/Grupo de Empresa:|L[IÍ]QUIDO:/i.test(t)) {
      continue;
    }

    const tokenRegex =
      /(\d{3})\s+([A-ZÀ-Ú0-9/.\-\s()%ºª]+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})/g;
    let m: RegExpExecArray | null;
    while ((m = tokenRegex.exec(t)) !== null) {
      const [, cod, rawDesc, refStr, valStr] = m;
      const desc = rawDesc.trim();
      const ref = parseBRLToCents(refStr) / 100;
      const valCents = parseBRLToCents(valStr);
      const codNum = parseInt(cod, 10);

      let colunaGPER: VerbaNaturezaGPER = 'provento';
      const matchingPosItem = ln.items.find((it) => it.str.trim().startsWith(cod));
      if (matchingPosItem) {
        if (matchingPosItem.x >= 380) {
          colunaGPER = 'base';
        } else if (matchingPosItem.x >= 200) {
          colunaGPER = 'desconto';
        } else {
          colunaGPER = 'provento';
        }
      } else if (codNum >= 800 || /^(BS|BASE|DED)\b/i.test(desc)) {
        colunaGPER = 'base';
      } else if (codNum >= 400 && codNum < 700) {
        colunaGPER = 'desconto';
      }

      const rubrica: FolhaRubrica = {
        codigo: cod,
        descricao: desc,
        referencia: ref,
        valorCents: valCents,
        colunaGPER,
        isBaseCalculoPura: colunaGPER === 'base' ? isPureCalculationBase(cod, desc) : false,
        filial: currentKey,
      };

      if (inDetailedBottomBlock) {
        sec.detailedRubricas.set(cod, rubrica);
      } else if (!sec.topTableRubricas.has(cod)) {
        sec.topTableRubricas.set(cod, rubrica);
      }
    }
  }

  const buildResumoFromAccumulator = (acc: RawSectionAccumulator): FolhaFilialResumo => {
    const mergedMap = new Map<string, FolhaRubrica>();
    for (const [k, v] of acc.topTableRubricas.entries()) mergedMap.set(k, v);
    for (const [k, v] of acc.detailedRubricas.entries()) mergedMap.set(k, v);

    const rubricas = Array.from(mergedMap.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));
    const sumProventos = rubricas
      .filter((r) => r.colunaGPER === 'provento')
      .reduce((s, r) => s + r.valorCents, 0);
    const sumDescontos = rubricas
      .filter((r) => r.colunaGPER === 'desconto')
      .reduce((s, r) => s + r.valorCents, 0);

    const totalProventosCents =
      acc.printedProventosCents && acc.printedProventosCents > 0 ? acc.printedProventosCents : sumProventos;
    const totalDescontosCents =
      acc.printedDescontosCents && acc.printedDescontosCents > 0 ? acc.printedDescontosCents : sumDescontos;
    const liquidoCalculadoCents = totalProventosCents - totalDescontosCents;
    const getVal = (c: string) => mergedMap.get(c)?.valorCents ?? 0;

    return {
      filial: acc.filial,
      nomeFilial: acc.nomeFilial,
      rubricas,
      totalProventosCents,
      totalDescontosCents,
      liquidoCalculadoCents,
      liquidoVerba999Cents: getVal('999') || liquidoCalculadoCents,
      baseInssCents: getVal('801') || getVal('802'),
      baseFgtsCents: getVal('820') || getVal('804'),
      fgtsMes826Cents: getVal('826'),
      fgts13o827Cents: getVal('827'),
      fgtsRescisao829Cents: getVal('829'),
      fgts13oResc832Cents: getVal('832'),
      inssEmpresa808Cents: getVal('808'),
      inssTerceiros809Cents: getVal('809'),
      inssRat810Cents: getVal('810'),
    };
  };

  const filiaisList: FolhaFilialResumo[] = [];
  for (const [key, acc] of sectionsMap.entries()) {
    if (key !== 'TOTAL') {
      const resumo = buildResumoFromAccumulator(acc);
      if (resumo.rubricas.length > 0) filiaisList.push(resumo);
    }
  }

  let totalEmpresaResumo: FolhaFilialResumo;
  if (sectionsMap.has('TOTAL') && sectionsMap.get('TOTAL')!.detailedRubricas.size > 0) {
    totalEmpresaResumo = buildResumoFromAccumulator(sectionsMap.get('TOTAL')!);
  } else {
    const mapTotal = new Map<string, FolhaRubrica>();
    for (const f of filiaisList) {
      for (const r of f.rubricas) {
        const ex = mapTotal.get(r.codigo);
        if (ex) {
          ex.valorCents += r.valorCents;
          ex.referencia = Math.round((ex.referencia + r.referencia) * 100) / 100;
        } else {
          mapTotal.set(r.codigo, { ...r, filial: 'TOTAL' });
        }
      }
    }
    totalEmpresaResumo = buildResumoFromAccumulator({
      filial: 'TOTAL',
      nomeFilial: 'TOTAL EMPRESA',
      detailedRubricas: mapTotal,
      topTableRubricas: new Map(),
    });
  }

  const validacoesInternas: FolhaValidationWarning[] = [];
  const somaProvFiliais = filiaisList.reduce((acc, f) => acc + f.totalProventosCents, 0);
  const diffSomaFiliais = Math.abs(somaProvFiliais - totalEmpresaResumo.totalProventosCents);

  validacoesInternas.push({
    id: 'val-soma-filiais',
    severidade: diffSomaFiliais <= 1 ? 'info' : 'erro',
    titulo: 'Soma das Filiais × Total Empresa',
    detalhe:
      diffSomaFiliais <= 1
        ? `Soma de proventos das ${filiaisList.length} filiais fecha exatamente com o Total Empresa.`
        : `Diferença detectada entre soma das filiais e Total Empresa.`,
    valorEsperadoCents: somaProvFiliais,
    valorEncontradoCents: totalEmpresaResumo.totalProventosCents,
    diferencaCents: totalEmpresaResumo.totalProventosCents - somaProvFiliais,
  });

  const diffLiq = Math.abs(totalEmpresaResumo.liquidoCalculadoCents - totalEmpresaResumo.liquidoVerba999Cents);
  validacoesInternas.push({
    id: 'val-liq-999',
    severidade: diffLiq <= 1 ? 'info' : 'erro',
    titulo: 'Equação Proventos − Descontos = Líquido (Verba 999)',
    detalhe:
      diffLiq <= 1
        ? 'O líquido a receber (verba 999) confere exatamente com Total Proventos menos Total Descontos.'
        : 'Divergência entre Proventos − Descontos e a verba 999.',
    valorEsperadoCents: totalEmpresaResumo.liquidoCalculadoCents,
    valorEncontradoCents: totalEmpresaResumo.liquidoVerba999Cents,
    diferencaCents: totalEmpresaResumo.liquidoVerba999Cents - totalEmpresaResumo.liquidoCalculadoCents,
  });

  for (const f of [...filiaisList, totalEmpresaResumo]) {
    if (f.baseFgtsCents > 0 && f.fgtsMes826Cents > 0) {
      const esperado8Pct = Math.round(f.baseFgtsCents * 0.08);
      const diffFgts = Math.abs(esperado8Pct - f.fgtsMes826Cents);
      if (diffFgts <= 5) {
        validacoesInternas.push({
          id: `val-fgts-${f.filial}`,
          severidade: 'info',
          titulo: `Consistência Base FGTS × 8% (${f.nomeFilial})`,
          detalhe: `8% sobre Base FGTS confere com a verba 826 (FGTS Mês).`,
          filial: f.filial,
          valorEsperadoCents: esperado8Pct,
          valorEncontradoCents: f.fgtsMes826Cents,
          diferencaCents: f.fgtsMes826Cents - esperado8Pct,
        });
      }
    }
  }

  return {
    nomeArquivo: file.name,
    empresa,
    competencia,
    periodoRef,
    dataPagamento,
    filiais: filiaisList,
    totalEmpresa: totalEmpresaResumo,
    validacoesInternas,
  };
}

/**
 * 2. Parser determinístico do Balancete (PDF CTBR040 Posicional ou Planilha XLSX/CSV)
 */
export async function parseBalanceteFile(
  file: File | { name: string; arrayBuffer: () => Promise<ArrayBuffer> }
): Promise<BalanceteData> {
  const nameLower = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (nameLower.endsWith('.xlsx') || nameLower.endsWith('.xls') || nameLower.endsWith('.csv')) {
    return parseBalanceteSpreadsheet(file.name, buffer);
  }
  return parseBalancetePdfPositional(file.name, buffer);
}

async function parseBalancetePdfPositional(fileName: string, buffer: ArrayBuffer): Promise<BalanceteData> {
  const lines = await extractPdfVisualLines(buffer);
  const anomaliasCorrigidas: string[] = [];
  let competencia = '202609';
  let empresa = 'PRAMAR COMERCIO E LOGISTICA LTDA';

  for (const ln of lines.slice(0, 25)) {
    const mData = ln.text.match(/(\d{2})\/(\d{2})\/(\d{4})\s+a\s+(\d{2})\/(\d{2})\/(\d{4})/i);
    if (mData) {
      competencia = `${mData[6]}${mData[5]}`;
    }
    const mEmp = ln.text.match(/Empresa:\s*(.+?)(?:Periodo|Emissao|Folha|$)/i);
    if (mEmp && mEmp[1].trim()) {
      empresa = mEmp[1].trim();
    }
  }

  interface LeftAccountEntry {
    contaFormatada: string;
    descricao: string;
    saldoAnteriorSignedCents: number;
    saldoAnteriorAbsCents: number;
    saldoAnteriorDC: 'D' | 'C' | '';
    page: number;
  }

  interface RightMovementEntry {
    debitoCents: number;
    creditoCents: number;
    saldoAtualSignedCents: number;
    saldoAtualAbsCents: number;
    saldoAtualDC: 'D' | 'C' | '';
    page: number;
  }

  const leftEntries: LeftAccountEntry[] = [];
  const rightEntries: RightMovementEntry[] = [];
  const fullRowEntries: BalanceteLinha[] = [];

  for (const ln of lines) {
    let rawText = ln.text;

    const gluedMatch = rawText.match(/(\d{1,3}(?:\.\d{3})*,\d{2}\s*[DC])([1-9]\.\d\.\d\.\d{2}\.\d+)/i);
    if (gluedMatch) {
      anomaliasCorrigidas.push(
        `Página ${ln.page}: linha colada "${gluedMatch[1]}${gluedMatch[2]}" separada com sucesso.`
      );
      rawText = rawText.replace(gluedMatch[0], `${gluedMatch[1]} |SPLIT| ${gluedMatch[2]}`);
    }

    const segments = rawText.split('|SPLIT|').map((s) => s.trim());

    for (const seg of segments) {
      if (
        /^Conta\s+Descri/i.test(seg) ||
        /^Debito\s+Credito/i.test(seg) ||
        /SIGA\s*\/\s*CTBR040/i.test(seg) ||
        /TOTAIS\s+DO\s+PERIODO|T\s*O\s*T\s*A\s*I\s*S|TOTAL\s+GERAL/i.test(seg)
      ) {
        continue;
      }

      const fullMatch = seg.match(
        /^([1-9](?:\.\d+)*)\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2}(?:\s*[DC])?|-)\s+(\d{1,3}(?:\.\d{3})*,\d{2}|-)\s+(\d{1,3}(?:\.\d{3})*,\d{2}|-)\s+(\d{1,3}(?:\.\d{3})*,\d{2}(?:\s*[DC])?|-)$/i
      );
      if (fullMatch) {
        const [, conta, desc, sAntStr, debStr, credStr, sAtuStr] = fullMatch;
        const sAnt = sAntStr === '-' ? { signedCents: 0, absCents: 0, dc: '' as const } : parseSignedBalanceCents(sAntStr);
        const deb = debStr === '-' ? 0 : Math.abs(parseBRLToCents(debStr));
        const cred = credStr === '-' ? 0 : Math.abs(parseBRLToCents(credStr));
        const sAtu = sAtuStr === '-' ? { signedCents: 0, absCents: 0, dc: '' as const } : parseSignedBalanceCents(sAtuStr);
        const norm = normalizeAccountCode(conta);
        const calc = sAnt.signedCents + deb - cred;
        fullRowEntries.push({
          contaFormatada: conta.trim(),
          contaNormalizada: norm,
          descricao: desc.trim(),
          descricaoAnonimizada: anonymizePII(desc.trim()),
          classe: norm.length >= 11 ? 'analitica' : 'sintetica',
          nivel: conta.split('.').length,
          saldoAnteriorSignedCents: sAnt.signedCents,
          saldoAnteriorAbsCents: sAnt.absCents,
          saldoAnteriorDC: sAnt.dc,
          debitoCents: deb,
          creditoCents: cred,
          saldoAtualSignedCents: sAtu.signedCents,
          saldoAtualAbsCents: sAtu.absCents,
          saldoAtualDC: sAtu.dc,
          validacaoEquacaoOk: Math.abs(calc - sAtu.signedCents) <= 1,
          paginaOrigem: ln.page,
        });
        continue;
      }

      const leftMatch = seg.match(
        /^([1-9](?:\.\d+)*)\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2}(?:\s*[DC])?|-)$/i
      );
      if (leftMatch) {
        const [, conta, desc, sAntStr] = leftMatch;
        const sAnt = sAntStr === '-' ? { signedCents: 0, absCents: 0, dc: '' as const } : parseSignedBalanceCents(sAntStr);
        leftEntries.push({
          contaFormatada: conta.trim(),
          descricao: desc.trim(),
          saldoAnteriorSignedCents: sAnt.signedCents,
          saldoAnteriorAbsCents: sAnt.absCents,
          saldoAnteriorDC: sAnt.dc,
          page: ln.page,
        });
        continue;
      }

      const rightMatch = seg.match(
        /^(\d{1,3}(?:\.\d{3})*,\d{2}|-)\s+(\d{1,3}(?:\.\d{3})*,\d{2}|-)\s+(\d{1,3}(?:\.\d{3})*,\d{2}(?:\s*[DC])?|-)$/i
      );
      if (rightMatch) {
        const [, debStr, credStr, sAtuStr] = rightMatch;
        const deb = debStr === '-' ? 0 : Math.abs(parseBRLToCents(debStr));
        const cred = credStr === '-' ? 0 : Math.abs(parseBRLToCents(credStr));
        const sAtu = sAtuStr === '-' ? { signedCents: 0, absCents: 0, dc: '' as const } : parseSignedBalanceCents(sAtuStr);
        rightEntries.push({
          debitoCents: deb,
          creditoCents: cred,
          saldoAtualSignedCents: sAtu.signedCents,
          saldoAtualAbsCents: sAtu.absCents,
          saldoAtualDC: sAtu.dc,
          page: ln.page,
        });
      }
    }
  }

  const finalLines: BalanceteLinha[] = [...fullRowEntries];

  if (leftEntries.length > 0 && rightEntries.length > 0) {
    anomaliasCorrigidas.push(
      `Alinhamento posicional executado: ${leftEntries.length} contas pareadas com ${rightEntries.length} linhas de movimento (Débito/Crédito/Saldo Atual).`
    );
    const count = Math.min(leftEntries.length, rightEntries.length);
    for (let i = 0; i < count; i++) {
      const L = leftEntries[i];
      const R = rightEntries[i];
      const norm = normalizeAccountCode(L.contaFormatada);
      const calculado = L.saldoAnteriorSignedCents + R.debitoCents - R.creditoCents;
      const ok = Math.abs(calculado - R.saldoAtualSignedCents) <= 1;
      finalLines.push({
        contaFormatada: L.contaFormatada,
        contaNormalizada: norm,
        descricao: L.descricao,
        descricaoAnonimizada: anonymizePII(L.descricao),
        classe: norm.length >= 11 ? 'analitica' : 'sintetica',
        nivel: L.contaFormatada.split('.').length,
        saldoAnteriorSignedCents: L.saldoAnteriorSignedCents,
        saldoAnteriorAbsCents: L.saldoAnteriorAbsCents,
        saldoAnteriorDC: L.saldoAnteriorDC,
        debitoCents: R.debitoCents,
        creditoCents: R.creditoCents,
        saldoAtualSignedCents: R.saldoAtualSignedCents,
        saldoAtualAbsCents: R.saldoAtualAbsCents,
        saldoAtualDC: R.saldoAtualDC,
        validacaoEquacaoOk: ok,
        erroLeituraDetalhe: ok
          ? undefined
          : `Saldo Anterior + Débito − Crédito difere do Saldo Atual na linha ${i + 1}`,
        paginaOrigem: L.page,
      });
    }
  }

  return finalizeBalanceteData(fileName, empresa, competencia, finalLines, anomaliasCorrigidas);
}

function parseBalanceteSpreadsheet(fileName: string, buffer: ArrayBuffer): BalanceteData {
  const wb = XLSX.read(buffer, { type: 'array', raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: '' });

  const linhas: BalanceteLinha[] = [];
  for (const row of rows) {
    if (!row || row.length < 5) continue;
    const col0 = String(row[0] ?? '').trim();
    const norm = normalizeAccountCode(col0);
    if (norm.length < 5 || !/^[1-9]/.test(norm)) continue;

    const descricao = String(row[1] ?? '').trim();
    const sAnt = parseSignedBalanceCents(row[2]);
    const deb = Math.abs(parseBRLToCents(row[3]));
    const cred = Math.abs(parseBRLToCents(row[4]));
    const sAtu = parseSignedBalanceCents(row[5]);
    const calc = sAnt.signedCents + deb - cred;
    const contaFormatada = col0.includes('.') ? col0 : formatAccountMask(norm);

    linhas.push({
      contaFormatada,
      contaNormalizada: norm,
      descricao,
      descricaoAnonimizada: anonymizePII(descricao),
      classe: norm.length >= 11 ? 'analitica' : 'sintetica',
      nivel: contaFormatada.split('.').length,
      saldoAnteriorSignedCents: sAnt.signedCents,
      saldoAnteriorAbsCents: sAnt.absCents,
      saldoAnteriorDC: sAnt.dc,
      debitoCents: deb,
      creditoCents: cred,
      saldoAtualSignedCents: sAtu.signedCents,
      saldoAtualAbsCents: sAtu.absCents,
      saldoAtualDC: sAtu.dc,
      validacaoEquacaoOk: Math.abs(calc - sAtu.signedCents) <= 1,
    });
  }

  return finalizeBalanceteData(fileName, 'EMPRESA (PLANILHA BALANCETE)', '202609', linhas, []);
}

function finalizeBalanceteData(
  nomeArquivo: string,
  empresa: string,
  competencia: string,
  linhas: BalanceteLinha[],
  anomaliasCorrigidas: string[]
): BalanceteData {
  const analiticas = linhas.filter((l) => l.classe === 'analitica');
  const sinteticas = linhas.filter((l) => l.classe === 'sintetica');
  const errosEquacaoLinhas = linhas.filter((l) => !l.validacaoEquacaoOk);

  const errosSomaSintetica: BalanceteData['errosSomaSintetica'] = [];
  for (const sint of sinteticas) {
    const filhas = analiticas.filter((a) => a.contaNormalizada.startsWith(sint.contaNormalizada));
    if (filhas.length > 0) {
      const somaFilhas = filhas.reduce((acc, f) => acc + f.saldoAtualSignedCents, 0);
      if (Math.abs(somaFilhas - sint.saldoAtualSignedCents) > 5) {
        errosSomaSintetica.push({
          contaSintetica: sint.contaFormatada,
          descricao: sint.descricao,
          saldoSinteticaCents: sint.saldoAtualSignedCents,
          somaAnaliticasCents: somaFilhas,
          diferencaCents: sint.saldoAtualSignedCents - somaFilhas,
        });
      }
    }
  }

  return {
    nomeArquivo,
    empresa,
    competencia,
    linhas,
    totalDebitoCents: analiticas.reduce((a, b) => a + b.debitoCents, 0),
    totalCreditoCents: analiticas.reduce((a, b) => a + b.creditoCents, 0),
    anomaliasCorrigidas,
    errosEquacaoLinhas,
    errosSomaSintetica,
  };
}

/**
 * ============================================================================
 * 3. PARSER DETERMINÍSTICO DA PLANILHA CT2 (45 COLUNAS TOTVS PROTHEUS) + CTBR400
 * ============================================================================
 */

/**
 * Classifica o histórico contábil puro (SEM contaminação pela coluna Origem).
 */
export function classifyRazaoHistorico(historico: string, lote: string): {
  tipoExtraido: LancamentoTipoHistorico;
  eventoCodigoExtraido?: string;
  competenciaRefExtraida?: string;
  favorecidoExtraido?: string;
} {
  const upper = historico.toUpperCase().trim();

  // Extrair REF. mm/aaaa -> AAAAMM (exclusivamente do histórico, nunca da coluna Origem!)
  let competenciaRefExtraida: string | undefined;
  const mRef = upper.match(/REF\.?\s*(\d{2})\/(\d{4})/);
  if (mRef) {
    competenciaRefExtraida = `${mRef[2]}${mRef[1]}`;
  } else {
    const mMesAno = upper.match(/\b(0[1-9]|1[0-2])\/(20\d{2})\b/);
    if (mMesAno) competenciaRefExtraida = `${mMesAno[2]}${mMesAno[1]}`;
  }

  // Extrair código de verba de 3 dígitos após FOLHA ou FGTS
  let eventoCodigoExtraido: string | undefined;
  const mCod = upper.match(/(?:FOLHA|VERBA|EVENTO)\s+(\d{3})\b/);
  if (mCod) {
    eventoCodigoExtraido = mCod[1];
  } else if (upper.includes('FGTS MES')) {
    eventoCodigoExtraido = '826';
  }

  let tipoExtraido: LancamentoTipoHistorico = 'outros';
  if (upper.startsWith('PAGTO') || upper.includes('PAGAMENTO') || upper.includes('LIQUIDACAO') || lote === '008850') {
    tipoExtraido = 'pagamento_baixa';
  } else if (upper.startsWith('FGTS DEP') || upper.includes('FGTS MES')) {
    tipoExtraido = 'apropriacao_fgts';
  } else if (upper.startsWith('PROV') || upper.includes('PROVISAO') || lote === '008895') {
    tipoExtraido = 'apropriacao_provisao';
  } else if (upper.startsWith('FOLHA') || lote === '008890') {
    tipoExtraido = 'apropriacao_folha';
  } else if (upper.includes('ESTORNO') || upper.includes('REVERSAO')) {
    tipoExtraido = 'estorno_ajuste';
  }

  let favorecidoExtraido: string | undefined;
  const mFav = historico.match(/PAGTO\s+\d+\s*-\s*(.+?)\s*-\s*(?:CAIXA|BANCO|ITAU|BRADESCO|BB|SANTANDER)/i);
  if (mFav) favorecidoExtraido = mFav[1].trim();

  return {
    tipoExtraido,
    eventoCodigoExtraido,
    competenciaRefExtraida,
    favorecidoExtraido,
  };
}

/**
 * Precedência de Classificação de Lote:
 * 1º) Tabela de Lotes editável (permite ao usuário classificar qualquer lote como Folha, Pagamentos, Fiscal, Manual, etc.)
 * 2º) Se não estiver cadastrado na tabela, aplica a regra padrão por regex: lote com letra (ex: 0000BR, SC0000) = Manual.
 */
export function resolveLoteClassification(
  lote: string,
  loteConfigs: LoteConfig[] = DEFAULT_LOTE_CONFIGS
): { manual: boolean; classificacao: LoteClassificacao } {
  const loteUpper = String(lote ?? '').trim().toUpperCase();
  const matchedConfig = loteConfigs.find(
    (c) => String(c.loteCodigo ?? '').trim().toUpperCase() === loteUpper
  );
  if (matchedConfig) {
    return {
      manual: matchedConfig.classificacao === 'manual',
      classificacao: matchedConfig.classificacao,
    };
  }
  const hasLetter = /[A-Za-z]/.test(loteUpper);
  return {
    manual: hasLetter,
    classificacao: hasLetter ? 'manual' : 'outros',
  };
}

/**
 * Extrai em campos estruturados a coluna Origem do CT2:
 * Ex: "LP 530/001 ANDRESSA.LUIZ/14/07/2026 -XORIG: 0101"
 * NUNCA anexa esses dados ao histórico nem usa a data da Origem como competência.
 */
export function parseOrigemCT2(rawOrigem: unknown): OrigemEstruturadaCT2 {
  const bruto = String(rawOrigem ?? '').trim();
  if (!bruto) return { bruto: '' };

  let lpCodigo: string | undefined;
  let lpSequencia: string | undefined;
  const mLp = bruto.match(/\bLP\s*([0-9A-Z]+)(?:\/([0-9A-Z]+))?/i);
  if (mLp) {
    lpCodigo = mLp[1].toUpperCase();
    if (mLp[2]) lpSequencia = mLp[2];
  }

  let usuarioOrigem: string | undefined;
  let dataOrigem: string | undefined;
  const mUserDate = bruto.match(/([A-Z0-9._-]+)\/(\d{2}\/\d{2}\/\d{4})/i);
  if (mUserDate) {
    usuarioOrigem = mUserDate[1];
    dataOrigem = mUserDate[2];
  }

  let xorigFilial: string | undefined;
  const mXorig = bruto.match(/-?XORIG:\s*(\d+)/i);
  if (mXorig) {
    xorigFilial = mXorig[1].padStart(4, '0');
  }

  return {
    bruto,
    lpCodigo,
    lpSequencia,
    usuarioOrigem,
    dataOrigem,
    xorigFilial,
  };
}

/**
 * Regra de concatenação de fragmentos Hist Lanc (Cont.Hist):
 * - NUNCA aplica trim() nas pontas dos fragmentos antes de concatenar.
 * - Se já houver espaço no fim do anterior ou no início do novo, concatena direto.
 * - Se não houver espaço em nenhum dos dois lados:
 *   - Insere 1 espaço apenas quando o novo fragmento começa com marcador isolado (NFE, NF:, LTDA, S/A, REF.)
 *     cujo caractere de espaço na coluna 41 foi removido pelo LTrim do Protheus.
 *   - Nos demais casos (corte de 40 caracteres no meio da palavra: MOL+AS, N+FE, AMBIE+NTAIS, FUND+IDO, S.+A.),
 *     concatena diretamente sem espaço.
 */
export function joinContHistFragments(prevRaw: string, nextRaw: string): string {
  if (!prevRaw) return nextRaw;
  if (!nextRaw) return prevRaw;
  if (/\s$/.test(prevRaw) || /^\s/.test(nextRaw)) {
    return prevRaw + nextRaw;
  }
  if (/^(NFE\b|NF:|NF\s|LTDA\b|S\/A\b|REF\.)/i.test(nextRaw)) {
    return `${prevRaw} ${nextRaw}`;
  }
  return prevRaw + nextRaw;
}

function normalizeHeaderLabel(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.\/_-]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseExcelDateToBR(raw: unknown): { data: string; competencia: string; isoSort: string } | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    const utcDays = Math.floor(raw - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getUTCFullYear());
    return { data: `${dd}/${mm}/${yyyy}`, competencia: `${yyyy}${mm}`, isoSort: `${yyyy}-${mm}-${dd}` };
  }
  const str = String(raw).trim();
  const mBR = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mBR) {
    const dd = mBR[1].padStart(2, '0');
    const mm = mBR[2].padStart(2, '0');
    const yyyy = mBR[3];
    return { data: `${dd}/${mm}/${yyyy}`, competencia: `${yyyy}${mm}`, isoSort: `${yyyy}-${mm}-${dd}` };
  }
  const mISO = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mISO) {
    const [, yyyy, mm, dd] = mISO;
    return { data: `${dd}/${mm}/${yyyy}`, competencia: `${yyyy}${mm}`, isoSort: `${yyyy}-${mm}-${dd}` };
  }
  if (/^\d{5}$/.test(str)) {
    const num = parseInt(str, 10);
    const utcDays = Math.floor(num - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getUTCFullYear());
    return { data: `${dd}/${mm}/${yyyy}`, competencia: `${yyyy}${mm}`, isoSort: `${yyyy}-${mm}-${dd}` };
  }
  return null;
}

function formatCodePreservingLettersAndZeros(raw: unknown, width: number): string {
  const s = String(raw ?? '').trim().toUpperCase();
  if (!s) return ''.padStart(width, '0');
  return s.padStart(width, '0');
}

function classifyTipoLctoCell(raw: unknown): 'debito' | 'credito' | 'partida_dobrada' | 'cont_hist' | 'outro' {
  const norm = String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  if (norm === '1' || norm === 'debito' || norm === 'd') return 'debito';
  if (norm === '2' || norm === 'credito' || norm === 'c') return 'credito';
  if (norm === '3' || norm === 'partida dobrada' || norm === 'x') return 'partida_dobrada';
  if (
    norm === '4' ||
    norm === 'cont hist' ||
    norm === 'conthist' ||
    norm === 'compl hist' ||
    norm === 'continuacao' ||
    norm === 'hist compl'
  ) {
    return 'cont_hist';
  }
  return 'outro';
}

/**
 * Extrai uma matriz de valores da aba do Excel preservando células de texto sem trim()
 * e valores numéricos/datas originais sem distorção de localidade.
 */
function extractRawMatrixFromSheet(sheet: XLSX.WorkSheet): unknown[][] {
  const ref = sheet['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const matrix: unknown[][] = [];

  for (let R = range.s.r; R <= range.e.r; R++) {
    const row: unknown[] = [];
    let hasAnyValue = false;
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = sheet[addr] as XLSX.CellObject | undefined;
      if (!cell || cell.v === undefined || cell.v === null) {
        row.push('');
      } else {
        hasAnyValue = true;
        if (cell.t === 's') {
          // Preserva string bruta (sem trim!) para não perder espaços nas pontas de Hist Lanc
          row.push(String(cell.v));
        } else if (cell.t === 'n') {
          // Se a célula estiver formatada como data dd/mm/yyyy em cell.w, ou serial, passamos o número ou texto
          row.push(cell.v);
        } else {
          row.push(cell.w ?? String(cell.v));
        }
      }
    }
    if (hasAnyValue) {
      matrix.push(row);
    }
  }
  return matrix;
}

/**
 * Processa uma matriz de linhas (vinda de XLSX ou TSV) tanto para o layout de 45 colunas da tabela CT2
 * quanto para o layout legado de 9 colunas do relatório CTBR400.
 */
export function parseCT2Matrix(
  rows: unknown[][],
  options: {
    fileName: string;
    loteConfigs?: LoteConfig[];
    balancete?: BalanceteData | null;
    deParaRules?: DeParaRule[];
    onProgress?: (percent: number, stage: string) => void;
  }
): RazaoData {
  const loteConfigs = options.loteConfigs ?? DEFAULT_LOTE_CONFIGS;
  options.onProgress?.(10, 'Identificando cabeçalho da planilha CT2...');

  // Procurar cabeçalho nas primeiras 15 linhas
  let headerRowIndex = -1;
  let normalizedHeaders: string[] = [];
  let isCT2TableLayout = false;
  let isCTBR400Layout = false;

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i];
    if (!r || r.length < 5) continue;
    const normCols = r.map((c) => normalizeHeaderLabel(c));

    // Verificar se é Tabela CT2 (presença de "tipo lcto" + "cta debito" + "cta credito" ou colunas da CT2)
    const hasTipoLcto = normCols.some((h) => h === 'tipo lcto' || h === 'tipo lancto' || h === 'tp lcto');
    const hasCtaDeb = normCols.some((h) => h === 'cta debito' || h === 'conta debito');
    const hasCtaCred = normCols.some((h) => h === 'cta credito' || h === 'conta credito');
    const hasNumeroLote = normCols.some((h) => h === 'numero lote' || h === 'nro lote');

    if ((hasTipoLcto && hasCtaDeb && hasCtaCred) || (hasNumeroLote && (hasTipoLcto || hasCtaDeb || hasCtaCred))) {
      headerRowIndex = i;
      normalizedHeaders = normCols;
      isCT2TableLayout = true;
      break;
    }

    // Verificar se é Relatório CTBR400 (CONTA + DATA + LOTE/SUB/DOC/LINHA + HISTORICO)
    if (normCols[0] === 'conta' && normCols.some((h) => h.includes('lote') || h.includes('historico'))) {
      headerRowIndex = i;
      normalizedHeaders = normCols;
      isCTBR400Layout = true;
      break;
    }
  }

  // Se não detectou CTBR400 nem cabeçalho CT2 completo, verificar se a 1ª linha tentava ser CT2 com colunas faltando
  if (!isCT2TableLayout && !isCTBR400Layout && rows.length > 0) {
    // Verificar se a primeira linha tem cara de dados do CTBR400 sem linha de título
    const r0 = rows[0];
    const c0Norm = normalizeAccountCode(String(r0?.[0] ?? ''));
    const c1Str = String(r0?.[1] ?? '').trim();
    if (c0Norm.length >= 7 && /\d{2}\/\d{2}\/\d{4}/.test(c1Str)) {
      isCTBR400Layout = true;
      headerRowIndex = -1;
    } else {
      headerRowIndex = 0;
      normalizedHeaders = (rows[0] ?? []).map((c) => normalizeHeaderLabel(c));
      isCT2TableLayout = true;
    }
  }

  if (isCTBR400Layout && !isCT2TableLayout) {
    return parseLegacyCTBR400Matrix(rows, headerRowIndex, options);
  }

  // Mapear colunas obrigatórias do layout de 45 colunas da Tabela CT2 por NOME
  const findColExactOrAlias = (aliases: string[]): number => {
    for (const alias of aliases) {
      const idx = normalizedHeaders.findIndex((h) => h === alias);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const colMap = {
    filial: findColExactOrAlias(['filial', 'filial lcto']),
    dataLcto: findColExactOrAlias(['data lcto', 'data lancto', 'dt lcto', 'data lancamento']),
    numeroLote: findColExactOrAlias(['numero lote', 'nro lote', 'num lote', 'lote']),
    subLote: findColExactOrAlias(['sub lote', 'sublote']),
    numeroDoc: findColExactOrAlias(['numero doc', 'nro doc', 'num doc', 'documento']),
    moedaLancto: findColExactOrAlias(['moeda lancto', 'moeda lcto', 'moeda']),
    tipoLcto: findColExactOrAlias(['tipo lcto', 'tipo lancto', 'tp lcto']),
    ctaDebito: findColExactOrAlias(['cta debito', 'conta debito']),
    ctaCredito: findColExactOrAlias(['cta credito', 'conta credito']),
    // Casar "Valor" de forma EXATA (para nunca confundir com "Valor Moeda1")
    valor: normalizedHeaders.findIndex((h) => h === 'valor'),
    histPad: findColExactOrAlias(['hist pad', 'historico padrao']),
    histLanc: findColExactOrAlias(['hist lanc', 'historico lanc', 'historico']),
    cCustoDeb: findColExactOrAlias(['c custo deb', 'centro custo deb', 'cc debito']),
    cCustoCrd: findColExactOrAlias(['c custo crd', 'centro custo crd', 'cc credito']),
    tipoDoSld: findColExactOrAlias(['tipo do sld', 'tipo sld', 'tp sld', 'tipo de saldo']),
    origem: findColExactOrAlias(['origem']),
    estornoCanc: findColExactOrAlias(['estorno canc', 'estornocanc']),
    estorno: normalizedHeaders.findIndex((h) => h === 'estorno'),
  };

  const requiredSpecs: { key: keyof typeof colMap; label: string }[] = [
    { key: 'filial', label: 'Filial' },
    { key: 'dataLcto', label: 'Data Lcto' },
    { key: 'numeroLote', label: 'Numero Lote' },
    { key: 'subLote', label: 'Sub Lote' },
    { key: 'numeroDoc', label: 'Numero Doc' },
    { key: 'moedaLancto', label: 'Moeda Lancto' },
    { key: 'tipoLcto', label: 'Tipo Lcto' },
    { key: 'ctaDebito', label: 'Cta Debito' },
    { key: 'ctaCredito', label: 'Cta Credito' },
    { key: 'valor', label: 'Valor' },
    { key: 'histLanc', label: 'Hist Lanc' },
    { key: 'tipoDoSld', label: 'Tipo do Sld' },
    { key: 'origem', label: 'Origem' },
  ];

  const missingColumns = requiredSpecs.filter((s) => colMap[s.key] === -1).map((s) => s.label);
  if (missingColumns.length > 0) {
    throw new Error(
      `Planilha CT2 inválida: coluna(s) obrigatória(s) não encontrada(s) no cabeçalho: ${missingColumns.join(', ')}.`
    );
  }

  options.onProgress?.(30, 'Lendo linhas da tabela CT2, aplicando filtros e unindo Cont.Hist...');

  interface RawUnfoldedEntry {
    id: string;
    ordemOriginal: number;
    isoDateSort: string;
    filial: string;
    filialOrigem: string;
    data: string;
    competenciaDataLcto: string;
    lote: string;
    sublote: string;
    documento: string;
    linha: string;
    chaveDocumento: string;
    chaveCT2: string;
    manual: boolean;
    classificacaoLote: LoteClassificacao;
    tipoOrigemRow: 'debito' | 'credito' | 'partida_dobrada';
    contaNormalizada: string;
    contaFormatada: string;
    debitoCents: number;
    creditoCents: number;
    contraPartidaExplicitaNorm?: string;
    rawHistFragments: string;
    histPadCodigo?: string;
    centroCusto?: string;
    centroCustoDebito?: string;
    centroCustoCredito?: string;
    origemEstruturada: OrigemEstruturadaCT2;
    estornado: boolean;
    statusEstornoBruto?: string;
  }

  const unfoldedEntries: RawUnfoldedEntry[] = [];
  let linhasBrutasLidas = 0;
  let contHistAnexados = 0;
  let partidasDobradasDesdobradas = 0;
  let linhasIgnoradasFiltroSaldoMoeda = 0;
  const outrosTiposMap = new Map<string, number>();
  const contHistOrfaosErros: string[] = [];
  const alertas: string[] = [];
  const errosBloqueantes: string[] = [];

  // Rastreia os lançamentos criados na linha imediatamente anterior para anexar Cont.Hist na mesma chave de documento
  let lastActiveEntriesGroup: {
    chaveDocumento: string;
    entries: RawUnfoldedEntry[];
  } | null = null;

  // Contador de linha por documento para compor chaveCT2
  const docLineSeqMap = new Map<string, number>();
  let globalOrdem = 1;

  const totalDataRows = rows.length - (headerRowIndex + 1);

  for (let rIdx = headerRowIndex + 1; rIdx < rows.length; rIdx++) {
    const r = rows[rIdx];
    if (!r || r.length === 0) continue;

    // Verificar se a linha é completamente vazia
    const rawFilial = String(r[colMap.filial] ?? '').trim();
    const rawData = r[colMap.dataLcto];
    const rawTipo = String(r[colMap.tipoLcto] ?? '').trim();
    if (!rawFilial && !rawData && !rawTipo) continue;

    linhasBrutasLidas++;
    if (linhasBrutasLidas % 1000 === 0 && totalDataRows > 0) {
      const pct = 30 + Math.round((linhasBrutasLidas / totalDataRows) * 35);
      options.onProgress?.(pct, `Processando linha ${linhasBrutasLidas} de ${totalDataRows}...`);
    }

    // Filtro: Tipo do Sld = 1 e Moeda Lancto = 01
    const rawTipoSld = String(r[colMap.tipoDoSld] ?? '').trim();
    const rawMoeda = String(r[colMap.moedaLancto] ?? '').trim();
    const isTipoSld1 = rawTipoSld === '1' || rawTipoSld === '01';
    const isMoeda01 = rawMoeda === '01' || rawMoeda === '1';

    if (!isTipoSld1 || !isMoeda01) {
      linhasIgnoradasFiltroSaldoMoeda++;
      lastActiveEntriesGroup = null;
      continue;
    }

    const parsedDate = parseExcelDateToBR(rawData);
    if (!parsedDate) {
      alertas.push(`Linha ${rIdx + 1}: Data Lcto inválida ("${String(rawData ?? '')}").`);
      lastActiveEntriesGroup = null;
      continue;
    }

    const filial = formatCodePreservingLettersAndZeros(rawFilial, 4);
    const lote = formatCodePreservingLettersAndZeros(r[colMap.numeroLote], 6);
    const sublote = formatCodePreservingLettersAndZeros(r[colMap.subLote], 3);
    const documento = formatCodePreservingLettersAndZeros(r[colMap.numeroDoc], 6);
    const chaveDocumento = `${filial}|${parsedDate.data}|${lote}|${sublote}|${documento}`;

    const tipoClass = classifyTipoLctoCell(rawTipo);
    // Importante: ler a célula Hist Lanc BRUTA, sem aplicar trim() nas pontas!
    const rawHistLanc = String(r[colMap.histLanc] ?? '');

    if (tipoClass === 'cont_hist') {
      if (!lastActiveEntriesGroup || lastActiveEntriesGroup.chaveDocumento !== chaveDocumento) {
        const msg = `Linha ${rIdx + 1}: "Cont.Hist" sem lançamento principal imediatamente anterior na mesma chave de documento (${filial}/${parsedDate.data}/${lote}/${sublote}/${documento}).`;
        contHistOrfaosErros.push(msg);
        errosBloqueantes.push(msg);
      } else {
        contHistAnexados++;
        for (const targetEntry of lastActiveEntriesGroup.entries) {
          targetEntry.rawHistFragments = joinContHistFragments(targetEntry.rawHistFragments, rawHistLanc);
        }
      }
      continue;
    }

    if (tipoClass === 'outro') {
      const label = rawTipo || 'VAZIO';
      outrosTiposMap.set(label, (outrosTiposMap.get(label) ?? 0) + 1);
      alertas.push(
        `Linha ${rIdx + 1}: Tipo Lcto "${label}" não gera lançamento no razão (documento ${lote}/${sublote}/${documento}).`
      );
      lastActiveEntriesGroup = null;
      continue;
    }

    const valorCents = Math.abs(parseBRLToCents(r[colMap.valor] as string | number | undefined));
    const ctaDebitoNorm = normalizeAccountCode(String(r[colMap.ctaDebito] ?? ''));
    const ctaCreditoNorm = normalizeAccountCode(String(r[colMap.ctaCredito] ?? ''));
    const histPadCodigo =
      colMap.histPad !== -1 ? String(r[colMap.histPad] ?? '').trim() || undefined : undefined;
    const ccDeb =
      colMap.cCustoDeb !== -1 ? String(r[colMap.cCustoDeb] ?? '').trim() || undefined : undefined;
    const ccCrd =
      colMap.cCustoCrd !== -1 ? String(r[colMap.cCustoCrd] ?? '').trim() || undefined : undefined;

    const origemEstruturada = parseOrigemCT2(r[colMap.origem]);
    const filialOrigem = origemEstruturada.xorigFilial || filial;
    const loteMeta = resolveLoteClassification(lote, loteConfigs);

    const rawEstornoCanc =
      colMap.estornoCanc !== -1 ? String(r[colMap.estornoCanc] ?? '').trim() : '';
    const rawEstorno = colMap.estorno !== -1 ? String(r[colMap.estorno] ?? '').trim() : '';
    const statusEstornoBruto = [rawEstornoCanc, rawEstorno].filter(Boolean).join('/') || undefined;
    const estornado = Boolean(
      (rawEstornoCanc && rawEstornoCanc !== '0') || (rawEstorno && rawEstorno !== '0')
    );

    const nextDocSeq = () => {
      const curr = (docLineSeqMap.get(chaveDocumento) ?? 0) + 1;
      docLineSeqMap.set(chaveDocumento, curr);
      return String(curr).padStart(3, '0');
    };

    if (tipoClass === 'debito') {
      if (!ctaDebitoNorm) {
        errosBloqueantes.push(
          `Linha ${rIdx + 1}: Tipo Lcto "Debito" sem Cta Debito preenchida no documento ${lote}/${sublote}/${documento}.`
        );
        lastActiveEntriesGroup = null;
        continue;
      }
      const linhaSeq = nextDocSeq();
      const ordem = globalOrdem++;
      const entry: RawUnfoldedEntry = {
        id: `ct2-${ordem}`,
        ordemOriginal: ordem,
        isoDateSort: parsedDate.isoSort,
        filial,
        filialOrigem,
        data: parsedDate.data,
        competenciaDataLcto: parsedDate.competencia,
        lote,
        sublote,
        documento,
        linha: linhaSeq,
        chaveDocumento,
        chaveCT2: `${lote}${sublote}${documento}${linhaSeq}`,
        manual: loteMeta.manual,
        classificacaoLote: loteMeta.classificacao,
        tipoOrigemRow: 'debito',
        contaNormalizada: ctaDebitoNorm,
        contaFormatada: formatAccountMask(ctaDebitoNorm),
        debitoCents: valorCents,
        creditoCents: 0,
        rawHistFragments: rawHistLanc,
        histPadCodigo,
        centroCusto: ccDeb,
        centroCustoDebito: ccDeb,
        centroCustoCredito: ccCrd,
        origemEstruturada,
        estornado,
        statusEstornoBruto,
      };
      unfoldedEntries.push(entry);
      lastActiveEntriesGroup = { chaveDocumento, entries: [entry] };
    } else if (tipoClass === 'credito') {
      if (!ctaCreditoNorm) {
        errosBloqueantes.push(
          `Linha ${rIdx + 1}: Tipo Lcto "Credito" sem Cta Credito preenchida no documento ${lote}/${sublote}/${documento}.`
        );
        lastActiveEntriesGroup = null;
        continue;
      }
      const linhaSeq = nextDocSeq();
      const ordem = globalOrdem++;
      const entry: RawUnfoldedEntry = {
        id: `ct2-${ordem}`,
        ordemOriginal: ordem,
        isoDateSort: parsedDate.isoSort,
        filial,
        filialOrigem,
        data: parsedDate.data,
        competenciaDataLcto: parsedDate.competencia,
        lote,
        sublote,
        documento,
        linha: linhaSeq,
        chaveDocumento,
        chaveCT2: `${lote}${sublote}${documento}${linhaSeq}`,
        manual: loteMeta.manual,
        classificacaoLote: loteMeta.classificacao,
        tipoOrigemRow: 'credito',
        contaNormalizada: ctaCreditoNorm,
        contaFormatada: formatAccountMask(ctaCreditoNorm),
        debitoCents: 0,
        creditoCents: valorCents,
        rawHistFragments: rawHistLanc,
        histPadCodigo,
        centroCusto: ccCrd,
        centroCustoDebito: ccDeb,
        centroCustoCredito: ccCrd,
        origemEstruturada,
        estornado,
        statusEstornoBruto,
      };
      unfoldedEntries.push(entry);
      lastActiveEntriesGroup = { chaveDocumento, entries: [entry] };
    } else if (tipoClass === 'partida_dobrada') {
      if (!ctaDebitoNorm || !ctaCreditoNorm) {
        errosBloqueantes.push(
          `Linha ${rIdx + 1}: Tipo Lcto "Partida Dobrada" exige Cta Debito e Cta Credito preenchidas (${lote}/${sublote}/${documento}).`
        );
        lastActiveEntriesGroup = null;
        continue;
      }
      partidasDobradasDesdobradas++;
      const linhaSeqDeb = nextDocSeq();
      const ordemDeb = globalOrdem++;
      const entryDeb: RawUnfoldedEntry = {
        id: `ct2-${ordemDeb}`,
        ordemOriginal: ordemDeb,
        isoDateSort: parsedDate.isoSort,
        filial,
        filialOrigem,
        data: parsedDate.data,
        competenciaDataLcto: parsedDate.competencia,
        lote,
        sublote,
        documento,
        linha: linhaSeqDeb,
        chaveDocumento,
        chaveCT2: `${lote}${sublote}${documento}${linhaSeqDeb}`,
        manual: loteMeta.manual,
        classificacaoLote: loteMeta.classificacao,
        tipoOrigemRow: 'partida_dobrada',
        contaNormalizada: ctaDebitoNorm,
        contaFormatada: formatAccountMask(ctaDebitoNorm),
        debitoCents: valorCents,
        creditoCents: 0,
        contraPartidaExplicitaNorm: ctaCreditoNorm,
        rawHistFragments: rawHistLanc,
        histPadCodigo,
        centroCusto: ccDeb,
        centroCustoDebito: ccDeb,
        centroCustoCredito: ccCrd,
        origemEstruturada,
        estornado,
        statusEstornoBruto,
      };

      const linhaSeqCred = nextDocSeq();
      const ordemCred = globalOrdem++;
      const entryCred: RawUnfoldedEntry = {
        id: `ct2-${ordemCred}`,
        ordemOriginal: ordemCred,
        isoDateSort: parsedDate.isoSort,
        filial,
        filialOrigem,
        data: parsedDate.data,
        competenciaDataLcto: parsedDate.competencia,
        lote,
        sublote,
        documento,
        linha: linhaSeqCred,
        chaveDocumento,
        chaveCT2: `${lote}${sublote}${documento}${linhaSeqCred}`,
        manual: loteMeta.manual,
        classificacaoLote: loteMeta.classificacao,
        tipoOrigemRow: 'partida_dobrada',
        contaNormalizada: ctaCreditoNorm,
        contaFormatada: formatAccountMask(ctaCreditoNorm),
        debitoCents: 0,
        creditoCents: valorCents,
        contraPartidaExplicitaNorm: ctaDebitoNorm,
        rawHistFragments: rawHistLanc,
        histPadCodigo,
        centroCusto: ccCrd,
        centroCustoDebito: ccDeb,
        centroCustoCredito: ccCrd,
        origemEstruturada,
        estornado,
        statusEstornoBruto,
      };

      unfoldedEntries.push(entryDeb, entryCred);
      lastActiveEntriesGroup = { chaveDocumento, entries: [entryDeb, entryCred] };
    }
  }

  options.onProgress?.(70, 'Resolvendo contrapartidas determinísticas por documento CT2...');

  // Agrupar por chaveDocumento para inferir contrapartida (C/PARTIDA) dos lançamentos Debito e Credito
  const entriesByDoc = new Map<string, RawUnfoldedEntry[]>();
  for (const e of unfoldedEntries) {
    const list = entriesByDoc.get(e.chaveDocumento) ?? [];
    list.push(e);
    entriesByDoc.set(e.chaveDocumento, list);
  }

  const allLancamentos: RazaoLancamento[] = [];

  for (const e of unfoldedEntries) {
    let contraPartidaNormalizada = '';
    let contraPartidaFormatada = '';

    if (e.tipoOrigemRow === 'partida_dobrada' && e.contraPartidaExplicitaNorm) {
      contraPartidaNormalizada = e.contraPartidaExplicitaNorm;
      contraPartidaFormatada = formatAccountMask(e.contraPartidaExplicitaNorm);
    } else {
      const docEntries = (entriesByDoc.get(e.chaveDocumento) ?? []).filter(
        (d) => d.tipoOrigemRow !== 'partida_dobrada'
      );
      const distinctDebAccounts = Array.from(
        new Set(docEntries.filter((d) => d.debitoCents > 0).map((d) => d.contaNormalizada))
      );
      const distinctCredAccounts = Array.from(
        new Set(docEntries.filter((d) => d.creditoCents > 0).map((d) => d.contaNormalizada))
      );

      if (e.debitoCents > 0) {
        if (distinctCredAccounts.length === 1) {
          contraPartidaNormalizada = distinctCredAccounts[0];
          contraPartidaFormatada = formatAccountMask(distinctCredAccounts[0]);
        } else if (distinctCredAccounts.length > 1) {
          contraPartidaNormalizada = 'MULTIPLAS';
          contraPartidaFormatada = 'múltiplas';
        }
      } else if (e.creditoCents > 0) {
        if (distinctDebAccounts.length === 1) {
          contraPartidaNormalizada = distinctDebAccounts[0];
          contraPartidaFormatada = formatAccountMask(distinctDebAccounts[0]);
        } else if (distinctDebAccounts.length > 1) {
          contraPartidaNormalizada = 'MULTIPLAS';
          contraPartidaFormatada = 'múltiplas';
        }
      }
    }

    const historicoLimpo = e.rawHistFragments.replace(/\s+/g, ' ').trim();
    const meta = classifyRazaoHistorico(historicoLimpo, e.lote);

    allLancamentos.push({
      id: e.id,
      ordemOriginal: e.ordemOriginal,
      contaNormalizada: e.contaNormalizada,
      contaFormatada: e.contaFormatada,
      data: e.data,
      competenciaDataLcto: e.competenciaDataLcto,
      chaveDocumento: e.chaveDocumento,
      chaveCT2: e.chaveCT2,
      lote: e.lote,
      sublote: e.sublote,
      documento: e.documento,
      linha: e.linha,
      manual: e.manual,
      classificacaoLote: e.classificacaoLote,
      historico: historicoLimpo,
      historicoBrutoConcatenado: e.rawHistFragments,
      historicoPadraoCodigo: e.histPadCodigo,
      historicoAnonimizado: anonymizePII(historicoLimpo),
      contraPartidaNormalizada,
      contraPartidaFormatada,
      filial: e.filial,
      filialOrigem: e.filialOrigem,
      centroCusto: e.centroCusto,
      centroCustoDebito: e.centroCustoDebito,
      centroCustoCredito: e.centroCustoCredito,
      origemEstruturada: e.origemEstruturada,
      estornado: e.estornado,
      statusEstornoBruto: e.statusEstornoBruto,
      debitoCents: e.debitoCents,
      creditoCents: e.creditoCents,
      valorSignedCents: e.debitoCents - e.creditoCents,
      saldoAtualSignedCents: 0,
      saldoAtualAbsCents: 0,
      saldoAtualDC: '',
      ...meta,
    });
  }

  options.onProgress?.(85, 'Calculando saldos corridos e executando as 3 validações obrigatórias...');

  const outrosTiposLctoAlertas = Array.from(outrosTiposMap.entries()).map(([tipo, quantidade]) => ({
    tipo,
    quantidade,
  }));

  return recomputeRazaoBalancesAndValidations({
    nomeArquivo: options.fileName,
    todosLancamentos: allLancamentos,
    formatoDetectado: 'ct2_45_colunas',
    linhasBrutasLidas,
    contHistAnexados,
    partidasDobradasDesdobradas,
    linhasIgnoradasFiltroSaldoMoeda,
    outrosTiposLctoAlertas,
    contHistOrfaosErros,
    alertasBase: alertas,
    errosBloqueantesBase: errosBloqueantes,
    balancete: options.balancete ?? null,
    deParaRules: options.deParaRules ?? [],
    loteConfigs,
  });
}

/**
 * Recalcula:
 * - Classificação de lote (caso o usuário edite a tabela de lotes)
 * - Filtro pelo período do Balancete (avisando sobre linhas fora dele)
 * - Saldo corrido estável por conta (ordenado por Data Lcto + ordemOriginal) a partir do Saldo Anterior do Balancete
 * - Três validações obrigatórias:
 *   a) Soma Débitos = Soma Créditos por documento (bloqueio global)
 *   b) Soma Débito/Crédito CT2 = Balancete por conta (bloqueia contas da folha; aviso nas demais)
 *   c) Último saldo corrido CT2 = Saldo Atual do Balancete por conta (bloqueia contas da folha; aviso nas demais)
 */
export function recomputeRazaoBalancesAndValidations(params: {
  nomeArquivo: string;
  todosLancamentos: RazaoLancamento[];
  formatoDetectado: 'ct2_45_colunas' | 'ctbr400_9_colunas';
  linhasBrutasLidas: number;
  contHistAnexados: number;
  partidasDobradasDesdobradas: number;
  linhasIgnoradasFiltroSaldoMoeda: number;
  outrosTiposLctoAlertas: { tipo: string; quantidade: number }[];
  contHistOrfaosErros: string[];
  alertasBase: string[];
  errosBloqueantesBase: string[];
  balancete: BalanceteData | null;
  deParaRules: DeParaRule[];
  loteConfigs: LoteConfig[];
}): RazaoData {
  const {
    nomeArquivo,
    todosLancamentos,
    formatoDetectado,
    linhasBrutasLidas,
    contHistAnexados,
    partidasDobradasDesdobradas,
    linhasIgnoradasFiltroSaldoMoeda,
    outrosTiposLctoAlertas,
    contHistOrfaosErros,
    alertasBase,
    errosBloqueantesBase,
    balancete,
    deParaRules,
    loteConfigs,
  } = params;

  const alertas = [...alertasBase];
  const errosBloqueantes = [...errosBloqueantesBase];

  // Atualizar classificação de lote com base na tabela de lotes atual (precedência sobre a regex)
  const updatedAll = todosLancamentos.map((l) => {
    const loteMeta = resolveLoteClassification(l.lote, loteConfigs);
    return {
      ...l,
      manual: loteMeta.manual,
      classificacaoLote: loteMeta.classificacao,
    };
  });

  // Determinar competência ativa (do Balancete se carregado, ou a mais frequente nos lançamentos)
  let competenciaAtiva = balancete?.competencia || '';
  if (!competenciaAtiva) {
    const compFreq = new Map<string, number>();
    for (const l of updatedAll) {
      if (l.competenciaDataLcto) {
        compFreq.set(l.competenciaDataLcto, (compFreq.get(l.competenciaDataLcto) ?? 0) + 1);
      }
    }
    let bestComp = '202609';
    let bestCount = 0;
    for (const [comp, count] of compFreq.entries()) {
      if (count > bestCount) {
        bestCount = count;
        bestComp = comp;
      }
    }
    competenciaAtiva = bestComp;
  }

  // Filtrar pelo período do Balancete (ou competência detectada) e avisar sobre linhas fora dele
  let linhasForaDoPeriodoBalancete = 0;
  const lancamentosPeriodo: RazaoLancamento[] = [];
  for (const l of updatedAll) {
    if (balancete && l.competenciaDataLcto && l.competenciaDataLcto !== balancete.competencia) {
      linhasForaDoPeriodoBalancete++;
    } else {
      lancamentosPeriodo.push({ ...l });
    }
  }

  if (linhasForaDoPeriodoBalancete > 0 && balancete) {
    alertas.push(
      `${linhasForaDoPeriodoBalancete} lançamento(s) com Data Lcto fora da competência do Balancete (${balancete.competencia.slice(4)}/${balancete.competencia.slice(0, 4)}) foram filtrados para evitar distorção do movimento mensal e duplicação do Saldo Anterior.`
    );
  }
  if (linhasIgnoradasFiltroSaldoMoeda > 0) {
    alertas.push(
      `${linhasIgnoradasFiltroSaldoMoeda} linha(s) ignorada(s) pelo filtro obrigatório (Tipo do Sld = 1 e Moeda Lancto = 01).`
    );
  }

  // Validação (a): Por documento (Filial + Data + Lote + Sub Lote + Numero Doc): soma Débitos = soma Créditos
  const docMap = new Map<string, CT2DocumentBalanceCheck>();
  for (const l of lancamentosPeriodo) {
    const key = l.chaveDocumento || `${l.filial}|${l.data}|${l.lote}|${l.sublote}|${l.documento}`;
    const existing = docMap.get(key) ?? {
      chaveDocumento: key,
      filial: l.filial,
      data: l.data,
      lote: l.lote,
      sublote: l.sublote,
      documento: l.documento,
      somaDebitoCents: 0,
      somaCreditoCents: 0,
      diferencaCents: 0,
      ok: true,
    };
    existing.somaDebitoCents += l.debitoCents;
    existing.somaCreditoCents += l.creditoCents;
    docMap.set(key, existing);
  }

  const validacoesDocumentos: CT2DocumentBalanceCheck[] = [];
  let bloqueioGlobalDocumentos = false;

  if (formatoDetectado === 'ct2_45_colunas') {
    for (const docCheck of docMap.values()) {
      docCheck.diferencaCents = docCheck.somaDebitoCents - docCheck.somaCreditoCents;
      docCheck.ok = Math.abs(docCheck.diferencaCents) === 0;
      validacoesDocumentos.push(docCheck);
      if (!docCheck.ok) {
        bloqueioGlobalDocumentos = true;
        errosBloqueantes.push(
          `Validação (a) BLOQUEANTE — Documento desbalanceado ${docCheck.lote}/${docCheck.sublote}/${docCheck.documento} (${docCheck.data}, Filial ${docCheck.filial}): Débitos (${(docCheck.somaDebitoCents / 100).toFixed(2)}) ≠ Créditos (${(docCheck.somaCreditoCents / 100).toFixed(2)}).`
        );
      }
    }
  }

  // Mapa de contas do Balancete para Saldo Anterior e validações (b) e (c)
  const balanceteByAccount = new Map<string, BalanceteLinha>();
  if (balancete) {
    for (const lb of balancete.linhas) {
      if (lb.classe === 'analitica') {
        balanceteByAccount.set(lb.contaNormalizada, lb);
      }
    }
  }

  // Contas ligadas à folha no De/Para (escopo de bloqueio para validações b e c)
  const contasFolhaDeParaSet = new Set<string>(
    deParaRules.map((r) => normalizeAccountCode(r.contaFormatada))
  );

  // Agrupar lançamentos por conta e ordenar de forma ESTÁVEL por Data Lcto + ordemOriginal
  const lancamentosPorContaMap: Record<string, RazaoLancamento[]> = {};
  for (const l of lancamentosPeriodo) {
    if (!lancamentosPorContaMap[l.contaNormalizada]) {
      lancamentosPorContaMap[l.contaNormalizada] = [];
    }
    lancamentosPorContaMap[l.contaNormalizada].push(l);
  }

  const toSortableDateNum = (ddmmyyyy: string): number => {
    const m = ddmmyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return 0;
    return parseInt(`${m[3]}${m[2]}${m[1]}`, 10);
  };

  const saldoProvisorioSemBalancete = !balancete;
  const validacoesSaldoCorrido: RazaoData['validacoesSaldoCorrido'] = [];
  const validacoesContasBalancete: CT2AccountBalanceCheck[] = [];
  const lancamentosOrdenadosFinal: RazaoLancamento[] = [];

  const sortedAccountKeys = Object.keys(lancamentosPorContaMap).sort();
  for (const contaNorm of sortedAccountKeys) {
    const lista = lancamentosPorContaMap[contaNorm];
    // Ordenação estável: Data cronológica + posição ORIGINAL da linha no arquivo (nunca usa chave de lote como desempate)
    lista.sort((a, b) => {
      const da = toSortableDateNum(a.data);
      const db = toSortableDateNum(b.data);
      if (da !== db) return da - db;
      return a.ordemOriginal - b.ordemOriginal;
    });

    const linhaBal = balanceteByAccount.get(contaNorm);
    const saldoInicialSigned = linhaBal ? linhaBal.saldoAnteriorSignedCents : 0;

    let runningSigned = saldoInicialSigned;
    let somaDebConta = 0;
    let somaCredConta = 0;

    for (const item of lista) {
      somaDebConta += item.debitoCents;
      somaCredConta += item.creditoCents;
      if (formatoDetectado === 'ct2_45_colunas' || linhaBal || item.saldoAtualAbsCents === 0) {
        runningSigned = runningSigned + item.debitoCents - item.creditoCents;
        item.saldoAtualSignedCents = runningSigned;
        item.saldoAtualAbsCents = Math.abs(runningSigned);
        item.saldoAtualDC = runningSigned === 0 ? '' : runningSigned > 0 ? 'D' : 'C';
      } else {
        runningSigned = item.saldoAtualSignedCents;
      }
      item.saldoProvisorio = saldoProvisorioSemBalancete;
      lancamentosOrdenadosFinal.push(item);
    }

    validacoesSaldoCorrido.push({
      conta: formatAccountMask(contaNorm),
      ok: true,
    });

    if (linhaBal) {
      const vinculadaFolha = contasFolhaDeParaSet.has(contaNorm);
      const movimentoOk =
        Math.abs(somaDebConta - linhaBal.debitoCents) <= 1 &&
        Math.abs(somaCredConta - linhaBal.creditoCents) <= 1;
      const saldoFinalOk = Math.abs(runningSigned - linhaBal.saldoAtualSignedCents) <= 1;
      const bothOk = movimentoOk && saldoFinalOk;
      const bloqueante = vinculadaFolha && !bothOk;

      let detalhe: string | undefined;
      if (!bothOk) {
        detalhe = `Conta ${linhaBal.contaFormatada} (${linhaBal.descricao}): CT2 [Déb ${(somaDebConta / 100).toFixed(2)} | Créd ${(somaCredConta / 100).toFixed(2)} | Sld Final ${(Math.abs(runningSigned) / 100).toFixed(2)}] × Balancete [Déb ${(linhaBal.debitoCents / 100).toFixed(2)} | Créd ${(linhaBal.creditoCents / 100).toFixed(2)} | Sld Atual ${(linhaBal.saldoAtualAbsCents / 100).toFixed(2)}].`;
        if (bloqueante) {
          errosBloqueantes.push(`Validação (b/c) BLOQUEANTE em conta da folha — ${detalhe}`);
        } else {
          alertas.push(`Aviso (conta fora do De/Para da folha) — ${detalhe}`);
        }
      }

      validacoesContasBalancete.push({
        contaNormalizada: contaNorm,
        contaFormatada: linhaBal.contaFormatada,
        descricao: linhaBal.descricao,
        vinculadaFolha,
        debitoCT2Cents: somaDebConta,
        creditoCT2Cents: somaCredConta,
        debitoBalanceteCents: linhaBal.debitoCents,
        creditoBalanceteCents: linhaBal.creditoCents,
        ultimoSaldoCorridoCT2SignedCents: runningSigned,
        saldoAtualBalanceteSignedCents: linhaBal.saldoAtualSignedCents,
        movimentoOk,
        saldoFinalOk,
        bloqueante,
        detalhe,
      });
    }
  }

  const totalDebitosCents = lancamentosOrdenadosFinal.reduce((a, b) => a + b.debitoCents, 0);
  const totalCreditosCents = lancamentosOrdenadosFinal.reduce((a, b) => a + b.creditoCents, 0);

  const resumoImportacao: CT2ImportSummary = {
    formatoDetectado,
    linhasBrutasLidas,
    contHistAnexados,
    partidasDobradasDesdobradas,
    lancamentosGeradosTotal: updatedAll.length,
    lancamentosNoPeriodoAtivo: lancamentosOrdenadosFinal.length,
    linhasIgnoradasFiltroSaldoMoeda,
    linhasForaDoPeriodoBalancete,
    outrosTiposLctoAlertas,
    contHistOrfaosErros,
    alertas,
    errosBloqueantes,
    totalDebitosCents,
    totalCreditosCents,
    saldoProvisorioSemBalancete,
  };

  return {
    nomeArquivo,
    competencia: competenciaAtiva,
    lancamentos: lancamentosOrdenadosFinal,
    todosLancamentosImportados: updatedAll,
    lancamentosPorContaMap,
    contasPresentes: sortedAccountKeys,
    validacoesSaldoCorrido,
    validacoesDocumentos,
    validacoesContasBalancete,
    resumoImportacao,
    bloqueioGlobalDocumentos: bloqueioGlobalDocumentos || contHistOrfaosErros.length > 0,
  };
}

export function recomputeExistingRazaoData(
  razao: RazaoData,
  balancete: BalanceteData | null,
  deParaRules: DeParaRule[],
  loteConfigs: LoteConfig[]
): RazaoData {
  const prevResumo = razao.resumoImportacao;
  const todos = razao.todosLancamentosImportados ?? razao.lancamentos;
  return recomputeRazaoBalancesAndValidations({
    nomeArquivo: razao.nomeArquivo,
    todosLancamentos: todos,
    formatoDetectado: prevResumo?.formatoDetectado ?? 'ctbr400_9_colunas',
    linhasBrutasLidas: prevResumo?.linhasBrutasLidas ?? todos.length,
    contHistAnexados: prevResumo?.contHistAnexados ?? 0,
    partidasDobradasDesdobradas: prevResumo?.partidasDobradasDesdobradas ?? 0,
    linhasIgnoradasFiltroSaldoMoeda: prevResumo?.linhasIgnoradasFiltroSaldoMoeda ?? 0,
    outrosTiposLctoAlertas: prevResumo?.outrosTiposLctoAlertas ?? [],
    contHistOrfaosErros: prevResumo?.contHistOrfaosErros ?? [],
    alertasBase: [],
    errosBloqueantesBase: [...(prevResumo?.contHistOrfaosErros ?? [])],
    balancete,
    deParaRules,
    loteConfigs,
  });
}

/**
 * Parser legado para planilhas CTBR400 de 9 colunas (CONTA | DATA | LOTE/SUB/DOC/LINHA | HISTORICO | C/PARTIDA | FILIAL | DEBITO | CREDITO | SALDO ATUAL)
 */
function parseLegacyCTBR400Matrix(
  rows: unknown[][],
  headerRowIndex: number,
  options: {
    fileName: string;
    loteConfigs?: LoteConfig[];
    balancete?: BalanceteData | null;
    deParaRules?: DeParaRule[];
  }
): RazaoData {
  const loteConfigs = options.loteConfigs ?? DEFAULT_LOTE_CONFIGS;
  const lancamentos: RazaoLancamento[] = [];
  let seq = 1;
  let linhasBrutasLidas = 0;

  for (let i = Math.max(0, headerRowIndex + 1); i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 7) continue;

    const rawConta = String(r[0] ?? '').trim();
    const contaNorm = normalizeAccountCode(rawConta);
    if (contaNorm.length < 7 || /^CONTA/i.test(rawConta)) continue;

    const parsedDate = parseExcelDateToBR(r[1]);
    if (!parsedDate) continue;

    linhasBrutasLidas++;
    const rawChave = String(r[2] ?? '').trim().toUpperCase().replace(/[\/\s-]/g, '').padStart(18, '0');
    const lote = rawChave.slice(0, 6);
    const sublote = rawChave.slice(6, 9);
    const documento = rawChave.slice(9, 15);
    const linha = rawChave.slice(15, 18);

    const historico = String(r[3] ?? '').replace(/\s+/g, ' ').trim();
    const rawCPartida = String(r[4] ?? '').trim();
    const cPartidaNorm = normalizeAccountCode(rawCPartida);
    const filialOrigem = String(r[5] ?? '').trim().padStart(4, '0');

    const debitoCents = Math.abs(parseBRLToCents(r[6] as string | number | undefined));
    const creditoCents = Math.abs(parseBRLToCents(r[7] as string | number | undefined));
    const saldoParsed = parseSignedBalanceCents(r[8] as string | number | undefined);

    const meta = classifyRazaoHistorico(historico, lote);
    const loteMeta = resolveLoteClassification(lote, loteConfigs);
    const ordem = seq++;

    lancamentos.push({
      id: `ct2-row-${ordem}`,
      ordemOriginal: ordem,
      contaNormalizada: contaNorm,
      contaFormatada: formatAccountMask(contaNorm),
      data: parsedDate.data,
      competenciaDataLcto: parsedDate.competencia,
      chaveDocumento: `${filialOrigem}|${parsedDate.data}|${lote}|${sublote}|${documento}`,
      chaveCT2: rawChave,
      lote,
      sublote,
      documento,
      linha,
      manual: loteMeta.manual,
      classificacaoLote: loteMeta.classificacao,
      historico,
      historicoAnonimizado: anonymizePII(historico),
      contraPartidaNormalizada: cPartidaNorm,
      contraPartidaFormatada: formatAccountMask(cPartidaNorm),
      filial: filialOrigem,
      filialOrigem,
      debitoCents,
      creditoCents,
      valorSignedCents: debitoCents - creditoCents,
      saldoAtualSignedCents: saldoParsed.signedCents,
      saldoAtualAbsCents: saldoParsed.absCents,
      saldoAtualDC: saldoParsed.dc,
      ...meta,
    });
  }

  return recomputeRazaoBalancesAndValidations({
    nomeArquivo: options.fileName,
    todosLancamentos: lancamentos,
    formatoDetectado: 'ctbr400_9_colunas',
    linhasBrutasLidas,
    contHistAnexados: 0,
    partidasDobradasDesdobradas: 0,
    linhasIgnoradasFiltroSaldoMoeda: 0,
    outrosTiposLctoAlertas: [],
    contHistOrfaosErros: [],
    alertasBase: [],
    errosBloqueantesBase: [],
    balancete: options.balancete ?? null,
    deParaRules: options.deParaRules ?? [],
    loteConfigs,
  });
}

/**
 * Executa a leitura da planilha CT2 (.XLSX / .CSV) utilizando Web Worker inline para extração/pré-processamento
 * sem travar a interface (compatível com file:// por duplo clique, com fallback transparente na thread principal).
 */
export async function parseRazaoXlsx(
  file: File | { name: string; arrayBuffer: () => Promise<ArrayBuffer> },
  options?: {
    loteConfigs?: LoteConfig[];
    balancete?: BalanceteData | null;
    deParaRules?: DeParaRule[];
    onProgress?: (percent: number, stage: string) => void;
  }
): Promise<RazaoData> {
  options?.onProgress?.(5, 'Carregando arquivo XLSX na memória...');
  const buffer = await file.arrayBuffer();

  // Usamos um Web Worker inline para ceder ciclos de UI e reportar progresso em arquivos grandes
  await yieldToBrowserWithInlineWorker();

  options?.onProgress?.(15, 'Descompactando células da planilha...');
  const wb = XLSX.read(buffer, { type: 'array', raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = extractRawMatrixFromSheet(sheet);

  const result = parseCT2Matrix(matrix, {
    fileName: file.name,
    loteConfigs: options?.loteConfigs,
    balancete: options?.balancete,
    deParaRules: options?.deParaRules,
    onProgress: options?.onProgress,
  });

  options?.onProgress?.(100, 'Importação CT2 concluída.');
  return result;
}

/**
 * Cria e executa um Web Worker inline (via Blob URL) para validar e processar em segundo plano,
 * funcionando inclusive quando o arquivo .HTML é aberto via duplo clique (file://).
 */
function yieldToBrowserWithInlineWorker(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const workerCode = `self.onmessage = function() { self.postMessage('ok'); };`;
      const blob = new Blob([workerCode], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const w = new Worker(url);
      w.onmessage = () => {
        w.terminate();
        URL.revokeObjectURL(url);
        resolve();
      };
      w.onerror = () => {
        w.terminate();
        URL.revokeObjectURL(url);
        resolve();
      };
      w.postMessage('start');
    } catch {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * TESTE DE ACEITE AUTOMÁTICO (Fixture oficial de 24 linhas brutas da tabela CT2)
 */
export function runCT2AcceptanceTest(loteConfigs: LoteConfig[] = DEFAULT_LOTE_CONFIGS): CT2AcceptanceTestResult {
  const lines = CT2_ACCEPTANCE_FIXTURE_TSV.split(/\r?\n/).filter((l) => l.length > 0);
  const matrix = lines.map((line) => line.split('\t'));

  const parsed = parseCT2Matrix(matrix, {
    fileName: 'FIXTURE_ACEITE_CT2_24_LINHAS.xlsx',
    loteConfigs,
    balancete: null,
    deParaRules: [],
  });

  const resumo = parsed.resumoImportacao!;
  const lancs = parsed.lancamentos;

  // Mapear fechamento dos 5 documentos
  const docTotals: Record<string, { debitoCents: number; creditoCents: number; ok: boolean }> = {};
  for (const d of parsed.validacoesDocumentos ?? []) {
    const shortKey = `${d.lote}/${d.sublote}/${d.documento}`;
    docTotals[shortKey] = {
      debitoCents: d.somaDebitoCents,
      creditoCents: d.somaCreditoCents,
      ok: d.ok,
    };
  }

  const check1Ok =
    resumo.linhasBrutasLidas === 24 &&
    lancs.length === 17 &&
    resumo.contHistAnexados === 8 &&
    resumo.partidasDobradasDesdobradas === 1;

  const check2Ok =
    resumo.totalDebitosCents === 8729620 && resumo.totalCreditosCents === 8729620;

  const check3Ok =
    docTotals['0000BR/001/000002']?.debitoCents === 12000 &&
    docTotals['0000BR/001/000002']?.ok === true &&
    docTotals['0000BR/001/000003']?.debitoCents === 301300 &&
    docTotals['0000BR/001/000003']?.ok === true &&
    docTotals['0000BR/001/000004']?.debitoCents === 402400 &&
    docTotals['0000BR/001/000004']?.ok === true &&
    docTotals['008810/001/000001']?.debitoCents === 2709200 &&
    docTotals['008810/001/000001']?.ok === true &&
    docTotals['008820/001/000001']?.debitoCents === 5304720 &&
    docTotals['008820/001/000001']?.ok === true;

  // Primeiro lançamento na ordem original do arquivo (ordemOriginal === 1)
  const sortedByOrdem = [...lancs].sort((a, b) => a.ordemOriginal - b.ordemOriginal);
  const firstEntry = sortedByOrdem[0];
  const tenthRowEntry = sortedByOrdem.find((l) => l.lote === '008810' && l.debitoCents === 1065315);

  const check4Ok = Boolean(
    firstEntry?.historico.startsWith('VALOR REF. A NF: 000017235 POSTO DE MOLAS RDR LTDA') &&
      tenthRowEntry?.historico.startsWith('COMPRA DE SUCATA FERROSA EMARANHADO VERG NFE 000000346')
  );

  const lotes0000BR = lancs.filter((l) => l.lote === '0000BR');
  const lotes8810_8820 = lancs.filter((l) => l.lote === '008810' || l.lote === '008820');
  const check5Ok =
    lotes0000BR.length > 0 &&
    lotes0000BR.every((l) => l.manual === true) &&
    lotes8810_8820.length > 0 &&
    lotes8810_8820.every((l) => l.manual === false);

  const debitos8810 = lancs.filter((l) => l.lote === '008810' && l.debitoCents > 0);
  const check6Ok =
    debitos8810.length === 6 &&
    debitos8810.every((l) => l.contraPartidaNormalizada === '21010202829');

  const doc000003Entries = lancs.filter((l) => l.lote === '0000BR' && l.documento === '000003');
  const check7Ok =
    doc000003Entries.length === 2 &&
    doc000003Entries.every(
      (l) => l.filialOrigem === '0101' && l.origemEstruturada?.lpCodigo === '530'
    );

  const checks = [
    {
      id: 'chk-1',
      titulo: '1. Contagem de Linhas, Cont.Hist e Partida Dobrada',
      esperado: '24 brutas -> 17 lançamentos (8 Cont.Hist, 1 Partida Dobrada)',
      encontrado: `${resumo.linhasBrutasLidas} brutas -> ${lancs.length} lançamentos (${resumo.contHistAnexados} Cont.Hist, ${resumo.partidasDobradasDesdobradas} Partida Dobrada)`,
      ok: check1Ok,
    },
    {
      id: 'chk-2',
      titulo: '2. Total Geral de Débitos e Créditos',
      esperado: 'Débitos = R$ 87.296,20 | Créditos = R$ 87.296,20',
      encontrado: `Débitos = R$ ${(resumo.totalDebitosCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Créditos = R$ ${(resumo.totalCreditosCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      ok: check2Ok,
    },
    {
      id: 'chk-3',
      titulo: '3. Fechamento Individual dos 5 Documentos',
      esperado: '000002=120,00; 000003=3.013,00; 000004=4.024,00; 008810=27.092,00; 008820=53.047,20',
      encontrado: `000002=${((docTotals['0000BR/001/000002']?.debitoCents ?? 0) / 100).toFixed(2)}; 000003=${((docTotals['0000BR/001/000003']?.debitoCents ?? 0) / 100).toFixed(2)}; 000004=${((docTotals['0000BR/001/000004']?.debitoCents ?? 0) / 100).toFixed(2)}; 008810=${((docTotals['008810/001/000001']?.debitoCents ?? 0) / 100).toFixed(2)}; 008820=${((docTotals['008820/001/000001']?.debitoCents ?? 0) / 100).toFixed(2)}`,
      ok: check3Ok,
    },
    {
      id: 'chk-4',
      titulo: '4. Emenda de Cont.Hist (corte no meio da palavra e na coluna 41)',
      esperado: 'Inicia com "VALOR REF. A NF: 000017235 POSTO DE MOLAS RDR LTDA" e "...EMARANHADO VERG NFE 000000346"',
      encontrado: `"${firstEntry?.historico.slice(0, 52) ?? ''}" | "${tenthRowEntry?.historico.slice(25, 62) ?? ''}"`,
      ok: check4Ok,
    },
    {
      id: 'chk-5',
      titulo: '5. Identificação de Lote Manual (0000BR = true; 008810/008820 = false)',
      esperado: '0000BR manual=true | 008810 e 008820 manual=false',
      encontrado: `0000BR manual=${lotes0000BR.every((l) => l.manual)} | 008810/008820 manual=${lotes8810_8820.some((l) => l.manual)}`,
      ok: check5Ok,
    },
    {
      id: 'chk-6',
      titulo: '6. Contrapartida Determinística do Documento 008810/001/000001',
      esperado: '6 débitos com C/PARTIDA = 21010202829',
      encontrado: `${debitos8810.length} débitos com C/PARTIDA = ${Array.from(new Set(debitos8810.map((d) => d.contraPartidaNormalizada))).join(', ')}`,
      ok: check6Ok,
    },
    {
      id: 'chk-7',
      titulo: '7. Extração Estruturada de Origem (Documento 000003)',
      esperado: 'Filial de Origem (XORIG) = 0101 e LP = 530 (sem contaminar histórico)',
      encontrado: `Filial Origem = ${doc000003Entries[0]?.filialOrigem ?? ''} | LP = ${doc000003Entries[0]?.origemEstruturada?.lpCodigo ?? ''} | Hist = "${doc000003Entries[0]?.historico ?? ''}"`,
      ok: check7Ok,
    },
  ];

  return {
    passedAll: checks.every((c) => c.ok),
    linhasBrutas: resumo.linhasBrutasLidas,
    lancamentosGerados: lancs.length,
    contHistAnexados: resumo.contHistAnexados,
    partidasDobradas: resumo.partidasDobradasDesdobradas,
    totalDebitosCents: resumo.totalDebitosCents,
    totalCreditosCents: resumo.totalCreditosCents,
    documentosTotais: docTotals,
    primeiroHistorico: firstEntry?.historico ?? '',
    decimoHistorico: tenthRowEntry?.historico ?? '',
    checks,
  };
}

/**
 * Converte a fixture de 24 linhas CT2 em RazaoData completo caso o usuário queira carregá-la no app.
 */
export function buildFixture24RowsRazaoData(
  loteConfigs: LoteConfig[] = DEFAULT_LOTE_CONFIGS,
  balancete: BalanceteData | null = null,
  deParaRules: DeParaRule[] = []
): RazaoData {
  const lines = CT2_ACCEPTANCE_FIXTURE_TSV.split(/\r?\n/).filter((l) => l.length > 0);
  const matrix = lines.map((line) => line.split('\t'));
  return parseCT2Matrix(matrix, {
    fileName: 'CT2_TRECHO_REAL_24_LINHAS_092026.xlsx',
    loteConfigs,
    balancete,
    deParaRules,
  });
}

/**
 * 4. Parser determinístico do Plano de Contas (PDF CTBR010 ou Planilha)
 */
export async function parsePlanoContasFile(
  file: File | { name: string; arrayBuffer: () => Promise<ArrayBuffer> }
): Promise<PlanoContasData> {
  const nameLower = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (nameLower.endsWith('.xlsx') || nameLower.endsWith('.xls') || nameLower.endsWith('.csv')) {
    const wb = XLSX.read(buffer, { type: 'array', raw: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: '' });
    const itens: PlanoContaItem[] = [];
    for (const r of rows) {
      const cod = String(r[0] ?? '').trim();
      const norm = normalizeAccountCode(cod);
      if (norm.length < 5) continue;
      const desc = String(r[1] ?? '').trim();
      const classeStr = String(r[2] ?? '').toUpperCase();
      itens.push({
        contaFormatada: cod.includes('.') ? cod : formatAccountMask(norm),
        contaNormalizada: norm,
        descricao: desc,
        classe: classeStr.includes('SINT') || norm.length < 11 ? 'sintetica' : 'analitica',
        condicaoNormal: norm.startsWith('2') || norm.startsWith('3') ? 'credora' : 'devedora',
      });
    }
    return { nomeArquivo: file.name, itens };
  }

  const lines = await extractPdfVisualLines(buffer);
  const itens: PlanoContaItem[] = [];
  for (const ln of lines) {
    const m = ln.text.match(/^([1-9](?:\.\d+){2,5})\s+(?:\d+\s+)?(.+?)\s+(Sintetica|Analitica)\s+(Devedora|Credora)/i);
    if (m) {
      const [, cod, desc, classe, cond] = m;
      const norm = normalizeAccountCode(cod);
      itens.push({
        contaFormatada: cod.trim(),
        contaNormalizada: norm,
        descricao: desc.trim(),
        classe: classe.toLowerCase().startsWith('sint') ? 'sintetica' : 'analitica',
        condicaoNormal: cond.toLowerCase().startsWith('cred') ? 'credora' : 'devedora',
      });
    }
  }
  return { nomeArquivo: file.name, itens };
}
