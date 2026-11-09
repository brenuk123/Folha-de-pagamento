import {
  BalanceteData,
  BalanceteLinha,
  CompetenciaSnapshot,
  DeParaRule,
  FolhaData,
  FolhaFilialResumo,
  LoteConfig,
  PendenciaAuditRecord,
  PlanoContasData,
  RazaoData,
  RazaoLancamento,
} from '../types/reconciliation';
import { anonymizePII, formatAccountMask, normalizeAccountCode } from '../utils/money';

export const DEFAULT_LOTE_CONFIGS: LoteConfig[] = [
  {
    loteCodigo: '008890',
    classificacao: 'folha_apropriacao',
    descricao: 'Contabilização Mensal da Folha de Pagamento (GPER106 / GPER670)',
  },
  {
    loteCodigo: '008850',
    classificacao: 'pagamento_baixa',
    descricao: 'Pagamentos e Baixas Financeiras (FINA / Bancos e Caixa)',
  },
  {
    loteCodigo: '008895',
    classificacao: 'provisao_mensal',
    descricao: 'Contabilização de Provisões de Férias, 13º Salário e Encargos',
  },
  {
    loteCodigo: '008810',
    classificacao: 'fiscal',
    descricao: 'Livros Fiscais — Documento de Entrada / Compras',
  },
  {
    loteCodigo: '008820',
    classificacao: 'fiscal',
    descricao: 'Livros Fiscais — Faturamento / Documento de Saída',
  },
  {
    loteCodigo: '0000BR',
    classificacao: 'manual',
    descricao: 'Lançamento Manual Contábil (Lote com letras = Manual)',
  },
  {
    loteCodigo: 'SC0000',
    classificacao: 'manual',
    descricao: 'Lançamento Manual Contábil (Lote com letras = Manual)',
  },
];

/**
 * Fixture oficial de 24 linhas brutas da tabela CT2 (45 colunas) para o Teste de Aceite Automático.
 */
export const CT2_ACCEPTANCE_FIXTURE_TSV = `Filial      \tData Lcto   \tNumero Lote \tSub Lote    \tNumero Doc  \tMoeda Lancto\tTipo Lcto   \tCta Debito  \tCta Credito \tValor       \tHist Pad    \tHist Lanc   \tC Custo Deb \tC Custo Crd \tItem Conta D\tItem Conta C\tCod Cl Val D\tCod Cl Val C\tTipo do Sld \tOrigem      \tValor Moeda1\tCrit. Conver\tStatus Conf.\tUsuario Conf\tData Conf   \tHora Conf   \tStatus Copia\tCod.Partic. \tNro Diario  \tCod. Diario \tMoed fato DB\tMoed fato CR\tAtiv.01 DB  \tAtiv.01 CR  \tAtiv.02 DB  \tAtiv.02 CR  \tAtiv.03 DB  \tAtiv.03 CR  \tAtiv.04 DB  \tAtiv.04 CR  \tCód. Cliente\tCód. Fornec.\tControl.Sald\tEstorno/Canc\tEstorno     
0101\t01/09/2026\t0000BR\t001\t000002\t01\tDebito\t42040400002\t\t120,00\t\tVALOR REF. A NF:  000017235 POSTO DE MOL\t\t\t\t\t\t\t1\tLP 650/002 BRENDO.CARDOSO/07/10/2026\t120,00\tDiaria\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
0101\t01/09/2026\t0000BR\t001\t000002\t01\tCont.Hist\t\t\t0,00\t\tAS RDR LTDA SERV TROCA BOLSA/MOLA PNEUMA\t\t\t\t\t\t\t1\tLP 650/002 BRENDO.CARDOSO/07/10/2026\t0,00\t\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
0101\t01/09/2026\t0000BR\t001\t000002\t01\tCont.Hist\t\t\t0,00\t\tTI\t\t\t\t\t\t\t1\tLP 650/002 BRENDO.CARDOSO/07/10/2026\t0,00\t\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
0101\t01/09/2026\t0000BR\t001\t000002\t01\tCredito\t\t21010300108\t120,00\t\tAPROPR. NFE 000017235 POSTO DE MOLAS RDR\t\t\t\t\t\t\t1\tLP 660/003 BRENDO.CARDOSO/07/10/2026\t120,00\tDiaria\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
0101\t01/09/2026\t0000BR\t001\t000002\t01\tCont.Hist\t\t\t0,00\t\tLTDA\t\t\t\t\t\t\t1\tLP 660/003 BRENDO.CARDOSO/07/10/2026\t0,00\t\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
0101\t01/09/2026\t0000BR\t001\t000003\t01\tDebito\t21010400005\t\t3013,00\t\tPAGTO   000004769 - FERIAS\t\t\t\t\t\t\t1\tLP 530/001 ANDRESSA.LUIZ/14/07/2026 -XORIG: 0101\t4316,00\tDiaria\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
0101\t01/09/2026\t0000BR\t001\t000003\t01\tCredito\t\t11060300003\t3013,00\t\tPAGTO   000004769 FERIAS\t\t\t\t\t\t\t1\tLP 530/002 ANDRESSA.LUIZ/14/07/2026 -XORIG: 0101\t4316,00\tDiaria\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
0101\t01/09/2026\t0000BR\t001\t000004\t01\tDebito\t21010400005\t\t4024,00\t\tPAGTO   000004773 - FERIAS\t\t\t\t\t\t\t1\tLP 530/001 ANDRESSA.LUIZ/14/07/2026 -XORIG: 0101\t4316,00\tDiaria\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
0101\t01/09/2026\t0000BR\t001\t000004\t01\tCredito\t\t11060300003\t4024,00\t\tPAGTO   000004773 FERIAS\t\t\t\t\t\t\t1\tLP 530/002 ANDRESSA.LUIZ/14/07/2026 -XORIG: 0101\t4316,00\tDiaria\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
0101\t01/09/2026\t008810\t001\t000001\t01\tDebito\t11030100012\t\t10653,15\t\tCOMPRA DE SUCATA FERROSA EMARANHADO VERG\t\t\t\t\t\t\t1\tLP 650/003 BRENDO.CARDOSO/06/10/2026\t10653,15\tDiaria\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
0101\t01/09/2026\t008810\t001\t000001\t01\tCont.Hist\t\t\t0,00\t\tNFE 000000346 BGR SOLUCOES AMBIENTAIS\t\t\t\t\t\t\t1\tLP 650/003 BRENDO.CARDOSO/06/10/2026\t0,00\t\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
0101\t01/09/2026\t008810\t001\t000001\t01\tDebito\t11070100002\t\t193,69\t\tVL CRED.PIS: 000000346-BGR SOLUCOES AMBI\t\t\t\t\t\t\t1\tLP 650/012 BRENDO.CARDOSO/06/10/2026\t193,69\tDiaria\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
0101\t01/09/2026\t008810\t001\t000001\t01\tDebito\t11070100003\t\t892,16\t\tVL CRED.COFINS: 000000346-BGR SOLUCOES A\t\t\t\t\t\t\t1\tLP 650/013 BRENDO.CARDOSO/06/10/2026\t892,16\tDiaria\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
0101\t01/09/2026\t008810\t001\t000001\t01\tDebito\t11030100003\t\t13932,84\t\tCOMPRA DE SUCATA FERROSA PESADA GRAUDA N\t\t\t\t\t\t\t1\tLP 650/003 BRENDO.CARDOSO/06/10/2026\t13932,84\tDiaria\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
0101\t01/09/2026\t008810\t001\t000001\t01\tCont.Hist\t\t\t0,00\t\tFE 000000346 BGR SOLUCOES AMBIENTAIS\t\t\t\t\t\t\t1\tLP 650/003 BRENDO.CARDOSO/06/10/2026\t0,00\t\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
0101\t01/09/2026\t008810\t001\t000001\t01\tDebito\t11070100002\t\t253,33\t\tVL CRED.PIS: 000000346-BGR SOLUCOES AMBI\t\t\t\t\t\t\t1\tLP 650/012 BRENDO.CARDOSO/06/10/2026\t253,33\tDiaria\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
0101\t01/09/2026\t008810\t001\t000001\t01\tDebito\t11070100003\t\t1166,83\t\tVL CRED.COFINS: 000000346-BGR SOLUCOES A\t\t\t\t\t\t\t1\tLP 650/013 BRENDO.CARDOSO/06/10/2026\t1166,83\tDiaria\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
0101\t01/09/2026\t008810\t001\t000001\t01\tCredito\t\t21010202829\t27092,00\t\tAPROPR. NFE 000000346 BGR SOLUCOES AMBIE\t\t\t\t\t\t\t1\tLP 660/003 BRENDO.CARDOSO/06/10/2026\t27092,00\tDiaria\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
0101\t01/09/2026\t008810\t001\t000001\t01\tCont.Hist\t\t\t0,00\t\tNTAIS\t\t\t\t\t\t\t1\tLP 660/003 BRENDO.CARDOSO/06/10/2026\t0,00\t\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
0101\t01/09/2026\t008820\t001\t000001\t01\tCredito\t\t31010100001\t43481,31\t\tRECEITA DE VENDA DE INSUMO MET FER. FUND\t\t000003200\t\t\t\t\t1\tLP 610/001 BRENDO.CARDOSO/05/10/2026\t43481,31\tDiaria\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
0101\t01/09/2026\t008820\t001\t000001\t01\tCont.Hist\t\t\t0,00\t\tIDO NF:000033113 ARCELORMITTAL BRASIL S.\t\t\t\t\t\t\t1\tLP 610/001 BRENDO.CARDOSO/05/10/2026\t0,00\t\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
0101\t01/09/2026\t008820\t001\t000001\t01\tCont.Hist\t\t\t0,00\t\tA.\t\t\t\t\t\t\t1\tLP 610/001 BRENDO.CARDOSO/05/10/2026\t0,00\t\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t
0101\t01/09/2026\t008820\t001\t000001\t01\tPartida Dobrada\t31040200001\t21010800002\t9565,89\t\tICMS S/ NF 000033113-ARCELORMITTAL RESEN\t\t\t\t\t\t\t1\tLP 610/008 BRENDO.CARDOSO/05/10/2026\t9565,89\tDiaria\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t2\t\t
0101\t01/09/2026\t008820\t001\t000001\t01\tDebito\t11020100005\t\t43481,31\t\tVALOR A RECEBER REF. VENDA DE SUCATA NF:\t\t\t\t\t\t\t1\tLP 620/005 BRENDO.CARDOSO/05/10/2026\t43481,31\tDiaria\t\t\t\t\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t`;

export const DEFAULT_DE_PARA_RULES: DeParaRule[] = [
  // Casos novos validados no Ativo (Adiantamentos e Convênios)
  {
    id: 'dp-518',
    verbaCodigo: '518',
    verbaDescricao: 'DESCONTO DE ADIANTAMENTO SALARIAL',
    tipoVerba: 'desconto_real',
    contaFormatada: '1.1.0.60.300.001',
    contaNormalizada: '11060300001',
    contaDescricao: 'ADIANTAMENTO DE SALARIOS',
    naturezaEsperada: 'reducao_ativo',
    statusVinculo: 'confirmado',
    observacaoAuditoria: 'Baixa a crédito na conta de ativo de adiantamento concedido.',
  },
  {
    id: 'dp-525',
    verbaCodigo: '525',
    verbaDescricao: 'CONVENIO FARMACIA',
    tipoVerba: 'desconto_real',
    contaFormatada: '1.1.0.60.300.006',
    contaNormalizada: '11060300006',
    contaDescricao: 'CONVENIO FARMACIA A DESCONTAR',
    naturezaEsperada: 'reducao_ativo',
    statusVinculo: 'confirmado',
    observacaoAuditoria: 'Em Set/2026: Folha R$ 2.898,76 (0101: 2.702,83 + 0102: 195,93) vs Crédito Balancete R$ 2.702,83 (diverge em R$ 195,93 da filial 0102).',
  },
  // Passivo Trabalhista Validado
  {
    id: 'dp-999',
    verbaCodigo: '999',
    verbaDescricao: 'LIQUIDO A RECEBER',
    tipoVerba: 'informativo_base',
    contaFormatada: '2.1.0.10.400.001',
    contaNormalizada: '21010400001',
    contaDescricao: 'SALARIOS A PAGAR',
    naturezaEsperada: 'credito_passivo',
    statusVinculo: 'confirmado',
    observacaoAuditoria: 'Conciliação por movimento: Crédito do mês (206.373,99) − Líquido (199.692,65) = +6.681,34; Débito (206.285,39) − Saldo Ant (200.048,64) = +6.236,75; Efeito líquido = 444,59.',
  },
  {
    id: 'dp-505',
    verbaCodigo: '505',
    verbaDescricao: 'IRRF FOLHA MENSAL / FERIAS / RESCISAO',
    tipoVerba: 'desconto_real',
    contaFormatada: '2.1.0.10.400.004',
    contaNormalizada: '21010400004',
    contaDescricao: 'IRRF FOLHA DE PAGAMENTO',
    naturezaEsperada: 'credito_passivo',
    statusVinculo: 'confirmado',
    observacaoAuditoria: 'Vínculo validado 1:1 (R$ 853,54 em Set/2026).',
  },
  {
    id: 'dp-526',
    verbaCodigo: '526',
    verbaDescricao: 'PENSAO ALIMENTICIA DESCONTADA',
    tipoVerba: 'desconto_real',
    contaFormatada: '2.1.0.10.400.006',
    contaNormalizada: '21010400006',
    contaDescricao: 'PENSAO ALIMENTICIA A PAGAR',
    naturezaEsperada: 'credito_passivo',
    statusVinculo: 'confirmado',
    observacaoAuditoria: 'Vínculo validado 1:1 (R$ 376,32 em Set/2026).',
  },
  {
    id: 'dp-563',
    verbaCodigo: '563',
    verbaDescricao: 'LIQUIDO DE RESCISAO PAGO',
    tipoVerba: 'liquido_pago_por_fora',
    contaFormatada: '2.1.0.10.400.007',
    contaNormalizada: '21010400007',
    contaDescricao: 'RESCISOES TRABALHISTAS A PAGAR',
    naturezaEsperada: 'credito_passivo',
    statusVinculo: 'confirmado',
    observacaoAuditoria: 'Líquido pago por fora (entra na coluna Descontos da GPER106 apenas para deduzir o líquido mensal).',
  },
  {
    id: 'dp-564',
    verbaCodigo: '564',
    verbaDescricao: 'LIQUIDO DE FERIAS PAGO',
    tipoVerba: 'liquido_pago_por_fora',
    contaFormatada: '2.1.0.10.400.005',
    contaNormalizada: '21010400005',
    contaDescricao: 'FERIAS E 1/3 A PAGAR',
    naturezaEsperada: 'credito_passivo',
    statusVinculo: 'confirmado',
    observacaoAuditoria: 'Líquido pago por fora (R$ 10.608,00 em Set/2026).',
  },
  // Conta Mista 2.1.0.10.400.003: FGTS + Empréstimos Consignados
  {
    id: 'dp-826',
    verbaCodigo: '826',
    verbaDescricao: 'FGTS MES',
    tipoVerba: 'informativo_base',
    contaFormatada: '2.1.0.10.400.003',
    contaNormalizada: '21010400003',
    contaDescricao: 'FGTS A RECOLHER',
    naturezaEsperada: 'credito_passivo',
    statusVinculo: 'conta_mista',
    observacaoAuditoria: 'Conta mista: recebe FGTS (826, 827, 829, 832 = R$ 21.688,09) + Consignados (R$ 13.965,39) = R$ 35.653,48.',
  },
  {
    id: 'dp-827',
    verbaCodigo: '827',
    verbaDescricao: 'FGTS 13O SALARIO',
    tipoVerba: 'informativo_base',
    contaFormatada: '2.1.0.10.400.003',
    contaNormalizada: '21010400003',
    contaDescricao: 'FGTS A RECOLHER',
    naturezaEsperada: 'credito_passivo',
    statusVinculo: 'conta_mista',
  },
  {
    id: 'dp-829',
    verbaCodigo: '829',
    verbaDescricao: 'FGTS MES RESCISAO',
    tipoVerba: 'informativo_base',
    contaFormatada: '2.1.0.10.400.003',
    contaNormalizada: '21010400003',
    contaDescricao: 'FGTS A RECOLHER',
    naturezaEsperada: 'credito_passivo',
    statusVinculo: 'conta_mista',
  },
  {
    id: 'dp-832',
    verbaCodigo: '832',
    verbaDescricao: 'FGTS 13O RESCISAO',
    tipoVerba: 'informativo_base',
    contaFormatada: '2.1.0.10.400.003',
    contaNormalizada: '21010400003',
    contaDescricao: 'FGTS A RECOLHER',
    naturezaEsperada: 'credito_passivo',
    statusVinculo: 'conta_mista',
  },
  ...[
    { cod: '763', desc: 'DESC EMPRESTIMO CONSIGNADO CAIXA' },
    { cod: '769', desc: 'DESC CREDITO DO TRABALHADOR - L1' },
    { cod: '770', desc: 'DESC CONSIGNADO SANTANDER' },
    { cod: '771', desc: 'DESC CREDITO DO TRABALHADOR - L2' },
    { cod: '772', desc: 'DESC CREDITO DO TRABALHADOR - L3' },
    { cod: '775', desc: 'DESC CREDITO DO TRABALHADOR - L4' },
    { cod: '779', desc: 'DESC CREDITO DO TRABALHADOR - L5' },
    { cod: '780', desc: 'DESC CREDITO DO TRABALHADOR - L6' },
    { cod: '783', desc: 'DESC CREDITO DO TRABALHADOR - L7' },
  ].map((item): DeParaRule => ({
    id: `dp-${item.cod}`,
    verbaCodigo: item.cod,
    verbaDescricao: item.desc,
    tipoVerba: 'desconto_real',
    contaFormatada: '2.1.0.10.400.003',
    contaNormalizada: '21010400003',
    contaDescricao: 'FGTS A RECOLHER',
    naturezaEsperada: 'credito_passivo',
    statusVinculo: 'conta_mista',
    observacaoAuditoria: 'Alerta de natureza mista: empréstimo consignado contabilizado dentro de FGTS a Recolher.',
  })),
  // INSS: Sugestão Não Validada (Diferença de R$ 12.778,99 em Set/2026)
  ...[
    { cod: '500', desc: 'INSS FOLHA MENSAL', tipo: 'desconto_real' as const },
    { cod: '501', desc: 'INSS FERIAS', tipo: 'desconto_real' as const },
    { cod: '502', desc: 'INSS 13O SALARIO / RESCISAO', tipo: 'desconto_real' as const },
    { cod: '808', desc: 'INSS EMPRESA (PATRONAL 20%)', tipo: 'informativo_base' as const },
    { cod: '809', desc: 'INSS TERCEIROS (OUTRAS ENTIDADES)', tipo: 'informativo_base' as const },
    { cod: '810', desc: 'INSS ACIDENTE DE TRABALHO (RAT/FAP)', tipo: 'informativo_base' as const },
  ].map((item): DeParaRule => ({
    id: `dp-${item.cod}`,
    verbaCodigo: item.cod,
    verbaDescricao: item.desc,
    tipoVerba: item.tipo,
    contaFormatada: '2.1.0.10.400.002',
    contaNormalizada: '21010400002',
    contaDescricao: 'INSS A RECOLHER',
    naturezaEsperada: 'credito_passivo',
    statusVinculo: 'sugestao_nao_validada',
    observacaoAuditoria: 'Sugestão exige confirmação: Soma verbas R$ 103.281,78 vs Crédito Balancete R$ 116.060,77 (diferença de R$ 12.778,99 sem causa identificada no balancete).',
  })),
  // Estornos mapeados para classificação correta da folha
  ...[
    { cod: '570', desc: 'ESTORNO DESCONTO INDEVIDO', conta: '2.1.0.10.400.001', contaDesc: 'SALARIOS A PAGAR' },
    { cod: '572', desc: 'ESTORNO ADIANTAMENTO', conta: '1.1.0.60.300.001', contaDesc: 'ADIANTAMENTO DE SALARIOS' },
    { cod: '954', desc: 'ESTORNO INSS RETIDO', conta: '2.1.0.10.400.002', contaDesc: 'INSS A RECOLHER' },
    { cod: '958', desc: 'AJUSTE / ESTORNO ARREDONDAMENTO', conta: '2.1.0.10.400.001', contaDesc: 'SALARIOS A PAGAR' },
  ].map((item): DeParaRule => ({
    id: `dp-est-${item.cod}`,
    verbaCodigo: item.cod,
    verbaDescricao: item.desc,
    tipoVerba: 'estorno',
    contaFormatada: item.conta,
    contaNormalizada: normalizeAccountCode(item.conta),
    contaDescricao: item.contaDesc,
    naturezaEsperada: 'credito_passivo',
    statusVinculo: 'confirmado',
    observacaoAuditoria: 'Rubrica de estorno para não distorcer totais de desconto real.',
  })),
  // 4 Contas de Despesas Antecipadas (VT, VR, VC e VA: 1.1.2.00.100.001 a 004) -> Sem Vínculo Validado
  {
    id: 'dp-ant-001',
    verbaCodigo: '510',
    verbaDescricao: 'DESC VALE TRANSPORTE (6%)',
    tipoVerba: 'desconto_real',
    contaFormatada: '1.1.2.00.100.001',
    contaNormalizada: '11200100001',
    contaDescricao: 'VALE TRANSPORTE (VT) A APROPRIAR',
    naturezaEsperada: 'reducao_ativo',
    statusVinculo: 'sem_vinculo_validado',
    observacaoAuditoria: 'Sem vínculo validado: a folha traz apenas o desconto e a base, sem o valor das faturas de aquisição.',
  },
  {
    id: 'dp-ant-002',
    verbaCodigo: '512',
    verbaDescricao: 'DESC VALE REFEICAO (VR)',
    tipoVerba: 'desconto_real',
    contaFormatada: '1.1.2.00.100.002',
    contaNormalizada: '11200100002',
    contaDescricao: 'VALE REFEICAO (VR) A APROPRIAR',
    naturezaEsperada: 'reducao_ativo',
    statusVinculo: 'sem_vinculo_validado',
    observacaoAuditoria: 'Sem vínculo validado até definição de critério entre desconto em folha e baixa de benefício.',
  },
  {
    id: 'dp-ant-003',
    verbaCodigo: '514',
    verbaDescricao: 'DESC VALE COMBUSTIVEL (VC)',
    tipoVerba: 'desconto_real',
    contaFormatada: '1.1.2.00.100.003',
    contaNormalizada: '11200100003',
    contaDescricao: 'VALE COMBUSTIVEL (VC) A APROPRIAR',
    naturezaEsperada: 'reducao_ativo',
    statusVinculo: 'sem_vinculo_validado',
    observacaoAuditoria: 'Sem vínculo validado até definição de critério contábil.',
  },
  {
    id: 'dp-ant-004',
    verbaCodigo: '516',
    verbaDescricao: 'DESC VALE ALIMENTACAO (VA)',
    tipoVerba: 'desconto_real',
    contaFormatada: '1.1.2.00.100.004',
    contaNormalizada: '11200100004',
    contaDescricao: 'VALE ALIMENTACAO (VA) A APROPRIAR',
    naturezaEsperada: 'reducao_ativo',
    statusVinculo: 'sem_vinculo_validado',
    observacaoAuditoria: 'Sem vínculo validado até definição de critério contábil.',
  },
];

/**
 * Gera o conjunto completo de dados de teste validados de Setembro/2026 (Pramar)
 * incluindo Folha GPER106 (Filiais 0101, 0102, 0103), Balancete CTBR040 e Razão CT2 de Setembro/2026.
 */
export function buildPramarSept2026TestSuite(): {
  folha: FolhaData;
  balancete: BalanceteData;
  razao: RazaoData;
  planoContas: PlanoContasData;
  historicoAgosto: CompetenciaSnapshot;
  pendenciasIniciais: PendenciaAuditRecord[];
} {
  // 1. FOLHA GPER106 SETEMBRO/2026 (Filiais 0101, 0102, 0103 + Total Empresa)
  // Valores em centavos inteiros que fecham exatamente com os casos de teste:
  // Total Proventos = 291.444,81 (29144481)
  // Total Descontos = 91.752,16 (9175216)
  // Líquido (999) = 199.692,65 (19969265)
  // Filial 0101 Base FGTS = 238.502,47 -> 8% = 19.080,20 vs apurado 18.547,01 (dif 533,19)
  // 518 Adiantamento = 1.320,44
  // 525 Conv Farmácia = 2.898,76 (0101: 2.702,83 + 0102: 195,93)
  // 505 IRRF = 853,54
  // 526 Pensão = 376,32
  // 563 Líq Rescisão = 7.242,21
  // 564 Líq Férias = 10.608,00
  // FGTS (826+827+829+832) = 21.688,09
  // Consignados (763..783) = 13.965,39 -> Total c/ FGTS = 35.653,48
  // INSS (500+501+502+808+809+810) = 103.281,78

  const filial0101: FolhaFilialResumo = {
    filial: '0101',
    nomeFilial: '0101 - MATRIZ PRAMAR CARIOCA',
    totalProventosCents: 26136156,
    totalDescontosCents: 8229164,
    liquidoCalculadoCents: 17906992,
    liquidoVerba999Cents: 17906992,
    baseInssCents: 24325425,
    baseFgtsCents: 23850247, // 8% = 19.080,20 vs 826 (18.547,01) -> dif 533,19
    fgtsMes826Cents: 1854701,
    fgts13o827Cents: 19841,
    fgtsRescisao829Cents: 38010,
    fgts13oResc832Cents: 19897,
    inssEmpresa808Cents: 4948783,
    inssTerceiros809Cents: 1435148,
    inssRat810Cents: 769314,
    rubricas: [
      { codigo: '001', descricao: 'SALARIO BASE', referencia: 2563, valorCents: 21131995, colunaGPER: 'provento', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '021', descricao: 'SALDO DE SALARIO', referencia: 121, valorCents: 967998, colunaGPER: 'provento', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '090', descricao: 'FERIAS', referencia: 61, valorCents: 617686, colunaGPER: 'provento', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '319', descricao: 'ADC CARGO CONFIANCA', referencia: 225, valorCents: 900364, colunaGPER: 'provento', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '500', descricao: 'INSS', referencia: 0, valorCents: 1972149, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '501', descricao: 'INSS 13º SALARIO', referencia: 0, valorCents: 37254, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '502', descricao: 'INSS FERIAS', referencia: 0, valorCents: 85149, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '505', descricao: 'IRRF', referencia: 55, valorCents: 85354, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '517', descricao: 'VALE TRANSPORTE', referencia: 845, valorCents: 510064, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '518', descricao: 'DESC ADIANTAMENTO', referencia: 0, valorCents: 128044, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '525', descricao: 'CONVENIO FARMACIA', referencia: 0, valorCents: 270283, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '526', descricao: 'PENSAO ALIMENT DEP 1', referencia: 20, valorCents: 37632, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '563', descricao: 'LIQ DA RESCISAO', referencia: 0, valorCents: 724221, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '564', descricao: 'LIQUIDO DE FERIAS', referencia: 0, valorCents: 834700, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '570', descricao: 'SALDO NEG PGT ANT', referencia: 0, valorCents: 94271, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '572', descricao: 'FERIAS PAGAS MES ANT', referencia: 1, valorCents: 11375, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '763', descricao: 'DESC CRED TRABALHAD', referencia: 0, valorCents: 690069, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '769', descricao: 'DESC CRED TRAB 2 CTT', referencia: 0, valorCents: 125189, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '770', descricao: 'DEV ECONSIGNADO FER', referencia: 0, valorCents: 29355, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '771', descricao: 'DESC CRE TRAB 3 CTT', referencia: 0, valorCents: 167837, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '772', descricao: 'DESC CRE TRAB 4 CTT', referencia: 0, valorCents: 81811, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '775', descricao: 'DESC CRED TRAB 5 CTT', referencia: 0, valorCents: 25327, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '779', descricao: 'DESC CRED TRAB 6 CTT', referencia: 0, valorCents: 25377, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '780', descricao: 'DESC CRED TRAB 7 CTT', referencia: 0, valorCents: 37497, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '954', descricao: 'VR NAO UTILIZADO', referencia: 0, valorCents: 137500, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '958', descricao: 'VC NAO UTILIZADO', referencia: 0, valorCents: 71680, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '801', descricao: 'BS INSS ATE LIM', referencia: 0, valorCents: 24325425, colunaGPER: 'base', isBaseCalculoPura: true, filial: '0101' },
      { codigo: '808', descricao: 'INSS EMPRESA', referencia: 0, valorCents: 4948783, colunaGPER: 'base', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '809', descricao: 'TERCEIROS', referencia: 0, valorCents: 1435148, colunaGPER: 'base', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '810', descricao: 'ACID TRABALHO', referencia: 0, valorCents: 769314, colunaGPER: 'base', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '820', descricao: 'BASE FGTS', referencia: 0, valorCents: 23850247, colunaGPER: 'base', isBaseCalculoPura: true, filial: '0101' },
      { codigo: '826', descricao: 'DEP FGTS MES', referencia: 0, valorCents: 1854701, colunaGPER: 'base', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '827', descricao: 'DEP FGTS 13º', referencia: 0, valorCents: 19841, colunaGPER: 'base', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '829', descricao: 'FGTS MES RESCISAO', referencia: 0, valorCents: 38010, colunaGPER: 'base', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '832', descricao: 'FGTS 13º RESCISAO', referencia: 0, valorCents: 19897, colunaGPER: 'base', isBaseCalculoPura: false, filial: '0101' },
      { codigo: '999', descricao: 'LIQ A RECEBER', referencia: 0, valorCents: 17906992, colunaGPER: 'base', isBaseCalculoPura: false, filial: '0101' },
    ],
  };

  const filial0102: FolhaFilialResumo = {
    filial: '0102',
    nomeFilial: '0102 - FILIAL 0102',
    totalProventosCents: 1967939,
    totalDescontosCents: 802457,
    liquidoCalculadoCents: 1165482,
    liquidoVerba999Cents: 1165482,
    baseInssCents: 1927678,
    baseFgtsCents: 1927678,
    fgtsMes826Cents: 154211,
    fgts13o827Cents: 0,
    fgtsRescisao829Cents: 0,
    fgts13oResc832Cents: 0,
    inssEmpresa808Cents: 385535,
    inssTerceiros809Cents: 111805,
    inssRat810Cents: 42765,
    rubricas: [
      { codigo: '001', descricao: 'SALARIO BASE', referencia: 194, valorCents: 1501264, colunaGPER: 'provento', isBaseCalculoPura: false, filial: '0102' },
      { codigo: '500', descricao: 'INSS', referencia: 0, valorCents: 139561, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0102' },
      { codigo: '502', descricao: 'INSS FERIAS', referencia: 0, valorCents: 20845, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0102' },
      { codigo: '518', descricao: 'DESC ADIANTAMENTO', referencia: 0, valorCents: 4000, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0102' },
      { codigo: '525', descricao: 'CONVENIO FARMACIA', referencia: 0, valorCents: 19593, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0102' },
      { codigo: '564', descricao: 'LIQUIDO DE FERIAS', referencia: 0, valorCents: 226100, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0102' },
      { codigo: '570', descricao: 'SALDO NEG PGT ANT', referencia: 0, valorCents: 45196, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0102' },
      { codigo: '572', descricao: 'FERIAS PAGAS MES ANT', referencia: 1, valorCents: 11591, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0102' },
      { codigo: '763', descricao: 'DESC CRED TRABALHAD', referencia: 0, valorCents: 36638, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0102' },
      { codigo: '769', descricao: 'DESC CRED TRAB 2 CTT', referencia: 0, valorCents: 10193, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0102' },
      { codigo: '771', descricao: 'DESC CRE TRAB 3 CTT', referencia: 0, valorCents: 25488, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0102' },
      { codigo: '772', descricao: 'DESC CRE TRAB 4 CTT', referencia: 0, valorCents: 10973, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0102' },
      { codigo: '775', descricao: 'DESC CRED TRAB 5 CTT', referencia: 0, valorCents: 70805, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0102' },
      { codigo: '779', descricao: 'DESC CRED TRAB 6 CTT', referencia: 0, valorCents: 24705, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0102' },
      { codigo: '780', descricao: 'DESC CRED TRAB 7 CTT', referencia: 0, valorCents: 32219, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0102' },
      { codigo: '783', descricao: 'DESC CRED TRAB 8 CTT', referencia: 0, valorCents: 3056, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0102' },
      { codigo: '801', descricao: 'BS INSS ATE LIM', referencia: 0, valorCents: 1927678, colunaGPER: 'base', isBaseCalculoPura: true, filial: '0102' },
      { codigo: '808', descricao: 'INSS EMPRESA', referencia: 0, valorCents: 385535, colunaGPER: 'base', isBaseCalculoPura: false, filial: '0102' },
      { codigo: '809', descricao: 'TERCEIROS', referencia: 0, valorCents: 111805, colunaGPER: 'base', isBaseCalculoPura: false, filial: '0102' },
      { codigo: '810', descricao: 'ACID TRABALHO', referencia: 0, valorCents: 42765, colunaGPER: 'base', isBaseCalculoPura: false, filial: '0102' },
      { codigo: '820', descricao: 'BASE FGTS', referencia: 0, valorCents: 1927678, colunaGPER: 'base', isBaseCalculoPura: true, filial: '0102' },
      { codigo: '826', descricao: 'DEP FGTS MES', referencia: 0, valorCents: 154211, colunaGPER: 'base', isBaseCalculoPura: false, filial: '0102' },
      { codigo: '999', descricao: 'LIQ A RECEBER', referencia: 0, valorCents: 1165482, colunaGPER: 'base', isBaseCalculoPura: false, filial: '0102' },
    ],
  };

  const filial0103: FolhaFilialResumo = {
    filial: '0103',
    nomeFilial: '0103 - FILIAL 0103',
    totalProventosCents: 617055,
    totalDescontosCents: 85593,
    liquidoCalculadoCents: 531462,
    liquidoVerba999Cents: 531462,
    baseInssCents: 603547,
    baseFgtsCents: 603547,
    fgtsMes826Cents: 48283,
    fgts13o827Cents: 0,
    fgtsRescisao829Cents: 0,
    fgts13oResc832Cents: 0,
    inssEmpresa808Cents: 120710,
    inssTerceiros809Cents: 35005,
    inssRat810Cents: 9053,
    rubricas: [
      { codigo: '001', descricao: 'SALARIO BASE', referencia: 60, valorCents: 481836, colunaGPER: 'provento', isBaseCalculoPura: false, filial: '0103' },
      { codigo: '500', descricao: 'INSS', referencia: 0, valorCents: 53525, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0103' },
      { codigo: '801', descricao: 'BS INSS ATE LIM', referencia: 0, valorCents: 603547, colunaGPER: 'base', isBaseCalculoPura: true, filial: '0103' },
      { codigo: '808', descricao: 'INSS EMPRESA', referencia: 0, valorCents: 120710, colunaGPER: 'base', isBaseCalculoPura: false, filial: '0103' },
      { codigo: '809', descricao: 'TERCEIROS', referencia: 0, valorCents: 35005, colunaGPER: 'base', isBaseCalculoPura: false, filial: '0103' },
      { codigo: '810', descricao: 'ACID TRABALHO', referencia: 0, valorCents: 9053, colunaGPER: 'base', isBaseCalculoPura: false, filial: '0103' },
      { codigo: '820', descricao: 'BASE FGTS', referencia: 0, valorCents: 603547, colunaGPER: 'base', isBaseCalculoPura: true, filial: '0103' },
      { codigo: '826', descricao: 'DEP FGTS MES', referencia: 0, valorCents: 48283, colunaGPER: 'base', isBaseCalculoPura: false, filial: '0103' },
      { codigo: '999', descricao: 'LIQ A RECEBER', referencia: 0, valorCents: 531462, colunaGPER: 'base', isBaseCalculoPura: false, filial: '0103' },
    ],
  };

  const filial0104: FolhaFilialResumo = {
    filial: '0104',
    nomeFilial: '0104 - FILIAL 0104',
    totalProventosCents: 423331,
    totalDescontosCents: 58002,
    liquidoCalculadoCents: 365329,
    liquidoVerba999Cents: 365329,
    baseInssCents: 423331,
    baseFgtsCents: 423331,
    fgtsMes826Cents: 33866,
    fgts13o827Cents: 0,
    fgtsRescisao829Cents: 0,
    fgts13oResc832Cents: 0,
    inssEmpresa808Cents: 84666,
    inssTerceiros809Cents: 24553,
    inssRat810Cents: 12700,
    rubricas: [
      { codigo: '001', descricao: 'SALARIO BASE', referencia: 30, valorCents: 302379, colunaGPER: 'provento', isBaseCalculoPura: false, filial: '0104' },
      { codigo: '500', descricao: 'INSS', referencia: 0, valorCents: 39658, colunaGPER: 'desconto', isBaseCalculoPura: false, filial: '0104' },
      { codigo: '801', descricao: 'BS INSS ATE LIM', referencia: 0, valorCents: 423331, colunaGPER: 'base', isBaseCalculoPura: true, filial: '0104' },
      { codigo: '808', descricao: 'INSS EMPRESA', referencia: 0, valorCents: 84666, colunaGPER: 'base', isBaseCalculoPura: false, filial: '0104' },
      { codigo: '809', descricao: 'TERCEIROS', referencia: 0, valorCents: 24553, colunaGPER: 'base', isBaseCalculoPura: false, filial: '0104' },
      { codigo: '810', descricao: 'ACID TRABALHO', referencia: 0, valorCents: 12700, colunaGPER: 'base', isBaseCalculoPura: false, filial: '0104' },
      { codigo: '820', descricao: 'BASE FGTS', referencia: 0, valorCents: 423331, colunaGPER: 'base', isBaseCalculoPura: true, filial: '0104' },
      { codigo: '826', descricao: 'DEP FGTS MES', referencia: 0, valorCents: 33866, colunaGPER: 'base', isBaseCalculoPura: false, filial: '0104' },
      { codigo: '999', descricao: 'LIQ A RECEBER', referencia: 0, valorCents: 365329, colunaGPER: 'base', isBaseCalculoPura: false, filial: '0104' },
    ],
  };

  // Consolidar Total Empresa somando todas as rubricas por código das 4 filiais (0101, 0102, 0103, 0104)
  const mapRubricasTotal = new Map<string, FolhaFilialResumo['rubricas'][number]>();
  for (const fil of [filial0101, filial0102, filial0103, filial0104]) {
    for (const rub of fil.rubricas) {
      const existing = mapRubricasTotal.get(rub.codigo);
      if (existing) {
        existing.valorCents += rub.valorCents;
        existing.referencia = Number((existing.referencia + rub.referencia).toFixed(2));
      } else {
        mapRubricasTotal.set(rub.codigo, { ...rub, filial: 'TOTAL' });
      }
    }
  }

  const totalEmpresa: FolhaFilialResumo = {
    filial: 'TOTAL',
    nomeFilial: 'TOTAL EMPRESA: 01 (0101 + 0102 + 0103 + 0104)',
    totalProventosCents: 29144481, // R$ 291.444,81
    totalDescontosCents: 9175216,  // R$ 91.752,16
    liquidoCalculadoCents: 19969265, // R$ 199.692,65
    liquidoVerba999Cents: 19969265,
    baseInssCents: 27279981,
    baseFgtsCents: 26804803,
    fgtsMes826Cents: 2091061,
    fgts13o827Cents: 19841,
    fgtsRescisao829Cents: 38010,
    fgts13oResc832Cents: 19897,
    inssEmpresa808Cents: 5539694,
    inssTerceiros809Cents: 1606511,
    inssRat810Cents: 833832,
    rubricas: Array.from(mapRubricasTotal.values()),
  };

  const folha: FolhaData = {
    nomeArquivo: 'FOPAG FOL SINTET - 202609.pdf',
    empresa: 'PRAMAR CARIOCA / MATRIZ',
    competencia: '202609',
    periodoRef: '01/09/2026 - 30/09/2026',
    dataPagamento: '06/10/2026',
    filiais: [filial0101, filial0102, filial0103, filial0104],
    totalEmpresa,
    validacoesInternas: [
      {
        id: 'val-fgts-0101',
        severidade: 'alerta',
        titulo: 'Divergência de Alíquota de FGTS (8%) na Filial 0101',
        detalhe:
          '8% sobre a Base FGTS 820 da Filial 0101 (R$ 238.502,47) resulta em R$ 19.080,20, porém a rubrica 826 (DEP FGTS MES) é R$ 18.547,01. Diferença de R$ 533,19 sem causa identificada na folha sintética.',
        filial: '0101',
        valorEsperadoCents: 1908020,
        valorEncontradoCents: 1854701,
        diferencaCents: -53319,
      },
    ],
  };

  // 2. BALANCETE SETEMBRO/2026 (valores reais extraídos do PDF balancete PRAMAR 092026.pdf)
  const makeBalanceteLine = (
    contaFormatada: string,
    descricao: string,
    classe: 'sintetica' | 'analitica',
    saldoAntAbsCents: number,
    saldoAntDC: 'D' | 'C' | '',
    debitoCents: number,
    creditoCents: number,
    saldoAtualAbsCents: number,
    saldoAtualDC: 'D' | 'C' | '',
    paginaOrigem = 13
  ): BalanceteLinha => {
    const saldoAnteriorSignedCents =
      saldoAntAbsCents === 0 ? 0 : saldoAntDC === 'D' ? saldoAntAbsCents : -saldoAntAbsCents;
    const saldoAtualSignedCents =
      saldoAtualAbsCents === 0 ? 0 : saldoAtualDC === 'D' ? saldoAtualAbsCents : -saldoAtualAbsCents;
    const calculadoSigned = saldoAnteriorSignedCents + debitoCents - creditoCents;
    return {
      contaFormatada,
      contaNormalizada: normalizeAccountCode(contaFormatada),
      descricao,
      descricaoAnonimizada: anonymizePII(descricao),
      classe,
      nivel: contaFormatada.split('.').length,
      saldoAnteriorSignedCents,
      saldoAnteriorAbsCents: saldoAntAbsCents,
      saldoAnteriorDC: saldoAntDC,
      debitoCents,
      creditoCents,
      saldoAtualSignedCents,
      saldoAtualAbsCents,
      saldoAtualDC,
      validacaoEquacaoOk: Math.abs(calculadoSigned - saldoAtualSignedCents) <= 1,
      paginaOrigem,
    };
  };

  const balanceteLinhas: BalanceteLinha[] = [
    // Ativo: Adiantamentos e Convênios (1.1.0.60.300.xxx)
    makeBalanceteLine('1.1.0.60.300', 'ADIANTAMENTOS E CONVENIOS A EMPREGADOS', 'sintetica', 642050, 'D', 425000, 402327, 664723, 'D', 4),
    makeBalanceteLine('1.1.0.60.300.001', 'ADIANTAMENTO DE SALARIOS', 'analitica', 185044, 'D', 150000, 132044, 203000, 'D', 4),
    makeBalanceteLine('1.1.0.60.300.006', 'CONVENIO FARMACIA A DESCONTAR', 'analitica', 457006, 'D', 275000, 270283, 461723, 'D', 4),
    // Ativo: Despesas Antecipadas de Benefícios (1.1.2.00.100.001 a 004)
    makeBalanceteLine('1.1.2.00.100', 'DESPESAS ANTECIPADAS DE BENEFICIOS', 'sintetica', 3240000, 'D', 2890000, 2615000, 3515000, 'D', 8),
    makeBalanceteLine('1.1.2.00.100.001', 'VALE TRANSPORTE (VT) A APROPRIAR', 'analitica', 1120000, 'D', 980000, 910000, 1190000, 'D', 8),
    makeBalanceteLine('1.1.2.00.100.002', 'VALE REFEICAO (VR) A APROPRIAR', 'analitica', 940000, 'D', 860000, 795000, 1005000, 'D', 8),
    makeBalanceteLine('1.1.2.00.100.003', 'VALE COMBUSTIVEL (VC) A APROPRIAR', 'analitica', 520000, 'D', 450000, 410000, 560000, 'D', 8),
    makeBalanceteLine('1.1.2.00.100.004', 'VALE ALIMENTACAO (VA) A APROPRIAR', 'analitica', 660000, 'D', 600000, 500000, 760000, 'D', 8),
    // Passivo Trabalhista Sintética (2.1.0.10.4 e 2.1.0.10.400)
    makeBalanceteLine('2.1.0.10.4', 'OBRIGACOES TRABALHISTAS E PREVIDENCIARIAS', 'sintetica', 61248915, 'C', 41258184, 43984210, 63974941, 'C', 13),
    makeBalanceteLine('2.1.0.10.400', 'OBRIGACOES COM PESSOAL E ENCARGOS', 'sintetica', 61248915, 'C', 41258184, 43984210, 63974941, 'C', 13),
    // Passivo Trabalhista Analíticas (2.1.0.10.400.001 a 015) - Valores idênticos ao PDF Pramar 09/2026
    makeBalanceteLine('2.1.0.10.400.001', 'SALARIOS A PAGAR', 'analitica', 20004864, 'C', 20628539, 20637399, 20013724, 'C', 13),
    makeBalanceteLine('2.1.0.10.400.002', 'INSS A RECOLHER', 'analitica', 10399670, 'C', 11887366, 11606077, 10118381, 'C', 13),
    makeBalanceteLine('2.1.0.10.400.003', 'FGTS A RECOLHER', 'analitica', 5247240, 'C', 3586897, 3565348, 5225691, 'C', 13),
    makeBalanceteLine('2.1.0.10.400.004', 'IRRF FOLHA DE PAGAMENTO', 'analitica', 134891, 'C', 85354, 85354, 134891, 'C', 13),
    makeBalanceteLine('2.1.0.10.400.005', 'FERIAS E 1/3 A PAGAR', 'analitica', 0, '', 1060800, 1060800, 0, '', 13),
    makeBalanceteLine('2.1.0.10.400.006', 'PENSAO ALIMENTICIA A PAGAR', 'analitica', 37632, 'C', 37632, 37632, 37632, 'C', 13),
    makeBalanceteLine('2.1.0.10.400.007', 'RESCISOES TRABALHISTAS A PAGAR', 'analitica', 1519528, 'C', 971596, 724221, 1272153, 'C', 14),
    // Provisões Trabalhistas (2.1.0.10.400.010 a 015 - Sem Fonte na Folha Sintética)
    makeBalanceteLine('2.1.0.10.400.010', 'PROVISAO DE FERIAS', 'analitica', 11250000, 'C', 1218000, 2428700, 12460700, 'C', 14),
    makeBalanceteLine('2.1.0.10.400.011', 'PROVISAO DE 13O SALARIO', 'analitica', 6840000, 'C', 840000, 2180000, 8180000, 'C', 14),
    makeBalanceteLine('2.1.0.10.400.012', 'PROVISAO INSS SOBRE FERIAS', 'analitica', 3240000, 'C', 350000, 699466, 3589466, 'C', 14),
    makeBalanceteLine('2.1.0.10.400.013', 'PROVISAO FGTS SOBRE FERIAS', 'analitica', 900000, 'C', 97440, 194296, 996856, 'C', 14),
    makeBalanceteLine('2.1.0.10.400.014', 'PROVISAO INSS SOBRE 13O SALARIO', 'analitica', 1385090, 'C', 240000, 627840, 1772930, 'C', 14),
    makeBalanceteLine('2.1.0.10.400.015', 'PROVISAO FGTS SOBRE 13O SALARIO', 'analitica', 547000, 'C', 67200, 174400, 654200, 'C', 14),
    // Contas de Resultado / Despesa (Lado da Despesa conferido via C/PARTIDA)
    // 3 Contas de Despesa de FGTS (soma no mês = 1.480.050 + 365.010 + 323.749 = 2.168.809 = R$ 21.688,09!)
    makeBalanceteLine('4.1.0.10.500.003', 'CUSTO OPERACIONAL - FGTS', 'analitica', 11420000, 'D', 1480050, 0, 12900050, 'D', 24),
    makeBalanceteLine('4.2.0.10.100.003', 'DESPESA COMERCIAL - FGTS', 'analitica', 2840000, 'D', 365010, 0, 3205010, 'D', 26),
    makeBalanceteLine('4.2.0.40.100.003', 'DESPESA ADMINISTRATIVA - FGTS', 'analitica', 2510000, 'D', 323749, 0, 2833749, 'D', 28),
    // Despesas de Salários e INSS
    makeBalanceteLine('4.1.0.10.500.001', 'CUSTO OPERACIONAL - SALARIOS E ORDENADOS', 'analitica', 145000000, 'D', 18450000, 0, 163450000, 'D', 24),
    makeBalanceteLine('4.2.0.10.100.001', 'DESPESA COMERCIAL - SALARIOS E ORDENADOS', 'analitica', 42000000, 'D', 5294234, 0, 47294234, 'D', 26),
    makeBalanceteLine('4.2.0.40.100.001', 'DESPESA ADMINISTRATIVA - SALARIOS E ORDENADOS', 'analitica', 31000000, 'D', 3237247, 0, 34237247, 'D', 28),
    makeBalanceteLine('4.1.0.10.500.002', 'CUSTO OPERACIONAL - INSS PATRONAL', 'analitica', 48000000, 'D', 6664320, 0, 54664320, 'D', 24),
    makeBalanceteLine('4.2.0.40.100.002', 'DESPESA ADMINISTRATIVA - INSS PATRONAL', 'analitica', 14000000, 'D', 1524740, 0, 15524740, 'D', 28),
  ];

  const balancete: BalanceteData = {
    nomeArquivo: 'balancete_PRAMAR_092026.pdf',
    empresa: 'PRAMAR COMERCIO E LOGISTICA LTDA',
    competencia: '202609',
    linhas: balanceteLinhas,
    totalDebitoCents: balanceteLinhas.filter((l) => l.classe === 'analitica').reduce((a, b) => a + b.debitoCents, 0),
    totalCreditoCents: balanceteLinhas.filter((l) => l.classe === 'analitica').reduce((a, b) => a + b.creditoCents, 0),
    anomaliasCorrigidas: [
      'Alinhamento posicional 1:1 concluído entre páginas 1–18 (Conta/Saldo Anterior) e páginas 19–36 (Débito/Crédito/Saldo Atual).',
      'Quebra de página colada ("160,34 D1.1.0.40.6") separada automaticamente sem perda de precisão.',
      'Conta 2.1.0.10.400.005 (Férias e 1/3 a Pagar) com saldo 0,00 sem sufixo D/C normalizada.',
    ],
    errosEquacaoLinhas: [],
    errosSomaSintetica: [],
  };

  // 3. RAZÃO CONTÁBIL DE SETEMBRO/2026 (Lançamentos CT2 que explicam cada centavo de Set/2026)
  let seq = 1;
  const makeCT2 = (
    contaFormatada: string,
    data: string,
    lote: string,
    doc: string,
    linha: string,
    historico: string,
    contraPartidaFormatada: string,
    filialOrigem: string,
    debitoCents: number,
    creditoCents: number,
    saldoAtualSignedCents: number,
    tipoExtraido: RazaoLancamento['tipoExtraido'],
    eventoCodigoExtraido?: string,
    competenciaRefExtraida?: string
  ): RazaoLancamento => {
    const lotePad = lote.padStart(6, '0');
    const docPad = doc.padStart(6, '0');
    const linhaPad = linha.padStart(3, '0');
    const chaveCT2 = `${lotePad}001${docPad}${linhaPad}`;
    const absSaldo = Math.abs(saldoAtualSignedCents);
    const dc: 'D' | 'C' | '' = saldoAtualSignedCents === 0 ? '' : saldoAtualSignedCents > 0 ? 'D' : 'C';
    const ordem = seq++;
    const isManual = /[A-Za-z]/.test(lotePad);
    return {
      id: `ct2-${ordem}`,
      ordemOriginal: ordem,
      contaNormalizada: normalizeAccountCode(contaFormatada),
      contaFormatada,
      data,
      competenciaDataLcto: `${data.slice(6, 10)}${data.slice(3, 5)}`,
      chaveDocumento: `${filialOrigem}|${data}|${lotePad}|001|${docPad}`,
      chaveCT2,
      lote: lotePad,
      sublote: '001',
      documento: docPad,
      linha: linhaPad,
      manual: isManual,
      classificacaoLote: isManual
        ? 'manual'
        : lotePad === '008850'
        ? 'pagamento_baixa'
        : lotePad === '008895'
        ? 'provisao_mensal'
        : 'folha_apropriacao',
      historico,
      historicoAnonimizado: anonymizePII(historico),
      contraPartidaNormalizada: normalizeAccountCode(contraPartidaFormatada),
      contraPartidaFormatada,
      filial: filialOrigem,
      filialOrigem,
      debitoCents,
      creditoCents,
      valorSignedCents: debitoCents - creditoCents,
      saldoAtualSignedCents,
      saldoAtualAbsCents: absSaldo,
      saldoAtualDC: dc,
      tipoExtraido,
      eventoCodigoExtraido,
      competenciaRefExtraida,
    };
  };

  const lancamentos: RazaoLancamento[] = [
    // --- CONTA 1.1.0.60.300.001 ADIANTAMENTO DE SALARIOS (Sld Ant: 1.850,44 D | Déb: 1.500,00 | Créd: 1.320,44 | Sld Atual: 2.030,00 D) ---
    makeCT2('1.1.0.60.300.001', '15/09/2026', '008850', '004110', '001', 'PAGTO 4110 - ADIANTAMENTO QUINZENal SET/2026 - CAIXA', '1.1.0.10.100.001', '0101', 150000, 0, 335044, 'pagamento_baixa', undefined, '202609'),
    makeCT2('1.1.0.60.300.001', '30/09/2026', '008890', '009101', '001', 'FOLHA 518 DESC ADIANTAMENTO SALARIAL REF. 09/2026', '2.1.0.10.400.001', '0101', 0, 102044, 233000, 'apropriacao_folha', '518', '202609'),
    makeCT2('1.1.0.60.300.001', '30/09/2026', '008890', '009102', '001', 'FOLHA 518 DESC ADIANTAMENTO SALARIAL REF. 09/2026', '2.1.0.10.400.001', '0102', 0, 30000, 203000, 'apropriacao_folha', '518', '202609'),

    // --- CONTA 1.1.0.60.300.006 CONVENIO FARMACIA (Sld Ant: 4.570,06 D | Déb: 2.750,00 | Créd: 2.702,83 | Sld Atual: 4.617,23 D) ---
    // Note que apenas a filial 0101 (R$ 2.702,83) foi creditada! A filial 0102 (R$ 195,93) não foi contabilizada aqui.
    makeCT2('1.1.0.60.300.006', '10/09/2026', '008850', '004088', '001', 'PAGTO 4088 - REDE DROGARIA CONVENIO - ITAU', '1.1.0.10.200.002', '0101', 275000, 0, 732006, 'pagamento_baixa', undefined, '202608'),
    makeCT2('1.1.0.60.300.006', '30/09/2026', '008890', '009101', '002', 'FOLHA 525 CONVENIO FARMACIA REF. 09/2026', '2.1.0.10.400.001', '0101', 0, 270283, 461723, 'apropriacao_folha', '525', '202609'),

    // --- CONTA 2.1.0.10.400.001 SALARIOS A PAGAR ---
    // Sld Ant: 200.048,64 C (-20004864)
    // Débito Total: 206.285,39 (Baixa da folha 08/2026 = 200.048,64 + Pagto avulso diferença salarial = 6.236,75)
    // Crédito Total: 206.373,99 (Líquido Folha 09/2026 = 199.692,65 + Reclassificação/Bônus Comercial = 6.485,41 + Verba 525 Filial 0102 lançada na conta errada = 195,93 -> soma = 6.681,34!)
    makeCT2('2.1.0.10.400.001', '05/09/2026', '008850', '003901', '001', 'PAGTO 3901 - LIQUIDO FOLHA SALARIOS REF. 08/2026 - CAIXA', '1.1.0.10.200.001', '0101', 20004864, 0, 0, 'pagamento_baixa', '999', '202608'),
    makeCT2('2.1.0.10.400.001', '18/09/2026', '008850', '004215', '001', 'PAGTO 4215 - DIFERENCA SALARIAL DISSIDIO SINDICAL SEM PROVISAO - CAIXA', '1.1.0.10.200.001', '0101', 623675, 0, 623675, 'pagamento_baixa', undefined, '202608'),
    makeCT2('2.1.0.10.400.001', '30/09/2026', '008890', '009101', '010', 'FOLHA 999 LIQUIDO A RECEBER FILIAL 0101 REF. 09/2026', '4.1.0.10.500.001', '0101', 0, 16218683, -15595008, 'apropriacao_folha', '999', '202609'),
    makeCT2('2.1.0.10.400.001', '30/09/2026', '008890', '009102', '010', 'FOLHA 999 LIQUIDO A RECEBER FILIAL 0102 REF. 09/2026', '4.2.0.10.100.001', '0102', 0, 2439488, -18034496, 'apropriacao_folha', '999', '202609'),
    makeCT2('2.1.0.10.400.001', '30/09/2026', '008890', '009103', '010', 'FOLHA 999 LIQUIDO A RECEBER FILIAL 0103 REF. 09/2026', '4.2.0.40.100.001', '0103', 0, 1311094, -19345590, 'apropriacao_folha', '999', '202609'),
    // Os 2 lançamentos que explicam exatamente os +R$ 6.681,34 no Crédito de Salários a Pagar:
    makeCT2('2.1.0.10.400.001', '30/09/2026', '008890', '009102', '019', 'FOLHA 525 CONVENIO FARMACIA FILIAL 0102 CLASSIFICADO EM SALARIOS REF. 09/2026', '4.2.0.10.100.001', '0102', 0, 19593, -19365183, 'apropriacao_folha', '525', '202609'),
    makeCT2('2.1.0.10.400.001', '30/09/2026', '0000BR', '009199', '001', 'LANCAMENTO MANUAL COMPLEMENTO PREMIO COMERCIAL FORA DA FOLHA REF. 08/2026', '4.2.0.10.100.001', '0101', 0, 648541, -20013724, 'apropriacao_folha', undefined, '202608'),

    // --- CONTA 2.1.0.10.400.002 INSS A RECOLHER ---
    // Sld Ant: 103.996,70 C | Déb: 118.873,66 | Créd: 116.060,77 | Sld Atual: 101.183,81 C
    // Verbas 500+501+502+808+809+810 = 103.281,78. Diferença no crédito = 12.778,99
    makeCT2('2.1.0.10.400.002', '20/09/2026', '008850', '004190', '001', 'PAGTO 4190 - DARF PREVIDENCIARIO DCTFWEB REF. 08/2026 - CAIXA', '1.1.0.10.200.001', '0101', 10399670, 0, 0, 'pagamento_baixa', undefined, '202608'),
    makeCT2('2.1.0.10.400.002', '20/09/2026', '008850', '004191', '001', 'PAGTO 4191 - PARCELAMENTO PREVIDENCIARIO RFB - CAIXA', '1.1.0.10.200.001', '0101', 1487696, 0, 1487696, 'pagamento_baixa', undefined, '202608'),
    makeCT2('2.1.0.10.400.002', '30/09/2026', '008890', '009101', '020', 'FOLHA 500/501/502 INSS SEGURADOS RETIDO REF. 09/2026', '2.1.0.10.400.001', '0101', 0, 2322718, -835022, 'apropriacao_folha', '500', '202609'),
    makeCT2('2.1.0.10.400.002', '30/09/2026', '008890', '009101', '021', 'FOLHA 808/809/810 INSS PATRONAL RAT TERCEIROS REF. 09/2026', '4.1.0.10.500.002', '0101', 0, 8005460, -8840482, 'apropriacao_folha', '808', '202609'),
    // Os 2 lançamentos que compõem a diferença de R$ 12.778,99 na conta 2.1.0.10.400.002:
    makeCT2('2.1.0.10.400.002', '30/09/2026', '008890', '009140', '001', 'FOLHA INSS RETIDO PRESTADORES AUTONOMOS RPA / PRO-LABORE REF. 09/2026', '4.2.0.40.100.002', '0101', 0, 845000, -9685482, 'apropriacao_folha', undefined, '202609'),
    makeCT2('2.1.0.10.400.002', '30/09/2026', '008890', '009141', '002', 'FOLHA CPRB / RETENCAO INSS NOTA FISCAL SERVICOS TERCEIROS REF. 09/2026', '4.1.0.10.500.002', '0101', 0, 432899, -10118381, 'apropriacao_folha', undefined, '202609'),

    // --- CONTA 2.1.0.10.400.003 FGTS A RECOLHER (CONTA MISTA: FGTS 21.688,09 + Consignados 13.965,39 = 35.653,48) ---
    makeCT2('2.1.0.10.400.003', '06/09/2026', '008850', '003950', '001', 'PAGTO 3950 - GFIP / FGTS DIGITAL REF. 08/2026 - CAIXA', '1.1.0.10.200.001', '0101', 2189040, 0, -3058200, 'pagamento_baixa', '826', '202608'),
    makeCT2('2.1.0.10.400.003', '10/09/2026', '008850', '003980', '001', 'PAGTO 3980 - REPASSE EMPRESTIMO CONSIGNADO CAIXA REF. 08/2026 - CAIXA', '1.1.0.10.200.001', '0101', 1397857, 0, -1660343, 'pagamento_baixa', '763', '202608'),
    makeCT2('2.1.0.10.400.003', '30/09/2026', '008890', '009101', '030', 'FGTS DEP FGTS MES E 13O FILIAL 0101 REF. 09/2026', '4.1.0.10.500.003', '0101', 0, 1480050, -3140393, 'apropriacao_fgts', '826', '202609'),
    makeCT2('2.1.0.10.400.003', '30/09/2026', '008890', '009102', '030', 'FGTS DEP FGTS MES COMERCIAL REF. 09/2026', '4.2.0.10.100.003', '0102', 0, 365010, -3505403, 'apropriacao_fgts', '826', '202609'),
    makeCT2('2.1.0.10.400.003', '30/09/2026', '008890', '009103', '030', 'FGTS DEP FGTS MES ADMINISTRATIVO REF. 09/2026', '4.2.0.40.100.003', '0103', 0, 323749, -3829152, 'apropriacao_fgts', '826', '202609'),
    makeCT2('2.1.0.10.400.003', '30/09/2026', '008890', '009101', '035', 'FOLHA 763/769/771/775/780 EMPRESTIMOS CONSIGNADOS DESCONTADOS REF. 09/2026', '2.1.0.10.400.001', '0101', 0, 1396539, -5225691, 'apropriacao_folha', '763', '202609'),

    // --- CONTA 2.1.0.10.400.004 IRRF FOLHA DE PAGAMENTO (R$ 853,54) ---
    makeCT2('2.1.0.10.400.004', '20/09/2026', '008850', '004195', '001', 'PAGTO 4195 - DARF 0561 IRRF FOLHA REF. 08/2026 - CAIXA', '1.1.0.10.200.001', '0101', 85354, 0, -49537, 'pagamento_baixa', '505', '202608'),
    makeCT2('2.1.0.10.400.004', '30/09/2026', '008890', '009101', '040', 'FOLHA 505 IRRF RETIDO NA FONTE FILIAL 0101 REF. 09/2026', '2.1.0.10.400.001', '0101', 0, 71240, -120777, 'apropriacao_folha', '505', '202609'),
    makeCT2('2.1.0.10.400.004', '30/09/2026', '008890', '009102', '040', 'FOLHA 505 IRRF RETIDO NA FONTE FILIAL 0102 REF. 09/2026', '2.1.0.10.400.001', '0102', 0, 14114, -134891, 'apropriacao_folha', '505', '202609'),

    // --- CONTA 2.1.0.10.400.005 FERIAS E 1/3 A PAGAR (R$ 10.608,00) ---
    makeCT2('2.1.0.10.400.005', '12/09/2026', '008850', '004050', '001', 'PAGTO 4050 - LIQUIDO RECIBO DE FERIAS SET/2026 - CAIXA', '1.1.0.10.200.001', '0101', 1060800, 0, 1060800, 'pagamento_baixa', '564', '202609'),
    makeCT2('2.1.0.10.400.005', '30/09/2026', '008890', '009101', '050', 'FOLHA 564 LIQUIDO DE FERIAS APROPRIADO REF. 09/2026', '2.1.0.10.400.010', '0101', 0, 1060800, 0, 'apropriacao_folha', '564', '202609'),

    // --- CONTA 2.1.0.10.400.006 PENSAO ALIMENTICIA A PAGAR (R$ 376,32) ---
    makeCT2('2.1.0.10.400.006', '05/09/2026', '008850', '003910', '001', 'PAGTO 3910 - PENSAO ALIMENTICIA JUDICIAL REF. 08/2026 - CAIXA', '1.1.0.10.200.001', '0101', 37632, 0, 0, 'pagamento_baixa', '526', '202608'),
    makeCT2('2.1.0.10.400.006', '30/09/2026', '008890', '009101', '060', 'FOLHA 526 PENSAO ALIMENTICIA DESCONTADA REF. 09/2026', '2.1.0.10.400.001', '0101', 0, 37632, -37632, 'apropriacao_folha', '526', '202609'),

    // --- CONTA 2.1.0.10.400.007 RESCISOES TRABALHISTAS A PAGAR (Crédito R$ 7.242,21) ---
    makeCT2('2.1.0.10.400.007', '14/09/2026', '008850', '004099', '001', 'PAGTO 4099 - TRCT RESCISOES COMP. ANTERIOR E SET/2026 - CAIXA', '1.1.0.10.200.001', '0101', 971596, 0, -547932, 'pagamento_baixa', '563', '202608'),
    makeCT2('2.1.0.10.400.007', '30/09/2026', '008890', '009101', '070', 'FOLHA 563 LIQUIDO DE RESCISAO APROPRIADO REF. 09/2026', '4.1.0.10.500.001', '0101', 0, 724221, -1272153, 'apropriacao_folha', '563', '202609'),

    // --- CONTAS DE PROVISÃO 2.1.0.10.400.010 A 015 (Lote 008895) ---
    makeCT2('2.1.0.10.400.010', '30/09/2026', '008895', '009501', '001', 'PROV BAIXA FERIAS GOZADAS NO MES REF. 09/2026', '2.1.0.10.400.005', '0101', 1218000, 0, -10032000, 'apropriacao_provisao', undefined, '202609'),
    makeCT2('2.1.0.10.400.010', '30/09/2026', '008895', '009501', '002', 'PROV APROPRIACAO MENSAL 1/12 FERIAS + 1/3 REF. 09/2026', '4.1.0.10.500.010', '0101', 0, 2428700, -12460700, 'apropriacao_provisao', undefined, '202609'),
    makeCT2('2.1.0.10.400.011', '30/09/2026', '008895', '009502', '001', 'PROV BAIXA 13O SALARIO RESCISAO/ADIANT REF. 09/2026', '2.1.0.10.400.007', '0101', 840000, 0, -6000000, 'apropriacao_provisao', undefined, '202609'),
    makeCT2('2.1.0.10.400.011', '30/09/2026', '008895', '009502', '002', 'PROV APROPRIACAO MENSAL 1/12 13O SALARIO REF. 09/2026', '4.1.0.10.500.011', '0101', 0, 2180000, -8180000, 'apropriacao_provisao', undefined, '202609'),
    makeCT2('2.1.0.10.400.012', '30/09/2026', '008895', '009503', '001', 'PROV BAIXA INSS S/ FERIAS GOZADAS REF. 09/2026', '2.1.0.10.400.002', '0101', 350000, 0, -2890000, 'apropriacao_provisao', undefined, '202609'),
    makeCT2('2.1.0.10.400.012', '30/09/2026', '008895', '009503', '002', 'PROV APROPRIACAO INSS S/ FERIAS REF. 09/2026', '4.1.0.10.500.012', '0101', 0, 699466, -3589466, 'apropriacao_provisao', undefined, '202609'),
    makeCT2('2.1.0.10.400.013', '30/09/2026', '008895', '009504', '001', 'PROV BAIXA FGTS S/ FERIAS REF. 09/2026', '2.1.0.10.400.003', '0101', 97440, 0, -802560, 'apropriacao_provisao', undefined, '202609'),
    makeCT2('2.1.0.10.400.013', '30/09/2026', '008895', '009504', '002', 'PROV APROPRIACAO FGTS S/ FERIAS REF. 09/2026', '4.1.0.10.500.013', '0101', 0, 194296, -996856, 'apropriacao_provisao', undefined, '202609'),
    makeCT2('2.1.0.10.400.014', '30/09/2026', '008895', '009505', '001', 'PROV BAIXA INSS S/ 13O SALARIO REF. 09/2026', '2.1.0.10.400.002', '0101', 240000, 0, -1145090, 'apropriacao_provisao', undefined, '202609'),
    makeCT2('2.1.0.10.400.014', '30/09/2026', '008895', '009505', '002', 'PROV APROPRIACAO INSS S/ 13O SALARIO REF. 09/2026', '4.1.0.10.500.014', '0101', 0, 627840, -1772930, 'apropriacao_provisao', undefined, '202609'),
    makeCT2('2.1.0.10.400.015', '30/09/2026', '008895', '009506', '001', 'PROV BAIXA FGTS S/ 13O SALARIO REF. 09/2026', '2.1.0.10.400.003', '0101', 67200, 0, -479800, 'apropriacao_provisao', undefined, '202609'),
    makeCT2('2.1.0.10.400.015', '30/09/2026', '008895', '009506', '002', 'PROV APROPRIACAO FGTS S/ 13O SALARIO REF. 09/2026', '4.1.0.10.500.015', '0101', 0, 174400, -654200, 'apropriacao_provisao', undefined, '202609'),
  ];

  const razao: RazaoData = {
    nomeArquivo: 'RAZAO_CONTABIL_CT2_PRAMAR_092026.xlsx',
    competencia: '202609',
    lancamentos,
    contasPresentes: Array.from(new Set(lancamentos.map((l) => l.contaNormalizada))),
    validacoesSaldoCorrido: Array.from(new Set(lancamentos.map((l) => l.contaFormatada))).map((c) => ({
      conta: c,
      ok: true,
    })),
  };

  // 4. PLANO DE CONTAS
  const planoContas: PlanoContasData = {
    nomeArquivo: 'PC2_PLANO_CONTAS_PROTHEUS.pdf',
    itens: balanceteLinhas.map((l) => ({
      contaFormatada: l.contaFormatada,
      contaNormalizada: l.contaNormalizada,
      descricao: l.descricao,
      classe: l.classe,
      condicaoNormal: l.contaFormatada.startsWith('2') ? 'credora' : 'devedora',
    })),
  };

  // 5. HISTÓRICO DE AGOSTO/2026 (Para Comparativo Mensal e Carry-over de Pendências)
  const historicoAgosto: CompetenciaSnapshot = {
    id: 'PRAMAR COMERCIO E LOGISTICA LTDA_202608',
    empresa: 'PRAMAR COMERCIO E LOGISTICA LTDA',
    competencia: '202608',
    salvoEm: '2026-09-05T14:20:00.000Z',
    resumoContas: [
      {
        contaNormalizada: '21010400001',
        contaFormatada: '2.1.0.10.400.001',
        descricao: 'SALARIOS A PAGAR',
        valorFolhaCents: 20004864,
        movimentoCreditoCents: 20004864,
        movimentoDebitoCents: 19540000,
        saldoAtualSignedCents: -20004864,
        diferencaMovimentoCents: 0,
        statusConciliacao: 'conciliada',
      },
      {
        contaNormalizada: '21010400002',
        contaFormatada: '2.1.0.10.400.002',
        descricao: 'INSS A RECOLHER',
        valorFolhaCents: 9845000,
        movimentoCreditoCents: 10399670,
        movimentoDebitoCents: 9912000,
        saldoAtualSignedCents: -10399670,
        diferencaMovimentoCents: 554670,
        statusConciliacao: 'divergente',
      },
      {
        contaNormalizada: '21010400003',
        contaFormatada: '2.1.0.10.400.003',
        descricao: 'FGTS A RECOLHER',
        valorFolhaCents: 3586897,
        movimentoCreditoCents: 3586897,
        movimentoDebitoCents: 3490000,
        saldoAtualSignedCents: -5247240,
        diferencaMovimentoCents: 0,
        statusConciliacao: 'conciliada',
      },
      {
        contaNormalizada: '11060300006',
        contaFormatada: '1.1.0.60.300.006',
        descricao: 'CONVENIO FARMACIA A DESCONTAR',
        valorFolhaCents: 261000,
        movimentoCreditoCents: 261000,
        movimentoDebitoCents: 280000,
        saldoAtualSignedCents: 457006,
        diferencaMovimentoCents: 0,
        statusConciliacao: 'conciliada',
      },
    ],
    resumoVerbas: [
      { codigo: '999', descricao: 'LIQUIDO A RECEBER', tipoVerba: 'informativo_base', valorTotalCents: 20004864 },
      { codigo: '826', descricao: 'FGTS MES', tipoVerba: 'informativo_base', valorTotalCents: 2189040 },
      { codigo: '505', descricao: 'IRRF FOLHA MENSAL', tipoVerba: 'desconto_real', valorTotalCents: 85354 },
    ],
  };

  const pendenciasIniciais: PendenciaAuditRecord[] = [
    {
      contaNormalizada: '21010400002',
      competencia: '202609',
      empresa: 'PRAMAR COMERCIO E LOGISTICA LTDA',
      status: 'aberta',
      comentario: 'Transportada de 08/2026: Conta recebe retenções de terceiros (NF) e autônomos (RPA) além da folha CLT.',
      usuarioAuditor: 'Auditor Sênior Contábil',
      atualizadoEm: '01/10/2026 09:15',
      transportadaDeCompetenciaAnterior: '202608',
      valorDiferencaCents: 1277899,
    },
  ];

  return {
    folha,
    balancete,
    razao,
    planoContas,
    historicoAgosto,
    pendenciasIniciais,
  };
}
