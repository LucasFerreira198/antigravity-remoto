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
  async testUrl(url: string, apiKey: string, timeoutMs: number = 3500): Promise<boolean> {
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
   * Consulta o tópico Rendezvous em nuvem para obter as URLs mais recentes do PC.
   */
  async fetchRendezvous(bridgeId: string): Promise<RendezvousData | null> {
    if (!bridgeId) return null;
    const endpoint = `https://ntfy.sh/agbridge_${bridgeId}/json?poll=1`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);

    try {
      const res = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;

      const text = await res.text();
      const lines = text.trim().split('\n').filter(Boolean);

      // Ler do final para o início para obter a mensagem mais recente
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(lines[i]);
          if (parsed.event === 'message' && parsed.message) {
            const data: RendezvousData = JSON.parse(parsed.message);
            if (data.remote_url) {
              return data;
            }
          }
        } catch (e) {}
      }
    } catch (e) {
      clearTimeout(timer);
    }
    return null;
  },

  /**
   * Resolve a conexão ativa de forma inteligente e sem necessidade de escanear QR Code.
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

    // 1. Testar URL atual primeiro se fornecida
    if (fallbackUrl) {
      onProgress?.('Verificando conexão salva...');
      const ok = await this.testUrl(fallbackUrl, key, 2500);
      if (ok) {
        return { url: fallbackUrl, source: 'current' };
      }
    }

    // 2. Buscar dados da Ponte em Nuvem
    onProgress?.('Consultando Ponte em Nuvem (Zero-QR)...');
    const bridgeId = this.computeBridgeId(key);
    const data = await this.fetchRendezvous(bridgeId);

    if (data) {
      // 3. Testar a URL remota obtida da nuvem
      if (data.remote_url) {
        onProgress?.('Conectando via Túnel Remoto...');
        const remoteOk = await this.testUrl(data.remote_url, key, 4000);
        if (remoteOk) {
          return { url: data.remote_url, source: 'remote' };
        }
      }

      // 4. Testar a URL local (caso ambos estejam no mesmo Wi-Fi)
      if (data.local_url) {
        onProgress?.('Conectando via Rede Local (Wi-Fi)...');
        const localOk = await this.testUrl(data.local_url, key, 2000);
        if (localOk) {
          return { url: data.local_url, source: 'local' };
        }
      }
    }

    throw new Error(
      'Não foi possível conectar ao seu computador pela internet nem pela rede local.\n\nVerifique se o computador está ligado e com o Antigravity Remoto em segundo plano.'
    );
  },
};
