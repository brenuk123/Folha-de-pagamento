import React, { useState } from 'react';
import {
  Check,
  Download,
  Lock,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  DeParaRule,
  LoteClassificacao,
  LoteConfig,
  VerbaTipoFuncional,
  VinculoStatus,
} from '../types/reconciliation';
import { normalizeAccountCode } from '../utils/money';

interface DeParaScreenProps {
  rules: DeParaRule[];
  loteConfigs: LoteConfig[];
  onChangeRules: (next: DeParaRule[]) => void;
  onChangeLoteConfigs: (next: LoteConfig[]) => void;
  onResetDefaults: () => void;
}

const TIPO_VERBA_LABELS: Record<VerbaTipoFuncional, { label: string; badgeClass: string }> = {
  provento: {
    label: 'Provento',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  desconto_real: {
    label: 'Desconto Real',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  liquido_pago_por_fora: {
    label: 'Líquido Pago por Fora (563/564)',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
  },
  estorno: {
    label: 'Estorno (570/572/954/958)',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  informativo_base: {
    label: 'Informativo / Base (Encargo/999)',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
  },
};

const STATUS_VINCULO_LABELS: Record<VinculoStatus, { label: string; badgeClass: string }> = {
  confirmado: {
    label: 'Confirmado',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  sugestao_nao_validada: {
    label: 'Sugestão (Exige Confirmação)',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
  },
  conta_mista: {
    label: 'Conta Mista (Revisar Segregação)',
    badgeClass: 'bg-orange-50 text-orange-800 border-orange-300',
  },
  sem_vinculo_validado: {
    label: 'Sem Vínculo Validado',
    badgeClass: 'bg-red-50 text-red-800 border-red-200',
  },
};

const LOTE_CLASS_LABELS: Record<LoteClassificacao, { label: string; badgeClass: string }> = {
  manual: {
    label: 'Lançamento Manual (Ex: 0000BR, SC0000)',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  folha_apropriacao: {
    label: 'Apropriação da Folha (GPE)',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  pagamento_baixa: {
    label: 'Pagamentos / Baixas Financeiras',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  provisao_mensal: {
    label: 'Provisão Mensal (Férias/13º)',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
  },
  fiscal: {
    label: 'Fiscal / Faturamento (008810/008820)',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
  },
  outros: {
    label: 'Outros Lotes Contábeis',
    badgeClass: 'bg-slate-50 text-slate-600 border-slate-200',
  },
};

export const DeParaScreen: React.FC<DeParaScreenProps> = ({
  rules,
  loteConfigs,
  onChangeRules,
  onChangeLoteConfigs,
  onResetDefaults,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTipo, setFilterTipo] = useState<string>('TODOS');
  const [filterStatus, setFilterStatus] = useState<string>('TODOS');
  const [aiOptInEnabled, setAiOptInEnabled] = useState<boolean>(false);

  // Novo mapeamento N:N
  const [newVerbaCod, setNewVerbaCod] = useState('');
  const [newVerbaDesc, setNewVerbaDesc] = useState('');
  const [newTipoVerba, setNewTipoVerba] = useState<VerbaTipoFuncional>('desconto_real');
  const [newContaForm, setNewContaForm] = useState('2.1.0.10.400.001');
  const [newContaDesc, setNewContaDesc] = useState('SALARIOS A PAGAR');
  const [newFilial, setNewFilial] = useState('');
  const [newCentroCusto, setNewCentroCusto] = useState('');
  const [newStatus, setNewStatus] = useState<VinculoStatus>('confirmado');

  // Novo lote CT2
  const [newLoteCod, setNewLoteCod] = useState('');
  const [newLoteClass, setNewLoteClass] = useState<LoteClassificacao>('manual');
  const [newLoteDesc, setNewLoteDesc] = useState('');

  const filteredRules = rules.filter((r) => {
    const matchesSearch =
      r.verbaCodigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.verbaDescricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.contaFormatada.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.contaDescricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.centroCustoOpcional || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTipo = filterTipo === 'TODOS' || r.tipoVerba === filterTipo;
    const matchesStatus = filterStatus === 'TODOS' || r.statusVinculo === filterStatus;
    return matchesSearch && matchesTipo && matchesStatus;
  });

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVerbaCod.trim() || !newContaForm.trim()) return;
    const created: DeParaRule = {
      id: `dp-custom-${Date.now()}`,
      verbaCodigo: newVerbaCod.trim(),
      verbaDescricao: newVerbaDesc.trim().toUpperCase() || `VERBA ${newVerbaCod.trim()}`,
      tipoVerba: newTipoVerba,
      contaFormatada: newContaForm.trim(),
      contaNormalizada: normalizeAccountCode(newContaForm.trim()),
      contaDescricao: newContaDesc.trim().toUpperCase() || 'CONTA CONTABIL',
      naturezaEsperada: newContaForm.trim().startsWith('1') ? 'reducao_ativo' : 'credito_passivo',
      filialOpcional: newFilial.trim() || undefined,
      centroCustoOpcional: newCentroCusto.trim() || undefined,
      statusVinculo: newStatus,
    };
    onChangeRules([created, ...rules]);
    setNewVerbaCod('');
    setNewVerbaDesc('');
    setNewCentroCusto('');
  };

  const handleUpdateTipo = (id: string, tipoVerba: VerbaTipoFuncional) => {
    onChangeRules(rules.map((r) => (r.id === id ? { ...r, tipoVerba } : r)));
  };

  const handleUpdateStatus = (id: string, statusVinculo: VinculoStatus) => {
    onChangeRules(rules.map((r) => (r.id === id ? { ...r, statusVinculo } : r)));
  };

  const handleUpdateCentroCusto = (id: string, cc: string) => {
    onChangeRules(
      rules.map((r) => (r.id === id ? { ...r, centroCustoOpcional: cc.trim() || undefined } : r))
    );
  };

  const handleDeleteRule = (id: string) => {
    onChangeRules(rules.filter((r) => r.id !== id));
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify({ rules, loteConfigs }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'de_para_protheus_contabil.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = async (file: File) => {
    try {
      const txt = await file.text();
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed.rules)) {
        onChangeRules(parsed.rules);
      }
      if (Array.isArray(parsed.loteConfigs)) {
        onChangeLoteConfigs(parsed.loteConfigs);
      }
    } catch {
      // Ignorar JSON inválido
    }
  };

  const handleAddLote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLoteCod.trim()) return;
    const raw = newLoteCod.trim().toUpperCase();
    const padded = /^\d+$/.test(raw) ? raw.padStart(6, '0') : raw;
    const filtered = loteConfigs.filter((l) => l.loteCodigo.toUpperCase() !== padded);
    onChangeLoteConfigs([
      ...filtered,
      {
        loteCodigo: padded,
        classificacao: newLoteClass,
        descricao: newLoteDesc.trim() || `Lote ${padded}`,
      },
    ]);
    setNewLoteCod('');
    setNewLoteDesc('');
  };

  const handleUpdateLoteClass = (loteCodigo: string, classificacao: LoteClassificacao) => {
    onChangeLoteConfigs(
      loteConfigs.map((l) => (l.loteCodigo === loteCodigo ? { ...l, classificacao } : l))
    );
  };

  const handleDeleteLote = (loteCodigo: string) => {
    onChangeLoteConfigs(loteConfigs.filter((l) => l.loteCodigo !== loteCodigo));
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho e Política de IA Desligada por Padrão */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-slate-900">
            2. Matriz De/Para N:N (Verbas ↔ Contas + C. Custo) e Tabela de Lotes CT2
          </h1>
          <p className="text-sm text-slate-600 max-w-3xl">
            Define o relacionamento N:N entre rubricas do <code className="text-xs bg-slate-100 px-1 rounded">GPER106</code> e contas
            analíticas (11 dígitos), com suporte opcional a <strong>Filial</strong> e <strong>Centro de Custo</strong> (<code className="text-xs bg-slate-100 px-1 rounded">C Custo Deb/Crd</code>).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar JSON
          </button>

          <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>Importar JSON</span>
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportJson(f);
              }}
            />
          </label>

          <button
            type="button"
            onClick={onResetDefaults}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar Padrão Validado
          </button>
        </div>
      </div>

      {/* Trava de Privacidade da IA */}
      <div className="bg-slate-900 text-white rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <Lock className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5">
            <div className="font-bold text-sm flex items-center gap-2">
              <span>Política de Privacidade LGPD — Sugestão por IA {aiOptInEnabled ? 'ATIVADA (Apenas Metadados)' : 'DESLIGADA POR PADRÃO'}</span>
            </div>
            <p className="text-slate-300">
              Por padrão, o motor utiliza exclusivamente correspondência léxica local no navegador. Se ativada manualmente pelo auditor,
              apenas o <strong>código e a descrição genérica da verba/conta</strong> são utilizados — jamais valores financeiros, CPFs, CNPJs ou nomes.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAiOptInEnabled(!aiOptInEnabled)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded border transition-colors shrink-0 cursor-pointer ${
            aiOptInEnabled
              ? 'bg-emerald-600 text-white border-emerald-500'
              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{aiOptInEnabled ? 'IA Opt-In: Ligada (Só Códigos/Descrições)' : 'IA Desligada (100% Determinístico Local)'}</span>
        </button>
      </div>

      {/* Formulário para Adicionar Nova Regra N:N */}
      <form
        onSubmit={handleAddRule}
        className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-8 gap-3 items-end"
      >
        <div>
          <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
            Cód. Verba
          </label>
          <input
            type="text"
            placeholder="Ex: 525"
            value={newVerbaCod}
            onChange={(e) => setNewVerbaCod(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded focus:outline-none focus:border-slate-900"
          />
        </div>
        <div className="lg:col-span-2">
          <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
            Descrição da Verba
          </label>
          <input
            type="text"
            placeholder="Ex: CONVENIO FARMACIA"
            value={newVerbaDesc}
            onChange={(e) => setNewVerbaDesc(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-slate-900"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
            Tipo de Verba
          </label>
          <select
            value={newTipoVerba}
            onChange={(e) => setNewTipoVerba(e.target.value as VerbaTipoFuncional)}
            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded bg-white"
          >
            <option value="provento">Provento</option>
            <option value="desconto_real">Desconto Real</option>
            <option value="liquido_pago_por_fora">Líquido Pago por Fora</option>
            <option value="estorno">Estorno</option>
            <option value="informativo_base">Informativo / Base</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
            Conta Contábil
          </label>
          <input
            type="text"
            placeholder="2.1.0.10.400.001"
            value={newContaForm}
            onChange={(e) => setNewContaForm(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded focus:outline-none focus:border-slate-900"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
            Filial (Opc.)
          </label>
          <input
            type="text"
            placeholder="Todas ou 0101"
            value={newFilial}
            onChange={(e) => setNewFilial(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded focus:outline-none focus:border-slate-900"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
            C. Custo (Opc.)
          </label>
          <input
            type="text"
            placeholder="Ex: 000003200"
            value={newCentroCusto}
            onChange={(e) => setNewCentroCusto(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded focus:outline-none focus:border-slate-900"
          />
        </div>
        <div>
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar
          </button>
        </div>
      </form>

      {/* Filtros e Tabela De/Para */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2" />
            <input
              type="text"
              placeholder="Buscar por código de verba, descrição, conta ou centro de custo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-900"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value)}
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
            >
              <option value="TODOS">Todos os Tipos de Verba</option>
              <option value="provento">Provento</option>
              <option value="desconto_real">Desconto Real</option>
              <option value="liquido_pago_por_fora">Líquido Pago por Fora (563/564)</option>
              <option value="estorno">Estorno (570/572/954/958)</option>
              <option value="informativo_base">Informativo / Base</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
            >
              <option value="TODOS">Todos os Status de Vínculo</option>
              <option value="confirmado">Confirmado</option>
              <option value="sugestao_nao_validada">Sugestão Não Validada (INSS)</option>
              <option value="conta_mista">Conta Mista (FGTS + Consignados)</option>
              <option value="sem_vinculo_validado">Sem Vínculo Validado (VT/VR/VC/VA)</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                <th className="py-2.5 px-3 font-semibold">Verba</th>
                <th className="py-2.5 px-3 font-semibold">Descrição na Folha (GPER106)</th>
                <th className="py-2.5 px-3 font-semibold">Tipo de Verba</th>
                <th className="py-2.5 px-3 font-semibold">Conta Contábil</th>
                <th className="py-2.5 px-3 font-semibold">Descrição da Conta</th>
                <th className="py-2.5 px-3 font-semibold">Filial</th>
                <th className="py-2.5 px-3 font-semibold">C. Custo (Opc.)</th>
                <th className="py-2.5 px-3 font-semibold">Status do Vínculo</th>
                <th className="py-2.5 px-3 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRules.map((rule) => (
                <tr key={rule.id} className="hover:bg-slate-50/80">
                  <td className="py-2 px-3 font-mono font-bold text-slate-900">
                    {rule.verbaCodigo}
                  </td>
                  <td className="py-2 px-3 text-slate-800 font-medium">
                    <div>{rule.verbaDescricao}</div>
                    {rule.observacaoAuditoria && (
                      <div className="text-[11px] text-slate-500 mt-0.5">{rule.observacaoAuditoria}</div>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <select
                      value={rule.tipoVerba}
                      onChange={(e) => handleUpdateTipo(rule.id, e.target.value as VerbaTipoFuncional)}
                      className={`px-2 py-1 text-[11px] font-semibold rounded border ${
                        TIPO_VERBA_LABELS[rule.tipoVerba].badgeClass
                      }`}
                    >
                      <option value="provento">Provento</option>
                      <option value="desconto_real">Desconto Real</option>
                      <option value="liquido_pago_por_fora">Líquido Pago por Fora</option>
                      <option value="estorno">Estorno</option>
                      <option value="informativo_base">Informativo / Base</option>
                    </select>
                  </td>
                  <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                    {rule.contaFormatada}
                  </td>
                  <td className="py-2 px-3 text-slate-700">{rule.contaDescricao}</td>
                  <td className="py-2 px-3 font-mono text-slate-600">
                    {rule.filialOpcional || 'TODAS'}
                  </td>
                  <td className="py-2 px-3 font-mono text-slate-600">
                    <input
                      type="text"
                      placeholder="TODOS"
                      value={rule.centroCustoOpcional || ''}
                      onChange={(e) => handleUpdateCentroCusto(rule.id, e.target.value)}
                      className="w-24 px-1.5 py-0.5 text-[11px] font-mono bg-white border border-slate-200 rounded focus:outline-none focus:border-slate-900"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <select
                      value={rule.statusVinculo}
                      onChange={(e) => handleUpdateStatus(rule.id, e.target.value as VinculoStatus)}
                      className={`px-2 py-1 text-[11px] font-semibold rounded border ${
                        STATUS_VINCULO_LABELS[rule.statusVinculo].badgeClass
                      }`}
                    >
                      <option value="confirmado">Confirmado</option>
                      <option value="sugestao_nao_validada">Sugestão (Exige Confirmação)</option>
                      <option value="conta_mista">Conta Mista (Revisar)</option>
                      <option value="sem_vinculo_validado">Sem Vínculo Validado</option>
                    </select>
                  </td>
                  <td className="py-2 px-3 text-right space-x-1 whitespace-nowrap">
                    {rule.statusVinculo === 'sugestao_nao_validada' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(rule.id, 'confirmado')}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded cursor-pointer"
                        title="Confirmar sugestão"
                      >
                        <Check className="w-3 h-3" />
                        Confirmar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                      title="Remover vínculo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Configuração de Classificação por Lote do Protheus (CT2) */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            Tabela Editável de Lotes Contábeis (CT2) — Precedência sobre Regex de Letras
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            <strong>Regra de Precedência:</strong> A classificação cadastrada nesta tabela prevalece sobre a expressão de busca de letras (<code className="font-mono">/[A-Za-z]/</code>), permitindo reclassificar qualquer lote alfanumérico. Quando um lote não estiver cadastrado na tabela, a presença de letras (ex: <code className="font-mono">0000BR</code>, <code className="font-mono">SC0000</code>) o classifica automaticamente como <strong>Lançamento Manual</strong>.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {loteConfigs.map((lc) => (
            <div
              key={lc.loteCodigo}
              className="border border-slate-200 rounded p-3 flex flex-col justify-between gap-2 bg-slate-50 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono font-bold text-slate-900">Lote {lc.loteCodigo}</div>
                  <div className="text-slate-600">{lc.descricao}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteLote(lc.loteCodigo)}
                  className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                  title="Remover lote da tabela"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <select
                value={lc.classificacao}
                onChange={(e) => handleUpdateLoteClass(lc.loteCodigo, e.target.value as LoteClassificacao)}
                className={`w-full px-2 py-1 font-mono text-[11px] font-semibold border rounded ${
                  LOTE_CLASS_LABELS[lc.classificacao]?.badgeClass || 'bg-white border-slate-300'
                }`}
              >
                <option value="manual">manual (Lançamento Manual)</option>
                <option value="folha_apropriacao">folha_apropriacao (GPE Folha)</option>
                <option value="pagamento_baixa">pagamento_baixa (Baixa/Pagto)</option>
                <option value="provisao_mensal">provisao_mensal (Provisão)</option>
                <option value="fiscal">fiscal (Fiscal/Faturamento)</option>
                <option value="outros">outros (Outros)</option>
              </select>
            </div>
          ))}
        </div>

        <form onSubmit={handleAddLote} className="flex flex-wrap items-end gap-3 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
              Lote (Ex: 0000BR, 008890)
            </label>
            <input
              type="text"
              placeholder="0000BR"
              value={newLoteCod}
              onChange={(e) => setNewLoteCod(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded w-32"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
              Natureza do Lote
            </label>
            <select
              value={newLoteClass}
              onChange={(e) => setNewLoteClass(e.target.value as LoteClassificacao)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
            >
              <option value="manual">Lançamento Manual (0000BR / SC0000)</option>
              <option value="folha_apropriacao">Apropriação da Folha (GPE)</option>
              <option value="pagamento_baixa">Pagamentos / Baixas Financeiras</option>
              <option value="provisao_mensal">Provisão Mensal (Férias/13º)</option>
              <option value="fiscal">Fiscal / Faturamento (008810/008820)</option>
              <option value="outros">Outros Lotes</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1">
              Descrição
            </label>
            <input
              type="text"
              placeholder="Descrição do lote no Protheus"
              value={newLoteDesc}
              onChange={(e) => setNewLoteDesc(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded cursor-pointer"
          >
            Salvar Lote
          </button>
        </form>
      </div>
    </div>
  );
};
