// Utilitário de Resolução Automática da Ponte (Zero-QR Auto-Reconnect)

function sha256(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = 'length';
  let i: number, j: number;
  let result = '';
  const words: number[] = [];
  const asciiBitLength = ascii[lengthProperty] * 8;
  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;
  const isComposite: Record<number, boolean> = {};

  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) isComposite[i] = true;
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += '\x80';
  while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return '';
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength | 0;

  for (j = 0; j < words[lengthProperty]; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);
    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      w[i] = i < 16 ? w[i] : (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      const s1_maj = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const t2 = (s1_maj + maj) | 0;
      const s1_ch = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const t1 = (hash[7] + s1_ch + ch + k[i] + w[i]) | 0;
      hash.unshift((t1 + t2) | 0);
      hash.pop();
      hash[4] = (hash[4] + t1) | 0;
    }
    for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (8 * j)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

export interface RendezvousData {
  bridge_id: string;
  remote_url: string;
  local_url?: string;
  hostname?: string;
  timestamp?: number;
  status?: string;
  version?: string;
}

function firstSuccessful<T>(promises: Promise<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    if (promises.length === 0) {
      reject(new Error('Nenhum endpoint disponível para teste.'));
      return;
    }
    let rejectedCount = 0;
    const errors: any[] = [];
    promises.forEach((p, idx) => {
      p.then(resolve).catch((err) => {
        rejectedCount++;
        errors[idx] = err;
        if (rejectedCount === promises.length) {
          reject(new Error('Todos os endpoints falharam na conexão.'));
        }
      });
    });
  });
}

export const BridgeResolver = {
  /**
   * Calcula o Bridge ID único e determinístico a partir da API Key do servidor.
   */
  computeBridgeId(apiKey: string): string {
    const cleanKey = apiKey.trim();
    if (!cleanKey) return '';
    const hash = sha256(cleanKey);
    return hash.slice(0, 24);
  },

  /**
   * Testa se um endereço de servidor responde positivamente com a API Key fornecida.
   */
  async testUrl(url: string, apiKey: string, timeoutMs: number = 4500): Promise<boolean> {
    if (!url) return false;
    const cleanUrl = url.replace(/\/+$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${cleanUrl}/api/status`, {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey.trim(),
          'Authorization': `Bearer ${apiKey.trim()}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.status === 200;
    } catch (e) {
      clearTimeout(timer);
      return false;
    }
  },

  /**
   * Consulta o tópico Rendezvous em nuvem para obter todas as URLs candidatas recentes do PC.
   */
  async fetchCandidatesFromCloud(bridgeId: string): Promise<string[]> {
    if (!bridgeId) return [];
    const endpoint = `https://ntfy.sh/agbridge_${bridgeId}/json?poll=1`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const candidates: string[] = [];

    try {
      const res = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return [];

      const text = await res.text();
      const lines = text.trim().split('\n').filter(Boolean);

      // Ler do final para o início para priorizar os heartbeats mais recentes
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(lines[i]);
          if (parsed.event === 'message' && parsed.message) {
            const data: RendezvousData = JSON.parse(parsed.message);
            if (data.remote_url && !candidates.includes(data.remote_url)) {
              candidates.push(data.remote_url);
            }
            if (data.local_url && !candidates.includes(data.local_url)) {
              candidates.push(data.local_url);
            }
          }
        } catch (e) {}
      }
    } catch (e) {
      clearTimeout(timer);
    }
    return candidates;
  },

  /**
   * Resolve a conexão ativa de forma inteligente e sem necessidade de escanear QR Code.
   * Testa múltiplos candidatos em paralelo para conexão instantânea e redundante.
   */
  async resolveWorkingConnection(
    apiKey: string,
    fallbackUrl?: string,
    onProgress?: (step: string) => void
  ): Promise<{ url: string; source: 'current' | 'remote' | 'local' }> {
    const key = apiKey.trim();
    if (!key) {
      throw new Error('Chave de segurança (API Key) ausente para resolver a ponte.');
    }

    onProgress?.('Verificando conexão com o PC...');

    // 1. Se fallbackUrl existir, testá-la rapidamente
    if (fallbackUrl) {
      const isQuickOk = await this.testUrl(fallbackUrl, key, 2000);
      if (isQuickOk) {
        return {
          url: fallbackUrl,
          source: fallbackUrl.includes('trycloudflare') ? 'remote' : 'local'
        };
      }
    }

    // 2. Buscar candidatos na nuvem (Zero-QR)
    onProgress?.('Consultando Ponte em Nuvem (Zero-QR)...');
    const bridgeId = this.computeBridgeId(key);
    const cloudCandidates = await this.fetchCandidatesFromCloud(bridgeId);

    // 3. Montar lista consolidada priorizando candidatos frescos da nuvem e rede local
    const allCandidates: string[] = [];
    for (const c of cloudCandidates) {
      if (c && !allCandidates.includes(c)) {
        allCandidates.push(c);
      }
    }
    if (fallbackUrl && !allCandidates.includes(fallbackUrl)) {
      allCandidates.push(fallbackUrl);
    }

    if (allCandidates.length === 0) {
      throw new Error(
        'Nenhum endereço registrado encontrado na Nuvem.\n\nVerifique se o Antigravity Remoto está aberto no computador.'
      );
    }

    onProgress?.('Testando canais de comunicação com o PC...');

    // 4. Testar todos os candidatos em paralelo — o primeiro que responder ganha
    const testPromises = allCandidates.map(async (candUrl) => {
      const ok = await this.testUrl(candUrl, key, 4500);
      if (ok) {
        return candUrl;
      }
      throw new Error(`Inacessível: ${candUrl}`);
    });

    try {
      const winningUrl = await firstSuccessful(testPromises);
      return {
        url: winningUrl,
        source: winningUrl.includes('trycloudflare') ? 'remote' : 'local'
      };
    } catch (allErr) {
      throw new Error(
        'Não foi possível conectar ao seu computador pela internet nem pela rede local.\n\nVerifique se o computador está ligado e com o Antigravity Remoto em segundo plano.'
      );
    }
  },
};
