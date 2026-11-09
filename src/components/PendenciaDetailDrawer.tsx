import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileCode2,
  HelpCircle,
  History,
  Save,
  X,
} from 'lucide-react';
import {
  AccountReconciliationResult,
  PendenciaAuditRecord,
  PendenciaAuditStatus,
} from '../types/reconciliation';
import { formatCentsBRL, formatSignedCentsDC } from '../utils/money';

interface PendenciaDetailDrawerProps {
  account: AccountReconciliationResult | null;
  empresa: string;
  competencia: string;
  anonymizePii: boolean;
  existingAuditRecord?: PendenciaAuditRecord;
  onSaveAuditRecord: (record: PendenciaAuditRecord) => void;
  onClose: () => void;
}

export const PendenciaDetailDrawer: React.FC<PendenciaDetailDrawerProps> = ({
  account,
  empresa,
  competencia,
  anonymizePii,
  existingAuditRecord,
  onSaveAuditRecord,
  onClose,
}) => {
  const [status, setStatus] = useState<PendenciaAuditStatus>('aberta');
  const [comentario, setComentario] = useState<string>('');
  const [usuarioAuditor, setUsuarioAuditor] = useState<string>('Auditor Sênior Contábil');
  const [savedFeedback, setSavedFeedback] = useState<boolean>(false);

  useEffect(() => {
    if (existingAuditRecord) {
      setStatus(existingAuditRecord.status);
      setComentario(existingAuditRecord.comentario);
      setUsuarioAuditor(existingAuditRecord.usuarioAuditor);
    } else if (account) {
      setStatus(account.statusConciliacao === 'conciliada' ? 'ajustada' : 'aberta');
      setComentario('');
    }
  }, [account, existingAuditRecord]);

  if (!account) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveAuditRecord({
      contaNormalizada: account.contaNormalizada,
      competencia,
      empresa,
      status,
      comentario: comentario.trim() || account.explicacaoObjetiva,
      usuarioAuditor: usuarioAuditor.trim() || 'Auditor Contábil',
      atualizadoEm: new Date().toLocaleString('pt-BR'),
      transportadaDeCompetenciaAnterior: existingAuditRecord?.transportadaDeCompetenciaAnterior,
      valorDiferencaCents: account.diferencaMovimentoApropriacaoCents,
    });
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex justify-end">
      <div className="w-full max-w-6xl bg-white h-full overflow-y-auto shadow-2xl border-l border-slate-200 flex flex-col">
        {/* Cabeçalho Fixo */}
        <div className="sticky top-0 z-10 bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-emerald-400">
                {account.contaFormatada}
              </span>
              <span className="text-xs font-mono text-slate-400">
                (Chave sem pontos: {account.contaNormalizada})
              </span>
              {existingAuditRecord?.transportadaDeCompetenciaAnterior && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-400/40 rounded">
                  <History className="w-3 h-3" />
                  Transportada de {existingAuditRecord.transportadaDeCompetenciaAnterior.slice(4)}/
                  {existingAuditRecord.transportadaDeCompetenciaAnterior.slice(0, 4)}
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold mt-0.5">{account.descricao}</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1">
          {/* 1. Decomposição em 3 Camadas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
              <div className="text-[11px] font-bold uppercase text-slate-500">
                1. Apropriação (Crédito × Folha)
              </div>
              <div className="mt-1 space-y-0.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Folha GPER106:</span>
                  <span className="font-mono font-semibold">
                    {formatCentsBRL(account.valorFolhaEsperadoCents, true)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">
                    {account.movimentoComparadoTipo === 'credito' ? 'Crédito Balancete:' : 'Débito Balancete:'}
                  </span>
                  <span className="font-mono font-semibold">
                    {formatCentsBRL(account.movimentoComparadoBalanceteCents, true)}
                  </span>
                </div>
                <div className="pt-1 border-t border-slate-200 flex justify-between font-bold">
                  <span>Dif. Apropriação:</span>
                  <span
                    className={`font-mono ${
                      Math.abs(account.diferencaMovimentoApropriacaoCents) <= 1
                        ? 'text-emerald-700'
                        : 'text-red-600'
                    }`}
                  >
                    {formatCentsBRL(account.diferencaMovimentoApropriacaoCents, true)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
              <div className="text-[11px] font-bold uppercase text-slate-500">
                2. Baixas (Débito × Saldo Ant.)
              </div>
              <div className="mt-1 space-y-0.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Saldo Anterior:</span>
                  <span className="font-mono font-semibold">
                    {formatSignedCentsDC(account.saldoAnteriorSignedCents, true)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Débito Balancete:</span>
                  <span className="font-mono font-semibold">
                    {formatCentsBRL(account.debitoBalanceteCents, true)}
                  </span>
                </div>
                <div className="pt-1 border-t border-slate-200 flex justify-between font-bold">
                  <span>Dif. Baixa Mês:</span>
                  <span
                    className={`font-mono ${
                      Math.abs(account.diferencaBaixaDebitoCents) <= 1 ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {formatCentsBRL(account.diferencaBaixaDebitoCents, true)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
              <div className="text-[11px] font-bold uppercase text-slate-500">
                3. Efeito Líquido no Saldo
              </div>
              <div className="mt-1 space-y-0.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Saldo Atual Bal.:</span>
                  <span className="font-mono font-semibold">
                    {formatSignedCentsDC(account.saldoAtualSignedCents, true)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Folha Líquida:</span>
                  <span className="font-mono font-semibold">
                    {formatCentsBRL(account.valorFolhaEsperadoCents, true)}
                  </span>
                </div>
                <div className="pt-1 border-t border-slate-200 flex justify-between font-bold">
                  <span>Efeito Líquido:</span>
                  <span className="font-mono text-slate-900">
                    {formatCentsBRL(account.diferencaSaldoLiquidoCents, true)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
              <div className="text-[11px] font-bold uppercase text-slate-500">
                4. Balancete × Razão CT2 (b/c)
              </div>
              <div className="mt-1 space-y-0.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Débito Razão:</span>
                  <span className="font-mono font-semibold">
                    {account.temRazaoCarregado ? formatCentsBRL(account.debitoRazaoCents, true) : 'N/D'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Crédito Razão:</span>
                  <span className="font-mono font-semibold">
                    {account.temRazaoCarregado ? formatCentsBRL(account.creditoRazaoCents, true) : 'N/D'}
                  </span>
                </div>
                <div className="pt-1 border-t border-slate-200 flex justify-between font-bold">
                  <span>Integridade CT2:</span>
                  <span className={`font-mono ${account.fechamentoBalanceteRazaoOk ? 'text-emerald-700' : 'text-red-600'}`}>
                    {account.temRazaoCarregado
                      ? account.fechamentoBalanceteRazaoOk
                        ? '100% FECHADO'
                        : 'BLOQUEADO (b/c)'
                      : 'SEM RAZÃO'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Explicação Objetiva da Auditoria e Busca Combinatória (Subset-Sum) */}
          <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                Diagnóstico Técnico da Conta:
              </span>
              {account.classificacaoDivergencia.map((c, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-300 rounded"
                >
                  {c}
                </span>
              ))}
            </div>
            <p className="text-xs text-slate-800 leading-relaxed">{account.explicacaoObjetiva}</p>

            {account.combinacaoExataEncontrada && (
              <div className="mt-3 pt-3 border-t border-amber-200/80 bg-white rounded p-3 border">
                <div className="text-xs font-bold text-slate-900 mb-1.5">
                  🎯 {account.combinacaoExataEncontrada.descricaoCombinacao}
                </div>
                <ul className="space-y-1 text-xs font-mono">
                  {account.combinacaoExataEncontrada.itens.map((it, idx) => (
                    <li key={idx} className="flex justify-between text-slate-700">
                      <span>• {it.label}</span>
                      <span className="font-bold text-slate-900">{formatCentsBRL(it.valorCents, true)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* 3. Verbas da Folha Mapeadas na Conta (Com Abertura por Filial) */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Rubricas da Folha (GPER106) Vinculadas a Esta Conta
              </h3>
              <span className="text-xs font-mono font-bold text-slate-900">
                Total Folha: {formatCentsBRL(account.valorFolhaEsperadoCents, true)}
              </span>
            </div>
            {account.verbasMapeadas.length === 0 ? (
              <div className="p-4 text-xs text-slate-500">
                Nenhuma rubrica da folha sintética vinculada diretamente a esta conta (conta de provisão ou sem vínculo validado).
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                      <th className="py-2 px-3 font-semibold">Cód.</th>
                      <th className="py-2 px-3 font-semibold">Descrição da Verba</th>
                      <th className="py-2 px-3 font-semibold">Tipo Funcional</th>
                      <th className="py-2 px-3 font-semibold text-right">Filial 0101</th>
                      <th className="py-2 px-3 font-semibold text-right">Filial 0102</th>
                      <th className="py-2 px-3 font-semibold text-right">Filial 0103</th>
                      <th className="py-2 px-3 font-semibold text-right">Filial 0104</th>
                      <th className="py-2 px-3 font-semibold text-right">Total Empresa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {account.verbasMapeadas.map((vm) => (
                      <tr key={vm.codigo} className="hover:bg-slate-50">
                        <td className="py-1.5 px-3 font-mono font-bold text-slate-900">{vm.codigo}</td>
                        <td className="py-1.5 px-3 text-slate-800">{vm.descricao}</td>
                        <td className="py-1.5 px-3 font-mono text-[11px] text-slate-600">{vm.tipoVerba}</td>
                        <td className="py-1.5 px-3 font-mono text-right text-slate-600">
                          {formatCentsBRL(vm.porFilial['0101'] ?? 0)}
                        </td>
                        <td className="py-1.5 px-3 font-mono text-right text-slate-600">
                          {formatCentsBRL(vm.porFilial['0102'] ?? 0)}
                        </td>
                        <td className="py-1.5 px-3 font-mono text-right text-slate-600">
                          {formatCentsBRL(vm.porFilial['0103'] ?? 0)}
                        </td>
                        <td className="py-1.5 px-3 font-mono text-right text-slate-600">
                          {formatCentsBRL(vm.porFilial['0104'] ?? 0)}
                        </td>
                        <td className="py-1.5 px-3 font-mono text-right font-bold text-slate-900">
                          {formatCentsBRL(vm.valorTotalCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 4. Lançamentos do Razão Contábil CT2 e Classificação Individual */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Auditoria Analítica pelo Razão Contábil (Tabela CT2 • Saldo Corrido e Metadados)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Lotes com letras (<code className="font-mono">0000BR</code>, <code className="font-mono">SC0000</code>) recebem selo <strong>MANUAL</strong>. A coluna <code className="font-mono">Origem</code> é exibida em metadados estruturados (LP, Usuário, XORIG) sem contaminar o histórico nem a competência.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-600">
                {account.itensRazaoAnalisados.length} lançamento(s)
              </span>
            </div>

            {account.itensRazaoAnalisados.length === 0 ? (
              <div className="p-4 text-xs text-slate-500">
                Nenhum lançamento do Razão Contábil carregado para esta conta. Envie a planilha XLSX do Razão na aba 1 ou carregue o Caso Setembro/2026.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                      <th className="py-2 px-2.5 font-semibold">Status</th>
                      <th className="py-2 px-2.5 font-semibold">Data</th>
                      <th className="py-2 px-2.5 font-semibold">Chave CT2 / Lote</th>
                      <th className="py-2 px-2.5 font-semibold">Filial</th>
                      <th className="py-2 px-2.5 font-semibold">Histórico, Origem e Diagnóstico</th>
                      <th className="py-2 px-2.5 font-semibold">C/Partida</th>
                      <th className="py-2 px-2.5 font-semibold text-right">Débito</th>
                      <th className="py-2 px-2.5 font-semibold text-right">Crédito</th>
                      <th className="py-2 px-2.5 font-semibold text-right">Saldo Corrido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {account.itensRazaoAnalisados.map((item) => {
                      const l = item.lancamento;
                      const orig = l.origemEstruturada;
                      return (
                        <tr
                          key={l.id}
                          className={
                            item.statusMatch === 'explicado'
                              ? 'hover:bg-slate-50'
                              : item.statusMatch === 'historico_incompativel'
                              ? 'bg-amber-50/60 hover:bg-amber-50'
                              : 'bg-red-50/50 hover:bg-red-50'
                          }
                        >
                          <td className="py-2 px-2.5 whitespace-nowrap">
                            {item.statusMatch === 'explicado' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                                <CheckCircle2 className="w-3 h-3" />
                                Explicado
                              </span>
                            )}
                            {item.statusMatch === 'historico_incompativel' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 rounded">
                                <AlertTriangle className="w-3 h-3" />
                                Incompatível
                              </span>
                            )}
                            {item.statusMatch === 'sem_correspondencia' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-red-100 text-red-800 border border-red-300 rounded">
                                <HelpCircle className="w-3 h-3" />
                                Sem Match
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2.5 font-mono text-slate-700 whitespace-nowrap">{l.data}</td>
                          <td className="py-2 px-2.5 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                            <div>{l.chaveCT2}</div>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {l.manual && (
                                <span className="px-1.5 py-0.2 text-[10px] font-bold bg-amber-200 text-amber-950 border border-amber-400 rounded">
                                  MANUAL ({l.lote})
                                </span>
                              )}
                              {l.estornado && (
                                <span className="px-1.5 py-0.2 text-[10px] font-bold bg-red-600 text-white rounded">
                                  ESTORNO {l.statusEstornoBruto ? `(${l.statusEstornoBruto})` : ''}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-2.5 font-mono font-semibold text-slate-800 whitespace-nowrap">
                            <div>{l.filialOrigem}</div>
                            {l.centroCusto && (
                              <span className="text-[10px] font-mono text-slate-500 block">
                                CC: {l.centroCusto}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2.5">
                            <div className="font-medium text-slate-900">
                              {anonymizePii ? l.historicoAnonimizado : l.historico}
                            </div>
                            {orig && (orig.lpCodigo || orig.usuarioOrigem || orig.xorigFilial) && (
                              <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] font-mono text-slate-600">
                                {orig.lpCodigo && (
                                  <span className="px-1.5 py-0.2 bg-slate-100 border border-slate-300 rounded">
                                    LP {orig.lpCodigo}/{orig.lpSequencia}
                                  </span>
                                )}
                                {orig.usuarioOrigem && !anonymizePii && (
                                  <span className="px-1.5 py-0.2 bg-slate-100 border border-slate-200 rounded">
                                    Usu: {orig.usuarioOrigem}
                                  </span>
                                )}
                                {orig.dataOrigem && (
                                  <span className="px-1.5 py-0.2 bg-slate-100 border border-slate-200 rounded">
                                    Dt.Orig: {orig.dataOrigem}
                                  </span>
                                )}
                                {orig.xorigFilial && (
                                  <span className="px-1.5 py-0.2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded">
                                    XORIG: {orig.xorigFilial}
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="text-[11px] text-slate-600 mt-0.5">{item.motivoMatch}</div>
                          </td>
                          <td className="py-2 px-2.5 font-mono text-slate-700 whitespace-nowrap">
                            {l.contraPartidaFormatada}
                          </td>
                          <td className="py-2 px-2.5 font-mono text-right text-slate-800 whitespace-nowrap">
                            {l.debitoCents > 0 ? formatCentsBRL(l.debitoCents) : '–'}
                          </td>
                          <td className="py-2 px-2.5 font-mono text-right font-semibold text-slate-900 whitespace-nowrap">
                            {l.creditoCents > 0 ? formatCentsBRL(l.creditoCents) : '–'}
                          </td>
                          <td className="py-2 px-2.5 font-mono text-right font-semibold text-slate-800 whitespace-nowrap">
                            <div>{formatSignedCentsDC(l.saldoAtualSignedCents)}</div>
                            {l.saldoProvisorio && (
                              <span className="text-[9px] text-amber-700 font-sans block">Provisório</span>
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

          {/* 5. Sugestão de Lançamento de Ajuste */}
          {account.sugestoesAjusteCT2.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCode2 className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider">
                    Minuta de Lançamento Contábil de Ajuste (TOTVS CT2 + Auditoria)
                  </h3>
                </div>
                <span className="text-[11px] text-slate-300">Pronto para exportação CT2</span>
              </div>

              <div className="p-4 space-y-4">
                {account.sugestoesAjusteCT2.map((sug) => (
                  <div
                    key={sug.sequencia}
                    className="border border-slate-200 rounded-md p-3.5 bg-slate-50 space-y-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                      <span className="font-bold text-slate-900">
                        Ajuste #{sug.sequencia} • Filial {sug.filial} • Data: {sug.dataLancamento} • Lote: {sug.loteSugerido}
                      </span>
                      <span className="font-mono font-bold text-sm text-emerald-700">
                        Valor: {formatCentsBRL(sug.valorCents, true)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
                      <div className="bg-white p-2.5 rounded border border-slate-200">
                        <span className="text-[10px] font-sans font-bold uppercase text-slate-400 block">
                          Conta Débito (CT2_DEBITO)
                        </span>
                        <span className="font-bold text-slate-900">{sug.contaDebitoFormatada}</span>{' '}
                        <span className="text-slate-500">({sug.contaDebitoNormalizada})</span>
                      </div>
                      <div className="bg-white p-2.5 rounded border border-slate-200">
                        <span className="text-[10px] font-sans font-bold uppercase text-slate-400 block">
                          Conta Crédito (CT2_CREDIT)
                        </span>
                        <span className="font-bold text-slate-900">{sug.contaCreditoFormatada}</span>{' '}
                        <span className="text-slate-500">({sug.contaCreditoNormalizada})</span>
                      </div>
                    </div>

                    <div className="text-xs">
                      <span className="font-semibold text-slate-700">Histórico Padrão CT2: </span>
                      <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-900">
                        {sug.historicoPadraoCT2}
                      </code>
                    </div>
                    <div className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-700">Fundamentação de Auditoria: </span>
                      {sug.justificativaAuditoria}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 6. Controle de Status da Pendência e Trilha de Auditoria */}
          <form
            onSubmit={handleSave}
            className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-slate-700" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Controle de Status da Pendência (Trilha do Auditor — Persistente no IndexedDB)
                </h3>
              </div>
              {savedFeedback && (
                <span className="text-xs font-semibold text-emerald-700">
                  ✔ Parecer salvo com sucesso!
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                  Status da Pendência
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as PendenciaAuditStatus)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded font-semibold"
                >
                  <option value="aberta">Aberta (Transportar p/ Próximo Mês)</option>
                  <option value="justificada">Justificada (Composição Validada)</option>
                  <option value="ajustada">Ajustada (Lançamento CT2 Efetuado)</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                  Auditor / Contador Responsável
                </label>
                <input
                  type="text"
                  value={usuarioAuditor}
                  onChange={(e) => setUsuarioAuditor(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
                Comentário / Parecer de Auditoria
              </label>
              <textarea
                rows={2}
                placeholder="Descreva a justificativa contábil, número do chamado ou protocolo do ajuste CT2..."
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Registrar Status na Trilha de Auditoria
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
