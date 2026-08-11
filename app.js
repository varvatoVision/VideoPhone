let cfg, user, socket, localStream, peer, roomId, callId, activeContact, contacts = [];
const $ = id => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  bindNavigation();
  $("menuBtn").onclick = () => $("sidebar").classList.toggle("open");
  $("start").onclick = () => startCall();
  $("start2").onclick = () => startCall();
  $("close").onclick = endCall;
  $("end").onclick = endCall;
  $("mute").onclick = toggleMute;
  $("camera").onclick = toggleCamera;
  $("screen").onclick = shareScreen;
  $("copy").onclick = copyLink;
  $("addContact").onsubmit = addContact;
  $("sendMessage").onsubmit = sendMessage;
  $("signout").onclick = signOut;
  await loadConfig();
  await loadMe();
});

function bindNavigation(){
  document.querySelectorAll(".nav").forEach(b => b.onclick = () => showPage(b.dataset.page));
  document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => showPage(b.dataset.go));
}
function showPage(name){
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  $(name)?.classList.add("active");
  document.querySelectorAll(".nav").forEach(b => b.classList.toggle("active", b.dataset.page === name));
  $("title").textContent = name === "calls" ? "Video Calls" : name[0].toUpperCase()+name.slice(1);
  $("sidebar").classList.remove("open");
  if(name==="contacts") loadContacts();
  if(name==="messages") loadMessageContacts();
  if(name==="history") loadHistory();
}
async function api(url, options={}){
  const r = await fetch(url, options);
  const data = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error || "Request failed");
  return data;
}
async function loadConfig(){
  cfg = await api("/api/config");
  if(window.google?.accounts?.id) initGoogle(); else setTimeout(() => initGoogle(), 500);
}
function initGoogle(){
  if(!cfg || !window.google?.accounts?.id) return setTimeout(initGoogle,500);
  google.accounts.id.initialize({client_id:cfg.googleClientId,callback:googleCredential});
  google.accounts.id.renderButton($("googleButton"),{theme:"outline",size:"medium",shape:"pill",text:"signin_with"});
}
async function googleCredential(response){
  try{ const d=await api("/api/auth/google",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({credential:response.credential})}); setUser(d.user); }
  catch(e){ alert(e.message); }
}
async function loadMe(){
  const d=await api("/api/me");
  if(d.user) setUser(d.user);
}
function setUser(u){
  user=u;
  $("name").textContent=u.name;
  $("email").textContent=u.email;
  $("avatar").textContent=(u.name||"U")[0].toUpperCase();
  $("signout").classList.remove("hidden");
  if(socket) socket.emit("identify",u.id); else connectSocket();
  loadContacts(); loadHistory();
}
function connectSocket(){
  if(!window.io) return;
  socket=io();
  socket.on("connect",()=>user&&socket.emit("identify",user.id));
  socket.on("message:new",m=>{ if(activeContact?.id===m.sender_id) loadMessages(activeContact); updateUnread(); });
  socket.on("call:incoming",c=>{ if(confirm(`${c.caller.name} is calling you. Join the call?`)) openCall(c.roomId,c.callId,c.caller.name); });
}
async function loadContacts(){
  if(!user)return;
  const d=await api("/api/contacts"); contacts=d.contacts; renderContacts();
}
function renderContacts(){
  $("contactsList").innerHTML=contacts.length?contacts.map(c=>contactHtml(c)).join(""):`<div class="empty"><p>No contacts yet. Add someone by their Google email.</p></div>`;
  $("favoriteList").innerHTML=contacts.slice(0,4).map(c=>contactHtml(c,true)).join("") || `<div class="row"><p>No contacts yet.</p></div>`;
  $("messageContacts").innerHTML=contacts.map(c=>`<div class="message-contact" data-id="${c.id}"><b>${esc(c.name)}</b><small>${esc(c.email)}</small></div>`).join("") || `<div class="message-contact">No contacts yet.</div>`;
  document.querySelectorAll("[data-contact-call]").forEach(b=>b.onclick=()=>startCall(Number(b.dataset.contactCall),b.dataset.contactName));
  document.querySelectorAll(".message-contact").forEach(el=>el.onclick=()=>{const c=contacts.find(x=>x.id===Number(el.dataset.id)); if(c) openChat(c);});
}
function contactHtml(c, compact=false){ return `<div class="row"><div class="avatar">${esc((c.name||"U")[0].toUpperCase())}</div><div><b>${esc(c.name)}</b><small>${esc(c.email)}</small></div><button data-contact-call="${c.id}" data-contact-name="${esc(c.name)}">▣</button></div>`; }
async function addContact(e){
  e.preventDefault();
  if(!user)return alert("Sign in with Google first.");
  try{const d=await api("/api/contacts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:$("contactEmail").value})}); $("contactNotice").textContent=`Added ${d.contact.name}.`; $("contactEmail").value=""; loadContacts();}
  catch(err){$("contactNotice").textContent=err.message;}
}
async function loadMessageContacts(){ if(!user)return; await loadContacts(); }
function openChat(c){
  activeContact=c; $("chatHead").textContent=c.name; document.querySelectorAll(".message-contact").forEach(x=>x.classList.toggle("active",Number(x.dataset.id)===c.id)); loadMessages(c);
}
async function loadMessages(c){
  const d=await api(`/api/messages/${c.id}`);
  $("chatMessages").innerHTML=d.messages.map(m=>`<div class="bubble ${m.sender_id===user.id?"mine":""}">${esc(m.body)}<small>${new Date(m.created_at.replace(" ","T")+"Z").toLocaleString()}</small></div>`).join("");
  $("chatMessages").scrollTop=$("chatMessages").scrollHeight;
}
async function sendMessage(e){
  e.preventDefault(); if(!activeContact)return;
  const body=$("messageBody").value.trim(); if(!body)return;
  await api("/api/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({receiverId:activeContact.id,body})});
  $("messageBody").value=""; loadMessages(activeContact);
}
async function updateUnread(){ /* kept intentionally simple; server-backed unread counts can be added next */ }
async function loadHistory(){
  if(!user)return;
  const d=await api("/api/calls");
  $("recentCalls").innerHTML=d.calls.slice(0,5).map(callRow).join("")||`<div class="row"><p>No calls yet.</p></div>`;
  $("historyList").innerHTML=d.calls.map(callRow).join("")||`<div class="empty"><p>No call history yet.</p></div>`;
}
function callRow(c){
  const other=c.caller_id===user.id?c.callee_name:c.caller_name;
  return `<div class="row"><div class="avatar">${esc((other||"Room")[0].toUpperCase())}</div><div><b>${esc(other||"Video Room")}</b><small>${esc(c.status)} · ${new Date(c.started_at.replace(" ","T")+"Z").toLocaleString()}</small></div></div>`;
}
async function startCall(calleeId=null,name=""){
  if(!user)return alert("Sign in with Google first.");
  const d=await api("/api/calls",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({calleeId})});
  openCall(d.roomId,d.callId,name||"VarvatoVision Call");
}
async function openCall(room, id, name){
  roomId=room; callId=id; $("roomCode").textContent=room; $("callTitle").textContent=name?`Call with ${name}`:"VarvatoVision Call"; $("callStatus").textContent="Starting camera…"; $("callModal").classList.remove("hidden");
  try{localStream=await navigator.mediaDevices.getUserMedia({video:true,audio:true}); $("local").srcObject=localStream; joinRoom();}
  catch(e){$("callStatus").textContent="Camera/microphone permission is required.";}
}
function joinRoom(){
  socket ||= io(); socket.emit("identify",user.id); socket.emit("join-room",{roomId});
  socket.off("waiting");socket.off("ready");socket.off("offer");socket.off("answer");socket.off("ice-candidate");socket.off("peer-left");
  socket.on("waiting",()=>{$("callStatus").textContent="Waiting for your caller…";});
  socket.on("ready",async()=>{await makePeer();const offer=await peer.createOffer();await peer.setLocalDescription(offer);socket.emit("offer",{roomId,offer});});
  socket.on("offer",async({offer})=>{await makePeer();await peer.setRemoteDescription(offer);const answer=await peer.createAnswer();await peer.setLocalDescription(answer);socket.emit("answer",{roomId,answer});});
  socket.on("answer",async({answer})=>{if(peer)await peer.setRemoteDescription(answer);});
  socket.on("ice-candidate",async({candidate})=>{try{if(candidate&&peer)await peer.addIceCandidate(candidate)}catch(e){}});
  socket.on("peer-left",()=>{$("callStatus").textContent="The other caller left."; $("remote").srcObject=null;});
}
async function makePeer(){
  if(peer)return;
  peer=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
  localStream.getTracks().forEach(t=>peer.addTrack(t,localStream));
  peer.ontrack=e=>{$("remote").srcObject=e.streams[0];$("waiting").style.display="none";$("callStatus").textContent="Connected";};
  peer.onicecandidate=e=>{if(e.candidate)socket.emit("ice-candidate",{roomId,candidate:e.candidate});};
}
function toggleMute(){const t=localStream?.getAudioTracks()[0];if(!t)return;t.enabled=!t.enabled;$("mute").textContent=t.enabled?"🎤":"🔇";}
function toggleCamera(){const t=localStream?.getVideoTracks()[0];if(!t)return;t.enabled=!t.enabled;$("camera").textContent=t.enabled?"▣":"🚫";}
async function shareScreen(){
  try{const s=await navigator.mediaDevices.getDisplayMedia({video:true});const sender=peer?.getSenders().find(x=>x.track?.kind==="video");if(sender)await sender.replaceTrack(s.getVideoTracks()[0]);$("local").srcObject=s;s.getVideoTracks()[0].onended=async()=>{const cam=localStream?.getVideoTracks()[0];if(cam&&sender){await sender.replaceTrack(cam);$("local").srcObject=localStream;}}}catch(e){}
}
async function copyLink(){await navigator.clipboard.writeText(location.origin+"?room="+roomId);$("copy").textContent="Copied!";setTimeout(()=>$("copy").textContent="Copy call link",1200);}
async function endCall(){if(socket&&roomId)socket.emit("leave-room",roomId);if(callId)fetch(`/api/calls/${callId}/end`,{method:"PATCH"}).catch(()=>{});peer?.close();peer=null;localStream?.getTracks().forEach(t=>t.stop());localStream=null;$("local").srcObject=null;$("remote").srcObject=null;$("callModal").classList.add("hidden");loadHistory();}
async function signOut(){await api("/api/auth/logout",{method:"POST"});location.reload();}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
