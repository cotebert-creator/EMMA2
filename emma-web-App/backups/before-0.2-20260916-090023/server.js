import {interpretMedication} from './medication-interpreter.mjs';
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
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

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
    const answer = typeof call.text === 'function' ? await call.text() : String(call);
    res.type('application/sdp').send(answer);
  } catch (error) {
    console.error(error);
    res.status(500).send(error?.message || 'Failed to create Realtime call.');
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
app.listen(port,()=>console.log(`Emma Web POC running at http://localhost:${port}`));
