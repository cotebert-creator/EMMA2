import {interpretMedication} from './medication-interpreter.mjs';
import {interpretPersonalMemory} from './personal-memory-interpreter.mjs';
import {replyToPatient} from './reply.mjs';
import {lookupMedication} from './rxnorm.mjs';
import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;
const host = process.env.EMMA_HOST || 'localhost';
const appToken = process.env.EMMA_ACCESS_TOKEN || '';
if (!['localhost', '127.0.0.1', '::1'].includes(host) && appToken.length < 32) {
  throw new Error('LAN mode requires an EMMA_ACCESS_TOKEN of at least 32 characters.');
}
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

app.disable('x-powered-by');
app.use((req,res,next)=>{
  res.set('Cache-Control','no-store');
  res.set('X-Content-Type-Options','nosniff');
  // This development server spends the owner's API credits. Keep browser writes
  // same-origin, including requests from unrelated sites opened on this computer.
  if(req.method==='POST'){
    const origin=req.get('origin');
    if(origin && origin!==`http://${req.get('host')}`)return res.status(403).send('Use Emma from its own local page.');
    if(req.get('sec-fetch-site')==='cross-site')return res.status(403).send('Cross-site requests are not allowed.');
  }
  next();
});

// Preserve local browser use; require the app token for every remote request.
app.use((req, res, next) => {
  const address = req.socket.remoteAddress;
  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
  if (!loopback && (!appToken || req.get('authorization') !== `Bearer ${appToken}`)) {
    return res.status(401).json({error: 'An EMMA app token is required.'});
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/realtime', express.text({ type: ['application/sdp','text/plain'], limit: '1mb' }));

app.post('/api/realtime', async (req,res) => {
  try {
    if (!openai) return res.status(503).send('OPENAI_API_KEY is not configured.');
    if (!req.body) return res.status(400).send('Missing SDP offer.');
    const call = await openai.realtime.calls.create({
      sdp: req.body,
      session: { type: 'realtime', model: 'gpt-realtime-2.1-mini' }
    });
    const answer =
  typeof call.text === 'function'
    ? await call.text()
    : typeof call.sdp === 'string'
      ? call.sdp
      : typeof call.body?.sdp === 'string'
        ? call.body.sdp
        : String(call);

if (!answer || !answer.includes("v=0")) {
  console.error("Invalid Realtime SDP answer:", answer);
  return res.status(502).send("OpenAI returned an invalid voice session.");
}

res.type("application/sdp").send(answer);
    res.type('application/sdp').send(answer);
  } catch (error) {
    console.error('Realtime connection failed:',error?.status||'unavailable');
    res.status(500).send('Could not connect to the voice service. Check configuration and try again.');
  }
});

app.post('/api/medication-reference',express.json({limit:'2kb'}),async(req,res)=>{
  res.set('Cache-Control','no-store');
  if(typeof req.body?.name!=='string' || !/^[\p{L}][\p{L} '-]{1,79}$/u.test(req.body.name))return res.status(400).json({error:'Enter only a medication name.'});
  try {res.json({candidates:await lookupMedication(req.body.name)});}
  catch {res.status(503).json({error:'Medication reference unavailable.'});}
});
app.post('/api/medication-intent',express.json({limit:'24kb'}),async(req,res)=>{
  res.set('Cache-Control','no-store');
  if(!openai)return res.status(503).json({error:'AI interpretation unavailable'});
  if(typeof req.body?.text!=='string'||!req.body.text.trim()||req.body.text.length>1200)return res.status(400).json({error:'Invalid utterance'});
  try {res.json(await interpretMedication(openai,req.body));}
  catch {res.status(503).json({error:'AI interpretation unavailable'});}
});
app.get('/api/health', (_req,res) => res.json({ok:true,realtimeConfigured:Boolean(process.env.OPENAI_API_KEY)}));
app.post('/api/personal-memory',express.json({limit:'4kb'}),async(req,res)=>{
  if(!openai)return res.status(503).json({error:'Memory interpretation unavailable'});
  try{res.json(await interpretPersonalMemory(openai,req.body));}catch{res.status(503).json({error:'Memory interpretation unavailable'});}
});
app.post('/api/reply', express.json({limit:'24kb'}), async (req, res) => {
  if (!openai) return res.status(503).json({error:'Conversation unavailable'});

  try {
    const reply = await replyToPatient(openai, req.body);

    const speech = await openai.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice: 'coral',
      input: reply.text,
      response_format: 'mp3'
    });

    const audioBase64 = Buffer.from(
      await speech.arrayBuffer()
    ).toString('base64');

    res.json({
      ...reply,
      audioBase64,
      audioContentType: 'audio/mpeg'
    });
  } catch (error) {
    console.error('Conversation/TTS failed:', error);
    res.status(503).json({error:'Conversation unavailable'});
  }
});
app.listen(port,host,()=>console.log(`Emma Web POC running at http://localhost:${port}`));
