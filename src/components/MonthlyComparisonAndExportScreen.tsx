import React, { useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  TrendingUp,
} from 'lucide-react';
import {
  AccountReconciliationResult,
  CompetenciaSnapshot,
  DeParaRule,
  ExpenseDoubleEntryCheck,
  FolhaData,
  PendenciaAuditRecord,
  RazaoData,
} from '../types/reconciliation';
import { formatCentsBRL, formatSignedCentsDC } from '../utils/money';

interface MonthlyComparisonAndExportScreenProps {
  mode: 'comparativo' | 'exportacao';
  empresa: string;
  competenciaAtual: string;
  folha: FolhaData | null;
  razao: RazaoData | null;
  resultadosAtuais: AccountReconciliationResult[];
  conferenciaDespesas: ExpenseDoubleEntryCheck[];
  dePara: DeParaRule[];
  pendenciasMap: Record<string, PendenciaAuditRecord>;
  historicoSnapshots: CompetenciaSnapshot[];
  onExportSixSheetExcel: () => void;
  onExportExecutivePdf: () => void;
  onExportSept2026RazaoXlsx: () => void;
  onExportStandaloneHtml: () => void;
}

export const MonthlyComparisonAndExportScreen: React.FC<MonthlyComparisonAndExportScreenProps> = ({
  mode,
  empresa,
  competenciaAtual,
  resultadosAtuais,
  pendenciasMap,
  historicoSnapshots,
  onExportSixSheetExcel,
  onExportExecutivePdf,
  onExportSept2026RazaoXlsx,
  onExportStandaloneHtml,
}) => {
  const [variationThresholdPct, setVariationThresholdPct] = useState<number>(10);

  // Localizar competência anterior da mesma empresa (ex.: 202608 vs 202609)
  const snapshotAnterior =
    historicoSnapshots.find((s) => s.competencia < competenciaAtual && s.empresa === empresa) ||
    historicoSnapshots.find((s) => s.competencia !== competenciaAtual);

  const todasSugestoesCT2 = resultadosAtuais.flatMap((r) =>
    r.sugestoesAjusteCT2.map((s) => ({
      contaAuditada: r.contaFormatada,
      descricaoConta: r.descricao,
      ...s,
    }))
  );

  if (mode === 'comparativo') {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-slate-900">
              4. Comparativo Mensal e Transporte de Pendências (IndexedDB por Empresa)
            </h1>
            <p className="text-sm text-slate-600">
              Compara a evolução de apropriações e saldos entre competências armazenadas localmente e rastreia pendências abertas transportadas do mês anterior.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded border border-slate-300 text-xs shrink-0">
            <TrendingUp className="w-4 h-4 text-slate-700" />
            <span className="font-semibold text-slate-700">Alerta de Variação Mensal &gt;</span>
            <input
              type="number"
              min={1}
              max={100}
              value={variationThresholdPct}
              onChange={(e) => setVariationThresholdPct(Number(e.target.value) || 10)}
              className="w-14 px-1.5 py-0.5 bg-white border border-slate-300 rounded font-mono font-bold text-center"
            />
            <span className="font-mono font-bold">%</span>
          </div>
        </div>

        {/* Competências Salvas no IndexedDB */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {historicoSnapshots.map((snap) => (
            <div
              key={snap.id}
              className="bg-white border border-slate-200 rounded-lg p-4 flex items-center justify-between"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-900">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    Competência {snap.competencia.slice(4)}/{snap.competencia.slice(0, 4)}
                  </span>
                </div>
                <div className="text-xs text-slate-600 truncate max-w-[220px]">{snap.empresa}</div>
                <div className="text-[11px] text-slate-400">
                  {snap.resumoContas.length} contas registradas
                </div>
              </div>
              <span className="px-2 py-1 text-[11px] font-mono font-semibold bg-slate-100 text-slate-700 rounded border border-slate-300">
                IndexedDB OK
              </span>
            </div>
          ))}
        </div>

        {/* Tabela Comparativa Mês Anterior × Mês Atual */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Evolução de Movimento por Conta ({snapshotAnterior ? `${snapshotAnterior.competencia.slice(4)}/${snapshotAnterior.competencia.slice(0, 4)}` : 'Mês Anterior'} × {competenciaAtual.slice(4)}/{competenciaAtual.slice(0, 4)})
              </h2>
              <p className="text-xs text-slate-500">
                Sinaliza contas cuja apropriação variou acima de {variationThresholdPct}% entre competências.
              </p>
            </div>
          </div>

          {resultadosAtuais.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Carregue os arquivos na aba 1 para visualizar o comparativo mensal entre competências.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                    <th className="py-2.5 px-3 font-semibold">Conta</th>
                    <th className="py-2.5 px-3 font-semibold">Descrição</th>
                    <th className="py-2.5 px-3 font-semibold text-right">
                      Mov. Crédito {snapshotAnterior ? `${snapshotAnterior.competencia.slice(4)}/${snapshotAnterior.competencia.slice(0, 4)}` : 'Ant.'}
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-right">
                      Mov. Crédito {competenciaAtual.slice(4)}/{competenciaAtual.slice(0, 4)}
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-right">Variação (R$)</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Variação (%)</th>
                    <th className="py-2.5 px-3 font-semibold">Diagnóstico de Evolução</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resultadosAtuais
                    .filter((r) => r.grupoContabil === 'passivo_trabalhista' || r.grupoContabil === 'ativo_adiantamentos')
                    .map((r) => {
                      const prevConta = snapshotAnterior?.resumoContas.find(
                        (c) => c.contaNormalizada === r.contaNormalizada
                      );
                      const prevCred = prevConta?.movimentoCreditoCents ?? r.saldoAnteriorAbsCents;
                      const currCred = r.creditoBalanceteCents;
                      const diffCents = currCred - prevCred;
                      const pct =
                        prevCred > 0 ? Number((((currCred - prevCred) / prevCred) * 100).toFixed(2)) : 0;
                      const isAlert = Math.abs(pct) > variationThresholdPct;

                      return (
                        <tr key={r.contaNormalizada} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-mono font-bold text-slate-900">
                            {r.contaFormatada}
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-800">{r.descricao}</td>
                          <td className="py-2 px-3 font-mono text-right text-slate-600">
                            {formatCentsBRL(prevCred)}
                          </td>
                          <td className="py-2 px-3 font-mono text-right font-semibold text-slate-900">
                            {formatCentsBRL(currCred)}
                          </td>
                          <td className="py-2 px-3 font-mono text-right text-slate-700">
                            {formatCentsBRL(diffCents)}
                          </td>
                          <td
                            className={`py-2 px-3 font-mono text-right font-bold ${
                              isAlert ? 'text-amber-700' : 'text-emerald-700'
                            }`}
                          >
                            {pct > 0 ? `+${pct}%` : `${pct}%`}
                          </td>
                          <td className="py-2 px-3">
                            {isAlert ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-300 rounded">
                                <AlertTriangle className="w-3 h-3" />
                                Acima de {variationThresholdPct}%
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-500">Estável no período</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Trilha de Pendências Transportadas e Registradas */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-bold text-slate-900">
              Trilha de Auditoria e Pendências Transportadas Entre Competências
            </h2>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                  <th className="py-2 px-3 font-semibold">Conta</th>
                  <th className="py-2 px-3 font-semibold">Competência</th>
                  <th className="py-2 px-3 font-semibold">Origem / Transporte</th>
                  <th className="py-2 px-3 font-semibold">Status</th>
                  <th className="py-2 px-3 font-semibold">Comentário do Auditor</th>
                  <th className="py-2 px-3 font-semibold">Responsável / Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.values(pendenciasMap).map((p, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono font-bold text-slate-900">
                      {p.contaNormalizada}
                    </td>
                    <td className="py-2 px-3 font-mono">
                      {p.competencia.slice(4)}/{p.competencia.slice(0, 4)}
                    </td>
                    <td className="py-2 px-3 font-mono text-xs">
                      {p.transportadaDeCompetenciaAnterior
                        ? `Transportada de ${p.transportadaDeCompetenciaAnterior.slice(4)}/${p.transportadaDeCompetenciaAnterior.slice(0, 4)}`
                        : 'Originada no Mês'}
                    </td>
                    <td className="py-2 px-3 font-semibold uppercase">{p.status}</td>
                    <td className="py-2 px-3 text-slate-700">{p.comentario}</td>
                    <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                      {p.usuarioAuditor} ({p.atualizadoEm})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // MODO EXPORTAÇÃO (TELA 6)
  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-1">
        <h1 className="text-xl font-bold text-slate-900">
          5. Central de Exportação (Planilha 6 Abas, Razão Set/2026 e Parecer PDF)
        </h1>
        <p className="text-sm text-slate-600">
          Gere os artefatos oficiais de auditoria e integração contábil nos dois formatos confirmados:
          <strong> Layout TOTVS Protheus CT2</strong> e <strong>Demonstrativo Legível para Auditoria</strong>.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Planilha 6 Abas */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="w-9 h-9 rounded bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">
              Planilha Completa de Conciliação (.XLSX — 6 Abas)
            </h3>
            <p className="text-xs text-slate-600">
              Contém as abas: <strong>1. Resumo e Despesa</strong>, <strong>2. Conciliação por Conta</strong>,{' '}
              <strong>3. Pendências e Status</strong>, <strong>4. Lançamentos sem Match</strong>,{' '}
              <strong>5. De-Para e Tipos</strong> e <strong>6. Ajustes CT2 + Auditoria</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={onExportSixSheetExcel}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Baixar Planilha 6 Abas (.XLSX)
          </button>
        </div>

        {/* Card 2: Parecer Executivo PDF */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="w-9 h-9 rounded bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">
              Relatório Executivo de Fechamento (.PDF)
            </h3>
            <p className="text-xs text-slate-600">
              Documento formal de fechamento da competência com quadro de diferenças de crédito e débito,
              status de auditoria e campos para assinatura de RH e Contabilidade.
            </p>
          </div>
          <button
            type="button"
            onClick={onExportExecutivePdf}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Gerar Parecer em PDF
          </button>
        </div>

        {/* Card 3: Exportar Razão de Setembro/2026 */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="w-9 h-9 rounded bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">
              Exportar Razão Contábil de Set/2026 (.XLSX)
            </h3>
            <p className="text-xs text-slate-600">
              Gera o arquivo XLSX "Lançamentos Contábeis" de Setembro/2026 com as contas{' '}
              <code className="font-mono">2.1.0.10.400.001</code> a <code className="font-mono">015</code> e{' '}
              <code className="font-mono">1.1.0.60.300.xxx</code> para teste externo.
            </p>
          </div>
          <button
            type="button"
            onClick={onExportSept2026RazaoXlsx}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Exportar Razão Set/2026 (.XLSX)
          </button>
        </div>

        {/* Card 4: Baixar Aplicativo Completo em HTML Único (.HTML) */}
        <div className="bg-emerald-950 text-white border border-emerald-800 rounded-lg p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="w-9 h-9 rounded bg-emerald-500/20 text-emerald-300 flex items-center justify-center border border-emerald-400/30 font-mono font-bold text-xs">
              HTML
            </div>
            <h3 className="text-sm font-bold text-white">
              Aplicativo Completo em HTML Único (.HTML)
            </h3>
            <p className="text-xs text-emerald-100/80">
              Baixa o arquivo autônomo <code className="font-mono">Conciliador_Protheus_Completo.html</code> com todo o código-fonte e o caso Pramar Set/2026 embutido.
            </p>
          </div>
          <button
            type="button"
            onClick={onExportStandaloneHtml}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Baixar App Completo (.HTML)
          </button>
        </div>
      </div>

      {/* Prévia em Tela dos Lançamentos de Ajuste nos 2 Formatos (TOTVS CT2 + Auditoria) */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-900">
            Prévia dos Lançamentos de Ajuste Sugeridos (Formato Duplo: TOTVS CT2 + Auditoria)
          </h2>
          <p className="text-xs text-slate-500">
            Estes lançamentos compõem a Aba 6 da planilha de conciliação.
          </p>
        </div>

        {todasSugestoesCT2.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            Nenhuma sugestão de ajuste pendente na sessão atual.
          </div>
        ) : (
          <div className="p-4 space-y-6">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Formato A — Tabela de Importação TOTVS Protheus (CT2)
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="py-2 px-3">CT2_FILIAL</th>
                      <th className="py-2 px-3">CT2_DATA</th>
                      <th className="py-2 px-3">CT2_LOTE</th>
                      <th className="py-2 px-3">CT2_DEBITO</th>
                      <th className="py-2 px-3">CT2_CREDIT</th>
                      <th className="py-2 px-3 text-right">CT2_VALOR</th>
                      <th className="py-2 px-3">CT2_HIST</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {todasSugestoesCT2.map((s, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-bold">{s.filial}</td>
                        <td className="py-2 px-3">{s.dataLancamento}</td>
                        <td className="py-2 px-3">{s.loteSugerido}</td>
                        <td className="py-2 px-3 text-slate-900">{s.contaDebitoNormalizada}</td>
                        <td className="py-2 px-3 text-slate-900">{s.contaCreditoNormalizada}</td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-700">
                          {formatCentsBRL(s.valorCents)}
                        </td>
                        <td className="py-2 px-3">{s.historicoPadraoCT2}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Formato B — Demonstrativo Contábil Legível para Auditoria
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      <th className="py-2 px-3 font-semibold">Conta Auditada</th>
                      <th className="py-2 px-3 font-semibold">Débito (Formatado)</th>
                      <th className="py-2 px-3 font-semibold">Crédito (Formatado)</th>
                      <th className="py-2 px-3 font-semibold text-right">Valor (R$)</th>
                      <th className="py-2 px-3 font-semibold">Fundamentação Técnica da Auditoria</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {todasSugestoesCT2.map((s, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono font-bold text-slate-900">
                          {s.contaAuditada}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-800">
                          {s.contaDebitoFormatada}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-800">
                          {s.contaCreditoFormatada}
                        </td>
                        <td className="py-2 px-3 font-mono text-right font-bold text-slate-900">
                          {formatCentsBRL(s.valorCents, true)}
                        </td>
                        <td className="py-2 px-3 text-slate-700">{s.justificativaAuditoria}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
