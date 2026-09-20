import {validateState} from './storage.mjs';
const encoder=new TextEncoder(),decoder=new TextDecoder();
function encode(bytes){return btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));}
function decode(value){return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
async function key(password,salt,usage){
  const base=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,usage);
}
export async function encryptBackup(state,password){
  if(password.length<12)throw Error('Use a passphrase of at least 12 characters.');
  const clean=validateState(state);clean.medicationPending=null;clean.memoryPending=null;clean.debug=[];
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode('emma-backup-v1')},await key(password,salt,['encrypt']),encoder.encode(JSON.stringify(clean)));
  return JSON.stringify({format:'emma-backup',version:1,kdf:'PBKDF2-SHA256',iterations:600000,salt:encode(salt),iv:encode(iv),ciphertext:encode(new Uint8Array(ciphertext))});
}
export async function decryptBackup(text,password){
  if(text.length>20*1024*1024)throw Error('This file is too large for the prototype.');
  let doc;
  try{doc=JSON.parse(text);}catch{throw Error('This is not an Emma backup.');}
  if(doc.format!=='emma-backup'||doc.version!==1||doc.kdf!=='PBKDF2-SHA256'||doc.iterations!==600000)throw Error('Unsupported Emma backup format.');
  let plain;
  try{
    const salt=decode(doc.salt),iv=decode(doc.iv);
    if(salt.length!==16||iv.length!==12)throw Error();
    plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:encoder.encode('emma-backup-v1')},await key(password,salt,['decrypt']),decode(doc.ciphertext));
  }catch{throw Error('The passphrase is incorrect, or the file is damaged. Nothing was changed.');}
  const restored=validateState(JSON.parse(decoder.decode(plain)));
  restored.medicationPending=null;restored.memoryPending=null;
  return restored;
}
