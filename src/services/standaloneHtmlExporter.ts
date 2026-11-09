import {
  BalanceteData,
  CompetenciaSnapshot,
  DeParaRule,
  FolhaData,
  LoteConfig,
  PendenciaAuditRecord,
  PlanoContasData,
  RazaoData,
} from '../types/reconciliation';
import standaloneAppBundleRaw from '../generated/standaloneAppBundle.js?raw';

export interface StandaloneExportParams {
  folha: FolhaData | null;
  balancete: BalanceteData | null;
  razao: RazaoData | null;
  planoContas: PlanoContasData | null;
  deParaRules: DeParaRule[];
  loteConfigs: LoteConfig[];
  pendenciasMap: Record<string, PendenciaAuditRecord>;
  historicoSnapshots: CompetenciaSnapshot[];
}

function collectCompiledPageStyles(): string {
  const cssChunks: string[] = [];
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = sheet.cssRules;
        if (!rules) continue;
        for (const rule of Array.from(rules)) {
          cssChunks.push(rule.cssText);
        }
      } catch {
        // Ignorar folhas de estilo externas com restrição CORS
      }
    }
  } catch {
    // Fallback
  }
  const existingInline = document.getElementById('protheus-app-styles')?.textContent;
  if (cssChunks.length === 0 && existingInline) {
    return existingInline;
  }
  return cssChunks.join('\n');
}

function safeSerializeJsonForScript(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Gera e baixa o arquivo Conciliador_Protheus_Completo.html a partir do MESMO código-fonte
 * compilado do aplicativo principal (React + TypeScript + Tailwind CSS + PDF.js inline worker + CT2 inline worker).
 * Funciona 100% offline ao abrir por duplo clique (protocolo file://).
 */
export function downloadStandaloneCompleteHtml(params: StandaloneExportParams): void {
  const compiledCss = collectCompiledPageStyles();
  const runtimeBundle =
    (standaloneAppBundleRaw && standaloneAppBundleRaw.trim().length > 50
      ? standaloneAppBundleRaw
      : document.getElementById('protheus-app-bundle')?.textContent) || '';

  const initialStateJson = safeSerializeJsonForScript({
    folha: params.folha,
    balancete: params.balancete,
    razao: params.razao,
    planoContas: params.planoContas,
    deParaRules: params.deParaRules,
    loteConfigs: params.loteConfigs,
    pendenciasMap: params.pendenciasMap,
    historicoSnapshots: params.historicoSnapshots,
  });

  // Escapar fechamento de tag script dentro do bundle JS sem alterar a semântica
  const safeBundleJs = runtimeBundle.replace(/<\/script>/gi, '<\\/script>');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Conciliador Protheus — Folha (GPER106) × Contabilidade (CTBR040 / CT2)</title>
  <style id="protheus-app-styles">
${compiledCss}
  </style>
</head>
<body class="bg-slate-50 text-slate-900 antialiased">
  <div id="root"></div>
  <script id="protheus-initial-state">
    window.__PROTHEUS_INITIAL_STATE__ = ${initialStateJson};
  </script>
  <script id="protheus-app-bundle">
${safeBundleJs}
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Conciliador_Protheus_Completo.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
