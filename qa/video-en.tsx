import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../entrypoints/sidepanel/App';
import { buildConversationSnapshot, conversationTextFingerprint, generateConversationNodeTitle } from '../lib/conversation-graph';
import { SCHEMA_VERSION, type Clip, type StoredState } from '../lib/models';
import en from '../public/_locales/en/messages.json';
import '@xyflow/react/dist/style.css';
import '../entrypoints/sidepanel/styles.css';
import '../entrypoints/sidepanel/notebook-header.css';
import '../entrypoints/sidepanel/card-navigation.css';
import '../entrypoints/sidepanel/mind-map.css';
import '../entrypoints/sidepanel/conversation-map.css';
import '../entrypoints/sidepanel/conversation-export.css';

// Film fixture: real production components, synthetic data, isolated in-memory APIs.
const event = () => { const listeners = new Set<(...args: any[]) => void>(); return { addListener: (fn: any) => listeners.add(fn), removeListener: (fn: any) => listeners.delete(fn), emit: (...args: any[]) => listeners.forEach(fn => fn(...args)) }; };
const runtimeMessages = event(), storageChanges = event();
const copy = [
  ['How can I learn more from AI conversations?', 'Start with a question that matters to you. Keep the useful ideas close.'],
  ['What should I save?', 'Keep the original words, together with their source.'],
  ['How do I make the ideas my own?', 'Add your interpretation separately from the original text.'],
  ['How can I connect what I learn?', 'Connect related excerpts to build a structure you can revisit.'],
  ['What if I need the context again?', 'Return to the original message to check the surrounding conversation.'],
  ['How do I keep these notes?', 'Export your excerpts and annotations as Markdown.']
] as const;
const metadata = { platform: 'chatgpt' as const, conversationId: 'film-demo', conversationUrl: 'https://chatgpt.com/c/film-demo', conversationTitle: 'Learning with AI' };
const clipTexts = [copy[1][1], copy[2][1], copy[3][1]];
const clips: Record<string, Clip> = Object.fromEntries(clipTexts.map((text, i) => { const id = `clip${i+1}`; return [id, { id, notebookId:'research', originalText:text, annotation:i===1?'My interpretation stays separate from the evidence.':'', ...metadata, messageRole:'assistant', capturedAt:'2026-09-12T09:00:00Z', highlightColor:'yellow', parentClipId:i===2?'clip1':undefined, anchor:{exact:text,prefix:'',suffix:'',messageRole:'assistant',startOffset:0,endOffset:text.length,status:'resolved'} }]; }));
let state: StoredState = {schemaVersion:SCHEMA_VERSION,currentNotebookId:'research',pendingCaptures:[],clips,notebooks:{research:{id:'research',title:'Learning with AI',description:'From conversation to understanding.',clipIds:Object.keys(clips),schemaVersion:SCHEMA_VERSION,createdAt:'2026-09-12T09:00:00Z',updatedAt:'2026-09-12T09:00:00Z'}}};
const nodes = copy.flatMap((pair,round)=>pair.map((text,i)=>({id:`${i?'a':'q'}${round+1}`,order:round*2+i,role:i?'assistant' as const:'user' as const,title:generateConversationNodeTitle(text),text,searchText:text,fingerprint:conversationTextFingerprint(text),clipIds:i&&round>=1&&round<=3?[`clip${round}`]:[],isReport:false})));
let snapshot=buildConversationSnapshot(metadata,nodes,'a4');
const api={
 i18n:{getMessage:(key:string,values?:string|string[])=>{if(key==='@@ui_locale')return'en';const text=(en as Record<string,{message:string}>)[key]?.message??'';return(Array.isArray(values)?values:values?[values]:[]).reduce((r,v,i)=>r.replaceAll(`$${i+1}`,v),text);}},
 runtime:{onMessage:runtimeMessages,getURL:(path:string)=>path,getManifest:()=>({})},
 tabs:{onActivated:event(),onUpdated:event(),query:async()=>[{id:7,url:metadata.conversationUrl}],get:async()=>({id:7,url:metadata.conversationUrl}),update:async()=>({}),sendMessage:async(_id:number,message:any)=>{if(message.type==='GET_CONVERSATION_GRAPH')return{version:2,type:'CONVERSATION_GRAPH_RESULT',ok:true,snapshot};if(message.type==='SCROLL_TO_CONVERSATION_NODE'){snapshot={...snapshot,activeNodeId:message.nodeId};runtimeMessages.emit({version:2,type:'CONVERSATION_ACTIVE_NODE',nodeId:message.nodeId,conversationUrl:metadata.conversationUrl},{tab:{id:7}});return{version:2,type:'SCROLL_TO_CONVERSATION_NODE_RESULT',ok:true};}return{ok:true};}},
 storage:{onChanged:storageChanges,local:{get:async(key:string)=>key==='dialogueClipperState'?{dialogueClipperState:structuredClone(state)}:{},set:async(value:any)=>{if(value.dialogueClipperState)state=value.dialogueClipperState;storageChanges.emit({},'local');},getBytesInUse:async()=>5000,remove:async()=>{}},session:{get:async()=>({}),remove:async()=>{}}}
};
Object.defineProperty(globalThis,'chrome',{value:api,configurable:true});
createRoot(document.getElementById('root')!).render(createElement(App));
