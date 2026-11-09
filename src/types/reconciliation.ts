export type VerbaNaturezaGPER = 'provento' | 'desconto' | 'base';

export type VerbaTipoFuncional =
  | 'provento'
  | 'desconto_real'
  | 'liquido_pago_por_fora'
  | 'estorno'
  | 'informativo_base';

export type VinculoStatus =
  | 'confirmado'
  | 'sugestao_nao_validada'
  | 'conta_mista'
  | 'sem_vinculo_validado';

export type PendenciaAuditStatus = 'aberta' | 'justificada' | 'ajustada';

export type AccountConciliationStatus =
  | 'conciliada'
  | 'divergente'
  | 'bloqueada_ct2'
  | 'sem_correspondencia'
  | 'sem_vinculo_validado'
  | 'sem_fonte_folha';

export type LancamentoTipoHistorico =
  | 'apropriacao_folha'
  | 'apropriacao_fgts'
  | 'apropriacao_provisao'
  | 'pagamento_baixa'
  | 'estorno_ajuste'
  | 'outros';

export type LoteClassificacao =
  | 'folha_apropriacao'
  | 'pagamento_baixa'
  | 'provisao_mensal'
  | 'fiscal'
  | 'manual'
  | 'outros';

export interface FolhaRubrica {
  codigo: string;
  descricao: string;
  referencia: number;
  valorCents: number; // sempre positivo em centavos (salvo se sinal '-' explícito no PDF)
  colunaGPER: VerbaNaturezaGPER;
  isBaseCalculoPura: boolean; // BS..., BASE..., DED...
  filial: string; // '0101', '0102', 'TOTAL'
}

export interface FolhaFilialResumo {
  filial: string;
  nomeFilial: string;
  rubricas: FolhaRubrica[];
  totalProventosCents: number;
  totalDescontosCents: number;
  liquidoCalculadoCents: number;
  liquidoVerba999Cents: number;
  baseInssCents: number;
  baseFgtsCents: number;
  fgtsMes826Cents: number;
  fgts13o827Cents: number;
  fgtsRescisao829Cents: number;
  fgts13oResc832Cents: number;
  inssEmpresa808Cents: number;
  inssTerceiros809Cents: number;
  inssRat810Cents: number;
}

export interface FolhaValidationWarning {
  id: string;
  severidade: 'erro' | 'alerta' | 'info';
  titulo: string;
  detalhe: string;
  filial?: string;
  valorEsperadoCents?: number;
  valorEncontradoCents?: number;
  diferencaCents?: number;
}

export interface FolhaData {
  nomeArquivo: string;
  empresa: string;
  competencia: string; // 'AAAAMM' ex: '202609'
  periodoRef: string; // '01/09/2026 - 30/09/2026'
  dataPagamento: string; // '06/10/2026'
  filiais: FolhaFilialResumo[];
  totalEmpresa: FolhaFilialResumo;
  validacoesInternas: FolhaValidationWarning[];
}

export interface BalanceteLinha {
  contaFormatada: string; // '2.1.0.10.400.003'
  contaNormalizada: string; // '21010400003'
  descricao: string;
  descricaoAnonimizada: string;
  classe: 'sintetica' | 'analitica';
  nivel: number;
  /**
   * Convenção interna em centavos inteiros:
   * Débito = positivo (+), Crédito = negativo (-)
   */
  saldoAnteriorSignedCents: number;
  saldoAnteriorAbsCents: number;
  saldoAnteriorDC: 'D' | 'C' | '';
  debitoCents: number; // movimento a débito (inteiro >= 0)
  creditoCents: number; // movimento a crédito (inteiro >= 0)
  saldoAtualSignedCents: number;
  saldoAtualAbsCents: number;
  saldoAtualDC: 'D' | 'C' | '';
  validacaoEquacaoOk: boolean;
  erroLeituraDetalhe?: string;
  paginaOrigem?: number;
}

export interface BalanceteData {
  nomeArquivo: string;
  empresa: string;
  competencia: string; // '202609'
  linhas: BalanceteLinha[];
  totalDebitoCents: number;
  totalCreditoCents: number;
  anomaliasCorrigidas: string[];
  errosEquacaoLinhas: BalanceteLinha[];
  errosSomaSintetica: {
    contaSintetica: string;
    descricao: string;
    saldoSinteticaCents: number;
    somaAnaliticasCents: number;
    diferencaCents: number;
  }[];
}

export interface OrigemEstruturadaCT2 {
  bruto: string;
  lpCodigo?: string; // ex: '530', '650'
  lpSequencia?: string; // ex: '001', '002'
  usuarioOrigem?: string; // ex: 'ANDRESSA.LUIZ'
  dataOrigem?: string; // ex: '14/07/2026' (NUNCA usada como competência!)
  xorigFilial?: string; // ex: '0101'
}

export interface RazaoLancamento {
  id: string;
  ordemOriginal: number; // posição original no arquivo para ordenação estável
  contaNormalizada: string; // '21010400003'
  contaFormatada: string; // '2.1.0.10.400.003'
  data: string; // 'dd/mm/aaaa'
  competenciaDataLcto: string; // 'AAAAMM' extraído exclusivamente de Data Lcto
  chaveDocumento: string; // 'Filial|Data|Lote|SubLote|Doc'
  chaveCT2: string; // 18 caracteres preservados como texto (Lote+Sub+Doc+Linha)
  lote: string; // 6 caracteres ex: '0000BR', '008890'
  sublote: string; // 3 caracteres ex: '001'
  documento: string; // 6 caracteres ex: '000002'
  linha: string; // 3 caracteres ex: '001'
  manual: boolean; // true quando tabela de lotes = 'manual' ou (se não cadastrado) lote contém letra
  classificacaoLote?: LoteClassificacao;
  historico: string; // Histórico com Cont.Hist concatenado e sem contaminação da coluna Origem
  historicoBrutoConcatenado?: string; // Fragmentos Hist Lanc colados sem trim nas pontas
  historicoPadraoCodigo?: string; // Coluna Hist Pad
  historicoAnonimizado: string;
  contraPartidaNormalizada: string; // conta única oposta, explícita (Partida Dobrada) ou 'MULTIPLAS'
  contraPartidaFormatada: string; // máscara da conta ou 'múltiplas'
  filial: string; // coluna Filial da linha
  filialOrigem: string; // XORIG quando existir; senão coluna Filial
  centroCusto?: string; // C Custo Deb (para débito) ou C Custo Crd (para crédito)
  centroCustoDebito?: string;
  centroCustoCredito?: string;
  origemEstruturada?: OrigemEstruturadaCT2;
  estornado?: boolean; // marcado a partir das colunas Estorno/Canc ou Estorno
  statusEstornoBruto?: string;
  saldoProvisorio?: boolean; // true quando calculado sem Balancete carregado
  debitoCents: number;
  creditoCents: number;
  /**
   * Convenção interna: Débito (+), Crédito (-)
   */
  valorSignedCents: number;
  saldoAtualSignedCents: number;
  saldoAtualAbsCents: number;
  saldoAtualDC: 'D' | 'C' | '';
  // Metadados extraídos do histórico
  tipoExtraido: LancamentoTipoHistorico;
  eventoCodigoExtraido?: string;
  competenciaRefExtraida?: string; // '202609', '202608' extraído apenas do histórico
  favorecidoExtraido?: string;
}

export interface CT2DocumentBalanceCheck {
  chaveDocumento: string; // Filial/Lote/Sub/Doc (Data)
  filial: string;
  data: string;
  lote: string;
  sublote: string;
  documento: string;
  somaDebitoCents: number;
  somaCreditoCents: number;
  diferencaCents: number;
  ok: boolean;
}

export interface CT2AccountBalanceCheck {
  contaNormalizada: string;
  contaFormatada: string;
  descricao: string;
  vinculadaFolha: boolean; // se true, divergência bloqueia a conciliação da conta; se false, é apenas aviso
  debitoCT2Cents: number;
  creditoCT2Cents: number;
  debitoBalanceteCents: number;
  creditoBalanceteCents: number;
  ultimoSaldoCorridoCT2SignedCents: number;
  saldoAtualBalanceteSignedCents: number;
  movimentoOk: boolean; // Validação (b)
  saldoFinalOk: boolean; // Validação (c)
  bloqueante: boolean;
  detalhe?: string;
}

export interface CT2ImportSummary {
  formatoDetectado: 'ct2_45_colunas' | 'ctbr400_9_colunas';
  linhasBrutasLidas: number;
  contHistAnexados: number;
  partidasDobradasDesdobradas: number;
  lancamentosGeradosTotal: number;
  lancamentosNoPeriodoAtivo: number;
  linhasIgnoradasFiltroSaldoMoeda: number;
  linhasForaDoPeriodoBalancete: number;
  outrosTiposLctoAlertas: { tipo: string; quantidade: number }[];
  contHistOrfaosErros: string[];
  alertas: string[];
  errosBloqueantes: string[];
  totalDebitosCents: number;
  totalCreditosCents: number;
  saldoProvisorioSemBalancete: boolean;
}

export interface RazaoData {
  nomeArquivo: string;
  competencia: string; // '202609'
  lancamentos: RazaoLancamento[];
  /**
   * Todos os lançamentos válidos importados antes do filtro de competência do Balancete,
   * para permitir re-filtragem automática caso o Balancete seja carregado depois do CT2.
   */
  todosLancamentosImportados?: RazaoLancamento[];
  lancamentosPorContaMap?: Record<string, RazaoLancamento[]>;
  contasPresentes: string[];
  validacoesSaldoCorrido: {
    conta: string;
    ok: boolean;
    detalhe?: string;
  }[];
  validacoesDocumentos?: CT2DocumentBalanceCheck[];
  validacoesContasBalancete?: CT2AccountBalanceCheck[];
  resumoImportacao?: CT2ImportSummary;
  bloqueioGlobalDocumentos?: boolean;
}

export interface PlanoContaItem {
  contaFormatada: string;
  contaNormalizada: string;
  descricao: string;
  classe: 'sintetica' | 'analitica';
  condicaoNormal: 'devedora' | 'credora';
}

export interface PlanoContasData {
  nomeArquivo: string;
  itens: PlanoContaItem[];
}

export interface DeParaRule {
  id: string;
  verbaCodigo: string;
  verbaDescricao: string;
  tipoVerba: VerbaTipoFuncional;
  contaFormatada: string;
  contaNormalizada: string;
  contaDescricao: string;
  naturezaEsperada: 'credito_passivo' | 'debito_ativo_despesa' | 'reducao_ativo';
  filialOpcional?: string; // '' = todas
  centroCustoOpcional?: string; // '' = todos os centros de custo
  statusVinculo: VinculoStatus;
  observacaoAuditoria?: string;
}

export interface LoteConfig {
  loteCodigo: string; // '008890', '0000BR', 'SC0000'
  classificacao: LoteClassificacao;
  descricao: string;
}

export interface RazaoMatchItem {
  lancamento: RazaoLancamento;
  statusMatch: 'explicado' | 'historico_incompativel' | 'sem_correspondencia';
  motivoMatch: string;
  verbasAssociadas: string[];
  alertaCompetenciaApropriacao: boolean;
}

export interface AdjustmentSuggestionCT2 {
  sequencia: string;
  dataLancamento: string;
  loteSugerido: string;
  contaDebitoFormatada: string;
  contaDebitoNormalizada: string;
  contaCreditoFormatada: string;
  contaCreditoNormalizada: string;
  valorCents: number;
  filial: string;
  historicoPadraoCT2: string;
  justificativaAuditoria: string;
}

export interface AccountReconciliationResult {
  contaFormatada: string;
  contaNormalizada: string;
  descricao: string;
  grupoContabil:
    | 'passivo_trabalhista'
    | 'ativo_adiantamentos'
    | 'despesas_antecipadas'
    | 'provisoes_sem_fonte'
    | 'despesas_resultado';
  statusConciliacao: AccountConciliationStatus;
  statusVinculoDePara: VinculoStatus;
  bloqueadaPorValidacaoCT2?: boolean;
  motivoBloqueioCT2?: string;
  verbasMapeadas: {
    codigo: string;
    descricao: string;
    tipoVerba: VerbaTipoFuncional;
    valorTotalCents: number;
    porFilial: Record<string, number>;
    centroCustoOpcional?: string;
  }[];
  // Valores em centavos inteiros
  valorFolhaEsperadoCents: number; // Soma das verbas aplicáveis à apropriação
  saldoAnteriorSignedCents: number;
  saldoAnteriorAbsCents: number;
  saldoAnteriorDC: 'D' | 'C' | '';
  debitoBalanceteCents: number;
  creditoBalanceteCents: number;
  saldoAtualSignedCents: number;
  saldoAtualAbsCents: number;
  saldoAtualDC: 'D' | 'C' | '';
  // Camada 1: Folha x Movimento de Apropriação do Mês
  movimentoComparadoTipo: 'credito' | 'debito';
  movimentoComparadoBalanceteCents: number;
  diferencaMovimentoApropriacaoCents: number; // Balancete - Folha
  // Camada 2: Baixas / Pagamentos do Saldo Anterior e Efeito Líquido no Saldo
  diferencaBaixaDebitoCents: number; // Débito Balancete - Saldo Anterior (para passivos liquidados no mês)
  saldoFinalEsperadoSignedCents: number;
  diferencaSaldoLiquidoCents: number; // Efeito líquido final
  percentualDiferencaMovimento: number;
  // Camada 3: Balancete x Razão
  temRazaoCarregado: boolean;
  debitoRazaoCents: number;
  creditoRazaoCents: number;
  saldoFinalRazaoSignedCents: number;
  fechamentoBalanceteRazaoOk: boolean;
  saldoFinalBalanceteRazaoOk: boolean;
  diferencaBalanceteRazaoCents: number;
  diferencaSaldoFinalRazaoCents: number;
  // Conferência da Despesa (Partida Dobrada via C/PARTIDA)
  contrapartidasDespesaDetectadas: {
    contaDespesaFormatada: string;
    descricaoDespesa: string;
    valorDebitoRazaoCents: number;
  }[];
  // Investigação de Pendências
  itensRazaoAnalisados: RazaoMatchItem[];
  verbasFolhaSemMatchRazao: {
    codigo: string;
    descricao: string;
    filial: string;
    valorCents: number;
    hipotese: string;
  }[];
  combinacaoExataEncontrada?: {
    origem: 'razao' | 'folha_filial' | 'decomposicao_movimento';
    descricaoCombinacao: string;
    itens: { label: string; valorCents: number }[];
    somaCents: number;
  };
  classificacaoDivergencia: string[];
  explicacaoObjetiva: string;
  sugestoesAjusteCT2: AdjustmentSuggestionCT2[];
}

export interface PendenciaAuditRecord {
  contaNormalizada: string;
  competencia: string;
  empresa: string;
  status: PendenciaAuditStatus;
  comentario: string;
  usuarioAuditor: string;
  atualizadoEm: string;
  transportadaDeCompetenciaAnterior?: string;
  valorDiferencaCents: number;
}

export interface ExpenseDoubleEntryCheck {
  grupoNome: string;
  contasDespesa: {
    contaFormatada: string;
    descricao: string;
    debitoBalanceteCents: number;
    creditoBalanceteCents: number;
    liquidoDespesaCents: number;
  }[];
  somaDespesaLiquidaCents: number;
  valorPassivoFolhaReferenciaCents: number;
  diferencaCents: number;
  status: 'ok' | 'divergente' | 'informativo';
  observacao: string;
}

export interface CompetenciaSnapshot {
  id: string; // `${empresa}_${competencia}`
  empresa: string;
  competencia: string; // '202609'
  salvoEm: string;
  resumoContas: {
    contaNormalizada: string;
    contaFormatada: string;
    descricao: string;
    valorFolhaCents: number;
    movimentoCreditoCents: number;
    movimentoDebitoCents: number;
    saldoAtualSignedCents: number;
    diferencaMovimentoCents: number;
    statusConciliacao: AccountConciliationStatus;
  }[];
  resumoVerbas: {
    codigo: string;
    descricao: string;
    tipoVerba: VerbaTipoFuncional;
    valorTotalCents: number;
  }[];
}

export interface CT2AcceptanceTestResult {
  passedAll: boolean;
  linhasBrutas: number;
  lancamentosGerados: number;
  contHistAnexados: number;
  partidasDobradas: number;
  totalDebitosCents: number;
  totalCreditosCents: number;
  documentosTotais: Record<string, { debitoCents: number; creditoCents: number; ok: boolean }>;
  primeiroHistorico: string;
  decimoHistorico: string;
  checks: {
    id: string;
    titulo: string;
    esperado: string;
    encontrado: string;
    ok: boolean;
  }[];
}
