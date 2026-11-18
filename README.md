# CART3R AI — Red Edition

Interface web responsiva para conversar com modelos locais via Ollama, com modos especializados para programação, direção de arte e criação audiovisual.

## Requisitos
- Node.js 18 ou superior
- Ollama instalado e em execução
- Um modelo Ollama instalado

## Instalação

```bash
ollama pull llama3.2
npm install
npm start
```

Abra `http://localhost:3000`.

## Recursos desta versão
- Interface escura em preto e vermelho, responsiva para celular e desktop.
- Chat local via Ollama e seletor de modelos instalados.
- Modo Programação com instruções de engenharia de software, segurança e boas práticas.
- Anexos de imagens enviados ao modelo Ollama (use um modelo com visão, como llava ou qwen2.5vl).
- Leitura de arquivos de texto/código comuns (TXT, MD, CSV, JSON, JS, TS, PY, HTML, CSS, SQL etc.).
- Envio de vídeos de até 50 MB para armazenamento no servidor; a análise dos quadros do vídeo ainda não está implementada.
- Modos Criar imagem e Criar vídeo ajudam a elaborar prompts profissionais. Renderização real exige integrar e configurar um provedor externo ou um pipeline local de geração; nenhum provedor foi configurado nesta entrega.

## Configuração
Copie `.env.example` para `.env` se desejar alterar as configurações:
- `PORT` — porta HTTP (padrão 3000)
- `OLLAMA_URL` — endereço do Ollama (padrão `http://127.0.0.1:11434`)
- `OLLAMA_MODEL` — modelo padrão (padrão `llama3.2`)

Para analisar imagens, instale um modelo com visão e selecione-o em Configurações. Modelos somente de texto não conseguem interpretar o conteúdo visual.

## Limitações importantes
A interface oferece os modos de imagem e vídeo, mas a geração efetiva de arquivos de mídia ainda depende de credenciais e integração com um provedor de geração. Vídeos são enviados e armazenados na pasta privada `uploads/`, mas ainda não passam por extração de quadros/transcrição. Os anexos PDF/DOCX ainda não têm extração de texto nesta versão. O histórico permanece na memória da página e não é um serviço multiusuário pronto para exposição pública.

Não exponha o servidor ou a porta do Ollama diretamente à internet sem autenticação, TLS e controles de acesso.
