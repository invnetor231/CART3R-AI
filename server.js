'use strict';
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const CLOUD_BASE = (process.env.OLLAMA_CLOUD_URL || 'https://ollama.com').replace(/\/+$/, '');
const CLOUD_MODEL = process.env.OLLAMA_CLOUD_MODEL || 'gpt-oss:20b-cloud';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 8 } });
const uploadDir = path.join(__dirname, 'uploads');

app.disable('x-powered-by');
app.use(express.json({ limit: '35mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const BASE_PROMPT = `Você é CART3R AI, um assistente versátil, direto e colaborativo.
- Responda em português brasileiro, salvo pedido diferente.
- Seja franco sobre incertezas, limitações e ações não executadas. Nunca invente resultados ou capacidades.
- Ajude com temas técnicos, científicos, criativos e controversos com neutralidade e contexto.
- Não exponha dados privados nem ajude a causar dano real ou comprometer sistemas sem autorização.`;
const SYSTEM_PROMPTS = {
  chat: BASE_PROMPT,
  code: BASE_PROMPT + '\nAtue como engenheiro de software sênior. Produza código completo, executável, seguro, acessível, responsivo e bem documentado. Inclua arquivos, dependências, tratamento de erros e instruções quando necessário.',
  image: BASE_PROMPT + '\nAtue como diretor de arte. Crie prompts visuais precisos com composição, iluminação, lente, materiais, paleta, estilo e proporção. Se não houver gerador conectado, deixe claro que está produzindo um prompt, não uma imagem.',
  video: BASE_PROMPT + '\nAtue como diretor de fotografia. Crie prompts com cenas, movimento de câmera, ação, iluminação, duração, proporção, continuidade e som. Se não houver gerador conectado, deixe claro que está produzindo um prompt, não um vídeo.'
};

function validateMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) return null;
  return messages.slice(-24).map((m) => {
    const item = { role: ['user', 'assistant', 'system'].includes(m.role) ? m.role : 'user', content: String(m.content || '').slice(0, 40000) };
    if (item.role === 'user' && Array.isArray(m.images)) item.images = m.images.filter((x) => typeof x === 'string' && x.length < 18000000).slice(0, 6);
    return item;
  }).filter((m) => m.content.trim() || (m.images && m.images.length));
}

app.post('/api/upload', upload.array('files', 8), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'Nenhum arquivo recebido.' });
    await fs.mkdir(uploadDir, { recursive: true });
    const saved = [];
    for (const file of files) {
      const ext = path.extname(file.originalname).replace(/[^.a-zA-Z0-9]/g, '').slice(0, 12);
      const storedName = `${crypto.randomUUID()}${ext}`;
      await fs.writeFile(path.join(uploadDir, storedName), file.buffer, { flag: 'wx' });
      saved.push({ name: file.originalname, type: file.mimetype, size: file.size, storedName });
    }
    res.json({ uploaded: saved, note: 'Arquivo recebido. A análise de vídeo ainda depende de extração de quadros.' });
  } catch {
    res.status(500).json({ error: 'Não foi possível armazenar o anexo.' });
  }
});

app.get('/api/providers', (_req, res) => {
  res.json({ cloudConfigured: Boolean(process.env.OLLAMA_CLOUD_API_KEY), cloudModel: CLOUD_MODEL, cloudBase: CLOUD_BASE });
});

app.get('/api/cloud/models', async (_req, res) => {
  if (!process.env.OLLAMA_CLOUD_API_KEY) return res.status(503).json({ error: 'Ollama Cloud não configurado no servidor. Adicione OLLAMA_CLOUD_API_KEY nas variáveis do Render.' });
  try {
    const response = await fetch(`${CLOUD_BASE}/api/tags`, { headers: { Authorization: `Bearer ${process.env.OLLAMA_CLOUD_API_KEY}` }, signal: AbortSignal.timeout(12000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ error: data.error || `Ollama Cloud respondeu HTTP ${response.status}.` });
    res.json({ models: (data.models || []).map((m) => m.name), defaultModel: CLOUD_MODEL });
  } catch (error) {
    res.status(503).json({ error: `Não foi possível consultar Ollama Cloud: ${error.message}` });
  }
});

app.post('/api/chat', async (req, res) => {
  const { messages, model, mode = 'chat', provider = 'cloud' } = req.body || {};
  const safeMessages = validateMessages(messages);
  if (!safeMessages || !safeMessages.some((m) => m.role === 'user')) return res.status(400).json({ error: 'Envie uma conversa com pelo menos uma mensagem do usuário.' });
  if (!process.env.OLLAMA_CLOUD_API_KEY) return res.status(503).json({ error: 'Ollama Cloud não configurado. Adicione OLLAMA_CLOUD_API_KEY nas variáveis de ambiente do Render.' });
  const selectedModel = typeof model === 'string' && /^[a-zA-Z0-9._:/-]{1,120}$/.test(model) ? model : CLOUD_MODEL;
  const ollamaMessages = [{ role: 'system', content: SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.chat }, ...safeMessages];
  try {
    const response = await fetch(`${CLOUD_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OLLAMA_CLOUD_API_KEY}` },
      body: JSON.stringify({ model: selectedModel, messages: ollamaMessages, stream: false, options: { temperature: 0.8 } }),
      signal: AbortSignal.timeout(240000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ error: data.error || `Ollama Cloud respondeu HTTP ${response.status}.` });
    const answer = data.message?.content;
    if (!answer) return res.status(502).json({ error: 'O modelo na nuvem não retornou uma resposta.' });
    res.json({ answer, model: data.model || selectedModel, provider: 'cloud', done: true });
  } catch (error) {
    const message = error.name === 'TimeoutError' ? 'A IA na nuvem demorou demais para responder.' : 'Não foi possível conectar ao Ollama Cloud.';
    res.status(503).json({ error: message, detail: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

app.get('/api/status', (_req, res) => {
  res.json({ cloudConfigured: Boolean(process.env.OLLAMA_CLOUD_API_KEY), cloudModel: CLOUD_MODEL, localConnection: 'O navegador tenta detectar o Ollama no próprio dispositivo.' });
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`CART3R AI ativo na porta ${PORT}. Ollama Cloud: ${process.env.OLLAMA_CLOUD_API_KEY ? 'configurado' : 'não configurado'}`));
