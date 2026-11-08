let initializeApp,getApps,getAuth,signInWithCustomToken,signOut,getDatabase,ref,push,onValue,query,limitToLast,orderByChild,serverTimestamp,set,onDisconnect;
import {api} from './api';

let auth,db,connecting,activePresenceUser;

export async function connectChat(config){
 if(auth?.currentUser&&db)return;
 if(connecting)return connecting;
 connecting=(async()=>{
  if(!config?.apiKey||!config?.databaseURL)throw new Error('Firebase chat needs the project settings in the backend .env.');
  ({initializeApp,getApps}=await import('firebase/app'));
  ({getAuth,signInWithCustomToken,signOut}=await import('firebase/auth'));
  ({getDatabase,ref,push,onValue,query,limitToLast,orderByChild,serverTimestamp,set,onDisconnect}=await import('firebase/database'));
  const app=getApps()[0]||initializeApp(config);auth=getAuth(app);db=getDatabase(app);
  if(!auth.currentUser){const {token}=await api('/chat/token',{method:'POST',body:{}});await signInWithCustomToken(auth,token);}
 })();
 try{await connecting;}finally{connecting=null;}
}

const pair=(user,peer)=>[Number(user),Number(peer)].sort((a,b)=>a-b);
export function chatPath(user,peer){const [first,second]=pair(user,peer);return `direct/${first}/${second}/messages`;}
const readPath=(user,peer)=>`reads/${user}/${peer}`;
const deliveredPath=(user,peer)=>`delivered/${user}/${peer}`;
const presencePath=user=>`presence/${user}`;
const typingPath=(user,peer,writer)=>{const [first,second]=pair(user,peer);return `typing/${first}/${second}/${writer}`;};

export function startPresence(user,onError=console.error){
 activePresenceUser=String(user);
 const status=ref(db,presencePath(user));
 const stop=onValue(ref(db,'.info/connected'),async snapshot=>{
  if(snapshot.val()!==true)return;
  try{
   await onDisconnect(status).set({state:'offline',lastChanged:serverTimestamp()});
   await set(status,{state:'online',lastChanged:serverTimestamp()});
  }catch(error){onError(error);}
 },onError);
 return()=>{
  stop();
  set(status,{state:'offline',lastChanged:serverTimestamp()}).catch(onError);
 };
}

export function listenPresence(peer,receive,onError){
 return onValue(ref(db,presencePath(peer)),snapshot=>receive(snapshot.val()||{state:'offline',lastChanged:0}),onError);
}

export async function setTyping(user,peer,value){
 if(!db||!user||!peer)return;
 const target=ref(db,typingPath(user,peer,user));
 if(value)await onDisconnect(target).set(false);
 await set(target,Boolean(value));
}

export function listenTyping(user,peer,receive,onError){
 return onValue(ref(db,typingPath(user,peer,peer)),snapshot=>receive(snapshot.val()===true),onError);
}

export function listenMessages(user,peer,receive,onError){
 return onValue(query(ref(db,chatPath(user,peer)),orderByChild('createdAt'),limitToLast(100)),snapshot=>receive(Object.entries(snapshot.val()||{}).map(([id,message])=>({id,...message}))),onError);
}

export function listenMessageReceipts(user,peer,receive,onError){
 const receipt={delivered:0,seen:0};
 const emit=()=>receive({...receipt});
 const stopDelivered=onValue(ref(db,deliveredPath(peer,user)),snapshot=>{receipt.delivered=Number(snapshot.val()||0);emit();},onError);
 const stopSeen=onValue(ref(db,readPath(peer,user)),snapshot=>{receipt.seen=Number(snapshot.val()||0);emit();},onError);
 return()=>{stopDelivered();stopSeen();};
}

export function listenUnreadMessages(user,contacts,receive,onError){
 const states=new Map(),unsubscribe=[];
 const emit=()=>{
  const byPeer={};let total=0;
  for(const [peer,state] of states.entries()){
   const count=state.messages.filter(message=>String(message.sender)!==String(user)&&Number(message.createdAt||0)>Number(state.lastRead||0)).length;
   byPeer[peer]=count;total+=count;
  }
  receive({total,byPeer});
 };
 for(const contact of contacts){
  const peer=String(contact.user_id),state={messages:[],lastRead:0,lastDelivered:0};states.set(peer,state);
  unsubscribe.push(onValue(query(ref(db,chatPath(user,peer)),orderByChild('createdAt'),limitToLast(100)),snapshot=>{
   state.messages=Object.entries(snapshot.val()||{}).map(([id,message])=>({id,...message}));
   const newestIncoming=state.messages.reduce((latest,message)=>String(message.sender)!==String(user)?Math.max(latest,Number(message.createdAt||0)):latest,0);
   if(newestIncoming>state.lastDelivered){state.lastDelivered=newestIncoming;set(ref(db,deliveredPath(user,peer)),newestIncoming).catch(onError);}
   emit();
  },onError));
  unsubscribe.push(onValue(ref(db,readPath(user,peer)),snapshot=>{state.lastRead=Number(snapshot.val()||0);emit();},onError));
 }
 emit();return()=>unsubscribe.forEach(stop=>stop());
}

export async function markMessagesRead(user,peer){if(db&&user&&peer)await set(ref(db,readPath(user,peer)),serverTimestamp());}
export async function sendMessage(user,peer,text){const body=text.trim();if(!body||body.length>2000)throw new Error('Use 1–2,000 characters.');await push(ref(db,chatPath(user,peer)),{sender:String(user),text:body,createdAt:serverTimestamp()});}
export async function disconnectChat(){connecting=null;if(db&&activePresenceUser)await set(ref(db,presencePath(activePresenceUser)),{state:'offline',lastChanged:serverTimestamp()}).catch(()=>{});activePresenceUser=null;if(auth?.currentUser)await signOut(auth);}
