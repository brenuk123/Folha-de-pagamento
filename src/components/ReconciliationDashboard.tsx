import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Eye,
  EyeOff,
  FileSearch,
  Layers,
  Save,
  ShieldAlert,
} from 'lucide-react';
import {
  AccountReconciliationResult,
  ExpenseDoubleEntryCheck,
  FolhaData,
  PendenciaAuditRecord,
  RazaoData,
} from '../types/reconciliation';
import { formatCentsBRL, formatSignedCentsDC } from '../utils/money';

interface ReconciliationDashboardProps {
  empresa: string;
  competencia: string;
  folha: FolhaData | null;
  razao?: RazaoData | null;
  resultados: AccountReconciliationResult[];
  conferenciaDespesas: ExpenseDoubleEntryCheck[];
  pendenciasMap: Record<string, PendenciaAuditRecord>;
  toleranceCents: number;
  anonymizePii: boolean;
  onChangeToleranceCents: (cents: number) => void;
  onToggleAnonymizePii: () => void;
  onSelectAccount: (acc: AccountReconciliationResult) => void;
  onSaveCurrentSnapshot: () => void;
  snapshotSavedFeedback: boolean;
}

export const ReconciliationDashboard: React.FC<ReconciliationDashboardProps> = ({
  empresa,
  competencia,
  folha,
  razao,
  resultados,
  conferenciaDespesas,
  pendenciasMap,
  toleranceCents,
  anonymizePii,
  onChangeToleranceCents,
  onToggleAnonymizePii,
  onSelectAccount,
  onSaveCurrentSnapshot,
  snapshotSavedFeedback,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('TODAS');

  const contasPrincipais = resultados.filter(
    (r) => r.grupoContabil === 'passivo_trabalhista' || r.grupoContabil === 'ativo_adiantamentos'
  );
  const contasProvisaoESemVinculo = resultados.filter(
    (r) => r.grupoContabil === 'provisoes_sem_fonte' || r.grupoContabil === 'despesas_antecipadas'
  );

  const filteredPrincipais = contasPrincipais.filter((r) => {
    if (statusFilter === 'TODAS') return true;
    if (statusFilter === 'CONCILIADAS') return r.statusConciliacao === 'conciliada';
    if (statusFilter === 'DIVERGENTES')
      return r.statusConciliacao === 'divergente' || r.statusConciliacao === 'bloqueada_ct2';
    if (statusFilter === 'MISTAS') return r.statusVinculoDePara === 'conta_mista';
    return true;
  });

  const totalConciliadas = contasPrincipais.filter((r) => r.statusConciliacao === 'conciliada').length;
  const totalDivergentes = contasPrincipais.filter(
    (r) => r.statusConciliacao === 'divergente' || r.statusConciliacao === 'bloqueada_ct2'
  ).length;
  const totalBloqueadasCT2 = contasPrincipais.filter((r) => r.statusConciliacao === 'bloqueada_ct2').length;
  const totalMistas = contasPrincipais.filter((r) => r.statusVinculoDePara === 'conta_mista').length;

  const resumoCT2 = razao?.resumoImportacao;

  return (
    <div className="space-y-6">
      {/* Barra Superior de Controles e Resumo Executivo */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-mono font-semibold text-slate-500">
            {empresa} • COMPETÊNCIA {competencia.slice(4)}/{competencia.slice(0, 4)} • ESCOPO: TOTAL EMPRESA (FILIAIS NO RAZÃO)
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            3. Painel de Conciliação Contábil (3 Camadas + Partida Dobrada da Despesa)
          </h1>
          <p className="text-xs text-slate-600">
            Clique em qualquer conta contábil para abrir a <strong>Investigação de Pendências pelo Razão (CT2)</strong>,
            conferir o saldo corrido, os lotes manuais (<code className="font-mono">0000BR</code>), metadados de <code className="font-mono">Origem</code> e gerar lançamentos de ajuste.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded border border-slate-300 text-xs">
            <span className="font-semibold text-slate-600">Tolerância:</span>
            <select
              value={toleranceCents}
              onChange={(e) => onChangeToleranceCents(Number(e.target.value))}
              className="bg-transparent font-mono font-bold text-slate-900 focus:outline-none"
            >
              <option value={1}>R$ 0,01</option>
              <option value={5}>R$ 0,05</option>
              <option value={100}>R$ 1,00</option>
            </select>
          </div>

          <button
            type="button"
            onClick={onToggleAnonymizePii}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded cursor-pointer"
          >
            {anonymizePii ? <EyeOff className="w-3.5 h-3.5 text-emerald-600" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{anonymizePii ? 'Anonimização LGPD: Ativa' : 'Anonimizar Nomes/CPF'}</span>
          </button>

          <button
            type="button"
            onClick={onSaveCurrentSnapshot}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{snapshotSavedFeedback ? '✔ Competência Salva!' : 'Salvar Competência no Histórico'}</span>
          </button>
        </div>
      </div>

      {/* Alerta de Bloqueio Global CT2 (Validação a) ou Bloqueio Seletivo (Validações b/c) */}
      {razao?.bloqueioGlobalDocumentos && (
        <div className="bg-red-50 border-2 border-red-500 rounded-lg p-4 flex items-start gap-3 text-xs text-red-900">
          <Ban className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-sm">
              BLOQUEIO GLOBAL DE CONCILIAÇÃO — Validação (a): Documento CT2 Desbalanceado
            </div>
            <p className="mt-0.5">
              Foram detectados {(razao.validacoesDocumentos ?? []).filter((d) => !d.ok).length} documento(s) no CT2 em que a soma dos Débitos difere da soma dos Créditos. Toda a conciliação permanece bloqueada até a correção da planilha CT2.
            </p>
          </div>
        </div>
      )}

      {razao &&
        !razao.bloqueioGlobalDocumentos &&
        totalBloqueadasCT2 > 0 && (
          <div className="bg-red-50 border border-red-300 rounded-lg p-3.5 flex items-start gap-3 text-xs text-red-900">
            <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <strong>Bloqueio Seletivo de Contas da Folha — Validações (b) e (c):</strong>{' '}
              {totalBloqueadasCT2} conta(s) vinculada(s) à folha no De/Para apresenta(m) divergência de Movimento ou de Saldo Corrido Final entre o CT2 e o Balancete. As demais contas conciliáveis seguem liberadas.
            </div>
          </div>
        )}

      {/* KPIs de Fechamento */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Contas Conciliadas (OK)</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-emerald-700">{totalConciliadas}</span>
            <span className="text-xs text-slate-500">de {contasPrincipais.length} contas diretas</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Incluindo 518 Adiantamento, 505 IRRF, 526 Pensão, 563 Rescisão, 564 Férias e 003 FGTS/Consig.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Contas com Divergência / Bloqueio</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-red-600">{totalDivergentes}</span>
            <span className="text-xs font-medium text-red-700">
              {totalBloqueadasCT2 > 0 ? `${totalBloqueadasCT2} bloqueada(s) CT2` : 'Exigem ação / justificativa'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            2.1.0.10.400.001 (Salários), 002 (INSS) e 1.1.0.60.300.006 (Convênio Farmácia).
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Contas de Natureza Mista</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-amber-600">{totalMistas}</span>
            <span className="text-xs font-mono text-amber-800">2.1.0.10.400.003</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            FGTS (R$ 21.688,09) + Consignados (R$ 13.965,39) = R$ 35.653,48.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Líquido Folha GPER106 (999)</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-mono font-bold text-slate-900">
              {folha ? formatCentsBRL(folha.totalEmpresa.liquidoVerba999Cents, true) : 'R$ 0,00'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Proventos: {folha ? formatCentsBRL(folha.totalEmpresa.totalProventosCents, true) : '0,00'} • Descontos:{' '}
            {folha ? formatCentsBRL(folha.totalEmpresa.totalDescontosCents, true) : '0,00'}
          </p>
        </div>
      </div>

      {/* Tabela Principal: Passivo Trabalhista (2.1.0.10.400.001 a 007) e Ativo Adiantamentos/Convênios (1.1.0.60.300.xxx) */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Conciliação por Conta Analítica — Passivo Trabalhista e Ativo de Adiantamentos/Convênios
            </h2>
            <p className="text-xs text-slate-500">
              Comparação separada de <strong>Movimento de Crédito (Apropriação)</strong> e <strong>Movimento de Débito (Baixa do Saldo Anterior)</strong>.
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            {(['TODAS', 'CONCILIADAS', 'DIVERGENTES', 'MISTAS'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                  statusFilter === tab
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                <th className="py-2.5 px-3 font-semibold">Conta</th>
                <th className="py-2.5 px-3 font-semibold">Descrição</th>
                <th className="py-2.5 px-3 font-semibold text-right">Folha GPER106</th>
                <th className="py-2.5 px-3 font-semibold text-right">Saldo Anterior</th>
                <th className="py-2.5 px-3 font-semibold text-right">Débito (Baixa)</th>
                <th className="py-2.5 px-3 font-semibold text-right">Crédito (Aprop.)</th>
                <th className="py-2.5 px-3 font-semibold text-right">Saldo Atual</th>
                <th className="py-2.5 px-3 font-semibold text-right">Dif. Crédito (Mês)</th>
                <th className="py-2.5 px-3 font-semibold text-right">Dif. Débito (Baixa)</th>
                <th className="py-2.5 px-3 font-semibold">Status Conta</th>
                <th className="py-2.5 px-3 font-semibold">Status Auditoria</th>
                <th className="py-2.5 px-3 font-semibold text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPrincipais.map((r) => {
                const auditKey = `${empresa}_${competencia}_${r.contaNormalizada}`;
                const auditRec = pendenciasMap[auditKey];
                return (
                  <tr
                    key={r.contaNormalizada}
                    onClick={() => onSelectAccount(r)}
                    className="hover:bg-slate-50/90 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {r.contaFormatada}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">{r.descricao}</div>
                      <div className="text-[11px] text-slate-500">
                        Verbas: {r.verbasMapeadas.map((v) => v.codigo).join(', ') || 'N/A'}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right font-semibold text-slate-900">
                      {formatCentsBRL(r.valorFolhaEsperadoCents)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right text-slate-600">
                      {formatSignedCentsDC(r.saldoAnteriorSignedCents)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right text-slate-700">
                      {formatCentsBRL(r.debitoBalanceteCents)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right font-semibold text-slate-900">
                      {formatCentsBRL(r.creditoBalanceteCents)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right text-slate-800">
                      {formatSignedCentsDC(r.saldoAtualSignedCents)}
                    </td>
                    <td
                      className={`py-2.5 px-3 font-mono text-right font-bold ${
                        Math.abs(r.diferencaMovimentoApropriacaoCents) <= toleranceCents
                          ? 'text-emerald-700'
                          : 'text-red-600'
                      }`}
                    >
                      {formatCentsBRL(r.diferencaMovimentoApropriacaoCents)}
                    </td>
                    <td
                      className={`py-2.5 px-3 font-mono text-right font-medium ${
                        Math.abs(r.diferencaBaixaDebitoCents) <= toleranceCents
                          ? 'text-slate-500'
                          : 'text-amber-700 font-bold'
                      }`}
                    >
                      {r.grupoContabil === 'passivo_trabalhista'
                        ? formatCentsBRL(r.diferencaBaixaDebitoCents)
                        : '–'}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {r.statusConciliacao === 'conciliada' && r.statusVinculoDePara !== 'conta_mista' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                          <CheckCircle2 className="w-3 h-3" />
                          Conciliada
                        </span>
                      )}
                      {r.statusConciliacao === 'conciliada' && r.statusVinculoDePara === 'conta_mista' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-300 rounded">
                          <AlertTriangle className="w-3 h-3" />
                          OK (Conta Mista)
                        </span>
                      )}
                      {r.statusConciliacao === 'divergente' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200 rounded">
                          <ShieldAlert className="w-3 h-3" />
                          Divergente
                        </span>
                      )}
                      {r.statusConciliacao === 'bloqueada_ct2' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold bg-red-600 text-white rounded">
                          <Ban className="w-3 h-3" />
                          Bloqueada CT2
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {auditRec ? (
                        <span
                          className={`px-2 py-0.5 text-[11px] font-semibold rounded border ${
                            auditRec.status === 'ajustada'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : auditRec.status === 'justificada'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-amber-50 text-amber-800 border-amber-300'
                          }`}
                        >
                          {auditRec.status.toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          {r.statusConciliacao === 'conciliada' ? 'Verificada' : 'Aberta'}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectAccount(r);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                      >
                        <FileSearch className="w-3.5 h-3.5" />
                        <span>Razão</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Seção: Lado da Despesa — Conferência da Partida Dobrada via C/PARTIDA */}
      {conferenciaDespesas.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-700" />
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Lado da Despesa — Conferência da Partida Dobrada via <code className="font-mono">C/PARTIDA</code>
                </h2>
                <p className="text-xs text-slate-500">
                  Soma as contas de resultado (Custo, Comercial e Administrativa) e confronta com o passivo trabalhista apropriado
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {conferenciaDespesas.map((cd, idx) => (
              <div key={idx} className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">{cd.grupoNome}</span>
                  <span
                    className={`px-2 py-0.5 text-[11px] font-mono font-bold rounded border ${
                      cd.status === 'ok'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}
                  >
                    {cd.status === 'ok' ? 'PARTIDA DOBRADA OK' : 'RATEIO POR C. CUSTO'}
                  </span>
                </div>

                <div className="overflow-x-auto bg-white border border-slate-200 rounded">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-100 text-slate-600">
                        <th className="py-1.5 px-2.5 font-semibold">Conta de Resultado</th>
                        <th className="py-1.5 px-2.5 font-semibold">Descrição</th>
                        <th className="py-1.5 px-2.5 font-semibold text-right">Débito no Mês</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cd.contasDespesa.map((c) => (
                        <tr key={c.contaFormatada}>
                          <td className="py-1.5 px-2.5 font-mono font-semibold text-slate-900">
                            {c.contaFormatada}
                          </td>
                          <td className="py-1.5 px-2.5 text-slate-700">{c.descricao}</td>
                          <td className="py-1.5 px-2.5 font-mono text-right font-semibold text-slate-900">
                            {formatCentsBRL(c.liquidoDespesaCents, true)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between text-xs pt-1 font-mono">
                  <span>Soma Despesa: <strong>{formatCentsBRL(cd.somaDespesaLiquidaCents, true)}</strong></span>
                  <span>Ref. Folha: <strong>{formatCentsBRL(cd.valorPassivoFolhaReferenciaCents, true)}</strong></span>
                  <span>Diferença: <strong>{formatCentsBRL(cd.diferencaCents, true)}</strong></span>
                </div>
                <p className="text-[11px] text-slate-600">{cd.observacao}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Seção Dedicada: Contas sem Fonte na Folha Sintética e Contas sem Vínculo Validado */}
      {contasProvisaoESemVinculo.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-900">
              Seção Dedicada — Contas sem Vínculo Validado (VT/VR/VC/VA) e Provisões Conferidas pelo Razão (010 a 015)
            </h2>
            <p className="text-xs text-slate-500">
              As 4 contas de despesa antecipada (<code className="font-mono">1.1.2.00.100.001</code> a <code className="font-mono">004</code>) estão marcadas como <strong>Sem Vínculo Validado</strong> até definição de critério; as provisões trabalhistas (<code className="font-mono">2.1.0.10.400.010</code> a <code className="font-mono">015</code>) são auditadas via lote <code className="font-mono">008895</code> no Razão.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                  <th className="py-2 px-3 font-semibold">Conta</th>
                  <th className="py-2 px-3 font-semibold">Descrição</th>
                  <th className="py-2 px-3 font-semibold">Classificação Especial</th>
                  <th className="py-2 px-3 font-semibold text-right">Saldo Anterior</th>
                  <th className="py-2 px-3 font-semibold text-right">Débito</th>
                  <th className="py-2 px-3 font-semibold text-right">Crédito</th>
                  <th className="py-2 px-3 font-semibold text-right">Saldo Atual</th>
                  <th className="py-2 px-3 font-semibold">Conferência Razão</th>
                  <th className="py-2 px-3 font-semibold text-right">Inspecionar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contasProvisaoESemVinculo.map((r) => (
                  <tr
                    key={r.contaNormalizada}
                    onClick={() => onSelectAccount(r)}
                    className="hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="py-2 px-3 font-mono font-bold text-slate-900">{r.contaFormatada}</td>
                    <td className="py-2 px-3 font-medium text-slate-800">{r.descricao}</td>
                    <td className="py-2 px-3">
                      {r.grupoContabil === 'despesas_antecipadas' ? (
                        <span className="px-2 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-300 rounded">
                          Sem Vínculo Validado (Benefícios)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-300 rounded">
                          Provisão Sem Fonte no GPER106
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono text-right text-slate-600">
                      {formatSignedCentsDC(r.saldoAnteriorSignedCents)}
                    </td>
                    <td className="py-2 px-3 font-mono text-right text-slate-700">
                      {formatCentsBRL(r.debitoBalanceteCents)}
                    </td>
                    <td className="py-2 px-3 font-mono text-right text-slate-700">
                      {formatCentsBRL(r.creditoBalanceteCents)}
                    </td>
                    <td className="py-2 px-3 font-mono text-right font-semibold text-slate-900">
                      {formatSignedCentsDC(r.saldoAtualSignedCents)}
                    </td>
                    <td className="py-2 px-3 font-mono text-xs">
                      {r.temRazaoCarregado ? (
                        <span className="text-emerald-700 font-semibold">✔ Auditada via CT2</span>
                      ) : (
                        <span className="text-slate-400">Aguardando Razão</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900"
                      >
                        <span>Ver Detalhe</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
