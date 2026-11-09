# Plano de Implementação Final — Importador CT2 (.XLSX) TOTVS Protheus, Bloqueios Seletivos e HTML Autônomo (file://)

Esta versão incorpora todos os 8 ajustes apontados na revisão, responde à verificação sobre o espaço inicial das células `Cont.Hist` no trecho real do Excel e detalha a arquitetura para funcionamento por duplo clique (`file://`) do arquivo `.HTML` exportado.

---

## Resposta sobre o Corte de 40 Caracteres no Excel (`Cont.Hist`)

> [!IMPORTANT]
> **Verificação na planilha real enviada (imagem + texto tabulado)**:
> Analisando as células de `Hist Lanc` nas linhas `Cont.Hist` do trecho enviado:
> 1. Linha 10 (`40` caracteres exatos): `"COMPRA DE SUCATA FERROSA EMARANHADO VERG"` + Linha 11: `"NFE 000000346 BGR SOLUCOES AMBIENTAIS"` $\rightarrow$ **a célula da Linha 11 no Excel NÃO começa com espaço** (quando o 41º caractere seria um espaço, o Protheus aplica `LTrim` ao gravar a linha de continuação).
> 2. Linha 4 (`40` caracteres exatos): `"APROPR. NFE 000017235 POSTO DE MOLAS RDR"` + Linha 5: `"LTDA"` $\rightarrow$ **a célula da Linha 5 também NÃO começa com espaço**.
> 3. Já nas linhas 14+15 (`"COMPRA DE SUCATA FERROSA PESADA GRAUDA N"` + `"FE 000000346"`), linhas 1+2 (`"...POSTO DE MOL"` + `"AS RDR LTDA"`), linhas 18+19 (`"...SOLUCOES AMBIE"` + `"NTAIS"`) e linhas 20+21+22 (`"...FER. FUND"` + `"IDO..."` + `"A."`), o corte de 40 caracteres ocorreu **no meio da palavra**.
>
> **Regra de Emenda Determinística Adotada**:
> - **Nunca aplicar `trim()` nas pontas dos fragmentos** ao ler cada célula (preservando qualquer espaço original à esquerda ou à direita).
> - Quando o fragmento anterior tiver atingido o limite da coluna (sem espaço no fim) e o fragmento seguinte não começar com espaço:
>   - Emendar **direto (sem espaço)** por padrão (resolvendo `MOL`+`AS`, `N`+`FE`, `AMBIE`+`NTAIS`, `FUND`+`IDO`, `S.`+`A.`).
>   - Inserir **1 espaço** unicamente quando o novo fragmento iniciar por marcador fiscal/societário isolado cujo prefixo não foi cortado na linha anterior (`^(NFE\b|NF:|NF\s|LTDA\b|S\/A\b|REF\.)` quando o fragmento anterior não termina com `N` ou `S.`), reconstruindo perfeitamente `"EMARANHADO VERG NFE 000000346"` e `"POSTO DE MOLAS RDR LTDA"` sem quebrar `"GRAUDA NFE"`.

---

## 1. Regras de Leitura e Transformação da Planilha CT2 (45 Colunas)

### 1.1 Detecção por Nome de Cabeçalho e Colunas Obrigatórias
- **Detecção pelo Cabeçalho**: Normalização dos títulos da primeira linha (sem acentos, pontos ou espaços duplicados, em minúsculas). O layout de tabela bruta `CT2` é detectado pela presença simultânea de `"tipo lcto"`, `"cta debito"` e `"cta credito"`.
- **Casamento Exato da Coluna `"Valor"`**: Igualdade exata após normalização (`headerNorm === 'valor'`), nunca confundindo com `"valor moeda1"`.
- **Colunas Obrigatórias Verificadas**: `Filial`, `Data Lcto`, `Numero Lote`, `Sub Lote`, `Numero Doc`, `Moeda Lancto`, `Tipo Lcto`, `Cta Debito`, `Cta Credito`, `Valor`, `Hist Lanc`, `Tipo do Sld`, `Origem`. Se faltar qualquer coluna obrigatória, o importador interrompe a operação e lista nominalmente as colunas ausentes.

### 1.2 Tipos de Dado e Filtros (`Tipo do Sld`, `Moeda Lancto` e Período do Balancete)
- **Conversão de Dados**:
  - `Valor`: texto `"3013,00"` (com ou sem milhar) ou número nativo do Excel $\rightarrow$ centavos inteiros (`301300`).
  - `Data Lcto`: texto `dd/mm/aaaa` ou serial numérico do Excel $\rightarrow$ `dd/mm/aaaa` e competência `AAAAMM`.
  - `Numero Lote`, `Sub Lote`, `Numero Doc`: lidos como texto preservando letras e zeros; quando puramente numéricos, preenchidos com zeros à esquerda (`6`, `3` e `6` dígitos).
  - `Cta Debito` e `Cta Credito`: pontuação removida (`normalizeAccountCode`).
  - `C Custo Deb` e `C Custo Crd`: importados por lançamento e suportados como chave opcional no De/Para (`centroCustoOpcional`).
- **Filtro de Saldo e Moeda**: Importar exclusivamente linhas com `Tipo do Sld = 1` (ou `'01'`) e `Moeda Lancto = 01` (ou `'1'`). Outros valores são ignorados, contados em `linhasIgnoradasFiltro` e informados em aviso.
- **Filtro pelo Período do Balancete**:
  - Quando o Balancete estiver carregado (ex.: competência `202609`), filtrar o `CT2` mantendo no razão ativo apenas lançamentos cuja competência de `Data Lcto` coincida com a competência do Balancete.
  - Lançamentos de outros meses são contados em `linhasForaDoPeriodo` e destacados em aviso claro no resumo da importação, evitando distorção nas somas do período e duplicação do Saldo Anterior. (Se o CT2 for importado antes do Balancete, o filtro de período é reaplicado automaticamente assim que o Balancete for carregado).

### 1.3 Suporte Completo a `Tipo Lcto` (Textos com/sem Acento e Códigos `1`, `2`, `3`, `4`)
- `1`, `Debito`, `Débito` $\rightarrow$ **1 lançamento** a débito na `Cta Debito`.
- `2`, `Credito`, `Crédito` $\rightarrow$ **1 lançamento** a crédito na `Cta Credito`.
- `3`, `Partida Dobrada` $\rightarrow$ **2 lançamentos** (1 a débito na `Cta Debito` com `C/PARTIDA = Cta Credito`, e 1 a crédito na `Cta Credito` com `C/PARTIDA = Cta Debito`).
- `4`, `Cont.Hist`, `Compl.Hist`, `Continuacao`, `Continuação` $\rightarrow$ **Não gera lançamento**. Concatena a célula bruta de `Hist Lanc` (sem `trim()` nas pontas + regra de emenda na coluna 41) ao(s) lançamento(s) principal(is) imediatamente anterior(es) dentro da mesma chave (`Filial + Data Lcto + Numero Lote + Sub Lote + Numero Doc`). `Cont.Hist` sem lançamento anterior na mesma chave gera erro de leitura sinalizado.
- **Qualquer outro valor** (ex.: `Rateio`, `5`): gera alerta explícito e incrementa contador próprio, nunca sendo ignorado em silêncio.

### 1.4 Regra Determinística de Contrapartida (`C/PARTIDA`)
- **`Partida Dobrada`**: Explícita na própria linha.
- **`Debito` e `Credito` do Mesmo Documento**: Agrupados por `(Filial + Data Lcto + Numero Lote + Sub Lote + Numero Doc)`:
  - Se o lado oposto tiver **uma única conta distinta**, vincula essa conta a todos os lançamentos do lado atual (ex.: no documento `008810/001/000001`, os 6 débitos recebem `21010202829`).
  - Se houver **várias contas nos dois lados**, preenche `"múltiplas"`.
  - **Nunca** adivinha contrapartida por igualdade de valor.

### 1.5 Precedência da Tabela de Lotes sobre a Regex de Letras (Lote Manual)
- **Ordem de Precedência**:
  1. **Tabela de Lotes Editável e Persistente**: Se o código do lote estiver cadastrado na tabela de lotes do sistema (`Folha`, `Pagamentos`, `Provisões`, `Fiscal`, `Manual`, etc.), prevalece a classificação definida pelo usuário na tabela (`manual = (classificacao === 'manual')`). Assim, o usuário pode reclassificar qualquer lote alfanumérico ou numérico livremente.
  2. **Regra Padrão (Fallback por Regex)**: Se o lote ainda não constar na tabela configurada, aplica-se a regra padrão: contém letra (`/[A-Za-z]/`, como `0000BR`, `SC0000`) $\rightarrow$ `manual = true` (Lançamento Manual); apenas dígitos $\rightarrow$ `manual = false`.
- **Pendências**: Lançamentos com `manual = true` exibem o selo **`MANUAL`** e entram automaticamente na classificação **"Lançamento manual em conta da folha"** para revisão prioritária.

### 1.6 Extração Estruturada de `Origem` e Selo de `Estorno`
- **`Origem`** (ex.: `"LP 530/001 ANDRESSA.LUIZ/14/07/2026 -XORIG: 0101"`):
  - Extraída em campos próprios: `lpCodigo` (`"530"`), `lpSequencia` (`"001"`), `usuarioOrigem` (`"ANDRESSA.LUIZ"`), `dataOrigem` (`"14/07/2026"`) e `xorigFilial` (`"0101"`).
  - **Não** é concatenada ao histórico (`historico`), preservando as regex de `PAGTO` e `REF. mm/aaaa`.
  - `filialOrigem` = `XORIG` quando existir; senão a coluna `Filial`.
  - `dataOrigem` nunca é usada como competência; `Origem` nunca define se o lote é manual.
- **`Estorno/Canc` e `Estorno`**:
  - Lidas da planilha: quando preenchidas com indicador de estorno/cancelamento (ex.: `'1'`, `'2'`, `'S'`, `'E'` ou documento estornado), o lançamento recebe `estornado = true`, exibe o selo visual **`ESTORNO`** na gaveta do Razão e alimenta a classificação de divergência **"Sinal ou natureza invertidos / Estorno"**.

---

## 2. Saldo Corrido, Três Validações Obrigatórias + Resumo e Escopo de Bloqueios

### 2.1 Saldo Corrido Estável
- Ordenado dentro de cada conta por `Data Lcto` e desempatado exclusivamente pela **posição original da linha no arquivo (`ordemOriginal`)**.
- `Saldo Atual = Saldo Anterior do Balancete + Débito - Crédito` (centavos inteiros, débito positivo). Sem Balancete carregado: parte de zero com `saldoProvisorio = true` (`"Provisório"`) e recalcula automaticamente quando o Balancete é importado.

### 2.2 Três Validações Obrigatórias + Resumo da Importação
```
┌──────────────────────────────────────────────────────────────────────────────┐
│                 ESCOPO DE BLOQUEIO DAS 3 VALIDAÇÕES DO CT2                   │
├──────────────────────────────────────────────────────────────────────────────┤
│ a) Soma Débitos = Soma Créditos por Documento (Filial+Data+Lote+Sub+Doc)     │
│    ──► ERRO BLOQUEANTE GLOBAL (bloqueia toda a conciliação)                  │
├──────────────────────────────────────────────────────────────────────────────┤
│ b) Soma Débito/Crédito CT2 = Débito/Crédito do Balancete por Conta           │
│ c) Último Saldo Corrido CT2 = Saldo Atual do Balancete por Conta             │
│    ──► Contas vinculadas à Folha (De/Para): BLOQUEIA a conciliação da conta  │
│    ──► Demais contas do CT2 geral da empresa: AVISO INFORMATIVO (não trava)  │
├──────────────────────────────────────────────────────────────────────────────┤
│ Resumo da Importação: linhas brutas lidas, Cont.Hist anexados, lançamentos   │
│ gerados, linhas ignoradas (Tipo Sld/Moeda e fora do período) e alertas.      │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Desempenho, Privacidade (LGPD) e HTML Autônomo por Duplo Clique (`file://`)

- **Web Worker Inline + Indexação `Map` + LGPD**:
  - O processamento do `CT2` roda em Web Worker embutido com barra de progresso e indexa os lançamentos em `Map<string, RazaoLancamento[]>`.
  - Nenhum lançamento do `CT2` é salvo no IndexedDB (privacidade LGPD).
- **Abertura do `.HTML` Baixado por Duplo Clique (`file://`) e Código-Fonte Único**:
  - O arquivo `Conciliador_Protheus_Completo.html` é gerado diretamente a partir do bundle compilado do próprio aplicativo React (via script de empacotamento que injeta o JS/CSS compilado pelo Vite no HTML autônomo).
  - Tanto o Web Worker do `CT2` quanto o processamento do `pdf.js` funcionam com workers embutidos/inline (Blob Worker com fallback no thread principal caso `file://` restrinja Worker externo, e `disableWorker: false` com `workerSrc` via Blob/Data URL ou avaliação inline no `pdf.js`), garantindo que **abrir o `.html` por duplo clique e importar qualquer `.PDF` (`GPER106` / `Balancete`) e `.XLSX` (`CT2` / `Balancete`) funcione sem erro de rede ou CORS**.

---

## 4. Teste de Aceite Automático (Fixture de 24 Linhas CT2 + Teste `file://`)

O painel inclui verificação automática executável em 1 clique (no app e no `.HTML`) validando os 7 critérios sobre as 24 linhas brutas fornecidas:
1. `24` linhas brutas $\rightarrow$ `17` lançamentos de razão (`8` `Cont.Hist` anexados, `1` `Partida Dobrada` desdobrada em `2`).
2. Total de débitos = Total de créditos = `R$ 87.296,20` (`8.729.620` centavos).
3. Fechamento por documento: `0000BR/001/000002 = 120,00`; `0000BR/001/000003 = 3.013,00`; `0000BR/001/000004 = 4.024,00`; `008810/001/000001 = 27.092,00`; `008820/001/000001 = 53.047,20`.
4. Histórico do 1º lançamento começa com `"VALOR REF. A NF: 000017235 POSTO DE MOLAS RDR LTDA"`, e o 10º lançamento reconstrói `"COMPRA DE SUCATA FERROSA EMARANHADO VERG NFE 000000346 BGR SOLUCOES AMBIENTAIS"`.
5. Lotes `0000BR` com `manual = true`; `008810` e `008820` com `manual = false` (respeitando a precedência da Tabela de Lotes).
6. Documento `008810`: todos os `6` débitos recebem como contrapartida `21010202829`.
7. Lançamento do documento `000003` tem filial de origem `0101` (`XORIG`) e `LP 530`.
