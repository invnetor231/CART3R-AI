'use strict';
require('dotenv').config();
const express=require('express');
const path=require('path');
const fs=require('fs/promises');
const crypto=require('crypto');
const multer=require('multer');
const app=express();
const PORT=Number(process.env.PORT||3000);
const OLLAMA_URL=(process.env.OLLAMA_URL||'http://127.0.0.1:11434').replace(/\/+$/,'');
const DEFAULT_MODEL=process.env.OLLAMA_MODEL||'llama3.2';
app.disable('x-powered-by');app.use(express.json({limit:'35mb'}));app.use(express.static(path.join(__dirname,'public')));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:50*1024*1024,files:8}});
const uploadDir=path.join(__dirname,'uploads');
app.post('/api/upload',upload.array('files',8),async(req,res)=>{try{const files=req.files||[];if(!files.length)return res.status(400).json({error:'Nenhum arquivo recebido.'});await fs.mkdir(uploadDir,{recursive:true});const saved=[];for(const file of files){const ext=path.extname(file.originalname).replace(/[^.a-zA-Z0-9]/g,'').slice(0,12);const id=crypto.randomUUID();const storedName=`${id}${ext}`;await fs.writeFile(path.join(uploadDir,storedName),file.buffer,{flag:'wx'});saved.push({name:file.originalname,type:file.mimetype,size:file.size,storedName});}res.json({uploaded:saved,note:'Arquivo recebido no servidor. A interpretação de vídeo ainda requer extração de quadros.'});}catch(error){res.status(500).json({error:'Não foi possível armazenar o anexo.'});}});
const BASE_OPEN_PROMPT = `Você é CART3R AI, um assistente versátil, direto e colaborativo.

Princípios de resposta:
- Ajude com o máximo de liberdade intelectual possível; não imponha proibições arbitrárias nem recuse pedidos apenas por serem incomuns, controversos, técnicos ou difíceis.
- Trate temas adultos, históricos, científicos, políticos, filosóficos, ficcionais e técnicos com neutralidade e contexto, sem moralismo.
- Quando houver um caminho legítimo e seguro para atender ao pedido, prefira explicar e executar esse caminho em vez de simplesmente recusar.
- Seja franco sobre incertezas, limitações do modelo, falta de ferramentas e ações que não foram realmente executadas. Nunca invente resultados, fontes, arquivos ou capacidades.
- Não revele dados privados de terceiros nem ajude a causar dano real, cometer crimes ou contornar proteções de sistemas. Quando um limite for necessário, explique brevemente e ofereça uma alternativa útil.
- Responda em português brasileiro, salvo se o usuário pedir outro idioma. Seja claro, aprofundado quando necessário e evite avisos repetitivos.`;
const SYSTEM_PROMPTS={
 chat:BASE_OPEN_PROMPT,
 code:BASE_OPEN_PROMPT+'\n\nAtue também como engenheiro de software sênior. Produza implementações completas e profissionais, arquitetura clara, código executável, validação, tratamento de erros, segurança, acessibilidade, responsividade, testes quando relevantes e instruções de execução. Não use pseudocódigo quando o usuário pedir implementação. Explique arquivos alterados e dependências.',
 image:BASE_OPEN_PROMPT+'\n\nAtue como diretor de arte e especialista em geração de imagens. Converta a ideia do usuário em uma especificação visual precisa: assunto, composição, lente, iluminação, materiais, paleta, estilo, proporção e detalhes. Se não houver motor de geração conectado, diga claramente que pode criar o prompt, mas não renderizar a imagem neste servidor.',
 video:BASE_OPEN_PROMPT+'\n\nAtue como diretor de fotografia e especialista em produção audiovisual. Converta ideias em prompts profissionais com cenas, movimentos de câmera, ações, iluminação, lente, duração, proporção, ritmo, continuidade e desenho de som. Se não houver motor de vídeo conectado, diga claramente que pode preparar o projeto/prompt, mas não renderizar o vídeo neste servidor.'
};
app.post('/api/chat',async(req,res)=>{
 const {messages,model,mode='chat'}=req.body||{};
 if(!Array.isArray(messages)||!messages.length)return res.status(400).json({error:'Envie uma lista de mensagens.'});
 const safeMessages=messages.slice(-24).map(m=>{const item={role:['user','assistant','system'].includes(m.role)?m.role:'user',content:String(m.content||'').slice(0,40000)};if(item.role==='user'&&Array.isArray(m.images)){item.images=m.images.filter(x=>typeof x==='string'&&x.length<18_000_000).slice(0,6);}return item;}).filter(m=>m.content.trim()||(m.images&&m.images.length));
 if(!safeMessages.some(m=>m.role==='user'))return res.status(400).json({error:'A conversa precisa conter uma mensagem do usuário.'});
 const selectedModel=typeof model==='string'&&/^[a-zA-Z0-9._:-]{1,100}$/.test(model)?model:DEFAULT_MODEL;
 const system={role:'system',content:SYSTEM_PROMPTS[mode]||SYSTEM_PROMPTS.chat};
 const ollamaMessages=[system,...safeMessages];
 try{const response=await fetch(`${OLLAMA_URL}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:selectedModel,messages:ollamaMessages,stream:false,options:{temperature:0.8}}),signal:AbortSignal.timeout(240000)});const data=await response.json().catch(()=>({}));if(!response.ok)return res.status(response.status).json({error:data.error||`Ollama respondeu HTTP ${response.status}.`});const answer=data.message?.content;if(!answer)return res.status(502).json({error:'O modelo não retornou uma resposta.'});res.json({answer,model:data.model||selectedModel,done:true});}
 catch(error){const message=error.name==='TimeoutError'?'O modelo demorou demais para responder.':'Não foi possível conectar ao Ollama. Verifique se ele está instalado e iniciado.';res.status(503).json({error:message,detail:process.env.NODE_ENV==='development'?error.message:undefined});}
});
app.get('/api/status',async(_req,res)=>{try{const response=await fetch(`${OLLAMA_URL}/api/tags`,{signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error(`Ollama HTTP ${response.status}`);const data=await response.json();res.json({online:true,defaultModel:DEFAULT_MODEL,models:(data.models||[]).map(m=>m.name),imageGenerationConfigured:Boolean(process.env.IMAGE_PROVIDER_URL),videoGenerationConfigured:Boolean(process.env.VIDEO_PROVIDER_URL)});}catch{res.json({online:false,defaultModel:DEFAULT_MODEL,models:[],imageGenerationConfigured:Boolean(process.env.IMAGE_PROVIDER_URL),videoGenerationConfigured:Boolean(process.env.VIDEO_PROVIDER_URL)});}});
app.get('*',(_req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,'0.0.0.0',()=>{console.log(`CART3R AI disponível em http://localhost:${PORT}`);console.log(`Ollama: ${OLLAMA_URL} | Modelo padrão: ${DEFAULT_MODEL}`);});
