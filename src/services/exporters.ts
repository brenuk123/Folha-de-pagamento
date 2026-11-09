import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AccountReconciliationResult,
  DeParaRule,
  ExpenseDoubleEntryCheck,
  FolhaData,
  PendenciaAuditRecord,
  RazaoData,
} from '../types/reconciliation';
import { formatCentsBRL, formatSignedCentsDC } from '../utils/money';

/**
 * Exporta o Razão Contábil de Setembro/2026 no layout exato do TOTVS Protheus ("Lançamentos Contábeis"):
 * Linha 1: Título
 * Linha 2: Cabeçalho CONTA | DATA | LOTE/SUB/DOC/LINHA | HISTORICO | C/PARTIDA | FILIAL DE ORIGEM | DEBITO | CREDITO | SALDO ATUAL
 * Contempla as contas 2.1.0.10.400.001 a 015 e 1.1.0.60.300.xxx.
 */
export function exportRazaoSetembro2026Xlsx(razao: RazaoData, anonymize = false): void {
  const rows: (string | number)[][] = [
    ['TOTVS PROTHEUS - CTBR400 - LANCAMENTOS CONTABEIS (RAZAO ANALITICO) - COMPETENCIA 09/2026'],
    [
      'CONTA',
      'DATA',
      'LOTE/SUB/DOC/LINHA',
      'HISTORICO',
      'C/PARTIDA',
      'FILIAL DE ORIGEM',
      'DEBITO',
      'CREDITO',
      'SALDO ATUAL',
    ],
  ];

  for (const l of razao.lancamentos) {
    rows.push([
      l.contaNormalizada, // Sem pontos conforme layout real do Protheus (ex: 21010400003)
      l.data,
      l.chaveCT2, // 18 dígitos preservados como texto
      anonymize ? l.historicoAnonimizado : l.historico,
      l.contraPartidaFormatada, // Com pontos conforme layout real (ex: 4.1.0.10.500.001)
      l.filialOrigem,
      l.debitoCents === 0 ? '–' : formatCentsBRL(l.debitoCents),
      l.creditoCents === 0 ? '–' : formatCentsBRL(l.creditoCents),
      formatSignedCentsDC(l.saldoAtualSignedCents),
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Lancamentos Contabeis');
  XLSX.writeFile(wb, `RAZAO_CONTABIL_CT2_SETEMBRO_2026.xlsx`);
}

/**
 * Exporta a Planilha Completa de Conciliação com 6 abas:
 * 1. Resumo
 * 2. Conciliação por Conta
 * 3. Pendências e Status de Auditoria
 * 4. Lançamentos sem Match
 * 5. De-Para Utilizado
 * 6. Sugestões de Ajuste (Formato TOTVS CT2 + Formato Auditoria)
 */
export function exportSixSheetReconciliationWorkbook(params: {
  empresa: string;
  competencia: string;
  folha: FolhaData | null;
  resultados: AccountReconciliationResult[];
  conferenciaDespesas: ExpenseDoubleEntryCheck[];
  dePara: DeParaRule[];
  pendenciasMap: Record<string, PendenciaAuditRecord>;
}): void {
  const { empresa, competencia, folha, resultados, conferenciaDespesas, dePara, pendenciasMap } = params;
  const wb = XLSX.utils.book_new();

  // ABA 1: Resumo Executivo e Conferência da Despesa
  const conciliadas = resultados.filter((r) => r.statusConciliacao === 'conciliada').length;
  const divergentes = resultados.filter((r) => r.statusConciliacao === 'divergente').length;
  const semVinculo = resultados.filter(
    (r) => r.statusConciliacao === 'sem_vinculo_validado' || r.statusConciliacao === 'sem_fonte_folha'
  ).length;

  const resumoRows: (string | number)[][] = [
    ['RELATORIO DE CONCILIACAO CONTABIL DA FOLHA DE PAGAMENTO - TOTVS PROTHEUS'],
    ['Empresa:', empresa, 'Competência:', `${competencia.slice(4)}/${competencia.slice(0, 4)}`],
    ['Data de Pagamento Folha:', folha?.dataPagamento ?? 'N/D', 'Gerado em:', new Date().toLocaleString('pt-BR')],
    [],
    ['INDICADORES DE FECHAMENTO'],
    ['Total de Contas Analisadas', resultados.length],
    ['Contas Conciliadas (OK)', conciliadas],
    ['Contas com Divergência', divergentes],
    ['Contas sem Vínculo Validado / Sem Fonte na Folha Sintética', semVinculo],
    [],
    ['RESUMO DA FOLHA SINTETICA (GPER106 - TOTAL EMPRESA)'],
    ['Total Proventos (R$)', folha ? formatCentsBRL(folha.totalEmpresa.totalProventosCents) : '0,00'],
    ['Total Descontos (R$)', folha ? formatCentsBRL(folha.totalEmpresa.totalDescontosCents) : '0,00'],
    ['Líquido a Receber - Verba 999 (R$)', folha ? formatCentsBRL(folha.totalEmpresa.liquidoVerba999Cents) : '0,00'],
    [],
    ['CONFERENCIA DO LADO DA DESPESA (PARTIDA DOBRADA VIA C/PARTIDA)'],
    ['Grupo de Despesa', 'Soma Despesa Balancete (R$)', 'Referência Folha (R$)', 'Diferença (R$)', 'Status', 'Observação'],
    ...conferenciaDespesas.map((cd) => [
      cd.grupoNome,
      formatCentsBRL(cd.somaDespesaLiquidaCents),
      formatCentsBRL(cd.valorPassivoFolhaReferenciaCents),
      formatCentsBRL(cd.diferencaCents),
      cd.status.toUpperCase(),
      cd.observacao,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumoRows), '1_Resumo');

  // ABA 2: Conciliação por Conta
  const contasRows: (string | number)[][] = [
    [
      'CONTA FORMATADA',
      'CONTA NORMALIZADA',
      'DESCRICAO',
      'GRUPO',
      'VINCULO DE/PARA',
      'VALOR FOLHA (R$)',
      'SALDO ANTERIOR',
      'DEBITO BALANCETE (R$)',
      'CREDITO BALANCETE (R$)',
      'SALDO ATUAL',
      'DIF. CREDITO / APROPRIACAO (R$)',
      'DIF. DEBITO / BAIXA (R$)',
      'EFEITO LIQUIDO SALDO (R$)',
      'STATUS CONCILIACAO',
    ],
    ...resultados.map((r) => [
      r.contaFormatada,
      r.contaNormalizada,
      r.descricao,
      r.grupoContabil,
      r.statusVinculoDePara,
      formatCentsBRL(r.valorFolhaEsperadoCents),
      formatSignedCentsDC(r.saldoAnteriorSignedCents),
      formatCentsBRL(r.debitoBalanceteCents),
      formatCentsBRL(r.creditoBalanceteCents),
      formatSignedCentsDC(r.saldoAtualSignedCents),
      formatCentsBRL(r.diferencaMovimentoApropriacaoCents),
      formatCentsBRL(r.diferencaBaixaDebitoCents),
      formatCentsBRL(r.diferencaSaldoLiquidoCents),
      r.statusConciliacao.toUpperCase(),
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(contasRows), '2_Conciliacao_Contas');

  // ABA 3: Pendências Detalhadas e Controle de Status
  const pendenciasRows: (string | number)[][] = [
    [
      'CONTA',
      'DESCRICAO',
      'STATUS CONCILIACAO',
      'DIF. APROPRIACAO (R$)',
      'DIF. BAIXA (R$)',
      'CLASSIFICACAO',
      'EXPLICACAO OBJETIVA DA AUDITORIA',
      'STATUS AUDITORIA',
      'COMENTARIO DO AUDITOR',
      'RESPONSAVEL',
      'DATA ATUALIZACAO',
    ],
    ...resultados
      .filter((r) => r.statusConciliacao !== 'conciliada' || r.statusVinculoDePara === 'conta_mista')
      .map((r) => {
        const key = `${empresa}_${competencia}_${r.contaNormalizada}`;
        const audit = pendenciasMap[key];
        return [
          r.contaFormatada,
          r.descricao,
          r.statusConciliacao.toUpperCase(),
          formatCentsBRL(r.diferencaMovimentoApropriacaoCents),
          formatCentsBRL(r.diferencaBaixaDebitoCents),
          r.classificacaoDivergencia.join(' | '),
          r.explicacaoObjetiva,
          (audit?.status ?? 'aberta').toUpperCase(),
          audit?.comentario ?? 'Pendente de revisão',
          audit?.usuarioAuditor ?? 'Auditoria Contábil',
          audit?.atualizadoEm ?? '-',
        ];
      }),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pendenciasRows), '3_Pendencias_Detalhadas');

  // ABA 4: Lançamentos do Razão sem Match / Incompatíveis
  const semMatchRows: (string | number)[][] = [
    [
      'CONTA',
      'DATA',
      'CHAVE CT2 (18 DIGITOS)',
      'LOTE',
      'FILIAL ORIGEM',
      'HISTORICO',
      'C/PARTIDA',
      'DEBITO (R$)',
      'CREDITO (R$)',
      'STATUS MATCH',
      'DIAGNOSTICO DO LANCAMENTO',
    ],
  ];
  for (const r of resultados) {
    for (const item of r.itensRazaoAnalisados) {
      if (item.statusMatch !== 'explicado') {
        const l = item.lancamento;
        semMatchRows.push([
          l.contaFormatada,
          l.data,
          l.chaveCT2,
          l.lote,
          l.filialOrigem,
          l.historico,
          l.contraPartidaFormatada,
          formatCentsBRL(l.debitoCents),
          formatCentsBRL(l.creditoCents),
          item.statusMatch.toUpperCase(),
          item.motivoMatch,
        ]);
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(semMatchRows), '4_Lancamentos_Sem_Match');

  // ABA 5: De-Para Utilizado (Com Tipo de Verba)
  const deParaRows: (string | number)[][] = [
    [
      'VERBA CODIGO',
      'DESCRICAO VERBA',
      'TIPO DE VERBA (CLASSIFICACAO)',
      'CONTA CONTABIL',
      'CONTA NORMALIZADA',
      'DESCRICAO CONTA',
      'FILIAL OPCIONAL',
      'CENTRO DE CUSTO',
      'STATUS DO VINCULO',
      'OBSERVACAO DE AUDITORIA',
    ],
    ...dePara.map((d) => [
      d.verbaCodigo,
      d.verbaDescricao,
      d.tipoVerba,
      d.contaFormatada,
      d.contaNormalizada,
      d.contaDescricao,
      d.filialOpcional || 'TODAS',
      d.centroCustoOpcional || 'TODOS',
      d.statusVinculo,
      d.observacaoAuditoria || '',
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(deParaRows), '5_De_Para_Utilizado');

  // ABA 6: Sugestões de Ajuste (Ambos os formatos: Layout TOTVS CT2 + Demonstrativo Legível para Auditoria)
  const allSuggestions = resultados.flatMap((r) =>
    r.sugestoesAjusteCT2.map((s) => ({ contaOrigem: r.contaFormatada, ...s }))
  );

  const ajustesRows: (string | number)[][] = [
    ['BLOCO A - LAYOUT PADRAO DE IMPORTACAO TOTVS PROTHEUS (TABELA CT2)'],
    [
      'CT2_FILIAL',
      'CT2_DATA',
      'CT2_LOTE',
      'CT2_SBLOTE',
      'CT2_DOC',
      'CT2_LINHA',
      'CT2_DC',
      'CT2_DEBITO',
      'CT2_CREDIT',
      'CT2_VALOR',
      'CT2_HIST',
    ],
    ...allSuggestions.map((s, idx) => [
      s.filial,
      s.dataLancamento,
      s.loteSugerido,
      '001',
      String(idx + 1).padStart(6, '0'),
      s.sequencia,
      '3', // Partida dobrada no CT2
      s.contaDebitoNormalizada,
      s.contaCreditoNormalizada,
      formatCentsBRL(s.valorCents),
      s.historicoPadraoCT2,
    ]),
    [],
    ['BLOCO B - DEMONSTRATIVO CONTABIL LEGIVEL PARA AUDITORIA E APROVACAO'],
    [
      'CONTA AUDITADA',
      'DATA',
      'FILIAL',
      'DEBITO (CONTA FORMATADA)',
      'CREDITO (CONTA FORMATADA)',
      'VALOR DO AJUSTE (R$)',
      'HISTORICO CONTABIL',
      'FUNDAMENTACAO TECNICA DA AUDITORIA',
    ],
    ...allSuggestions.map((s) => [
      s.contaOrigem,
      s.dataLancamento,
      s.filial,
      s.contaDebitoFormatada,
      s.contaCreditoFormatada,
      formatCentsBRL(s.valorCents, true),
      s.historicoPadraoCT2,
      s.justificativaAuditoria,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ajustesRows), '6_Sugestoes_Ajuste_CT2');

  XLSX.writeFile(wb, `CONCILIACAO_FOLHA_PROTHEUS_${competencia}.xlsx`);
}

/**
 * Exporta o Relatório Executivo de Fechamento em PDF pronto para assinatura.
 */
export function exportExecutiveAuditPdf(params: {
  empresa: string;
  competencia: string;
  folha: FolhaData | null;
  resultados: AccountReconciliationResult[];
  pendenciasMap: Record<string, PendenciaAuditRecord>;
}): void {
  const { empresa, competencia, folha, resultados, pendenciasMap } = params;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFontSize(14);
  doc.text('RELATORIO EXECUTIVO DE CONCILIACAO CONTABIL DA FOLHA (TOTVS PROTHEUS)', 14, 15);
  doc.setFontSize(9);
  doc.text(
    `Empresa: ${empresa}   |   Competência: ${competencia.slice(4)}/${competencia.slice(0, 4)}   |   Pagamento Folha: ${folha?.dataPagamento ?? 'N/D'}   |   Emissão: ${new Date().toLocaleString('pt-BR')}`,
    14,
    21
  );

  autoTable(doc, {
    startY: 26,
    head: [
      [
        'Conta',
        'Descrição',
        'Folha (R$)',
        'Saldo Ant.',
        'Débito (R$)',
        'Crédito (R$)',
        'Saldo Atual',
        'Dif. Créd.',
        'Dif. Déb.',
        'Status',
        'Auditoria',
      ],
    ],
    body: resultados.map((r) => {
      const key = `${empresa}_${competencia}_${r.contaNormalizada}`;
      const stAudit = pendenciasMap[key]?.status ?? (r.statusConciliacao === 'conciliada' ? 'ok' : 'aberta');
      return [
        r.contaFormatada,
        r.descricao.slice(0, 28),
        formatCentsBRL(r.valorFolhaEsperadoCents),
        formatSignedCentsDC(r.saldoAnteriorSignedCents),
        formatCentsBRL(r.debitoBalanceteCents),
        formatCentsBRL(r.creditoBalanceteCents),
        formatSignedCentsDC(r.saldoAtualSignedCents),
        formatCentsBRL(r.diferencaMovimentoApropriacaoCents),
        formatCentsBRL(r.diferencaBaixaDebitoCents),
        r.statusConciliacao.toUpperCase(),
        stAudit.toUpperCase(),
      ];
    }),
    styles: { fontSize: 7.5, cellPadding: 1.8 },
    headStyles: { fillColor: [15, 23, 42] },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? 150;
  doc.setFontSize(9);
  doc.text(
    '___________________________________________________                    ___________________________________________________',
    25,
    Math.min(finalY + 22, 195)
  );
  doc.text(
    'Responsável Fechamento Folha / Recursos Humanos                        Auditor Contábil / Contador Responsável (CRC)',
    25,
    Math.min(finalY + 27, 200)
  );

  doc.save(`PARECER_CONCILIACAO_PROTHEUS_${competencia}.pdf`);
}
