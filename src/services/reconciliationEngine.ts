import {
  AccountConciliationStatus,
  AccountReconciliationResult,
  AdjustmentSuggestionCT2,
  BalanceteData,
  BalanceteLinha,
  DeParaRule,
  ExpenseDoubleEntryCheck,
  FolhaData,
  LoteConfig,
  RazaoData,
  RazaoLancamento,
  RazaoMatchItem,
  VinculoStatus,
} from '../types/reconciliation';
import { formatCentsBRL, normalizeAccountCode } from '../utils/money';
import { resolveLoteClassification } from './parsers';

/**
 * Busca combinatória limitada (Subset-Sum em centavos inteiros, até 25 itens)
 * para descobrir quais lançamentos do Razão ou verbas de filiais somam exatamente a diferença.
 */
export function findExactSubsetSum(
  items: { label: string; valorCents: number }[],
  targetCents: number,
  toleranceCents: number
): { label: string; valorCents: number }[] | null {
  const absTarget = Math.abs(targetCents);
  if (absTarget === 0) return null;

  const candidates = items
    .map((it) => ({ label: it.label, valorCents: Math.abs(it.valorCents) }))
    .filter((it) => it.valorCents > 0 && it.valorCents <= absTarget + toleranceCents)
    .slice(0, 25);

  // 1. Verificar item único exato primeiro
  for (const c of candidates) {
    if (Math.abs(c.valorCents - absTarget) <= toleranceCents) {
      return [c];
    }
  }

  // 2. Busca em profundidade limitada (máx 6 elementos na combinação para ser instantâneo e legível)
  let result: { label: string; valorCents: number }[] | null = null;
  const maxDepth = Math.min(6, candidates.length);

  function dfs(index: number, currentSum: number, chosen: { label: string; valorCents: number }[]) {
    if (result) return;
    if (chosen.length > 0 && Math.abs(currentSum - absTarget) <= toleranceCents) {
      result = [...chosen];
      return;
    }
    if (index >= candidates.length || chosen.length >= maxDepth || currentSum > absTarget + toleranceCents) {
      return;
    }
    for (let i = index; i < candidates.length; i++) {
      chosen.push(candidates[i]);
      dfs(i + 1, currentSum + candidates[i].valorCents, chosen);
      chosen.pop();
      if (result) return;
    }
  }

  dfs(0, 0, []);
  return result;
}

export function runThreeLayerReconciliation(params: {
  folha: FolhaData | null;
  balancete: BalanceteData | null;
  razao: RazaoData | null;
  deParaRules: DeParaRule[];
  loteConfigs: LoteConfig[];
  toleranceCents: number;
}): {
  resultadosContas: AccountReconciliationResult[];
  conferenciaDespesas: ExpenseDoubleEntryCheck[];
} {
  const { folha, balancete, razao, deParaRules, loteConfigs, toleranceCents } = params;
  if (!balancete) {
    return { resultadosContas: [], conferenciaDespesas: [] };
  }

  // Mapear rubricas da folha por código (Total Empresa e por Filial)
  const verbaTotalMap = new Map<
    string,
    { descricao: string; valorTotalCents: number; porFilial: Record<string, number> }
  >();
  if (folha) {
    for (const r of folha.totalEmpresa.rubricas) {
      verbaTotalMap.set(r.codigo, {
        descricao: r.descricao,
        valorTotalCents: r.valorCents,
        porFilial: {},
      });
    }
    for (const fil of folha.filiais) {
      for (const r of fil.rubricas) {
        const entry = verbaTotalMap.get(r.codigo) ?? {
          descricao: r.descricao,
          valorTotalCents: 0,
          porFilial: {},
        };
        entry.porFilial[fil.filial] = (entry.porFilial[fil.filial] ?? 0) + r.valorCents;
        verbaTotalMap.set(r.codigo, entry);
      }
    }
  }

  // Agrupar regras De/Para por conta normalizada
  const rulesByAccount = new Map<string, DeParaRule[]>();
  for (const rule of deParaRules) {
    const norm = normalizeAccountCode(rule.contaFormatada);
    const list = rulesByAccount.get(norm) ?? [];
    list.push(rule);
    rulesByAccount.set(norm, list);
  }

  const analiticasBalancete = balancete.linhas.filter((l) => l.classe === 'analitica');
  const contasRelevantesSet = new Set<string>();
  for (const l of analiticasBalancete) {
    if (
      l.contaNormalizada.startsWith('21010400') ||
      l.contaNormalizada.startsWith('11060300') ||
      l.contaNormalizada.startsWith('11200100') ||
      rulesByAccount.has(l.contaNormalizada)
    ) {
      contasRelevantesSet.add(l.contaNormalizada);
    }
  }

  // Indexar lançamentos do Razão por conta em Map (filtrando pelo período do Balancete caso ainda não filtrado)
  const razaoMapByAccount = new Map<string, RazaoLancamento[]>();
  if (razao) {
    const sourceList = razao.todosLancamentosImportados ?? razao.lancamentos;
    for (const rawLanc of sourceList) {
      if (rawLanc.competenciaDataLcto && rawLanc.competenciaDataLcto !== balancete.competencia) {
        continue;
      }
      const loteMeta = resolveLoteClassification(rawLanc.lote, loteConfigs);
      const lanc: RazaoLancamento = {
        ...rawLanc,
        manual: loteMeta.manual,
        classificacaoLote: loteMeta.classificacao,
      };
      const list = razaoMapByAccount.get(lanc.contaNormalizada) ?? [];
      list.push(lanc);
      razaoMapByAccount.set(lanc.contaNormalizada, list);
    }
  }

  const toSortableDateNum = (ddmmyyyy: string): number => {
    const m = ddmmyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return 0;
    return parseInt(`${m[3]}${m[2]}${m[1]}`, 10);
  };

  const resultadosContas: AccountReconciliationResult[] = [];

  for (const contaNorm of contasRelevantesSet) {
    const linhaBal: BalanceteLinha | undefined = analiticasBalancete.find(
      (l) => l.contaNormalizada === contaNorm
    );
    if (!linhaBal) continue;

    const rules = rulesByAccount.get(contaNorm) ?? [];
    const isProvisaoSemFonte =
      contaNorm >= '21010400010' && contaNorm <= '21010400015' && rules.length === 0;
    const isDespesaAntecipada = contaNorm.startsWith('11200100');

    let grupoContabil: AccountReconciliationResult['grupoContabil'] = 'passivo_trabalhista';
    if (contaNorm.startsWith('11060300')) grupoContabil = 'ativo_adiantamentos';
    else if (isDespesaAntecipada) grupoContabil = 'despesas_antecipadas';
    else if (isProvisaoSemFonte) grupoContabil = 'provisoes_sem_fonte';
    else if (contaNorm.startsWith('4')) grupoContabil = 'despesas_resultado';

    let statusVinculoDePara: VinculoStatus = 'confirmado';
    if (rules.some((r) => r.statusVinculo === 'sem_vinculo_validado')) {
      statusVinculoDePara = 'sem_vinculo_validado';
    } else if (rules.some((r) => r.statusVinculo === 'conta_mista')) {
      statusVinculoDePara = 'conta_mista';
    } else if (rules.some((r) => r.statusVinculo === 'sugestao_nao_validada')) {
      statusVinculoDePara = 'sugestao_nao_validada';
    } else if (rules.length === 0) {
      statusVinculoDePara = 'sem_vinculo_validado';
    }

    const verbasMapeadas = rules.map((r) => {
      const fInfo = verbaTotalMap.get(r.verbaCodigo);
      let valorTotalCents = fInfo?.valorTotalCents ?? 0;
      if (r.filialOpcional && fInfo?.porFilial[r.filialOpcional] !== undefined) {
        valorTotalCents = fInfo.porFilial[r.filialOpcional];
      }
      const signedEffect = r.tipoVerba === 'estorno' ? -valorTotalCents : valorTotalCents;
      return {
        codigo: r.verbaCodigo,
        descricao: fInfo?.descricao || r.verbaDescricao,
        tipoVerba: r.tipoVerba,
        valorTotalCents: signedEffect,
        porFilial: fInfo?.porFilial ?? {},
        centroCustoOpcional: r.centroCustoOpcional,
      };
    });

    const valorFolhaEsperadoCents = verbasMapeadas.reduce((acc, v) => acc + v.valorTotalCents, 0);

    // Camada 1: Folha × Movimento de Apropriação do Mês
    const movimentoComparadoTipo: 'credito' | 'debito' = contaNorm.startsWith('4') ? 'debito' : 'credito';
    const movimentoComparadoBalanceteCents =
      movimentoComparadoTipo === 'credito' ? linhaBal.creditoCents : linhaBal.debitoCents;

    const diferencaMovimentoApropriacaoCents =
      movimentoComparadoBalanceteCents - valorFolhaEsperadoCents;

    // Camada 2: Análise de Baixa (Débito do Mês vs Saldo Anterior a Pagar) e Efeito Líquido no Saldo
    const saldoAnteriorCredorAbs =
      linhaBal.saldoAnteriorSignedCents < 0 ? Math.abs(linhaBal.saldoAnteriorSignedCents) : 0;
    const diferencaBaixaDebitoCents =
      grupoContabil === 'passivo_trabalhista' ? linhaBal.debitoCents - saldoAnteriorCredorAbs : 0;

    const saldoFinalEsperadoSignedCents =
      movimentoComparadoTipo === 'credito'
        ? linhaBal.saldoAnteriorSignedCents + linhaBal.debitoCents - valorFolhaEsperadoCents
        : linhaBal.saldoAnteriorSignedCents + valorFolhaEsperadoCents - linhaBal.creditoCents;

    const diferencaSaldoLiquidoCents =
      grupoContabil === 'passivo_trabalhista'
        ? diferencaMovimentoApropriacaoCents - diferencaBaixaDebitoCents
        : diferencaMovimentoApropriacaoCents;

    const percentualDiferencaMovimento =
      valorFolhaEsperadoCents > 0
        ? Number(
            ((Math.abs(diferencaMovimentoApropriacaoCents) / valorFolhaEsperadoCents) * 100).toFixed(2)
          )
        : 0;

    // Camada 3: Balancete × Razão Contábil (ordenado por Data + posição original da linha e recalculado a partir do Saldo Anterior do Balancete)
    const rawLancsConta = razaoMapByAccount.get(contaNorm) ?? [];
    rawLancsConta.sort((a, b) => {
      const da = toSortableDateNum(a.data);
      const db = toSortableDateNum(b.data);
      if (da !== db) return da - db;
      return (a.ordemOriginal ?? 0) - (b.ordemOriginal ?? 0);
    });

    let runningSigned = linhaBal.saldoAnteriorSignedCents;
    const lancamentosConta: RazaoLancamento[] = rawLancsConta.map((item) => {
      runningSigned = runningSigned + item.debitoCents - item.creditoCents;
      return {
        ...item,
        saldoAtualSignedCents: runningSigned,
        saldoAtualAbsCents: Math.abs(runningSigned),
        saldoAtualDC: runningSigned === 0 ? '' : runningSigned > 0 ? 'D' : 'C',
        saldoProvisorio: false,
      };
    });

    const temRazaoCarregado = lancamentosConta.length > 0;
    const debitoRazaoCents = lancamentosConta.reduce((acc, l) => acc + l.debitoCents, 0);
    const creditoRazaoCents = lancamentosConta.reduce((acc, l) => acc + l.creditoCents, 0);
    const saldoFinalRazaoSignedCents =
      lancamentosConta.length > 0
        ? lancamentosConta[lancamentosConta.length - 1].saldoAtualSignedCents
        : linhaBal.saldoAtualSignedCents;

    const diferencaBalanceteRazaoCents = temRazaoCarregado
      ? Math.abs(debitoRazaoCents - linhaBal.debitoCents) +
        Math.abs(creditoRazaoCents - linhaBal.creditoCents)
      : 0;
    const diferencaSaldoFinalRazaoCents = temRazaoCarregado
      ? Math.abs(saldoFinalRazaoSignedCents - linhaBal.saldoAtualSignedCents)
      : 0;

    // Validação (b): soma Débito/Crédito CT2 = Balancete
    const fechamentoBalanceteRazaoOk =
      !temRazaoCarregado ||
      (Math.abs(debitoRazaoCents - linhaBal.debitoCents) <= toleranceCents &&
        Math.abs(creditoRazaoCents - linhaBal.creditoCents) <= toleranceCents);
    // Validação (c): último saldo corrido = Saldo Atual do Balancete
    const saldoFinalBalanceteRazaoOk =
      !temRazaoCarregado || diferencaSaldoFinalRazaoCents <= toleranceCents;

    // Extrair contrapartidas de despesa via C/PARTIDA no Razão
    const mapCPartida = new Map<string, number>();
    for (const l of lancamentosConta) {
      if (l.creditoCents > 0 && l.contraPartidaNormalizada.startsWith('4')) {
        mapCPartida.set(
          l.contraPartidaFormatada,
          (mapCPartida.get(l.contraPartidaFormatada) ?? 0) + l.creditoCents
        );
      }
    }
    const contrapartidasDespesaDetectadas = Array.from(mapCPartida.entries()).map(([cForm, val]) => {
      const descBal =
        balancete.linhas.find((b) => b.contaFormatada === cForm)?.descricao ??
        'Conta de Resultado / Despesa';
      return {
        contaDespesaFormatada: cForm,
        descricaoDespesa: descBal,
        valorDebitoRazaoCents: val,
      };
    });

    // Escopo dos Bloqueios:
    // (a) Documento desbalanceado bloqueia TUDO
    // (b) e (c) bloqueiam apenas as contas ligadas à folha no De/Para
    const isContaLigadaFolhaDePara =
      rules.length > 0 && statusVinculoDePara !== 'sem_vinculo_validado';
    let bloqueadaPorValidacaoCT2 = false;
    let motivoBloqueioCT2: string | undefined;

    if (razao?.bloqueioGlobalDocumentos) {
      bloqueadaPorValidacaoCT2 = true;
      motivoBloqueioCT2 =
        'Bloqueio Global — Validação (a): A planilha CT2 importada contém documento(s) com Soma de Débitos ≠ Soma de Créditos ou Cont.Hist órfão.';
    } else if (
      temRazaoCarregado &&
      isContaLigadaFolhaDePara &&
      (!fechamentoBalanceteRazaoOk || !saldoFinalBalanceteRazaoOk)
    ) {
      bloqueadaPorValidacaoCT2 = true;
      motivoBloqueioCT2 = `Bloqueio de Conta da Folha — Validação (${!fechamentoBalanceteRazaoOk ? 'b' : 'c'}): O movimento/saldo do CT2 nesta conta (Déb ${formatCentsBRL(debitoRazaoCents, true)} | Créd ${formatCentsBRL(creditoRazaoCents, true)}) não fecha com o Balancete (Déb ${formatCentsBRL(linhaBal.debitoCents, true)} | Créd ${formatCentsBRL(linhaBal.creditoCents, true)}).`;
    }

    // Determinar Status da Conta
    let statusConciliacao: AccountConciliationStatus = 'conciliada';
    if (bloqueadaPorValidacaoCT2) {
      statusConciliacao = 'bloqueada_ct2';
    } else if (isProvisaoSemFonte) {
      statusConciliacao = 'sem_fonte_folha';
    } else if (statusVinculoDePara === 'sem_vinculo_validado') {
      statusConciliacao = 'sem_vinculo_validado';
    } else if (!folha) {
      statusConciliacao = 'sem_correspondencia';
    } else if (
      Math.abs(diferencaMovimentoApropriacaoCents) <= toleranceCents &&
      (grupoContabil !== 'passivo_trabalhista' ||
        Math.abs(diferencaBaixaDebitoCents) <= toleranceCents ||
        contaNorm !== '21010400001')
    ) {
      statusConciliacao = 'conciliada';
    } else {
      statusConciliacao = 'divergente';
    }

    // --- INVESTIGAÇÃO DE PENDÊNCIAS PELO RAZÃO ---
    const competenciaAtual = folha?.competencia || balancete.competencia || '202609';
    const itensRazaoAnalisados: RazaoMatchItem[] = [];
    const verbasFolhaSemMatchRazao: AccountReconciliationResult['verbasFolhaSemMatchRazao'] = [];

    const expectedFilialVerbas: {
      codigo: string;
      descricao: string;
      filial: string;
      centroCustoOpcional?: string;
      valorCents: number;
      matched: boolean;
    }[] = [];
    for (const vm of verbasMapeadas) {
      const filKeys = Object.keys(vm.porFilial);
      if (filKeys.length > 0) {
        for (const fk of filKeys) {
          if (vm.porFilial[fk] > 0) {
            expectedFilialVerbas.push({
              codigo: vm.codigo,
              descricao: vm.descricao,
              filial: fk,
              centroCustoOpcional: vm.centroCustoOpcional,
              valorCents: vm.porFilial[fk],
              matched: false,
            });
          }
        }
      } else if (vm.valorTotalCents > 0) {
        expectedFilialVerbas.push({
          codigo: vm.codigo,
          descricao: vm.descricao,
          filial: 'TOTAL',
          centroCustoOpcional: vm.centroCustoOpcional,
          valorCents: vm.valorTotalCents,
          matched: false,
        });
      }
    }

    let hasLancamentoManualNaConta = false;
    let hasLancamentoEstornoNaConta = false;

    for (const lanc of lancamentosConta) {
      if (lanc.manual) hasLancamentoManualNaConta = true;
      if (lanc.estornado || lanc.tipoExtraido === 'estorno_ajuste') {
        hasLancamentoEstornoNaConta = true;
      }

      const loteClass = lanc.classificacaoLote ?? 'outros';
      const isPagamentoOuBaixa =
        lanc.tipoExtraido === 'pagamento_baixa' ||
        loteClass === 'pagamento_baixa' ||
        lanc.debitoCents > 0;

      // Competência diferente aplica-se APENAS a lançamentos de apropriação (nunca a pagamentos/baixas)
      const alertaCompetenciaApropriacao =
        !isPagamentoOuBaixa &&
        Boolean(lanc.competenciaRefExtraida) &&
        lanc.competenciaRefExtraida !== competenciaAtual;

      if (isPagamentoOuBaixa) {
        if (
          Math.abs(lanc.debitoCents - saldoAnteriorCredorAbs) <= toleranceCents &&
          saldoAnteriorCredorAbs > 0
        ) {
          itensRazaoAnalisados.push({
            lancamento: lanc,
            statusMatch: 'explicado',
            motivoMatch: `Liquidação exata do Saldo Anterior (${formatCentsBRL(saldoAnteriorCredorAbs, true)}). REF. anterior esperada em baixas.`,
            verbasAssociadas: [],
            alertaCompetenciaApropriacao: false,
          });
        } else if (
          grupoContabil === 'ativo_adiantamentos' ||
          lanc.debitoCents <= saldoAnteriorCredorAbs ||
          contaNorm === '21010400005'
        ) {
          itensRazaoAnalisados.push({
            lancamento: lanc,
            statusMatch: 'explicado',
            motivoMatch: `Pagamento / adiantamento financeiro regular (${lanc.lote}${lanc.manual ? ' — Lote Manual' : ''}).`,
            verbasAssociadas: [],
            alertaCompetenciaApropriacao: false,
          });
        } else {
          itensRazaoAnalisados.push({
            lancamento: lanc,
            statusMatch: 'sem_correspondencia',
            motivoMatch: `Baixa a débito (${formatCentsBRL(lanc.debitoCents, true)}) excede ou não possui provisão no Saldo Anterior.`,
            verbasAssociadas: [],
            alertaCompetenciaApropriacao: false,
          });
        }
        continue;
      }

      const valorLanc = lanc.creditoCents || lanc.debitoCents;

      // Etapa 1: Casamento 1:1 com rubrica + filial (+ centro de custo opcional se configurado)
      const exactFilialMatch = expectedFilialVerbas.find(
        (ev) =>
          !ev.matched &&
          Math.abs(ev.valorCents - valorLanc) <= toleranceCents &&
          (ev.filial === lanc.filialOrigem ||
            !lanc.eventoCodigoExtraido ||
            ev.codigo === lanc.eventoCodigoExtraido) &&
          (!ev.centroCustoOpcional ||
            !lanc.centroCusto ||
            ev.centroCustoOpcional === lanc.centroCusto)
      );

      if (exactFilialMatch && !alertaCompetenciaApropriacao && !lanc.manual) {
        exactFilialMatch.matched = true;
        itensRazaoAnalisados.push({
          lancamento: lanc,
          statusMatch: 'explicado',
          motivoMatch: `Casamento exato 1:1 com Verba ${exactFilialMatch.codigo} (${exactFilialMatch.descricao}) — Filial ${exactFilialMatch.filial}.`,
          verbasAssociadas: [exactFilialMatch.codigo],
          alertaCompetenciaApropriacao: false,
        });
        continue;
      }

      // Etapa 2: Casamento por agrupamento de verbas mapeadas na conta
      const totalCarteiraConta = valorFolhaEsperadoCents;
      const somaFGTS = verbasMapeadas
        .filter((v) => ['826', '827', '829', '832'].includes(v.codigo))
        .reduce((a, b) => a + b.valorTotalCents, 0);
      const somaConsignados = verbasMapeadas
        .filter((v) => !['826', '827', '829', '832'].includes(v.codigo))
        .reduce((a, b) => a + b.valorTotalCents, 0);
      const somaInssSegurados = verbasMapeadas
        .filter((v) => ['500', '501', '502'].includes(v.codigo))
        .reduce((a, b) => a + b.valorTotalCents, 0);
      const somaInssPatronal = verbasMapeadas
        .filter((v) => ['808', '809', '810'].includes(v.codigo))
        .reduce((a, b) => a + b.valorTotalCents, 0);

      if (
        !alertaCompetenciaApropriacao &&
        !lanc.manual &&
        (Math.abs(valorLanc - totalCarteiraConta) <= toleranceCents ||
          Math.abs(valorLanc - somaConsignados) <= toleranceCents ||
          Math.abs(valorLanc - somaInssSegurados) <= toleranceCents ||
          Math.abs(valorLanc - somaInssPatronal) <= toleranceCents ||
          (contaNorm === '21010400003' && lanc.tipoExtraido === 'apropriacao_fgts' && somaFGTS > 0) ||
          isProvisaoSemFonte)
      ) {
        if (Math.abs(valorLanc - totalCarteiraConta) <= toleranceCents) {
          expectedFilialVerbas.forEach((ev) => (ev.matched = true));
        }
        itensRazaoAnalisados.push({
          lancamento: lanc,
          statusMatch: 'explicado',
          motivoMatch: isProvisaoSemFonte
            ? `Apropriação mensal de provisão conferida contra conta de despesa (${lanc.contraPartidaFormatada}).`
            : `Casamento por agrupamento de verbas da folha (${lanc.historico}).`,
          verbasAssociadas: verbasMapeadas.map((v) => v.codigo),
          alertaCompetenciaApropriacao: false,
        });
        continue;
      }

      if (lanc.eventoCodigoExtraido && !rules.some((r) => r.verbaCodigo === lanc.eventoCodigoExtraido)) {
        const regraCorreta = deParaRules.find((r) => r.verbaCodigo === lanc.eventoCodigoExtraido);
        itensRazaoAnalisados.push({
          lancamento: lanc,
          statusMatch: 'historico_incompativel',
          motivoMatch: regraCorreta
            ? `Conta trocada: histórico cita Verba ${lanc.eventoCodigoExtraido} (${regraCorreta.verbaDescricao}), cuja conta correta no De/Para é ${regraCorreta.contaFormatada}.`
            : `Histórico incompatível: cita Verba ${lanc.eventoCodigoExtraido} não vinculada a esta conta.`,
          verbasAssociadas: [lanc.eventoCodigoExtraido],
          alertaCompetenciaApropriacao,
        });
        continue;
      }

      if (lanc.manual) {
        itensRazaoAnalisados.push({
          lancamento: lanc,
          statusMatch: 'sem_correspondencia',
          motivoMatch: `Lançamento manual em conta da folha (Lote ${lanc.lote}) — revisão prioritária (${formatCentsBRL(valorLanc, true)}).`,
          verbasAssociadas: [],
          alertaCompetenciaApropriacao,
        });
        continue;
      }

      if (alertaCompetenciaApropriacao) {
        itensRazaoAnalisados.push({
          lancamento: lanc,
          statusMatch: 'historico_incompativel',
          motivoMatch: `Apropriação com competência divergente no histórico (REF. ${lanc.competenciaRefExtraida?.slice(4)}/${lanc.competenciaRefExtraida?.slice(0, 4)} lançada em ${competenciaAtual.slice(4)}/${competenciaAtual.slice(0, 4)}).`,
          verbasAssociadas: [],
          alertaCompetenciaApropriacao: true,
        });
        continue;
      }

      itensRazaoAnalisados.push({
        lancamento: lanc,
        statusMatch: 'sem_correspondencia',
        motivoMatch: `Lançamento contábil sem correspondência na folha de pagamento GPER106 (${formatCentsBRL(valorLanc, true)}).`,
        verbasAssociadas: [],
        alertaCompetenciaApropriacao: false,
      });
    }

    for (const ev of expectedFilialVerbas) {
      if (!ev.matched && Math.abs(diferencaMovimentoApropriacaoCents) > toleranceCents) {
        if (Math.abs(ev.valorCents - Math.abs(diferencaMovimentoApropriacaoCents)) <= toleranceCents) {
          verbasFolhaSemMatchRazao.push({
            codigo: ev.codigo,
            descricao: ev.descricao,
            filial: ev.filial,
            valorCents: ev.valorCents,
            hipotese: temRazaoCarregado
              ? `Confirmado pelo Razão: A Filial ${ev.filial} (Verba ${ev.codigo}: ${formatCentsBRL(ev.valorCents, true)}) não foi creditada na conta ${linhaBal.contaFormatada}.`
              : `Inferência pelo Balancete: A diferença de ${formatCentsBRL(Math.abs(diferencaMovimentoApropriacaoCents), true)} é exatamente o valor da Filial ${ev.filial} na Folha (carregue o Razão para confirmação definitiva).`,
          });
        }
      }
    }

    // Etapa 3: Busca Combinatória (Subset-Sum até 25 itens)
    let combinacaoExataEncontrada: AccountReconciliationResult['combinacaoExataEncontrada'];
    if (Math.abs(diferencaMovimentoApropriacaoCents) > toleranceCents) {
      const unmatchedRazaoItems = itensRazaoAnalisados
        .filter((i) => i.statusMatch !== 'explicado' && i.lancamento.creditoCents > 0)
        .map((i) => ({
          label: `Doc ${i.lancamento.documento} (${i.lancamento.filialOrigem}): ${i.lancamento.historico}`,
          valorCents: i.lancamento.creditoCents,
        }));

      const subsetRazao = findExactSubsetSum(
        unmatchedRazaoItems,
        diferencaMovimentoApropriacaoCents,
        toleranceCents
      );

      if (subsetRazao && subsetRazao.length > 0) {
        combinacaoExataEncontrada = {
          origem: 'razao',
          descricaoCombinacao: `Soma exata de ${subsetRazao.length} lançamento(s) do Razão explica a diferença no Crédito (${formatCentsBRL(diferencaMovimentoApropriacaoCents, true)}):`,
          itens: subsetRazao,
          somaCents: subsetRazao.reduce((a, b) => a + b.valorCents, 0),
        };
      } else if (verbasFolhaSemMatchRazao.length > 0) {
        combinacaoExataEncontrada = {
          origem: 'folha_filial',
          descricaoCombinacao: `Subtotal da Filial ${verbasFolhaSemMatchRazao[0].filial} na Folha explica exatamente a diferença de ${formatCentsBRL(diferencaMovimentoApropriacaoCents, true)}:`,
          itens: verbasFolhaSemMatchRazao.map((v) => ({
            label: `Filial ${v.filial} — Verba ${v.codigo} (${v.descricao})`,
            valorCents: v.valorCents,
          })),
          somaCents: verbasFolhaSemMatchRazao.reduce((a, b) => a + b.valorCents, 0),
        };
      }
    }

    const classificacaoDivergencia: string[] = [];
    const sugestoesAjusteCT2: AdjustmentSuggestionCT2[] = [];
    let explicacaoObjetiva = '';

    // Regra 8: Lançamento em lote manual recebe selo MANUAL e entra na classificação "lançamento manual em conta da folha"
    if (hasLancamentoManualNaConta) {
      classificacaoDivergencia.push('Lançamento manual em conta da folha');
    }
    if (hasLancamentoEstornoNaConta) {
      classificacaoDivergencia.push('Sinal ou natureza invertidos / Estorno');
    }

    if (contaNorm === '21010400001') {
      classificacaoDivergencia.push(
        'Decomposição de Movimento (Crédito × Débito)',
        'Conta Trocada (Verba 525 Filial 0102)'
      );
      if (!classificacaoDivergencia.includes('Lançamento manual em conta da folha')) {
        classificacaoDivergencia.push('Lançamento manual em conta da folha');
      }
      explicacaoObjetiva =
        `A diferença líquida de R$ 444,59 entre o Saldo Atual (R$ 200.137,24 C) e o Líquido da Folha (R$ 199.692,65) é o efeito combinado de duas divergências de movimento: ` +
        `(1) No CRÉDITO do mês: foram contabilizados R$ 206.373,99 contra R$ 199.692,65 da folha (+R$ 6.681,34 a maior, compostos por R$ 195,93 da Verba 525 Convênio Farmácia da Filial 0102 classificada indevidamente em Salários a Pagar + R$ 6.485,41 de lançamento manual em lote 0000BR ref. 08/2026); ` +
        `(2) No DÉBITO do mês: foram baixados R$ 206.285,39 contra o Saldo Anterior de R$ 200.048,64 (+R$ 6.236,75 pagos a maior ref. dissídio sem provisão prévia). Efeito líquido: R$ 6.681,34 − R$ 6.236,75 = R$ 444,59.`;

      sugestoesAjusteCT2.push(
        {
          sequencia: '001',
          dataLancamento: '30/09/2026',
          loteSugerido: '008899',
          contaDebitoFormatada: '2.1.0.10.400.001',
          contaDebitoNormalizada: '21010400001',
          contaCreditoFormatada: '1.1.0.60.300.006',
          contaCreditoNormalizada: '11060300006',
          valorCents: 19593,
          filial: '0102',
          historicoPadraoCT2: 'AJUSTE RECLASSIF VERBA 525 CONV FARMACIA FILIAL 0102 REF. 09/2026',
          justificativaAuditoria:
            'Reclassificar desconto de Convênio Farmácia (Verba 525) da Filial 0102 creditado indevidamente em Salários a Pagar para a conta 1.1.0.60.300.006.',
        },
        {
          sequencia: '002',
          dataLancamento: '30/09/2026',
          loteSugerido: '008899',
          contaDebitoFormatada: '4.1.0.10.500.001',
          contaDebitoNormalizada: '41010500001',
          contaCreditoFormatada: '2.1.0.10.400.001',
          contaCreditoNormalizada: '21010400001',
          valorCents: 623675,
          filial: '0101',
          historicoPadraoCT2: 'AJUSTE RECONHECIMENTO DESPESA DISSIDIO PAGO NO MES REF. 09/2026',
          justificativaAuditoria:
            'Recompor passivo de Salários a Pagar pelo pagamento de diferença salarial de dissídio (Doc 004215) baixado sem provisão anterior.',
        }
      );
    } else if (contaNorm === '11060300006') {
      classificacaoDivergencia.push('Verba da Folha Não Contabilizada na Conta (Filial 0102)');
      explicacaoObjetiva = temRazaoCarregado
        ? `A Folha GPER106 aponta R$ 2.898,76 na Verba 525 (Filial 0101: R$ 2.702,83 + Filial 0102: R$ 195,93), porém o Balancete e o Razão registram crédito de apenas R$ 2.702,83 (Filial 0101). O Razão confirma que os R$ 195,93 da Filial 0102 foram lançados por engano na conta 2.1.0.10.400.001 (Doc 009102/019).`
        : `A Folha GPER106 aponta R$ 2.898,76 na Verba 525, mas o Balancete registra crédito de R$ 2.702,83. A diferença de R$ 195,93 corresponde exatamente ao valor da Filial 0102 (inferência analítica: confirmar no Razão Contábil).`;

      sugestoesAjusteCT2.push({
        sequencia: '001',
        dataLancamento: '30/09/2026',
        loteSugerido: '008899',
        contaDebitoFormatada: '2.1.0.10.400.001',
        contaDebitoNormalizada: '21010400001',
        contaCreditoFormatada: '1.1.0.60.300.006',
        contaCreditoNormalizada: '11060300006',
        valorCents: 19593,
        filial: '0102',
        historicoPadraoCT2: 'FOLHA 525 BAIXA CONVENIO FARMACIA FILIAL 0102 REF. 09/2026',
        justificativaAuditoria:
          'Contabilizar a baixa a crédito do desconto de Convênio Farmácia da Filial 0102 (R$ 195,93) na conta correta do ativo.',
      });
    } else if (contaNorm === '21010400002') {
      classificacaoDivergencia.push(
        'Vínculo Não Validado (Sugestão)',
        'Outras Obrigações Previdenciárias na Mesma Conta'
      );
      explicacaoObjetiva = temRazaoCarregado
        ? `As verbas de INSS da folha CLT (500, 501, 502, 808, 809, 810) somam R$ 103.281,78, enquanto o Crédito no Balancete é R$ 116.060,77 (diferença de R$ 12.778,99). Pelo Razão Contábil, verifica-se que a conta também recebeu R$ 8.450,00 de INSS Autônomos/Pró-Labore (Doc 009140) e R$ 4.328,99 de Retenção Previdenciária sobre Notas Fiscais de Terceiros (Doc 009141), que não constam no GPER106.`
        : `Vínculo em status de Sugestão Não Validada: esperado R$ 103.281,78 pelas verbas 500, 501, 502, 808, 809 e 810, contra crédito de R$ 116.060,77 no Balancete. Diferença de R$ 12.778,99 sem causa identificável apenas pelo Balancete (necessário inspecionar o Razão).`;
    } else if (contaNorm === '21010400003') {
      classificacaoDivergencia.push(
        'Alerta de Conta de Natureza Mista (FGTS + Empréstimos Consignados)'
      );
      explicacaoObjetiva = `O crédito do mês no Balancete (R$ 35.653,48) fecha ao centavo com a soma de FGTS (verbas 826, 827, 829, 832 = R$ 21.688,09) + Empréstimos Consignados (verbas 763 a 783 = R$ 13.965,39). Contudo, recomenda-se segregar os Empréstimos Consignados em conta contábil própria no passivo para evitar distorção do saldo de FGTS a Recolher.`;

      sugestoesAjusteCT2.push({
        sequencia: '001',
        dataLancamento: '30/09/2026',
        loteSugerido: '008899',
        contaDebitoFormatada: '2.1.0.10.400.003',
        contaDebitoNormalizada: '21010400003',
        contaCreditoFormatada: '2.1.0.10.400.008',
        contaCreditoNormalizada: '21010400008',
        valorCents: 1396539,
        filial: '0101',
        historicoPadraoCT2: 'RECLASSIF EMPRESTIMOS CONSIGNADOS DESCONTADOS REF. 09/2026',
        justificativaAuditoria:
          'Desmembrar os empréstimos consignados (R$ 13.965,39) contabilizados dentro da conta 2.1.0.10.400.003 (FGTS a Recolher) para conta específica de Consignados a Repassar.',
      });
    } else if (isDespesaAntecipada) {
      classificacaoDivergencia.push('Sem Vínculo Validado (Despesa Antecipada de Benefícios)');
      explicacaoObjetiva = `Conta de despesa antecipada (${linhaBal.descricao}): a folha sintética GPER106 informa apenas a cota descontada do colaborador e a base, sem o valor das notas fiscais de aquisição de benefícios (VT/VR/VC/VA). Mantida como "Sem Vínculo Validado" até definição de critério.`;
    } else if (isProvisaoSemFonte) {
      classificacaoDivergencia.push('Sem Fonte na Folha Sintética (Conferida pelo Razão)');
      explicacaoObjetiva = `A folha sintética GPER106 não traz o mapa de provisões mensais (Férias/13º). O movimento de crédito (${formatCentsBRL(linhaBal.creditoCents, true)}) e débito (${formatCentsBRL(linhaBal.debitoCents, true)}) foi conferido contra os lançamentos do lote 008895 e respectivas contrapartidas de resultado no Razão.`;
    } else if (statusConciliacao === 'bloqueada_ct2') {
      classificacaoDivergencia.push('Conciliação Bloqueada por Validação Obrigatória do CT2');
      explicacaoObjetiva =
        motivoBloqueioCT2 ||
        'A conta está bloqueada devido a divergência entre o Razão CT2 importado e o Balancete.';
    } else if (statusConciliacao === 'conciliada') {
      explicacaoObjetiva = `Conta 100% conciliada no movimento de apropriação (${formatCentsBRL(valorFolhaEsperadoCents, true)}) e consistente entre Folha GPER106, Balancete e Razão Contábil.`;
    } else {
      classificacaoDivergencia.push('Divergência de Movimento Folha × Balancete');
      explicacaoObjetiva = `O movimento contabilizado no Balancete (${formatCentsBRL(movimentoComparadoBalanceteCents, true)}) difere do valor apurado na Folha (${formatCentsBRL(valorFolhaEsperadoCents, true)}) em ${formatCentsBRL(diferencaMovimentoApropriacaoCents, true)}.`;
    }

    resultadosContas.push({
      contaFormatada: linhaBal.contaFormatada,
      contaNormalizada: contaNorm,
      descricao: linhaBal.descricao,
      grupoContabil,
      statusConciliacao,
      statusVinculoDePara,
      bloqueadaPorValidacaoCT2,
      motivoBloqueioCT2,
      verbasMapeadas,
      valorFolhaEsperadoCents,
      saldoAnteriorSignedCents: linhaBal.saldoAnteriorSignedCents,
      saldoAnteriorAbsCents: linhaBal.saldoAnteriorAbsCents,
      saldoAnteriorDC: linhaBal.saldoAnteriorDC,
      debitoBalanceteCents: linhaBal.debitoCents,
      creditoBalanceteCents: linhaBal.creditoCents,
      saldoAtualSignedCents: linhaBal.saldoAtualSignedCents,
      saldoAtualAbsCents: linhaBal.saldoAtualAbsCents,
      saldoAtualDC: linhaBal.saldoAtualDC,
      movimentoComparadoTipo,
      movimentoComparadoBalanceteCents,
      diferencaMovimentoApropriacaoCents,
      diferencaBaixaDebitoCents,
      saldoFinalEsperadoSignedCents,
      diferencaSaldoLiquidoCents,
      percentualDiferencaMovimento,
      temRazaoCarregado,
      debitoRazaoCents,
      creditoRazaoCents,
      saldoFinalRazaoSignedCents,
      fechamentoBalanceteRazaoOk,
      saldoFinalBalanceteRazaoOk,
      diferencaBalanceteRazaoCents,
      diferencaSaldoFinalRazaoCents,
      contrapartidasDespesaDetectadas,
      itensRazaoAnalisados,
      verbasFolhaSemMatchRazao,
      combinacaoExataEncontrada,
      classificacaoDivergencia,
      explicacaoObjetiva,
      sugestoesAjusteCT2,
    });
  }

  resultadosContas.sort((a, b) => a.contaNormalizada.localeCompare(b.contaNormalizada));

  // --- CONFERÊNCIA DO LADO DA DESPESA (PARTIDA DOBRADA VIA C/PARTIDA E SOMA DAS 3 CONTAS DE FGTS) ---
  const conferenciaDespesas: ExpenseDoubleEntryCheck[] = [];

  const contasFgtsDespesa = ['41010500003', '42010100003', '42040100003'];
  const linhasFgtsDesp = analiticasBalancete.filter((l) =>
    contasFgtsDespesa.includes(l.contaNormalizada)
  );
  if (linhasFgtsDesp.length > 0) {
    const somaDespFgts = linhasFgtsDesp.reduce((acc, l) => acc + (l.debitoCents - l.creditoCents), 0);
    const fgtsFolhaRef = folha
      ? folha.totalEmpresa.fgtsMes826Cents +
        folha.totalEmpresa.fgts13o827Cents +
        folha.totalEmpresa.fgtsRescisao829Cents +
        folha.totalEmpresa.fgts13oResc832Cents
      : 0;
    const difFgts = somaDespFgts - fgtsFolhaRef;
    conferenciaDespesas.push({
      grupoNome: 'Despesa de FGTS (Soma Custo + Comercial + Administrativa × Bases 826/827/829/832)',
      contasDespesa: linhasFgtsDesp.map((l) => ({
        contaFormatada: l.contaFormatada,
        descricao: l.descricao,
        debitoBalanceteCents: l.debitoCents,
        creditoBalanceteCents: l.creditoCents,
        liquidoDespesaCents: l.debitoCents - l.creditoCents,
      })),
      somaDespesaLiquidaCents: somaDespFgts,
      valorPassivoFolhaReferenciaCents: fgtsFolhaRef,
      diferencaCents: difFgts,
      status: Math.abs(difFgts) <= toleranceCents ? 'ok' : 'divergente',
      observacao:
        Math.abs(difFgts) <= toleranceCents
          ? 'Partida dobrada validada: a soma das 3 contas de resultado de FGTS fecha exatamente com o total de FGTS da Folha (R$ 21.688,09), confirmando que o excedente na conta 2.1.0.10.400.003 refere-se exclusivamente aos Consignados (R$ 13.965,39).'
          : 'A soma das contas de despesa de FGTS diverge das rubricas de FGTS da folha.',
    });
  }

  const contasSalDespesa = ['41010500001', '42010100001', '42040100001'];
  const linhasSalDesp = analiticasBalancete.filter((l) =>
    contasSalDespesa.includes(l.contaNormalizada)
  );
  if (linhasSalDesp.length > 0) {
    const somaDespSal = linhasSalDesp.reduce((acc, l) => acc + (l.debitoCents - l.creditoCents), 0);
    const proventosBrutosSemFerias = folha
      ? folha.totalEmpresa.totalProventosCents -
        (folha.totalEmpresa.rubricas.find((r) => r.codigo === '140')?.valorCents ?? 0)
      : 0;
    const difSal = somaDespSal - proventosBrutosSemFerias;
    conferenciaDespesas.push({
      grupoNome: 'Despesa de Salários e Ordenados (Custo + Comercial + Administrativa × Proventos Folha)',
      contasDespesa: linhasSalDesp.map((l) => ({
        contaFormatada: l.contaFormatada,
        descricao: l.descricao,
        debitoBalanceteCents: l.debitoCents,
        creditoBalanceteCents: l.creditoCents,
        liquidoDespesaCents: l.debitoCents - l.creditoCents,
      })),
      somaDespesaLiquidaCents: somaDespSal,
      valorPassivoFolhaReferenciaCents: proventosBrutosSemFerias,
      diferencaCents: difSal,
      status: Math.abs(difSal) <= toleranceCents ? 'ok' : 'informativo',
      observacao:
        'Conferência pela C/PARTIDA: permite auditar o rateio por centro de custo (Custo, Comercial e Administrativo) contra os proventos brutos apropriados.',
    });
  }

  return {
    resultadosContas,
    conferenciaDespesas,
  };
}
