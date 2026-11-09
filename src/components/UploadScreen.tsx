import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  FolderOpen,
  Info,
  Play,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  BalanceteData,
  FolhaData,
  LoteConfig,
  PlanoContasData,
  RazaoData,
} from '../types/reconciliation';
import { runCT2AcceptanceTest } from '../services/parsers';
import { formatCentsBRL, formatSignedCentsDC } from '../utils/money';

interface UploadScreenProps {
  folha: FolhaData | null;
  balancete: BalanceteData | null;
  razao: RazaoData | null;
  planoContas: PlanoContasData | null;
  loteConfigs: LoteConfig[];
  isParsing: boolean;
  parseProgressPercent?: number;
  parseProgressStage?: string;
  parseError: string | null;
  onUploadFolha: (file: File) => Promise<void>;
  onUploadBalancete: (file: File) => Promise<void>;
  onUploadRazao: (file: File) => Promise<void>;
  onUploadPlanoContas: (file: File) => Promise<void>;
  onLoadPramarSept2026Suite: () => void;
  onLoad24RowAcceptanceFixture: () => void;
  onLoadAttachedAssetsPdfs: () => Promise<void>;
  onDownloadSept2026RazaoXlsx: () => void;
  onClearAllFiles: () => void;
  onProceedToDashboard: () => void;
}

export const UploadScreen: React.FC<UploadScreenProps> = ({
  folha,
  balancete,
  razao,
  planoContas,
  loteConfigs,
  isParsing,
  parseProgressPercent = 0,
  parseProgressStage = '',
  parseError,
  onUploadFolha,
  onUploadBalancete,
  onUploadRazao,
  onUploadPlanoContas,
  onLoadPramarSept2026Suite,
  onLoad24RowAcceptanceFixture,
  onLoadAttachedAssetsPdfs,
  onDownloadSept2026RazaoXlsx,
  onClearAllFiles,
  onProceedToDashboard,
}) => {
  const [selectedFilialTab, setSelectedFilialTab] = useState<string>('TOTAL');
  const [showAcceptanceModal, setShowAcceptanceModal] = useState<boolean>(false);
  const [ct2ValidationFilter, setCt2ValidationFilter] = useState<'TODAS' | 'FOLHA' | 'DIVERGENTES'>('TODAS');

  const acceptanceTestResult = useMemo(() => {
    return runCT2AcceptanceTest(loteConfigs);
  }, [loteConfigs]);

  const competenciasCarregadas = [
    folha ? { fonte: 'Folha (GPER106)', comp: folha.competencia } : null,
    balancete ? { fonte: 'Balancete (CTBR040)', comp: balancete.competencia } : null,
    razao ? { fonte: 'Razão Contábil (CT2)', comp: razao.competencia } : null,
  ].filter(Boolean) as { fonte: string; comp: string }[];

  const competenciasUnicas = new Set(competenciasCarregadas.map((c) => c.comp));
  const travaCompetenciaOk = competenciasUnicas.size <= 1;

  const resumoCT2 = razao?.resumoImportacao;

  return (
    <div className="space-y-6">
      {/* Cabeçalho Operacional + Declaração de Escopo e Privacidade */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Processamento 100% Local (LGPD) • Aritmética em Centavos Inteiros (+D / −C)</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            1. Upload de Arquivos e Validação Estrutural (TOTVS Protheus)
          </h1>
          <p className="text-sm text-slate-600 max-w-3xl">
            Envie o relatório da folha sintética (<code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">GPER106</code>),
            o balancete (<code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">CTBR040</code>) e a exportação de lançamentos
            contábeis (<code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">CT2</code> 45 colunas ou <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">CTBR400</code>).
            Lotes com letras (<code className="text-xs bg-slate-100 px-1 rounded">0000BR</code>, <code className="text-xs bg-slate-100 px-1 rounded">SC0000</code>) são classificados como <strong>Lançamentos Manuais</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowAcceptanceModal(!showAcceptanceModal)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-md transition-colors cursor-pointer"
            title="Conferir os 7 critérios do Teste de Aceite das 24 linhas reais do CT2"
          >
            <FlaskConical className="w-3.5 h-3.5 text-emerald-700" />
            <span>Teste de Aceite CT2 (24 Linhas)</span>
          </button>

          <button
            type="button"
            onClick={onDownloadSept2026RazaoXlsx}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-colors cursor-pointer"
            title="Baixar planilha XLSX do Razão Contábil de Setembro/2026"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar Razão Set/2026 (.XLSX)
          </button>

          <button
            type="button"
            onClick={onLoadAttachedAssetsPdfs}
            disabled={isParsing}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors cursor-pointer disabled:opacity-50"
          >
            <FolderOpen className="w-3.5 h-3.5 text-slate-600" />
            Ler PDFs Anexados
          </button>

          <button
            type="button"
            onClick={onLoadPramarSept2026Suite}
            disabled={isParsing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors cursor-pointer disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            Carregar Caso Pramar Set/2026 Completo
          </button>

          {(folha || balancete || razao || planoContas) && (
            <button
              type="button"
              onClick={onClearAllFiles}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* Barra de Progresso de Leitura (Web Worker / Parser) */}
      {isParsing && (
        <div className="bg-slate-900 text-white rounded-lg p-4 space-y-2 border border-slate-800">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-emerald-400">
              Processando arquivo: {parseProgressStage || 'Lendo estrutura...'}
            </span>
            <span className="font-mono font-bold">{parseProgressPercent}%</span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400 transition-all duration-200"
              style={{ width: `${Math.max(5, parseProgressPercent)}%` }}
            />
          </div>
        </div>
      )}

      {parseError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 text-sm text-red-800">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Erro na leitura de arquivo</p>
            <p className="text-xs mt-0.5">{parseError}</p>
          </div>
        </div>
      )}

      {/* Painel do Teste de Aceite Automático (24 linhas CT2 reais) */}
      {showAcceptanceModal && (
        <div className="bg-white border-2 border-emerald-500 rounded-lg p-5 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 text-xs font-mono font-bold rounded ${
                    acceptanceTestResult.passedAll
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      : 'bg-red-100 text-red-900 border border-red-300'
                  }`}
                >
                  {acceptanceTestResult.passedAll ? '✔ 7/7 CRITÉRIOS APROVADOS' : '✖ FALHA NO TESTE'}
                </span>
                <h2 className="text-sm font-bold text-slate-900">
                  Teste de Aceite Automático — Planilha CT2 Real (24 Linhas • Lotes 0000BR, 008810 e 008820)
                </h2>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Valida emenda de <code className="font-mono">Cont.Hist</code> sem remoção de espaços das pontas, desdobramento de{' '}
                <code className="font-mono">Partida Dobrada</code>, contrapartida única por documento, lote manual{' '}
                <code className="font-mono">0000BR</code> e equilíbrio de débitos/créditos.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onLoad24RowAcceptanceFixture}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                Carregar Estas 24 Linhas no Razão Ativo
              </button>
              <button
                type="button"
                onClick={() => setShowAcceptanceModal(false)}
                className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 rounded cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
            {acceptanceTestResult.checks.map((chk) => (
              <div
                key={chk.id}
                className={`p-2.5 rounded border flex items-start gap-2 ${
                  chk.ok
                    ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                {chk.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-bold">{chk.titulo}</div>
                  <div className="text-[11px] text-slate-600 font-mono mt-0.5">
                    Esperado: {chk.esperado}
                  </div>
                  <div className="text-[11px] text-slate-900 font-mono font-semibold">
                    Obtido: {chk.encontrado}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trava de Competência entre Arquivos */}
      {competenciasCarregadas.length > 1 && (
        <div
          className={`border rounded-lg p-3.5 flex items-center justify-between ${
            travaCompetenciaOk
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-300 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs font-medium">
            {travaCompetenciaOk ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>
              <strong>Trava de Competência:</strong>{' '}
              {competenciasCarregadas.map((c) => `${c.fonte}: ${c.comp.slice(4)}/${c.comp.slice(0, 4)}`).join('  •  ')}
            </span>
          </div>
          <span className="text-xs font-mono font-semibold">
            {travaCompetenciaOk ? 'COMPETÊNCIAS SINCRONIZADAS' : 'ALERTA: PERÍODOS DISTINTOS'}
          </span>
        </div>
      )}

      {/* Grade de 4 Cartões de Upload */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Folha GPER106 */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">1. Folha Sintética</span>
              {folha ? (
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                  Carregado
                </span>
              ) : (
                <span className="text-xs text-slate-400">Obrigatório</span>
              )}
            </div>
            <h3 className="text-sm font-bold text-slate-900">Relatório GPER106 (.PDF)</h3>
            <p className="text-xs text-slate-500 mt-1">
              Lê cabeçalho (<code className="font-mono">Periodo:AAAAMM</code>), filiais, Total Empresa e descrições completas abaixo de Total Filial.
            </p>
            {folha && (
              <div className="mt-3 pt-3 border-t border-slate-100 text-xs space-y-1">
                <div className="font-medium text-slate-800 truncate">{folha.nomeArquivo}</div>
                <div className="flex justify-between text-slate-600">
                  <span>Competência:</span>
                  <span className="font-mono font-semibold">{folha.competencia.slice(4)}/{folha.competencia.slice(0, 4)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Dt. Pagto:</span>
                  <span className="font-mono">{folha.dataPagamento}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Líquido (999):</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {formatCentsBRL(folha.totalEmpresa.liquidoVerba999Cents, true)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <label className="mt-4 flex items-center justify-center gap-2 w-full py-2 px-3 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 rounded-md cursor-pointer transition-colors">
            <Upload className="w-3.5 h-3.5" />
            <span>{folha ? 'Substituir PDF da Folha' : 'Selecionar PDF GPER106'}</span>
            <input
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadFolha(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        {/* 2. Balancete CTBR040 */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">2. Balancete Mensal</span>
              {balancete ? (
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                  Carregado
                </span>
              ) : (
                <span className="text-xs text-slate-400">Obrigatório</span>
              )}
            </div>
            <h3 className="text-sm font-bold text-slate-900">CTBR040 (.PDF, .XLSX, .CSV)</h3>
            <p className="text-xs text-slate-500 mt-1">
              Alinhamento posicional de blocos Débito/Crédito/Saldo Atual e validação <code className="font-mono">Sld Ant ± Mov = Sld Atual</code>.
            </p>
            {balancete && (
              <div className="mt-3 pt-3 border-t border-slate-100 text-xs space-y-1">
                <div className="font-medium text-slate-800 truncate">{balancete.nomeArquivo}</div>
                <div className="flex justify-between text-slate-600">
                  <span>Contas lidas:</span>
                  <span className="font-mono font-semibold">{balancete.linhas.length}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Equação Sld Ant ± Mov:</span>
                  <span className={`font-mono font-semibold ${balancete.errosEquacaoLinhas.length === 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {balancete.errosEquacaoLinhas.length === 0 ? '100% OK' : `${balancete.errosEquacaoLinhas.length} alerta(s)`}
                  </span>
                </div>
              </div>
            )}
          </div>

          <label className="mt-4 flex items-center justify-center gap-2 w-full py-2 px-3 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 rounded-md cursor-pointer transition-colors">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{balancete ? 'Substituir Balancete' : 'Selecionar PDF / XLSX / CSV'}</span>
            <input
              type="file"
              accept=".pdf,.xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadBalancete(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        {/* 3. Razão Contábil CT2 */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">3. Razão Contábil</span>
              {razao ? (
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                  Carregado
                </span>
              ) : (
                <span className="text-xs text-amber-700">Recomendado p/ Pendências</span>
              )}
            </div>
            <h3 className="text-sm font-bold text-slate-900">Lançamentos CT2 (.XLSX)</h3>
            <p className="text-xs text-slate-500 mt-1">
              Suporta planilha <code className="font-mono">CT2</code> de 45 colunas (<code className="font-mono">Tipo Lcto</code>, <code className="font-mono">Cont.Hist</code>, <code className="font-mono">Partida Dobrada</code>, lotes manuais <code className="font-mono">0000BR</code>) e <code className="font-mono">CTBR400</code>.
            </p>
            {razao && (
              <div className="mt-3 pt-3 border-t border-slate-100 text-xs space-y-1">
                <div className="font-medium text-slate-800 truncate">{razao.nomeArquivo}</div>
                <div className="flex justify-between text-slate-600">
                  <span>Lançamentos ativos:</span>
                  <span className="font-mono font-semibold">{razao.lancamentos.length}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Contas auditadas:</span>
                  <span className="font-mono font-semibold">{razao.contasPresentes.length}</span>
                </div>
                {resumoCT2 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Equilíbrio Docs:</span>
                    <span
                      className={`font-mono font-semibold ${
                        !razao.bloqueioGlobalDocumentos ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {!razao.bloqueioGlobalDocumentos ? '100% OK' : 'DESBALANCEADO'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <label className="mt-4 flex items-center justify-center gap-2 w-full py-2 px-3 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 rounded-md cursor-pointer transition-colors">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{razao ? 'Substituir Razão XLSX' : 'Selecionar Razão CT2 (.XLSX)'}</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadRazao(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        {/* 4. Plano de Contas CTBR010 */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">4. Plano de Contas</span>
              {planoContas ? (
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                  Carregado
                </span>
              ) : (
                <span className="text-xs text-slate-400">Opcional</span>
              )}
            </div>
            <h3 className="text-sm font-bold text-slate-900">CTBR010 (.PDF, .XLSX)</h3>
            <p className="text-xs text-slate-500 mt-1">
              Enriquece descrições e valida condição normal (Devedora/Credora) e hierarquia Sintética vs. Analítica.
            </p>
            {planoContas && (
              <div className="mt-3 pt-3 border-t border-slate-100 text-xs space-y-1">
                <div className="font-medium text-slate-800 truncate">{planoContas.nomeArquivo}</div>
                <div className="flex justify-between text-slate-600">
                  <span>Contas catalogadas:</span>
                  <span className="font-mono font-semibold">{planoContas.itens.length}</span>
                </div>
              </div>
            )}
          </div>

          <label className="mt-4 flex items-center justify-center gap-2 w-full py-2 px-3 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 rounded-md cursor-pointer transition-colors">
            <FileText className="w-3.5 h-3.5" />
            <span>{planoContas ? 'Substituir Plano' : 'Selecionar Plano (Opcional)'}</span>
            <input
              type="file"
              accept=".pdf,.xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadPlanoContas(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      {/* Painel das Três Validações Obrigatórias + Resumo da Importação CT2 */}
      {razao && resumoCT2 && (() => {
        const docsDesbalanceados = (razao.validacoesDocumentos ?? []).filter((d) => !d.ok);
        const validacaoDocumentosOk = !razao.bloqueioGlobalDocumentos && docsDesbalanceados.length === 0;
        const validacoesContas = razao.validacoesContasBalancete ?? [];
        const validacaoContasFolhaMovimentoOk = validacoesContas
          .filter((vc) => vc.vinculadaFolha)
          .every((vc) => vc.movimentoOk);
        const validacaoContasFolhaSaldoFinalOk = validacoesContas
          .filter((vc) => vc.vinculadaFolha)
          .every((vc) => vc.saldoFinalOk);
        const avisosContasForaDaFolhaCount = validacoesContas.filter(
          (vc) => !vc.vinculadaFolha && (!vc.movimentoOk || !vc.saldoFinalOk)
        ).length;

        return (
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-[11px] font-mono font-bold bg-slate-900 text-emerald-400 rounded">
                    {resumoCT2.formatoDetectado === 'ct2_45_colunas'
                      ? 'LAYOUT CT2 PROTHEUS (45 COLUNAS)'
                      : 'LAYOUT RAZÃO CTBR400 (9 COLUNAS)'}
                  </span>
                  {resumoCT2.saldoProvisorioSemBalancete && (
                    <span className="px-2 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-300 rounded">
                      SALDO PROVISÓRIO (AGUARDANDO BALANCETE)
                    </span>
                  )}
                </div>
                <h2 className="text-base font-bold text-slate-900 mt-1">
                  Resumo da Importação CT2 e Três Validações Obrigatórias (a, b, c)
                </h2>
                <p className="text-xs text-slate-500">
                  Escopo seletivo de bloqueio: <strong>(a)</strong> documento desbalanceado bloqueia toda a conciliação;{' '}
                  <strong>(b)</strong> e <strong>(c)</strong> bloqueiam apenas as contas vinculadas à folha no De/Para (demais contas da empresa geram aviso informativo).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded">
                  Total Débitos CT2:{' '}
                  <strong className="text-slate-900">{formatCentsBRL(resumoCT2.totalDebitosCents, true)}</strong>
                </div>
                <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded">
                  Total Créditos CT2:{' '}
                  <strong className="text-slate-900">{formatCentsBRL(resumoCT2.totalCreditosCents, true)}</strong>
                </div>
              </div>
            </div>

            {/* Indicadores de Leitura do CT2 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded p-3">
                <span className="text-slate-500 block">Linhas Brutas Lidas</span>
                <span className="text-base font-mono font-bold text-slate-900">{resumoCT2.linhasBrutasLidas}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded p-3">
                <span className="text-slate-500 block">Cont.Hist Anexados</span>
                <span className="text-base font-mono font-bold text-emerald-700">{resumoCT2.contHistAnexados}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded p-3">
                <span className="text-slate-500 block">Partidas Dobradas (×2)</span>
                <span className="text-base font-mono font-bold text-blue-700">{resumoCT2.partidasDobradasDesdobradas}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded p-3">
                <span className="text-slate-500 block">Lançamentos Ativos</span>
                <span className="text-base font-mono font-bold text-slate-900">{resumoCT2.lancamentosNoPeriodoAtivo}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded p-3">
                <span className="text-slate-500 block">Ignoradas (Sld≠1/Moeda≠01)</span>
                <span className="text-base font-mono font-bold text-amber-700">
                  {resumoCT2.linhasIgnoradasFiltroSaldoMoeda}
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded p-3">
                <span className="text-slate-500 block">Fora do Período Balancete</span>
                <span className="text-base font-mono font-bold text-amber-700">
                  {resumoCT2.linhasForaDoPeriodoBalancete}
                </span>
              </div>
            </div>

            {/* Avisos de Filtros, Saldo Provisório ou Erros de Leitura */}
            {resumoCT2.saldoProvisorioSemBalancete && (
              <div className="bg-amber-50 border border-amber-300 rounded-md p-3 text-xs text-amber-900 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <strong>Saldo Corrido Provisório:</strong> O CT2 foi importado antes do Balancete. Os saldos corridos por conta foram iniciados em{' '}
                  <code className="font-mono">R$ 0,00</code>. Assim que você carregar o Balancete (CTBR040), o sistema recalculará automaticamente o saldo corrido a partir do Saldo Anterior de cada conta e executará as validações (b) e (c).
                </div>
              </div>
            )}

            {(resumoCT2.linhasIgnoradasFiltroSaldoMoeda > 0 ||
              resumoCT2.linhasForaDoPeriodoBalancete > 0 ||
              resumoCT2.outrosTiposLctoAlertas.length > 0 ||
              resumoCT2.errosBloqueantes.length > 0) && (
              <div className="space-y-2">
                {resumoCT2.linhasIgnoradasFiltroSaldoMoeda > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded p-2.5 text-xs text-amber-900">
                    <strong>Filtro Tipo do Sld = 1 e Moeda = 01:</strong> {resumoCT2.linhasIgnoradasFiltroSaldoMoeda} linha(s) ignorada(s) por pertencerem a outro tipo de saldo ou moeda.
                  </div>
                )}
                {resumoCT2.linhasForaDoPeriodoBalancete > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded p-2.5 text-xs text-amber-900">
                    <strong>Filtro de Período do Balancete ({balancete?.competencia.slice(4)}/{balancete?.competencia.slice(0, 4)}):</strong>{' '}
                    {resumoCT2.linhasForaDoPeriodoBalancete} lançamento(s) de outros meses foram excluídos do cálculo de movimento e saldo corrido para não quebrar as validações (b) e (c).
                  </div>
                )}
                {resumoCT2.errosBloqueantes.map((err, idx) => (
                  <div key={idx} className="bg-red-50 border border-red-200 rounded p-2.5 text-xs text-red-800">
                    <strong>Bloqueio / Anomalia CT2:</strong> {err}
                  </div>
                ))}
              </div>
            )}

            {/* Cartões das 3 Validações Obrigatórias (a, b, c) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Validação (a) */}
              <div
                className={`border rounded-lg p-4 space-y-1.5 ${
                  validacaoDocumentosOk
                    ? 'bg-emerald-50/60 border-emerald-200'
                    : 'bg-red-50 border-red-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-slate-700">
                    Validação (a) • Equilíbrio por Documento
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[11px] font-mono font-bold rounded ${
                      validacaoDocumentosOk
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-red-600 text-white'
                    }`}
                  >
                    {validacaoDocumentosOk ? 'APROVADA' : 'BLOQUEIO GLOBAL'}
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Em cada documento (<code className="font-mono">Filial+Data+Lote+Sub+Doc</code>), soma dos Débitos = soma dos Créditos.
                </p>
                {!validacaoDocumentosOk && (
                  <div className="pt-2 space-y-1 text-[11px] font-mono text-red-900">
                    {docsDesbalanceados.map((d) => (
                      <div key={d.chaveDocumento}>
                        • Doc {d.chaveDocumento}: Déb {formatCentsBRL(d.somaDebitoCents, true)} × Créd{' '}
                        {formatCentsBRL(d.somaCreditoCents, true)} (Dif: {formatCentsBRL(d.diferencaCents, true)})
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Validação (b) */}
              <div
                className={`border rounded-lg p-4 space-y-1.5 ${
                  resumoCT2.saldoProvisorioSemBalancete
                    ? 'bg-slate-50 border-slate-200'
                    : validacaoContasFolhaMovimentoOk
                    ? 'bg-emerald-50/60 border-emerald-200'
                    : 'bg-red-50 border-red-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-slate-700">
                    Validação (b) • Movimento CT2 × Balancete
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[11px] font-mono font-bold rounded ${
                      resumoCT2.saldoProvisorioSemBalancete
                        ? 'bg-slate-200 text-slate-700'
                        : validacaoContasFolhaMovimentoOk
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-red-600 text-white'
                    }`}
                  >
                    {resumoCT2.saldoProvisorioSemBalancete
                      ? 'AGUARDANDO BALANCETE'
                      : validacaoContasFolhaMovimentoOk
                      ? 'CONTAS FOLHA OK'
                      : 'BLOQUEIO CONTA FOLHA'}
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Soma de Débitos e Créditos do CT2 igual às colunas Movimento do Balancete. Bloqueia apenas contas mapeadas no De/Para.
                </p>
              </div>

              {/* Validação (c) */}
              <div
                className={`border rounded-lg p-4 space-y-1.5 ${
                  resumoCT2.saldoProvisorioSemBalancete
                    ? 'bg-slate-50 border-slate-200'
                    : validacaoContasFolhaSaldoFinalOk
                    ? 'bg-emerald-50/60 border-emerald-200'
                    : 'bg-red-50 border-red-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-slate-700">
                    Validação (c) • Saldo Corrido Final × Balancete
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[11px] font-mono font-bold rounded ${
                      resumoCT2.saldoProvisorioSemBalancete
                        ? 'bg-slate-200 text-slate-700'
                        : validacaoContasFolhaSaldoFinalOk
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-red-600 text-white'
                    }`}
                  >
                    {resumoCT2.saldoProvisorioSemBalancete
                      ? 'AGUARDANDO BALANCETE'
                      : validacaoContasFolhaSaldoFinalOk
                      ? 'CONTAS FOLHA OK'
                      : 'BLOQUEIO CONTA FOLHA'}
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Último saldo corrido calculado (<code className="font-mono">Sld Ant + Déb − Créd</code>) igual ao Saldo Atual do Balancete.
                </p>
                {!resumoCT2.saldoProvisorioSemBalancete && avisosContasForaDaFolhaCount > 0 && (
                  <div className="text-[11px] text-amber-800 font-medium pt-1">
                    ℹ {avisosContasForaDaFolhaCount} conta(s) fora da folha com aviso informativo (não trava a folha).
                  </div>
                )}
              </div>
            </div>

            {/* Tabela de Conferência por Conta (b) e (c) */}
            {validacoesContas.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="text-xs font-bold text-slate-800">
                    Detalhamento por Conta Analítica — Saldo Corrido Calculado a partir do Balancete ({validacoesContas.length} contas)
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    {(['TODAS', 'FOLHA', 'DIVERGENTES'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setCt2ValidationFilter(f)}
                        className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                          ct2ValidationFilter === f
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {f === 'TODAS' ? 'Todas' : f === 'FOLHA' ? 'Só Contas da Folha (De/Para)' : 'Só Divergentes/Avisos'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded max-h-72">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-100 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-1.5 px-2.5 font-semibold">Conta</th>
                        <th className="py-1.5 px-2.5 font-semibold">Descrição</th>
                        <th className="py-1.5 px-2.5 font-semibold">Escopo</th>
                        <th className="py-1.5 px-2.5 font-semibold text-right">Débito CT2</th>
                        <th className="py-1.5 px-2.5 font-semibold text-right">Débito Bal.</th>
                        <th className="py-1.5 px-2.5 font-semibold text-right">Crédito CT2</th>
                        <th className="py-1.5 px-2.5 font-semibold text-right">Crédito Bal.</th>
                        <th className="py-1.5 px-2.5 font-semibold text-right">Saldo Final CT2</th>
                        <th className="py-1.5 px-2.5 font-semibold text-right">Saldo Atual Bal.</th>
                        <th className="py-1.5 px-2.5 font-semibold">Status (b)/(c)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {validacoesContas
                        .filter((vc) => {
                          if (ct2ValidationFilter === 'FOLHA') return vc.vinculadaFolha;
                          if (ct2ValidationFilter === 'DIVERGENTES') return !vc.movimentoOk || !vc.saldoFinalOk;
                          return true;
                        })
                        .map((vc) => {
                          const ok = vc.movimentoOk && vc.saldoFinalOk;
                          return (
                            <tr key={vc.contaNormalizada} className="hover:bg-slate-50">
                              <td className="py-1.5 px-2.5 font-mono font-bold text-slate-900">
                                {vc.contaFormatada}
                              </td>
                              <td className="py-1.5 px-2.5 text-slate-700 truncate max-w-[180px]">
                                {vc.descricao}
                              </td>
                              <td className="py-1.5 px-2.5">
                                {vc.vinculadaFolha ? (
                                  <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-900 text-white rounded">
                                    Folha De/Para (Bloqueante)
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-300 rounded">
                                    Geral Empresa (Aviso)
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 px-2.5 font-mono text-right">{formatCentsBRL(vc.debitoCT2Cents)}</td>
                              <td className="py-1.5 px-2.5 font-mono text-right text-slate-500">
                                {formatCentsBRL(vc.debitoBalanceteCents)}
                              </td>
                              <td className="py-1.5 px-2.5 font-mono text-right">{formatCentsBRL(vc.creditoCT2Cents)}</td>
                              <td className="py-1.5 px-2.5 font-mono text-right text-slate-500">
                                {formatCentsBRL(vc.creditoBalanceteCents)}
                              </td>
                              <td className="py-1.5 px-2.5 font-mono text-right font-semibold">
                                {formatSignedCentsDC(vc.ultimoSaldoCorridoCT2SignedCents)}
                              </td>
                              <td className="py-1.5 px-2.5 font-mono text-right text-slate-600">
                                {formatSignedCentsDC(vc.saldoAtualBalanceteSignedCents)}
                              </td>
                              <td className="py-1.5 px-2.5 whitespace-nowrap">
                                {ok ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                    <CheckCircle2 className="w-3 h-3" />
                                    100% Íntegro
                                  </span>
                                ) : vc.bloqueante ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-800 border border-red-300 rounded">
                                    <ShieldAlert className="w-3 h-3" />
                                    Bloqueia Conta
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 rounded">
                                    <AlertTriangle className="w-3 h-3" />
                                    Aviso Fora da Folha
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Estado Vazio Inicial: Instruções Claras */}
      {!folha && !balancete && !razao && (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center mx-auto">
            <Upload className="w-5 h-5" />
          </div>
          <h2 className="text-base font-bold text-slate-900">
            Nenhum arquivo carregado na sessão atual
          </h2>
          <p className="text-xs text-slate-600 max-w-xl mx-auto">
            Faça o upload manual dos relatórios nos quadros acima ou utilize os botões no topo direito para{' '}
            <strong>Executar o Teste de Aceite CT2 (24 Linhas)</strong>,{' '}
            <strong>Exportar o Razão de Setembro/2026 (.XLSX)</strong>,{' '}
            <strong>Ler os PDFs Anexados</strong> ou{' '}
            <strong>Carregar o Caso Pramar Set/2026 Completo</strong>.
          </p>
        </div>
      )}

      {/* Painel de Validações de Leitura quando Folha ou Balancete estão carregados */}
      {(folha || balancete) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Diagnóstico da Folha GPER106 */}
          {folha && (
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Conferência Interna da Folha (GPER106)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Verificação Proventos − Descontos = Líquido (999) e trava FGTS ≈ 8% por filial
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSelectedFilialTab('TOTAL')}
                    className={`px-2.5 py-1 text-xs font-mono font-semibold rounded cursor-pointer ${
                      selectedFilialTab === 'TOTAL'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    TOTAL
                  </button>
                  {folha.filiais.map((f) => (
                    <button
                      key={f.filial}
                      type="button"
                      onClick={() => setSelectedFilialTab(f.filial)}
                      className={`px-2.5 py-1 text-xs font-mono font-semibold rounded cursor-pointer ${
                        selectedFilialTab === f.filial
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {f.filial}
                    </button>
                  ))}
                </div>
              </div>

              {(() => {
                const activeResumo =
                  selectedFilialTab === 'TOTAL'
                    ? folha.totalEmpresa
                    : folha.filiais.find((f) => f.filial === selectedFilialTab) || folha.totalEmpresa;
                const diffLiq = activeResumo.liquidoCalculadoCents - activeResumo.liquidoVerba999Cents;
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded border border-slate-200 text-xs">
                      <div>
                        <span className="text-slate-500 block">Total Proventos</span>
                        <span className="font-mono font-bold text-slate-900 text-sm">
                          {formatCentsBRL(activeResumo.totalProventosCents, true)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Total Descontos</span>
                        <span className="font-mono font-bold text-slate-900 text-sm">
                          {formatCentsBRL(activeResumo.totalDescontosCents, true)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Líquido (Verba 999)</span>
                        <span className="font-mono font-bold text-emerald-700 text-sm">
                          {formatCentsBRL(activeResumo.liquidoVerba999Cents, true)}
                        </span>
                        <span className="block text-[11px] text-slate-500 font-mono">
                          Dif: {formatCentsBRL(diffLiq, true)}
                        </span>
                      </div>
                    </div>

                    {folha.validacoesInternas.map((v) => (
                      <div
                        key={v.id}
                        className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900 space-y-1"
                      >
                        <div className="font-bold flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>{v.titulo}</span>
                        </div>
                        <p className="text-amber-800">{v.detalhe}</p>
                        {v.valorEsperadoCents !== undefined && v.valorEncontradoCents !== undefined && (
                          <div className="font-mono text-[11px] pt-1 flex gap-4">
                            <span>Esperado (8%): {formatCentsBRL(v.valorEsperadoCents, true)}</span>
                            <span>Apurado (826+827): {formatCentsBRL(v.valorEncontradoCents, true)}</span>
                            <span className="font-bold">
                              Diferença: {formatCentsBRL(v.diferencaCents ?? 0, true)}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Diagnóstico Posicional do Balancete */}
          {balancete && (
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Auditoria de Leitura do Balancete (CTBR040)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Validação algébrica linha a linha (<code className="font-mono">Saldo Ant + Débito − Crédito = Saldo Atual</code>)
                  </p>
                </div>
                <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {balancete.errosEquacaoLinhas.length === 0 ? 'Equação 100% Íntegra' : `${balancete.errosEquacaoLinhas.length} Divergência(s)`}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                {balancete.anomaliasCorrigidas.map((anom, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded p-2.5 text-slate-700"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{anom}</span>
                  </div>
                ))}

                <div className="pt-2">
                  <div className="text-xs font-semibold text-slate-700 mb-1.5">
                    Amostra de Contas Trabalhistas Lidas (Passivo 2.1.0.10.400 e Ativo 1.1.0.60.300):
                  </div>
                  <div className="overflow-x-auto border border-slate-200 rounded">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                          <th className="py-1.5 px-2 font-semibold">Conta</th>
                          <th className="py-1.5 px-2 font-semibold">Descrição</th>
                          <th className="py-1.5 px-2 font-semibold text-right">Saldo Ant.</th>
                          <th className="py-1.5 px-2 font-semibold text-right">Débito</th>
                          <th className="py-1.5 px-2 font-semibold text-right">Crédito</th>
                          <th className="py-1.5 px-2 font-semibold text-right">Saldo Atual</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {balancete.linhas
                          .filter(
                            (l) =>
                              l.classe === 'analitica' &&
                              (l.contaNormalizada.startsWith('2101040000') ||
                                l.contaNormalizada.startsWith('1106030000'))
                          )
                          .slice(0, 9)
                          .map((l) => (
                            <tr key={l.contaNormalizada} className="hover:bg-slate-50">
                              <td className="py-1.5 px-2 font-mono font-medium text-slate-900">
                                {l.contaFormatada}
                              </td>
                              <td className="py-1.5 px-2 text-slate-700 truncate max-w-[160px]">
                                {l.descricao}
                              </td>
                              <td className="py-1.5 px-2 font-mono text-right text-slate-600">
                                {formatSignedCentsDC(l.saldoAnteriorSignedCents)}
                              </td>
                              <td className="py-1.5 px-2 font-mono text-right text-slate-700">
                                {formatCentsBRL(l.debitoCents)}
                              </td>
                              <td className="py-1.5 px-2 font-mono text-right text-slate-700">
                                {formatCentsBRL(l.creditoCents)}
                              </td>
                              <td className="py-1.5 px-2 font-mono text-right font-semibold text-slate-900">
                                {formatSignedCentsDC(l.saldoAtualSignedCents)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {(balancete || razao) && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onProceedToDashboard}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md shadow-xs cursor-pointer transition-colors"
          >
            <span>Ir para Painel de Conciliação e Pendências</span>
          </button>
        </div>
      )}
    </div>
  );
};
