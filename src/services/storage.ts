import {
  CompetenciaSnapshot,
  DeParaRule,
  LoteConfig,
  PendenciaAuditRecord,
} from '../types/reconciliation';
import { DEFAULT_DE_PARA_RULES, DEFAULT_LOTE_CONFIGS } from '../data/defaultDeParaAndTestCases';

const DB_NAME = 'ConciliadorProtheusContabilDB';
const DB_VERSION = 1;

const STORE_DE_PARA = 'de_para_rules';
const STORE_LOTES = 'lote_configs';
const STORE_PENDENCIAS = 'pendencias_auditoria';
const STORE_HISTORICO = 'historico_competencias';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_DE_PARA)) {
        db.createObjectStore(STORE_DE_PARA, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_LOTES)) {
        db.createObjectStore(STORE_LOTES, { keyPath: 'loteCodigo' });
      }
      if (!db.objectStoreNames.contains(STORE_PENDENCIAS)) {
        db.createObjectStore(STORE_PENDENCIAS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_HISTORICO)) {
        db.createObjectStore(STORE_HISTORICO, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadDeParaRulesFromDB(): Promise<DeParaRule[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_DE_PARA, 'readonly');
      const store = tx.objectStore(STORE_DE_PARA);
      const req = store.getAll();
      req.onsuccess = () => {
        const res = req.result as DeParaRule[];
        if (!res || res.length === 0) {
          saveDeParaRulesToDB(DEFAULT_DE_PARA_RULES);
          resolve(DEFAULT_DE_PARA_RULES);
        } else {
          resolve(res);
        }
      };
      req.onerror = () => resolve(DEFAULT_DE_PARA_RULES);
    });
  } catch {
    return DEFAULT_DE_PARA_RULES;
  }
}

export async function saveDeParaRulesToDB(rules: DeParaRule[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_DE_PARA, 'readwrite');
    const store = tx.objectStore(STORE_DE_PARA);
    store.clear();
    for (const r of rules) {
      store.put(r);
    }
  } catch {
    // Fallback silencioso
  }
}

export async function loadLoteConfigsFromDB(): Promise<LoteConfig[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_LOTES, 'readonly');
      const store = tx.objectStore(STORE_LOTES);
      const req = store.getAll();
      req.onsuccess = () => {
        const res = req.result as LoteConfig[];
        if (!res || res.length === 0) {
          saveLoteConfigsToDB(DEFAULT_LOTE_CONFIGS);
          resolve(DEFAULT_LOTE_CONFIGS);
        } else {
          resolve(res);
        }
      };
      req.onerror = () => resolve(DEFAULT_LOTE_CONFIGS);
    });
  } catch {
    return DEFAULT_LOTE_CONFIGS;
  }
}

export async function saveLoteConfigsToDB(configs: LoteConfig[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_LOTES, 'readwrite');
    const store = tx.objectStore(STORE_LOTES);
    store.clear();
    for (const c of configs) {
      store.put(c);
    }
  } catch {
    // Fallback
  }
}

export async function loadPendenciasAuditFromDB(): Promise<Record<string, PendenciaAuditRecord>> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_PENDENCIAS, 'readonly');
      const store = tx.objectStore(STORE_PENDENCIAS);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result || []) as (PendenciaAuditRecord & { key: string })[];
        const map: Record<string, PendenciaAuditRecord> = {};
        for (const item of list) {
          map[item.key] = item;
        }
        resolve(map);
      };
      req.onerror = () => resolve({});
    });
  } catch {
    return {};
  }
}

export async function savePendenciaAuditToDB(record: PendenciaAuditRecord): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_PENDENCIAS, 'readwrite');
    const store = tx.objectStore(STORE_PENDENCIAS);
    const key = `${record.empresa}_${record.competencia}_${record.contaNormalizada}`;
    store.put({ ...record, key });
  } catch {
    // Fallback
  }
}

export async function loadCompetenciasHistoryFromDB(): Promise<CompetenciaSnapshot[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_HISTORICO, 'readonly');
      const store = tx.objectStore(STORE_HISTORICO);
      const req = store.getAll();
      req.onsuccess = () => {
        const res = (req.result || []) as CompetenciaSnapshot[];
        res.sort((a, b) => a.competencia.localeCompare(b.competencia));
        resolve(res);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function saveCompetenciaSnapshotToDB(snapshot: CompetenciaSnapshot): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_HISTORICO, 'readwrite');
    const store = tx.objectStore(STORE_HISTORICO);
    store.put(snapshot);
  } catch {
    // Fallback
  }
}
