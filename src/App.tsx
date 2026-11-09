import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  Download,
  FileSpreadsheet,
  LayoutDashboard,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import {
  AccountReconciliationResult,
  BalanceteData,
  CompetenciaSnapshot,
  DeParaRule,
  FolhaData,
  LoteConfig,
  PendenciaAuditRecord,
  PlanoContasData,
  RazaoData,
} from './types/reconciliation';
import {
  buildPramarSept2026TestSuite,
  CT2_ACCEPTANCE_FIXTURE_TSV,
  DEFAULT_DE_PARA_RULES,
  DEFAULT_LOTE_CONFIGS,
} from './data/defaultDeParaAndTestCases';
import {
  buildFixture24RowsRazaoData,
  parseBalanceteFile,
  parseFolhaGPER106Pdf,
  parsePlanoContasFile,
  parseRazaoXlsx,
  recomputeExistingRazaoData,
} from './services/parsers';
import { runThreeLayerReconciliation } from './services/reconciliationEngine';
import {
  loadCompetenciasHistoryFromDB,
  loadDeParaRulesFromDB,
  loadLoteConfigsFromDB,
  loadPendenciasAuditFromDB,
  saveCompetenciaSnapshotToDB,
  saveDeParaRulesToDB,
  saveLoteConfigsToDB,
  savePendenciaAuditToDB,
} from './services/storage';
import {
  exportExecutiveAuditPdf,
  exportRazaoSetembro2026Xlsx,
  exportSixSheetReconciliationWorkbook,
} from './services/exporters';
import { downloadStandaloneCompleteHtml } from './services/standaloneHtmlExporter';
import { UploadScreen } from './components/UploadScreen';
import { DeParaScreen } from './components/DeParaScreen';
import { ReconciliationDashboard } from './components/ReconciliationDashboard';
import { PendenciaDetailDrawer } from './components/PendenciaDetailDrawer';
import { MonthlyComparisonAndExportScreen } from './components/MonthlyComparisonAndExportScreen';

type ActiveTab = 'upload' | 'depara' | 'painel' | 'comparativo' | 'exportacao';

declare global {
  interface Window {
    __PROTHEUS_INITIAL_STATE__?: {
      folha?: FolhaData | null;
      balancete?: BalanceteData | null;
      razao?: RazaoData | null;
      planoContas?: PlanoContasData | null;
      deParaRules?: DeParaRule[];
      loteConfigs?: LoteConfig[];
      pendenciasMap?: Record<string, PendenciaAuditRecord>;
      historicoSnapshots?: CompetenciaSnapshot[];
    };
  }
}

export default function App() {
  const initialEmbedded = typeof window !== 'undefined' ? window.__PROTHEUS_INITIAL_STATE__ : undefined;

  const [activeTab, setActiveTab] = useState<ActiveTab>('upload');

  const [folha, setFolha] = useState<FolhaData | null>(initialEmbedded?.folha ?? null);
  const [balancete, setBalancete] = useState<BalanceteData | null>(initialEmbedded?.balancete ?? null);
  const [rawRazao, setRawRazao] = useState<RazaoData | null>(initialEmbedded?.razao ?? null);
  const [planoContas, setPlanoContas] = useState<PlanoContasData | null>(
    initialEmbedded?.planoContas ?? null
  );

  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parseProgressPercent, setParseProgressPercent] = useState<number>(0);
  const [parseProgressStage, setParseProgressStage] = useState<string>('');
  const [parseError, setParseError] = useState<string | null>(null);

  // Estado persistente no IndexedDB (apenas configurações De/Para, Lotes, Pareceres e Snapshots; jamais o CT2 bruto)
  const [deParaRules, setDeParaRules] = useState<DeParaRule[]>(
    initialEmbedded?.deParaRules ?? DEFAULT_DE_PARA_RULES
  );
  const [loteConfigs, setLoteConfigs] = useState<LoteConfig[]>(
    initialEmbedded?.loteConfigs ?? DEFAULT_LOTE_CONFIGS
  );
  const [pendenciasMap, setPendenciasMap] = useState<Record<string, PendenciaAuditRecord>>(
    initialEmbedded?.pendenciasMap ?? {}
  );
  const [historicoSnapshots, setHistoricoSnapshots] = useState<CompetenciaSnapshot[]>(
    initialEmbedded?.historicoSnapshots ?? []
  );

  // Parâmetros de Auditoria
  const [toleranceCents, setToleranceCents] = useState<number>(1);
  const [anonymizePii, setAnonymizePii] = useState<boolean>(false);
  const [selectedAccountForDrawer, setSelectedAccountForDrawer] =
    useState<AccountReconciliationResult | null>(null);
  const [snapshotSavedFeedback, setSnapshotSavedFeedback] = useState<boolean>(false);

  // Carregar configurações e histórico do IndexedDB ao iniciar
  useEffect(() => {
    (async () => {
      try {
        const [loadedRules, loadedLotes, loadedPendencias, loadedHist] = await Promise.all([
          loadDeParaRulesFromDB(),
          loadLoteConfigsFromDB(),
          loadPendenciasAuditFromDB(),
          loadCompetenciasHistoryFromDB(),
        ]);
        if (!initialEmbedded?.deParaRules) setDeParaRules(loadedRules);
        if (!initialEmbedded?.loteConfigs) setLoteConfigs(loadedLotes);
        if (!initialEmbedded?.pendenciasMap) setPendenciasMap(loadedPendencias);
        if (loadedHist.length === 0) {
          const suite = buildPramarSept2026TestSuite();
          await saveCompetenciaSnapshotToDB(suite.historicoAgosto);
          setHistoricoSnapshots([suite.historicoAgosto]);
        } else if (!initialEmbedded?.historicoSnapshots) {
          setHistoricoSnapshots(loadedHist);
        }
      } catch {
        // Fallback em memória caso IndexedDB esteja restrito em modo file://
        if (historicoSnapshots.length === 0) {
          const suite = buildPramarSept2026TestSuite();
          setHistoricoSnapshots([suite.historicoAgosto]);
        }
      }
    })();
  }, []);

  // Recalcula saldos corridos, filtro de período do Balancete e as 3 validações (a, b, c) sempre que Balancete, De/Para ou Lotes mudarem
  const razao = useMemo(() => {
    if (!rawRazao) return null;
    return recomputeExistingRazaoData(rawRazao, balancete, deParaRules, loteConfigs);
  }, [rawRazao, balancete, deParaRules, loteConfigs]);

  // Executar o motor de conciliação em 3 camadas + conferência de despesas
  const { resultadosContas, conferenciaDespesas } = useMemo(() => {
    return runThreeLayerReconciliation({
      folha,
      balancete,
      razao,
      deParaRules,
      loteConfigs,
      toleranceCents,
    });
  }, [folha, balancete, razao, deParaRules, loteConfigs, toleranceCents]);

  const empresaAtiva =
    balancete?.empresa || folha?.empresa || 'PRAMAR COMERCIO E LOGISTICA LTDA';
  const competenciaAtiva =
    folha?.competencia || balancete?.competencia || razao?.competencia || '202609';

  // Handlers de Upload
  const handleUploadFolha = async (file: File) => {
    setIsParsing(true);
    setParseProgressPercent(25);
    setParseProgressStage(`Lendo PDF da Folha GPER106 (${file.name})...`);
    setParseError(null);
    try {
      const parsed = await parseFolhaGPER106Pdf(file);
      setParseProgressPercent(100);
      setFolha(parsed);
    } catch (err) {
      setParseError(
        `Falha ao ler PDF da Folha GPER106 (${file.name}): ${
          err instanceof Error ? err.message : 'erro inesperado'
        }`
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleUploadBalancete = async (file: File) => {
    setIsParsing(true);
    setParseProgressPercent(30);
    setParseProgressStage(`Lendo Balancete CTBR040 (${file.name})...`);
    setParseError(null);
    try {
      const parsed = await parseBalanceteFile(file);
      setParseProgressPercent(100);
      setBalancete(parsed);
    } catch (err) {
      setParseError(
        `Falha ao ler arquivo de Balancete (${file.name}): ${
          err instanceof Error ? err.message : 'erro inesperado'
        }`
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleUploadRazao = async (file: File) => {
    setIsParsing(true);
    setParseProgressPercent(10);
    setParseProgressStage(`Iniciando leitura da planilha CT2 (${file.name})...`);
    setParseError(null);
    try {
      const parsed = await parseRazaoXlsx(file, {
        balancete,
        deParaRules,
        loteConfigs,
        onProgress: (pct, stage) => {
          setParseProgressPercent(pct);
          setParseProgressStage(stage);
        },
      });
      setRawRazao(parsed);
    } catch (err) {
      setParseError(
        `Falha ao ler planilha do Razão Contábil CT2 (${file.name}): ${
          err instanceof Error ? err.message : 'erro inesperado'
        }`
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleUploadPlanoContas = async (file: File) => {
    setIsParsing(true);
    setParseProgressPercent(30);
    setParseProgressStage(`Lendo Plano de Contas (${file.name})...`);
    setParseError(null);
    try {
      const parsed = await parsePlanoContasFile(file);
      setParseProgressPercent(100);
      setPlanoContas(parsed);
    } catch (err) {
      setParseError(
        `Falha ao ler Plano de Contas (${file.name}): ${
          err instanceof Error ? err.message : 'erro inesperado'
        }`
      );
    } finally {
      setIsParsing(false);
    }
  };

  // Carregar as 24 linhas reais do Teste de Aceite CT2 no Razão Ativo
  const handleLoad24RowAcceptanceFixture = () => {
    setParseError(null);
    const parsed = buildFixture24RowsRazaoData(loteConfigs, balancete, deParaRules);
    setRawRazao(parsed);
  };

  // Carregar os PDFs anexados em /public/assets/aistudio/
  const handleLoadAttachedAssetsPdfs = async () => {
    setIsParsing(true);
    setParseProgressPercent(20);
    setParseProgressStage('Carregando PDFs anexados da sessão...');
    setParseError(null);
    try {
      const fetchAsFileLike = async (url: string, name: string) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Arquivo ${name} não encontrado em ${url}`);
        const buf = await res.arrayBuffer();
        return {
          name,
          arrayBuffer: async () => buf,
        };
      };

      const [fopagFile, balFile] = await Promise.all([
        fetchAsFileLike(
          '/assets/aistudio/FOPAG_FOL_SINTET_-_202609_6b1caa7d.pdf',
          'FOPAG FOL SINTET - 202609.pdf'
        ),
        fetchAsFileLike(
          '/assets/aistudio/balancete_PRAMAR_092026_1fa8c481.pdf',
          'balancete PRAMAR 092026.pdf'
        ),
      ]);

      const [parsedFolha, parsedBal] = await Promise.all([
        parseFolhaGPER106Pdf(fopagFile),
        parseBalanceteFile(balFile),
      ]);

      setFolha(parsedFolha);
      setBalancete(parsedBal);
    } catch {
      const suite = buildPramarSept2026TestSuite();
      setFolha(suite.folha);
      setBalancete(suite.balancete);
    } finally {
      setIsParsing(false);
    }
  };

  // Carregar Caso Pramar Set/2026 Completo
  const handleLoadPramarSept2026Suite = async () => {
    const suite = buildPramarSept2026TestSuite();
    setFolha(suite.folha);
    setBalancete(suite.balancete);
    setRawRazao(suite.razao);
    setPlanoContas(suite.planoContas);

    const nextPendencias = { ...pendenciasMap };
    for (const p of suite.pendenciasIniciais) {
      const key = `${p.empresa}_${p.competencia}_${p.contaNormalizada}`;
      if (!nextPendencias[key]) {
        nextPendencias[key] = p;
        try {
          await savePendenciaAuditToDB(p);
        } catch {
          // Ignorar erro IndexedDB em file://
        }
      }
    }
    setPendenciasMap(nextPendencias);
  };

  // Exportar Razão de Setembro/2026 (.XLSX)
  const handleDownloadSept2026RazaoXlsx = () => {
    const targetRazao = razao ?? buildPramarSept2026TestSuite().razao;
    exportRazaoSetembro2026Xlsx(targetRazao, anonymizePii);
  };

  const handleClearAllFiles = () => {
    setFolha(null);
    setBalancete(null);
    setRawRazao(null);
    setPlanoContas(null);
    setParseError(null);
  };

  const handleChangeDeParaRules = async (next: DeParaRule[]) => {
    setDeParaRules(next);
    try {
      await saveDeParaRulesToDB(next);
    } catch {
      // Ignorar em modo file://
    }
  };

  const handleChangeLoteConfigs = async (next: LoteConfig[]) => {
    setLoteConfigs(next);
    try {
      await saveLoteConfigsToDB(next);
    } catch {
      // Ignorar em modo file://
    }
  };

  const handleResetDefaults = async () => {
    setDeParaRules(DEFAULT_DE_PARA_RULES);
    setLoteConfigs(DEFAULT_LOTE_CONFIGS);
    try {
      await saveDeParaRulesToDB(DEFAULT_DE_PARA_RULES);
      await saveLoteConfigsToDB(DEFAULT_LOTE_CONFIGS);
    } catch {
      // Ignorar em modo file://
    }
  };

  const handleSaveAuditRecord = async (record: PendenciaAuditRecord) => {
    const key = `${record.empresa}_${record.competencia}_${record.contaNormalizada}`;
    const next = { ...pendenciasMap, [key]: record };
    setPendenciasMap(next);
    try {
      await savePendenciaAuditToDB(record);
    } catch {
      // Ignorar em modo file://
    }
  };

  const handleSaveCurrentSnapshot = async () => {
    if (resultadosContas.length === 0) return;
    const snap: CompetenciaSnapshot = {
      id: `${empresaAtiva}_${competenciaAtiva}`,
      empresa: empresaAtiva,
      competencia: competenciaAtiva,
      salvoEm: new Date().toISOString(),
      resumoContas: resultadosContas.map((r) => ({
        contaNormalizada: r.contaNormalizada,
        contaFormatada: r.contaFormatada,
        descricao: r.descricao,
        valorFolhaCents: r.valorFolhaEsperadoCents,
        movimentoCreditoCents: r.creditoBalanceteCents,
        movimentoDebitoCents: r.debitoBalanceteCents,
        saldoAtualSignedCents: r.saldoAtualSignedCents,
        diferencaMovimentoCents: r.diferencaMovimentoApropriacaoCents,
        statusConciliacao: r.statusConciliacao,
      })),
      resumoVerbas: folha
        ? folha.totalEmpresa.rubricas.map((rub) => ({
            codigo: rub.codigo,
            descricao: rub.descricao,
            tipoVerba: 'informativo_base',
            valorTotalCents: rub.valorCents,
          }))
        : [],
    };
    try {
      await saveCompetenciaSnapshotToDB(snap);
      const updated = await loadCompetenciasHistoryFromDB();
      setHistoricoSnapshots(updated);
    } catch {
      setHistoricoSnapshots((prev) => [snap, ...prev.filter((x) => x.id !== snap.id)]);
    }
    setSnapshotSavedFeedback(true);
    setTimeout(() => setSnapshotSavedFeedback(false), 2500);
  };

  const handleExportSixSheetExcel = () => {
    exportSixSheetReconciliationWorkbook({
      empresa: empresaAtiva,
      competencia: competenciaAtiva,
      folha,
      resultados: resultadosContas,
      conferenciaDespesas,
      dePara: deParaRules,
      pendenciasMap,
    });
  };

  const handleExportExecutivePdf = () => {
    exportExecutiveAuditPdf({
      empresa: empresaAtiva,
      competencia: competenciaAtiva,
      folha,
      resultados: resultadosContas,
      pendenciasMap,
    });
  };

  const handleExportStandaloneHtml = () => {
    downloadStandaloneCompleteHtml({
      folha,
      balancete,
      razao,
      planoContas,
      deParaRules,
      loteConfigs,
      pendenciasMap,
      historicoSnapshots,
    });
  };

  const divergentesCount = resultadosContas.filter(
    (r) =>
      (r.grupoContabil === 'passivo_trabalhista' || r.grupoContabil === 'ativo_adiantamentos') &&
      (r.statusConciliacao === 'divergente' || r.statusConciliacao === 'bloqueada_ct2')
  ).length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Header Corporativo */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 font-mono font-bold text-sm">
              CT2
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight">
                Conciliador Protheus — Folha (GPER106) × Contabilidade (CTBR040 / CT2)
              </div>
              <div className="text-[11px] text-slate-400 hidden sm:block">
                Auditoria em 3 Camadas • CT2 45 Colunas • Lotes Manuais • Saldo Corrido Determinístico
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={handleExportStandaloneHtml}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors cursor-pointer"
              title="Baixar o código completo deste aplicativo em um único arquivo .html autônomo (funciona por duplo clique offline)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Baixar App (.HTML)</span>
            </button>
            <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>100% Navegador • IA Desligada por Padrão</span>
            </span>
            {(balancete || razao) && (
              <span className="px-2.5 py-1 rounded font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Comp: {competenciaAtiva.slice(4)}/{competenciaAtiva.slice(0, 4)}
              </span>
            )}
          </div>
        </div>

        {/* Barra de Navegação das 5 Abas */}
        <div className="bg-slate-950/60 border-t border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`inline-flex items-center gap-2 py-2.5 px-3.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'upload'
                  ? 'border-emerald-400 text-white bg-slate-900/60'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>1. Upload e Validações</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('depara')}
              className={`inline-flex items-center gap-2 py-2.5 px-3.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'depara'
                  ? 'border-emerald-400 text-white bg-slate-900/60'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>2. De/Para e Tabela de Lotes ({deParaRules.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('painel')}
              className={`inline-flex items-center gap-2 py-2.5 px-3.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'painel'
                  ? 'border-emerald-400 text-white bg-slate-900/60'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>3. Painel e Pendências pelo Razão</span>
              {divergentesCount > 0 && (
                <span className="px-1.5 py-0.2 bg-red-500 text-white rounded text-[10px] font-mono">
                  {divergentesCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('comparativo')}
              className={`inline-flex items-center gap-2 py-2.5 px-3.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'comparativo'
                  ? 'border-emerald-400 text-white bg-slate-900/60'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>4. Comparativo Mensal e Status</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('exportacao')}
              className={`inline-flex items-center gap-2 py-2.5 px-3.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'exportacao'
                  ? 'border-emerald-400 text-white bg-slate-900/60'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>5. Exportação (6 Abas CT2 + PDF)</span>
            </button>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex-1">
        {activeTab === 'upload' && (
          <UploadScreen
            folha={folha}
            balancete={balancete}
            razao={razao}
            planoContas={planoContas}
            loteConfigs={loteConfigs}
            isParsing={isParsing}
            parseProgressPercent={parseProgressPercent}
            parseProgressStage={parseProgressStage}
            parseError={parseError}
            onUploadFolha={handleUploadFolha}
            onUploadBalancete={handleUploadBalancete}
            onUploadRazao={handleUploadRazao}
            onUploadPlanoContas={handleUploadPlanoContas}
            onLoadPramarSept2026Suite={handleLoadPramarSept2026Suite}
            onLoad24RowAcceptanceFixture={handleLoad24RowAcceptanceFixture}
            onLoadAttachedAssetsPdfs={handleLoadAttachedAssetsPdfs}
            onDownloadSept2026RazaoXlsx={handleDownloadSept2026RazaoXlsx}
            onClearAllFiles={handleClearAllFiles}
            onProceedToDashboard={() => setActiveTab('painel')}
          />
        )}

        {activeTab === 'depara' && (
          <DeParaScreen
            rules={deParaRules}
            loteConfigs={loteConfigs}
            onChangeRules={handleChangeDeParaRules}
            onChangeLoteConfigs={handleChangeLoteConfigs}
            onResetDefaults={handleResetDefaults}
          />
        )}

        {activeTab === 'painel' && (
          <>
            {!balancete ? (
              <div className="bg-white border border-slate-200 rounded-lg p-8 text-center space-y-4">
                <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto" />
                <div className="space-y-1">
                  <h2 className="text-base font-bold text-slate-900">
                    Carregue o Balancete na aba 1 para executar a conciliação por conta
                  </h2>
                  <p className="text-xs text-slate-600 max-w-md mx-auto">
                    {razao
                      ? `O Razão CT2 (${razao.lancamentos.length} lançamentos) já foi importado com saldo provisório. Carregue o Balancete (CTBR040) na aba 1 ou carregue a suíte Pramar Set/2026.`
                      : 'Você pode enviar seus próprios arquivos na aba 1 ou clicar abaixo para carregar a suíte completa de Setembro/2026.'}
                  </p>
                </div>
                <div className="flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab('upload')}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                  >
                    Voltar para Upload e Validações
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadPramarSept2026Suite}
                    className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded cursor-pointer"
                  >
                    Carregar Caso Pramar Set/2026 Agora
                  </button>
                </div>
              </div>
            ) : (
              <ReconciliationDashboard
                empresa={empresaAtiva}
                competencia={competenciaAtiva}
                folha={folha}
                razao={razao}
                resultados={resultadosContas}
                conferenciaDespesas={conferenciaDespesas}
                pendenciasMap={pendenciasMap}
                toleranceCents={toleranceCents}
                anonymizePii={anonymizePii}
                onChangeToleranceCents={setToleranceCents}
                onToggleAnonymizePii={() => setAnonymizePii(!anonymizePii)}
                onSelectAccount={setSelectedAccountForDrawer}
                onSaveCurrentSnapshot={handleSaveCurrentSnapshot}
                snapshotSavedFeedback={snapshotSavedFeedback}
              />
            )}
          </>
        )}

        {activeTab === 'comparativo' && (
          <MonthlyComparisonAndExportScreen
            mode="comparativo"
            empresa={empresaAtiva}
            competenciaAtual={competenciaAtiva}
            folha={folha}
            razao={razao}
            resultadosAtuais={resultadosContas}
            conferenciaDespesas={conferenciaDespesas}
            dePara={deParaRules}
            pendenciasMap={pendenciasMap}
            historicoSnapshots={historicoSnapshots}
            onExportSixSheetExcel={handleExportSixSheetExcel}
            onExportExecutivePdf={handleExportExecutivePdf}
            onExportSept2026RazaoXlsx={handleDownloadSept2026RazaoXlsx}
            onExportStandaloneHtml={handleExportStandaloneHtml}
          />
        )}

        {activeTab === 'exportacao' && (
          <MonthlyComparisonAndExportScreen
            mode="exportacao"
            empresa={empresaAtiva}
            competenciaAtual={competenciaAtiva}
            folha={folha}
            razao={razao}
            resultadosAtuais={resultadosContas}
            conferenciaDespesas={conferenciaDespesas}
            dePara={deParaRules}
            pendenciasMap={pendenciasMap}
            historicoSnapshots={historicoSnapshots}
            onExportSixSheetExcel={handleExportSixSheetExcel}
            onExportExecutivePdf={handleExportExecutivePdf}
            onExportSept2026RazaoXlsx={handleDownloadSept2026RazaoXlsx}
            onExportStandaloneHtml={handleExportStandaloneHtml}
          />
        )}
      </main>

      {/* Gaveta de Auditoria Profunda (Detalhe da Pendência pelo Razão CT2) */}
      <PendenciaDetailDrawer
        account={selectedAccountForDrawer}
        empresa={empresaAtiva}
        competencia={competenciaAtiva}
        anonymizePii={anonymizePii}
        existingAuditRecord={
          selectedAccountForDrawer
            ? pendenciasMap[
                `${empresaAtiva}_${competenciaAtiva}_${selectedAccountForDrawer.contaNormalizada}`
              ]
            : undefined
        }
        onSaveAuditRecord={handleSaveAuditRecord}
        onClose={() => setSelectedAccountForDrawer(null)}
      />
    </div>
  );
}
