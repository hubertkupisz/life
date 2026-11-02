const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const DAYS=["Poniedziałek","Wtorek","Środa","Czwartek","Piątek","Sobota","Niedziela"];
const SH=["Pn","Wt","Śr","Cz","Pt","So","Nd"];
const MON=["stycznia","lutego","marca","kwietnia","maja","czerwca","lipca","sierpnia","września","października","listopada","grudnia"];
const MONN=["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];
const MONL=["styczniu","lutym","marcu","kwietniu","maju","czerwcu","lipcu","sierpniu","wrześniu","październiku","listopadzie","grudniu"];
const CAT_OUT=["Jedzenie","Mieszkanie","Transport","Rozrywka","Zdrowie","Zakupy","Inne"];
const CAT_IN=["Wynagrodzenie","Dodatkowe","Inne"];
const EVC={praca:"Praca",dom:"Dom",zdrowie:"Zdrowie",spotkanie:"Spotkanie",inne:"Inne"};
const pad=n=>String(n).padStart(2,"0");
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse=s=>{const[y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const monday=d=>addDays(d,-((d.getDay()+6)%7));
const wd=d=>(d.getDay()+6)%7;
const ym=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}`;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const fmt=new Intl.NumberFormat("pl-PL",{style:"currency",currency:"PLN"});
const fmt0=new Intl.NumberFormat("pl-PL",{style:"currency",currency:"PLN",maximumFractionDigits:0});
const money=n=>fmt.format(n), money0=n=>fmt0.format(Math.round(n));
function plural(n,a,b,c){if(n===1)return a;const t=n%10,h=n%100;return(t>=2&&t<=4&&(h<12||h>14))?b:c}
function isoWeek(d){const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const k=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-k);const y0=new Date(Date.UTC(t.getUTCFullYear(),0,1));return Math.ceil(((t-y0)/864e5+1)/7)}
function dayLabel(k){const d=parse(k),diff=Math.round((d-today)/864e5);return{0:"Dziś",1:"Jutro","-1":"Wczoraj"}[diff]||`${d.getDate()} ${MON[d.getMonth()]}`}
function parseAmt(s){const v=Number(String(s).replace(/\s/g,"").replace(",","."));return isFinite(v)?Math.round(v*100)/100:NaN}

const today=new Date();today.setHours(0,0,0,0);
const T=iso(today);
const ui={view:"start",calMonth:new Date(today.getFullYear(),today.getMonth(),1),calSel:T,tf:"active",
  finMonth:new Date(today.getFullYear(),today.getMonth(),1),txType:"out",finTab:"ov",recEdit:null,habWeek:monday(today),note:null};

/* ---------- storage ----------
   mode "local": this browser only · "db": Claude artifact store · "cloud": Supabase account (local cache + offline queue) */
const IN_CLAUDE=!!(window.claude&&typeof window.claude.use==="function");
let items=new Map(),mode="local",col=null;
const LS="life.v1",LS_PEND="life.pending",LS_OWNER="life.owner";
const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}};
const lsSet=(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch(e){}};
function loadLocal(){try{const r=lsGet(LS);if(r)items=new Map(Object.entries(JSON.parse(r)))}catch(e){}}
function saveLocal(){if(mode!=="db")lsSet(LS,JSON.stringify(Object.fromEntries(items)))}
const queues=new Map();
function enqueue(id,fn){const p=(queues.get(id)||Promise.resolve()).then(fn).catch(()=>setStatus("error"));queues.set(id,p);return p}
function remoteSet(id,obj){if(mode==="db")return enqueue(id,()=>col.doc(id).set(obj));if(mode==="cloud")queueCloud(id,obj);return Promise.resolve()}
function remoteDel(id){if(mode==="db")return enqueue(id,()=>col.doc(id).delete());if(mode==="cloud")queueCloud(id,null);return Promise.resolve()}
function put(id,obj,quiet){items.set(id,obj);if(!quiet)render();saveLocal();return remoteSet(id,obj)}
async function putMany(entries){for(const[id,o]of entries)items.set(id,o);saveLocal();render();
  if(mode==="db"){for(const[id,o]of entries)await remoteSet(id,o)}else for(const[id,o]of entries)remoteSet(id,o)}
function del(id){const it=items.get(id);
  if(it&&it.kind==="tx"&&it.rec){const r=items.get(it.rec);if(r&&r.paid){const p={...r.paid};for(const k in p)if(p[k]===id)delete p[k];put(it.rec,{...r,paid:p},true)}}
  items.delete(id);render();saveLocal();return remoteDel(id)}
function setStatus(s){
  const t={local:["Zapis w tej przeglądarce",""],db:["Zapisano na koncie","ok"],slow:["Łączę się z zapisem…","bad"],error:["Nie udało się zapisać. Odśwież stronę.","bad"],
    cloud:["Zsynchronizowano","ok"],sync:["Synchronizuję…",""],offline:["Offline · zmiany wyślę po połączeniu","bad"],
    cloudErr:["Nie udało się zsynchronizować · ponowię za chwilę","bad"],relogin:["Zaloguj się, żeby zsynchronizować","bad"]}[s];
  $("#statusTxt").textContent=t[0];$("#statusDot").className="dot "+t[1];
}

/* ---------- cloud sync (Supabase) ---------- */
const SB_URL="https://nmlxqbozlriigqdexiao.supabase.co",SB_KEY="sb_publishable_vCTPKGEJy7_94FRpefy-9g_GMJSmG1u";
const SITE=()=>location.origin+location.pathname;
let sb=null,sbUser=null,chan=null,pending=new Map(),flushing=false,flushAgain=false,authMode="in";
function loadPending(){try{pending=new Map(JSON.parse(lsGet(LS_PEND)||"[]"))}catch(e){pending=new Map()}}
function savePending(){lsSet(LS_PEND,pending.size?JSON.stringify([...pending]):null)}
function queueCloud(id,obj){pending.set(id,obj);savePending();flush()}
async function flush(){
  if(mode!=="cloud")return;
  if(!sbUser){setStatus(navigator.onLine===false||!sb?"offline":"relogin");return}
  if(flushing){flushAgain=true;return}
  flushing=true;if(pending.size)setStatus("sync");
  try{
    while(pending.size){
      const batch=[...pending].slice(0,200),ups=batch.filter(([,v])=>v!==null),dels=batch.filter(([,v])=>v===null).map(([k])=>k);
      if(ups.length){const{error}=await sb.from("items").upsert(ups.map(([id,data])=>({user_id:sbUser.id,id,data})),{onConflict:"user_id,id"});if(error)throw error}
      if(dels.length){const{error}=await sb.from("items").delete().in("id",dels);if(error)throw error}
      for(const[k,v]of batch)if(pending.get(k)===v)pending.delete(k);
      savePending();
    }
    setStatus("cloud");
  }catch(e){setStatus(navigator.onLine===false?"offline":"cloudErr")}
  finally{flushing=false;if(flushAgain){flushAgain=false;if(pending.size)setTimeout(flush,0)}}
}
async function pull(first){
  const{data,error}=await sb.from("items").select("id,data");
  if(error){setStatus(navigator.onLine===false?"offline":"cloudErr");return false}
  const remote=new Map(data.map(r=>[r.id,r.data]));
  if(first){const owner=lsGet(LS_OWNER);
    if(!owner){for(const[id,v]of items)if(!remote.has(id)&&!pending.has(id))pending.set(id,v)}   // entries made before signing in move to the account
    else if(owner!==sbUser.id)pending.clear();                                                     // cache of another account: never upload it
    lsSet(LS_OWNER,sbUser.id);savePending()}
  for(const[id,v]of pending)v===null?remote.delete(id):remote.set(id,v);
  items=remote;saveLocal();render();return true;
}
async function startCloud(){
  mode="cloud";loadPending();renderAcct();setStatus("sync");
  if(await pull(true))await flush();
  if(chan)sb.removeChannel(chan);
  chan=sb.channel("life-"+sbUser.id).on("postgres_changes",{event:"*",schema:"public",table:"items"},p=>{
    const row=p.eventType==="DELETE"?p.old:p.new;
    if(!row||!sbUser||row.user_id!==sbUser.id||pending.has(row.id))return;
    if(p.eventType==="DELETE")items.delete(row.id);else items.set(row.id,p.new.data);
    saveLocal();render();
  }).subscribe();
}
function endCloud(){
  if(chan){sb.removeChannel(chan);chan=null}
  mode="local";items=new Map();pending=new Map();
  lsSet(LS,null);lsSet(LS_PEND,null);lsSet(LS_OWNER,null);
  setStatus("local");render();renderAcct();
}
function acctMsg(t,kind){const m=$("#acctMsg");m.textContent=t||"";m.className="acct-msg"+(kind?" "+kind:"")}
function openAcct(){$("#acctPanel").hidden=false;$("#acctBtn").setAttribute("aria-expanded","true")}
function authErr(e){const m=(e&&e.message)||"";
  if(/invalid login credentials/i.test(m))return"Nieprawidłowy e-mail lub hasło.";
  if(/email not confirmed/i.test(m))return"Najpierw potwierdź adres e-mail linkiem z wiadomości, którą wysłaliśmy.";
  if(/password should be|weak password/i.test(m))return"Hasło jest za słabe. Użyj co najmniej 8 znaków.";
  if(/rate limit|too many|security purposes/i.test(m))return"Za dużo prób w krótkim czasie. Spróbuj ponownie za kilka minut.";
  if(/already registered/i.test(m))return"To konto już istnieje. Zaloguj się.";
  if(/fetch|network/i.test(m))return"Brak połączenia z internetem. Spróbuj ponownie, gdy będziesz online.";
  return"Nie udało się: "+m;}
function renderAcct(){
  $("#acctBtn").hidden=IN_CLAUDE;
  $("#acctBtn").textContent=sbUser?"Konto":"Zaloguj się";
  $("#acctOut").hidden=!!sbUser;$("#acctIn").hidden=!sbUser;
  if(sbUser)$("#acctEmail").textContent=sbUser.email||"";
  $$('[data-act="authMode"]').forEach(b=>b.setAttribute("aria-pressed",b.dataset.m===authMode));
  $("#authSubmit").textContent=authMode==="in"?"Zaloguj się":"Załóż konto";
  $("#authPass").setAttribute("autocomplete",authMode==="in"?"current-password":"new-password");
  $("#authPass").placeholder=authMode==="in"?"Hasło":"Hasło (min. 8 znaków)";
  $("#forgotBtn").hidden=authMode!=="in";
}
const urlQ=new URLSearchParams(location.search),urlCode=urlQ.get("code"),urlErr=urlQ.get("error_description");
function onAuth(ev,session){
  const u=session&&session.user||null;
  if(ev==="PASSWORD_RECOVERY"){openAcct();$("#newPassForm").hidden=false;acctMsg("Wpisz nowe hasło do konta.");}
  if(u&&(!sbUser||u.id!==sbUser.id)){sbUser=u;startCloud()}
  else if(u){sbUser=u}
  else if(!u&&sbUser){sbUser=null;endCloud()}
  else if(!u&&ev==="INITIAL_SESSION"&&mode==="cloud")setStatus("relogin");
  if(ev==="INITIAL_SESSION"&&(urlCode||urlErr)){
    if(!u){openAcct();acctMsg(urlErr?"Link z wiadomości wygasł albo został już użyty. Zaloguj się hasłem lub wyślij nowy link.":"Adres e-mail potwierdzony. Zaloguj się teraz hasłem.",urlErr?"err":"ok")}
    else if(ev!=="PASSWORD_RECOVERY"&&$("#newPassForm").hidden){openAcct();acctMsg("Konto potwierdzone. Zalogowano i synchronizuję dane.","ok")}
    history.replaceState(null,"",SITE()+location.hash);
  }
  renderAcct();
}
function initCloud(){
  if(IN_CLAUDE)return;
  renderAcct();
  if(lsGet(LS_OWNER)){mode="cloud";loadPending();setStatus(navigator.onLine===false?"offline":"sync")}
  if(!window.supabase){if(mode==="cloud")setStatus("offline");return}
  sb=supabase.createClient(SB_URL,SB_KEY,{auth:{flowType:"pkce",persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:"life-auth"}});
  sb.auth.onAuthStateChange((ev,session)=>setTimeout(()=>onAuth(ev,session),0));
  window.addEventListener("online",()=>{if(mode==="cloud"&&sbUser)pull(false).then(flush)});
  window.addEventListener("offline",()=>{if(mode==="cloud")setStatus("offline")});
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&mode==="cloud"&&sbUser)pull(false).then(flush)});
  setInterval(()=>{if(mode==="cloud"&&sbUser&&pending.size)flush()},30000);
}
$("#authForm").addEventListener("submit",async e=>{e.preventDefault();
  if(!sb){acctMsg("Logowanie wymaga połączenia z internetem.","err");return}
  const email=$("#authEmail").value.trim(),password=$("#authPass").value,btn=$("#authSubmit");
  if(password.length<8){acctMsg("Hasło musi mieć co najmniej 8 znaków.","err");$("#authPass").focus();return}
  btn.disabled=true;acctMsg(authMode==="in"?"Loguję…":"Zakładam konto…");
  try{
    if(authMode==="in"){const{error}=await sb.auth.signInWithPassword({email,password});
      if(error)acctMsg(authErr(error),"err");else{$("#authPass").value="";acctMsg("Zalogowano. Synchronizuję dane…","ok")}}
    else{const{data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:SITE()}});
      if(error)acctMsg(authErr(error),"err");
      else if(data.session){$("#authPass").value="";acctMsg("Konto założone. Synchronizuję dane…","ok")}
      else{$("#authPass").value="";authMode="in";renderAcct();acctMsg(`Wysłaliśmy link potwierdzający na ${email}. Kliknij go (może być w dowolnej przeglądarce), a potem zaloguj się tutaj hasłem. Sprawdź też folder spam.`,"ok")}}
  }finally{btn.disabled=false}
});
$("#newPassForm").addEventListener("submit",async e=>{e.preventDefault();const pw=$("#newPass").value;
  if(pw.length<8){acctMsg("Hasło musi mieć co najmniej 8 znaków.","err");return}
  const{error}=await sb.auth.updateUser({password:pw});
  if(error)acctMsg(authErr(error),"err");else{$("#newPass").value="";$("#newPassForm").hidden=true;acctMsg("Hasło zmienione.","ok")}});

/* ---------- selectors ---------- */
const all=()=>[...items].map(([id,v])=>({id,...v}));
const ofKind=k=>all().filter(x=>x.kind===k);
const tasks=()=>ofKind("task"), events=()=>ofKind("event").sort((a,b)=>(a.date+(a.time||"99")).localeCompare(b.date+(b.time||"99")));
const txs=()=>ofKind("tx"), habits=()=>ofKind("habit").sort((a,b)=>a.created-b.created);
const notes=()=>ofKind("note").sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||b.updated-a.updated);
const budget=()=>items.get("settings")?.budget||0;
const tcmp=(a,b)=>(a.date||"9999").localeCompare(b.date||"9999")||a.prio.localeCompare(b.prio)||a.created-b.created;
function monthTotals(m){let inc=0,out=0;const cats={};for(const t of txs())if(t.date.startsWith(m)){if(t.type==="in")inc+=t.amount;else{out+=t.amount;cats[t.cat]=(cats[t.cat]||0)+t.amount}}return{inc,out,cats}}
/* ---------- recurring payments ---------- */
const FREQ={weekly:"co tydzień",monthly:"co miesiąc",quarterly:"co kwartał",yearly:"co rok"};
const PERM={weekly:52/12,monthly:1,quarterly:1/3,yearly:1/12};
const recs=()=>ofKind("rec").sort((a,b)=>a.name.localeCompare(b.name,"pl"));
function occ(r,i){const s=parse(r.start);if(r.freq==="weekly")return addDays(s,7*i);
  const mo=s.getMonth()+({monthly:1,quarterly:3,yearly:12}[r.freq]||1)*i,last=new Date(s.getFullYear(),mo+1,0).getDate();
  return new Date(s.getFullYear(),mo,Math.min(s.getDate(),last))}
function occBetween(r,a,b){const o=[];for(let i=0;i<5000;i++){const d=iso(occ(r,i));if(d>b)break;if(d>=a)o.push(d)}return o}
function trackFrom(r){const lim=iso(addDays(today,-90));return[r.since||r.start,lim].sort()[1]}
function dueList(days){const to=iso(addDays(today,days)),out=[];
  for(const r of recs())if(r.active!==false)for(const d of occBetween(r,trackFrom(r),to))if(!(r.paid||{})[d])out.push({r,d});
  return out.sort((a,b)=>a.d.localeCompare(b.d)||a.r.name.localeCompare(b.r.name,"pl"))}
function nextDue(r){const to=iso(addDays(today,800));for(const d of occBetween(r,trackFrom(r),to))if(!(r.paid||{})[d])return d;return null}
function monthRec(m){const a=m+"-01",b=iso(new Date(+m.slice(0,4),+m.slice(5,7),0));let total=0,unpaid=0;
  for(const r of recs())if(r.active!==false)for(const d of occBetween(r,a,b)){total+=r.amount;if(!(r.paid||{})[d]&&d>=trackFrom(r))unpaid+=r.amount}
  return{total,unpaid}}
function inDays(k){const n=Math.round((parse(k)-today)/864e5);return n<0?`${-n} ${plural(-n,"dzień","dni","dni")} po terminie`:n===0?"dziś":n===1?"jutro":`za ${n} dni`}
function streak(h){const c=h.checks||{};let d=c[T]?today:addDays(today,-1),n=0;while(c[iso(d)]){n++;d=addDays(d,-1)}return n}

/* ---------- routing ---------- */
const VIEWS=["start","kalendarz","zadania","finanse","nawyki","notatki"];
function route(){
  let v=location.hash.slice(1);
  if(v==="finanse-cykliczne"){v="finanse";ui.finTab="rec"}else if(v==="finanse")ui.finTab="ov";
  ui.view=VIEWS.includes(v)?v:"start";
  $$("[data-view]").forEach(s=>s.hidden=s.dataset.view!==ui.view);
  $$("[data-nav]").forEach(a=>a.dataset.nav===ui.view?a.setAttribute("aria-current","page"):a.removeAttribute("aria-current"));
  render();window.scrollTo(0,0);
}
window.addEventListener("hashchange",route);

/* ---------- render ---------- */
function render(){({start:rStart,kalendarz:rCal,zadania:rTasks,finanse:rFin,nawyki:rHab,notatki:rNotes})[ui.view]()}

function taskItem(t,showDate){
  const late=t.date&&t.date<T&&!t.done;
  return `<li class="item${t.done?" done":""}">
    <input type="checkbox" id="c-${t.id}" data-act="toggle" data-id="${t.id}"${t.done?" checked":""}>
    <label class="t" for="c-${t.id}">${esc(t.title)}</label>
    <span class="meta">${showDate&&t.date?`<span class="when${late?" late":""}">${dayLabel(t.date)}</span>`:""}<span class="prio p${t.prio}" title="Priorytet ${t.prio}">${t.prio}</span>${showDate==="full"?`<button class="icon" data-act="del" data-id="${t.id}" aria-label="Usuń zadanie" title="Usuń">×</button>`:""}</span></li>`;
}
function miniMonth(base){
  const first=new Date(base.getFullYear(),base.getMonth(),1),start=monday(first),evd=new Set(events().map(e=>e.date));
  let h=SH.map(s=>`<span class="h">${s}</span>`).join("");
  const last=new Date(base.getFullYear(),base.getMonth()+1,0),cells=Math.ceil((wd(first)+last.getDate())/7)*7;
  for(let i=0;i<cells;i++){const d=addDays(start,i),k=iso(d);
    h+=`<span class="d${d.getMonth()!==base.getMonth()?" out":""}${k===T?" today":""}${evd.has(k)?" has":""}">${d.getDate()}</span>`}
  return `<div class="mini">${h}</div>`;
}

function rStart(){
  const h=new Date().getHours();
  $("#greet").textContent=h<5?"Dobranoc":h<18?"Dzień dobry":"Dobry wieczór";
  $("#hDate").textContent=`${DAYS[wd(today)]}, ${today.getDate()} ${MON[today.getMonth()]} · tydzień ${isoWeek(today)}`;
  const tT=tasks().filter(t=>t.date===T),open=tT.filter(t=>!t.done).length,evT=events().filter(e=>e.date===T).length;
  const m=ym(today),{out}=monthTotals(m),b=budget();
  $("#hSummary").textContent=items.size?`Dziś masz ${open} ${plural(open,"zadanie","zadania","zadań")} do zrobienia i ${evT} ${plural(evT,"wydarzenie","wydarzenia","wydarzeń")}. W ${MONL[today.getMonth()]} wydano ${money0(out)}${b?` z ${money0(b)} budżetu`:""}.`:"Twój plan dnia, pieniądze i nawyki w jednym miejscu.";
  $("#homeEmpty").hidden=items.size>0;
  $("#exTools").hidden=!all().some(x=>x.ex);

  // calendar widget
  const up=events().filter(e=>e.date>=T).slice(0,3);
  $("#wCal").innerHTML=`<div style="display:grid;gap:12px">${miniMonth(today)}
    <div style="display:grid;gap:6px"><span class="label">Najbliższe</span>${up.length?up.map(e=>`<div class="ev"><span class="k">${dayLabel(e.date)}${e.time?" "+e.time:""}</span><span><i class="cdot c-${e.cat}"></i>${esc(e.title)}</span></div>`).join(""):`<span class="muted">Brak zaplanowanych wydarzeń.</span>`}</div></div>`;

  // tasks widget
  const wt=tasks().filter(t=>t.date&&t.date<=T&&(!t.done||t.date===T)).sort((a,b)=>(a.done-b.done)||tcmp(a,b));
  const dn=tT.filter(t=>t.done).length;
  $("#wTasks").innerHTML=wt.length?`<div class="label">${dn} z ${tT.length} na dziś zrobione</div><ul class="list">${wt.slice(0,6).map(t=>taskItem(t,true)).join("")}</ul>${wt.length>6?`<span class="muted">i ${wt.length-6} więcej</span>`:""}`:`<p class="muted">Nic na dziś. Dodaj zadanie w zakładce Zadania.</p>`;

  // finance widget
  const{inc}=monthTotals(m),bal=inc-out,pct=b?Math.min(100,out/b*100):0,last=txs().sort((a,b)=>b.date.localeCompare(a.date)||b.created-a.created).slice(0,3);
  $("#wFin").innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px">
    <div style="display:grid;gap:8px;align-content:start"><span class="label">Saldo · ${MONN[today.getMonth()].toLowerCase()}</span><span class="big num ${bal<0?"neg":""}">${money0(bal)}</span>
      ${b?`<div class="meter${pct>=100?" over":pct>=80?" warn":""}"><i style="width:${pct}%"></i></div><span class="muted num" style="font-size:.88rem">Wydano ${money0(out)} z ${money0(b)}</span>`:`<span class="muted" style="font-size:.88rem">Wydano ${money0(out)}. Ustaw budżet w zakładce Finanse.</span>`}</div>
    <div style="display:grid;gap:4px;align-content:start"><span class="label">Ostatnie</span>${last.length?last.map(t=>`<div class="tx" style="grid-template-columns:minmax(0,1fr) auto"><span class="d"><span>${esc(t.note||t.cat)}</span><span class="when">${dayLabel(t.date)} · ${esc(t.cat)}</span></span><span class="amt ${t.type==="in"?"pos":""}">${t.type==="in"?"+":"−"}${money(t.amount)}</span></div>`).join(""):`<span class="muted">Brak transakcji.</span>`}</div></div>`;
  const nd=dueList(30),lateN=nd.filter(x=>x.d<T).length;
  if(nd.length)$("#wFin").innerHTML+=`<a class="wnext" href="#finanse-cykliczne" style="text-decoration:none;color:inherit"><span><span class="label">Najbliższa płatność</span><br>${esc(nd[0].r.name)} · <span class="${nd[0].d<T?"neg":""}">${inDays(nd[0].d)}</span>${lateN>1?` <span class="badge late">${lateN} po terminie</span>`:""}</span><span class="amt">${money(nd[0].r.amount)}</span></a>`;

  // habits widget
  const hs=habits();
  $("#wHab").innerHTML=hs.length?`<div class="label">Dziś</div><div>${hs.map(x=>{const on=!!(x.checks||{})[T];return`<div class="hrow"><span>${esc(x.name)}</span><button class="hc" data-act="habit" data-id="${x.id}" data-date="${T}" aria-pressed="${on}" aria-label="${esc(x.name)} dziś">${on?"✓":""}</button></div>`}).join("")}</div>`:`<p class="muted">Dodaj pierwszy nawyk.</p>`;

  // notes widget
  const ns=notes().slice(0,3);
  $("#wNotes").innerHTML=ns.length?`<div class="ngrid">${ns.map(n=>`<div class="ncard">${n.pinned?`<span class="pin">Przypięta</span>`:""}<b>${esc(n.title||"Bez tytułu")}</b><p>${esc(n.body||"")}</p></div>`).join("")}</div>`:`<p class="muted">Brak notatek.</p>`;
}

function rCal(){
  const base=ui.calMonth,first=new Date(base.getFullYear(),base.getMonth(),1),start=monday(first);
  const last=new Date(base.getFullYear(),base.getMonth()+1,0),cells=Math.ceil((wd(first)+last.getDate())/7)*7;
  $("#calMonth").textContent=`${MONN[base.getMonth()]} ${base.getFullYear()}`;
  const ev=events(),ts=tasks(),pays={};
  for(const r of recs())if(r.active!==false)for(const d of occBetween(r,iso(start),iso(addDays(start,cells-1))))(pays[d]=pays[d]||[]).push(r);
  let h=SH.map(s=>`<span class="h">${s}</span>`).join("");
  for(let i=0;i<cells;i++){const d=addDays(start,i),k=iso(d),de=ev.filter(e=>e.date===k),dt=ts.filter(t=>t.date===k&&!t.done).length,dp=(pays[k]||[]).length;
    h+=`<button class="cell${d.getMonth()!==base.getMonth()?" out":""}${k===T?" today":""}" data-act="calPick" data-date="${k}" aria-pressed="${k===ui.calSel}" aria-label="${d.getDate()} ${MON[d.getMonth()]}: ${de.length} wydarzeń, ${dt} zadań">
      <span class="n">${d.getDate()}</span><span class="chips">${de.slice(0,6).map(e=>`<i class="cdot c-${e.cat}"></i>`).join("")}${dp?`<i class="cdot c-pay" title="Płatność"></i>`:""}</span>${dt?`<span class="tc">${dt} zad.</span>`:""}</button>`}
  $("#calGrid").innerHTML=h;
  const sd=parse(ui.calSel);
  $("#calDayRel").textContent=DAYS[wd(sd)];
  $("#calDayTitle").textContent=`${sd.getDate()} ${MON[sd.getMonth()]} ${sd.getFullYear()}`;
  const de=ev.filter(e=>e.date===ui.calSel),dt=ts.filter(t=>t.date===ui.calSel).sort(tcmp),dp=recs().filter(r=>r.active!==false&&occBetween(r,ui.calSel,ui.calSel).length);
  $("#calDayList").innerHTML=(de.length||dt.length||dp.length)?`<div class="group">${dp.length?`<span class="label">Płatności</span><ul class="list">${dp.map(r=>{const paid=(r.paid||{})[ui.calSel];return`<li class="item"><i class="cdot c-pay"></i><a class="t" href="#finanse-cykliczne" style="color:inherit;text-decoration:none">${esc(r.name)}${paid?' <span class="badge off">zapłacono</span>':""}</a><span class="amt">${money(r.amount)}</span></li>`}).join("")}</ul>`:""}${de.length?`<span class="label">Wydarzenia</span><ul class="list">${de.map(e=>`<li class="item"><span class="when">${e.time||"cały dzień"}</span><span class="t" style="cursor:default"><i class="cdot c-${e.cat}"></i>${esc(e.title)}</span><button class="icon" data-act="del" data-id="${e.id}" aria-label="Usuń wydarzenie" title="Usuń">×</button></li>`).join("")}</ul>`:""}
    ${dt.length?`<span class="label">Zadania</span><ul class="list">${dt.map(t=>taskItem(t,false)).join("")}</ul>`:""}</div>`:`<p class="muted">Nic tego dnia.</p>`;
}

function rTasks(){
  $$('[data-act="tf"]').forEach(b=>b.setAttribute("aria-pressed",b.dataset.f===ui.tf));
  if(!$("#tDate").value)$("#tDate").value=T;
  const ts=tasks();let groups;
  if(ui.tf==="done"){const d=ts.filter(t=>t.done).sort((a,b)=>(b.date||"").localeCompare(a.date||""));groups=[["Zrobione",d]]}
  else{const a=ts.filter(t=>!t.done),wEnd=iso(addDays(monday(today),6));
    groups=[["Zaległe",a.filter(t=>t.date&&t.date<T)],["Dziś",a.filter(t=>t.date===T)],["Ten tydzień",a.filter(t=>t.date>T&&t.date<=wEnd)],["Później",a.filter(t=>t.date>wEnd)],["Kiedyś",a.filter(t=>!t.date)]]}
  const html=groups.filter(g=>g[1].length).map(([n,l])=>`<div class="group"><span class="label"${n==="Zaległe"?' style="color:var(--red)"':""}>${n} · ${l.length}</span><ul class="list">${l.sort(tcmp).map(t=>taskItem(t,"full")).join("")}</ul></div>`).join("");
  $("#taskGroups").innerHTML=html||`<p class="muted">${ui.tf==="done"?"Nie ma jeszcze zrobionych zadań.":"Wszystko zrobione. Dodaj nowe zadanie powyżej."}</p>`;
}

function rFin(){
  const isRec=ui.finTab==="rec";
  $("#finRec").hidden=!isRec;$("#finOv").hidden=isRec;$("#finNav").hidden=isRec;
  $("#finTabOv").removeAttribute("aria-current");$("#finTabRec").removeAttribute("aria-current");
  $(isRec?"#finTabRec":"#finTabOv").setAttribute("aria-current","page");
  isRec?rRec():rFinOv();
}
function rRec(){
  const rs=recs(),act=rs.filter(r=>r.active!==false),perM=act.reduce((s,r)=>s+r.amount*PERM[r.freq],0);
  const m=ym(today),mr=monthRec(m),due=dueList(30),late=due.filter(x=>x.d<T);
  $("#recStats").innerHTML=`<div class="stat"><span class="label">Miesięcznie średnio</span><span class="big num">${money0(perM)}</span><span class="muted" style="font-size:.85rem">${act.length} ${plural(act.length,"aktywna płatność","aktywne płatności","aktywnych płatności")}</span></div>
    <div class="stat"><span class="label">Rocznie</span><span class="big num">${money0(perM*12)}</span></div>
    <div class="stat"><span class="label">${MONN[today.getMonth()]}: do zapłaty</span><span class="big num ${late.length?"neg":""}">${money0(mr.unpaid)}</span><span class="muted" style="font-size:.85rem">z ${money0(mr.total)} w tym miesiącu${late.length?` · ${late.length} po terminie`:""}</span></div>`;
  $("#recDue").innerHTML=due.length?due.map(({r,d})=>`<li class="rec"><span class="d"><b>${esc(r.name)}</b><span class="when${d<T?" late":""}">${d===T?"Dziś":`${parse(d).getDate()} ${MON[parse(d).getMonth()]}`} · ${inDays(d)}</span></span>
      <span class="amt">${money(r.amount)}</span><span class="acts"><button class="paybtn" data-act="recPay" data-id="${r.id}" data-due="${d}">Zapłacono</button></span></li>`).join("")
    :`<li class="muted">${rs.length?"Nic do zapłaty w najbliższych 30 dniach.":"Dodaj pierwszą płatność cykliczną, np. czynsz albo internet."}</li>`;
  $("#recAll").innerHTML=rs.length?rs.map(r=>{const nd=r.active!==false?nextDue(r):null,off=r.active===false;
    const badge=off?`<span class="badge off">wstrzymana</span>`:nd&&nd<T?`<span class="badge late">po terminie</span>`:nd&&nd<=iso(addDays(today,3))?`<span class="badge soon">${inDays(nd)}</span>`:"";
    return`<li class="rec${off?" paused":""}"><span class="d"><b>${esc(r.name)} ${badge}</b><span class="when">${FREQ[r.freq]} · ${esc(r.cat)}${nd?` · następny termin ${parse(nd).getDate()} ${MON[parse(nd).getMonth()]}`:""}</span></span>
      <span class="amt">${money(r.amount)}</span><span class="acts">
      <button class="icon" data-act="recEdit" data-id="${r.id}" title="Edytuj" aria-label="Edytuj ${esc(r.name)}">✎</button>
      <button class="icon" data-act="recToggle" data-id="${r.id}" title="${off?"Wznów":"Wstrzymaj"}" aria-label="${off?"Wznów":"Wstrzymaj"} ${esc(r.name)}">${off?"▶":"⏸"}</button>
      <button class="icon" data-act="del" data-id="${r.id}" title="Usuń" aria-label="Usuń ${esc(r.name)}">×</button></span></li>`}).join(""):`<li class="muted">Brak płatności cyklicznych.</li>`;
  const sel=$("#recCat");if(!sel.options.length)sel.innerHTML=CAT_OUT.map(c=>`<option>${c}</option>`).join("");
  if(!$("#recStart").value)$("#recStart").value=T;
  $("#recFormTitle").textContent=ui.recEdit?"Edytuj płatność":"Nowa płatność cykliczna";
  $("#recSubmit").textContent=ui.recEdit?"Zapisz zmiany":"Dodaj płatność";$("#recCancel").hidden=!ui.recEdit;
}
function rFinOv(){
  const m=ym(ui.finMonth),{inc,out,cats}=monthTotals(m),bal=inc-out,b=budget();
  $("#finMonth").textContent=`${MONN[ui.finMonth.getMonth()]} ${ui.finMonth.getFullYear()}`;
  $("#finStats").innerHTML=`<div class="stat"><span class="label">Przychody</span><span class="big num pos">${money0(inc)}</span></div>
    <div class="stat"><span class="label">Wydatki</span><span class="big num">${money0(out)}</span></div>
    <div class="stat"><span class="label">Saldo</span><span class="big num ${bal<0?"neg":""}">${money0(bal)}</span></div>`;
  const pct=b?out/b*100:0;
  $("#finBudget").innerHTML=b?`<div class="meter${pct>=100?" over":pct>=80?" warn":""}"><i style="width:${Math.min(100,pct)}%"></i></div>
    <span class="num">${money0(out)} z ${money0(b)} · ${pct>=100?`przekroczono o ${money0(out-b)}`:`zostało ${money0(b-out)}`}</span>`:`<span class="muted">Nie ustawiono limitu wydatków.</span>`;
  const mr=monthRec(m);
  if(mr.total)$("#finBudget").innerHTML+=`<span class="muted num" style="font-size:.9rem">Płatności cykliczne w tym miesiącu: ${money0(mr.total)}${mr.unpaid?`, w tym ${money0(mr.unpaid)} jeszcze do zapłaty. Prognoza wydatków: ${money0(out+mr.unpaid)}${b?` z ${money0(b)}`:""}.`:", wszystkie zapłacone."} <a href="#finanse-cykliczne">Zobacz</a></span>`;
  if(document.activeElement!==$("#budgetIn"))$("#budgetIn").value=b?String(b).replace(".",","):"";
  const ce=Object.entries(cats).sort((a,b)=>b[1]-a[1]),max=ce.length?ce[0][1]:1;
  $("#finBars").innerHTML=ce.length?ce.map(([c,v])=>`<div class="bar"><span>${esc(c)}</span><span class="tr"><i style="width:${v/max*100}%"></i></span><span class="v">${money(v)}</span></div>`).join(""):`<p class="muted">Brak wydatków w tym miesiącu.</p>`;
  const list=txs().filter(t=>t.date.startsWith(m)).sort((a,b)=>b.date.localeCompare(a.date)||b.created-a.created);
  $("#finList").innerHTML=list.length?list.map(t=>`<li class="tx"><span class="d"><span>${esc(t.note||t.cat)}</span><span class="when">${parse(t.date).getDate()} ${MON[parse(t.date).getMonth()]} · ${esc(t.cat)}</span></span>
    <span class="amt ${t.type==="in"?"pos":""}">${t.type==="in"?"+":"−"}${money(t.amount)}</span><button class="icon" data-act="del" data-id="${t.id}" aria-label="Usuń transakcję" title="Usuń">×</button></li>`).join(""):`<li class="muted">Brak transakcji w tym miesiącu.</li>`;
  $$('[data-act="txType"]').forEach(b=>b.setAttribute("aria-pressed",b.dataset.t===ui.txType));
  const cs=ui.txType==="in"?CAT_IN:CAT_OUT,sel=$("#txCat");
  if(sel.dataset.t!==ui.txType){sel.innerHTML=cs.map(c=>`<option>${c}</option>`).join("");sel.dataset.t=ui.txType}
  if(!$("#txDate").value)$("#txDate").value=T;
}

function rHab(){
  const ws=ui.habWeek,we=addDays(ws,6);
  $("#habWeek").textContent=`Tydzień ${isoWeek(ws)} · ${ws.getDate()}.${pad(ws.getMonth()+1)}–${we.getDate()}.${pad(we.getMonth()+1)}`;
  const hs=habits();
  if(!hs.length){$("#habTable").innerHTML=`<p class="muted">Nie masz jeszcze nawyków. Dodaj pierwszy poniżej i odhaczaj go codziennie.</p>`;return}
  let h=`<table><thead><tr><th class="l">Nawyk</th>${SH.map((s,i)=>`<th>${s}<br>${addDays(ws,i).getDate()}</th>`).join("")}<th>Seria</th><th class="l">Ostatnie 30 dni</th><th></th></tr></thead><tbody>`;
  for(const x of hs){const c=x.checks||{};
    h+=`<tr><td class="n">${esc(x.name)}</td>`;
    for(let i=0;i<7;i++){const k=iso(addDays(ws,i)),on=!!c[k],fut=k>T;
      h+=`<td><button class="hc${k===T?" td":""}" data-act="habit" data-id="${x.id}" data-date="${k}" aria-pressed="${on}" aria-label="${esc(x.name)}, ${DAYS[i]}"${fut?' disabled style="opacity:.35;cursor:default"':""}>${on?"✓":""}</button></td>`}
    let strip="",cnt=0;for(let i=29;i>=0;i--){const on=!!c[iso(addDays(today,-i))];cnt+=on;strip+=`<i class="${on?"on":""}"></i>`}
    const s=streak(x);
    h+=`<td><span class="streak"><b>${s}</b> ${plural(s,"dzień","dni","dni")}</span></td><td><div class="strip" title="${cnt} z 30 dni">${strip}</div></td>
      <td><button class="icon" data-act="del" data-id="${x.id}" aria-label="Usuń nawyk ${esc(x.name)}" title="Usuń">×</button></td></tr>`}
  $("#habTable").innerHTML=h+"</tbody></table>";
}

function rNotes(){
  const ns=notes();
  if(ui.note&&!items.has(ui.note))ui.note=null;
  $("#noteList").innerHTML=ns.length?ns.map(n=>`<button class="ncard" data-act="openNote" data-id="${n.id}" aria-current="${n.id===ui.note}">${n.pinned?`<span class="pin">Przypięta</span>`:""}<b>${esc(n.title||"Bez tytułu")}</b><p>${esc(n.body||"Pusta notatka")}</p></button>`).join(""):`<p class="muted">Brak notatek.</p>`;
  const n=ui.note&&items.get(ui.note);
  $("#noteEditor").hidden=!n;$("#noteEmpty").hidden=!!n;
  if(n){
    if(document.activeElement!==$("#nTitle"))$("#nTitle").value=n.title||"";
    if(document.activeElement!==$("#nBody"))$("#nBody").value=n.body||"";
    const u=new Date(n.updated);
    $("#noteMeta").textContent=`Edytowano ${u.getDate()} ${MON[u.getMonth()]}, ${pad(u.getHours())}:${pad(u.getMinutes())}`;
    $("#pinBtn").textContent=n.pinned?"Odepnij":"Przypnij";
  }
}

/* ---------- interactions ---------- */
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-act]");
  if(!b){const w=e.target.closest(".widget");if(w&&!e.target.closest("a,button,input,label,select,textarea"))location.hash=w.dataset.go;return}
  if(b.type==="checkbox")return;
  const id=b.dataset.id,it=id&&items.get(id);
  const A={
    del:()=>del(id),
    habit:()=>{if(!it)return;const c={...(it.checks||{})};c[b.dataset.date]?delete c[b.dataset.date]:c[b.dataset.date]=true;put(id,{...it,checks:c})},
    examples:loadExamples,
    clearEx:async()=>{for(const x of all().filter(x=>x.ex))await del(x.id)},
    calPrev:()=>{ui.calMonth=new Date(ui.calMonth.getFullYear(),ui.calMonth.getMonth()-1,1);render()},
    calNext:()=>{ui.calMonth=new Date(ui.calMonth.getFullYear(),ui.calMonth.getMonth()+1,1);render()},
    calToday:()=>{ui.calMonth=new Date(today.getFullYear(),today.getMonth(),1);ui.calSel=T;render()},
    calPick:()=>{ui.calSel=b.dataset.date;const d=parse(ui.calSel);if(d.getMonth()!==ui.calMonth.getMonth())ui.calMonth=new Date(d.getFullYear(),d.getMonth(),1);render()},
    tf:()=>{ui.tf=b.dataset.f;render()},
    finPrev:()=>{ui.finMonth=new Date(ui.finMonth.getFullYear(),ui.finMonth.getMonth()-1,1);render()},
    finNext:()=>{ui.finMonth=new Date(ui.finMonth.getFullYear(),ui.finMonth.getMonth()+1,1);render()},
    txType:()=>{ui.txType=b.dataset.t;render()},
    habPrev:()=>{ui.habWeek=addDays(ui.habWeek,-7);render()},
    habNext:()=>{ui.habWeek=addDays(ui.habWeek,7);render()},
    newNote:()=>{const nid=uid("n");ui.note=nid;put(nid,{kind:"note",title:"",body:"",pinned:false,created:Date.now(),updated:Date.now()});$("#nTitle").focus()},
    openNote:()=>{flushNote();ui.note=id;render();$("#noteEditor").scrollIntoView({block:"nearest"})},
    pinNote:()=>{const n=items.get(ui.note);if(n)put(ui.note,{...n,pinned:!n.pinned})},
    recPay:()=>{if(!it)return;const due=b.dataset.due,tid=uid("x");
      put(tid,{kind:"tx",type:"out",amount:it.amount,cat:it.cat,date:due<=T?due:T,note:it.name,rec:id,created:Date.now(),...(it.ex?{ex:true}:{})},true);
      put(id,{...it,paid:{...(it.paid||{}),[due]:tid}})},
    recEdit:()=>{if(!it)return;ui.recEdit=id;$("#recName").value=it.name;$("#recAmt").value=String(it.amount).replace(".",",");
      $("#recFreq").value=it.freq;render();$("#recCat").value=it.cat;$("#recStart").value=nextDue(it)||it.start;$("#recName").focus()},
    recCancel:resetRecForm,
    recToggle:()=>{if(it)put(id,{...it,active:it.active===false})},
    theme:toggleTheme,
    refresh:refreshPage,
    acct:()=>{const p=$("#acctPanel");p.hidden=!p.hidden;$("#acctBtn").setAttribute("aria-expanded",!p.hidden);$("#backupMsg").textContent="";if(!p.hidden&&!sbUser)$("#authEmail").focus()},
    authMode:()=>{authMode=b.dataset.m;acctMsg("");renderAcct()},
    forgot:async()=>{const email=$("#authEmail").value.trim();
      if(!email){acctMsg("Wpisz adres e-mail, a potem kliknij „Nie pamiętasz hasła?”.","err");$("#authEmail").focus();return}
      if(!sb){acctMsg("Ta funkcja wymaga połączenia z internetem.","err");return}
      const{error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:SITE()});
      acctMsg(error?authErr(error):`Wysłaliśmy link do zmiany hasła na ${email}. Otwórz go na tym urządzeniu, w tej samej przeglądarce.`,error?"err":"ok")},
    signOut:async()=>{if(pending.size&&sbUser)await flush();
      if(pending.size){acctMsg("Część zmian nie została jeszcze wysłana. Połącz się z internetem i spróbuj ponownie.","err");return}
      await sb.auth.signOut();acctMsg("Wylogowano. Dane z konta zostały usunięte z tego urządzenia.","ok")},
    export:()=>{try{const blob=new Blob([JSON.stringify({app:"life",version:1,exported:new Date().toISOString(),items:Object.fromEntries(items)},null,1)],{type:"application/json"});
      const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`life-kopia-${T}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
      $("#backupMsg").textContent=`Pobrano kopię z ${items.size} wpisami.`}catch(e){$("#backupMsg").textContent="Nie udało się utworzyć pliku kopii."}},
    delNote:()=>{if(ui.note){clearTimeout(nT);const x=ui.note;ui.note=null;del(x)}},
  };
  A[b.dataset.act]?.();
});
document.addEventListener("change",e=>{const t=e.target;if(t.dataset.act==="toggle"){const it=items.get(t.dataset.id);if(it)put(t.dataset.id,{...it,done:t.checked})}});

$("#taskForm").addEventListener("submit",e=>{e.preventDefault();const title=$("#tTitle").value.trim();if(!title)return;
  put(uid("t"),{kind:"task",title,date:$("#tDate").value||null,prio:$("#tPrio").value,done:false,created:Date.now()});$("#tTitle").value="";$("#tTitle").focus()});
$("#evForm").addEventListener("submit",e=>{e.preventDefault();const title=$("#evTitle").value.trim();if(!title)return;
  put(uid("e"),{kind:"event",title,date:ui.calSel,time:$("#evTime").value||"",cat:$("#evCat").value,created:Date.now()});$("#evTitle").value="";$("#evTime").value=""});
$("#habForm").addEventListener("submit",e=>{e.preventDefault();const name=$("#habName").value.trim();if(!name)return;
  put(uid("h"),{kind:"habit",name,checks:{},created:Date.now()});$("#habName").value=""});
$("#txForm").addEventListener("submit",e=>{e.preventDefault();const a=parseAmt($("#txAmt").value),err=$("#txErr");
  if(!(a>0)){err.textContent="Wpisz kwotę większą od zera, np. 49,90.";err.hidden=false;$("#txAmt").focus();return}
  err.hidden=true;const date=$("#txDate").value||T;
  put(uid("x"),{kind:"tx",type:ui.txType,amount:a,cat:$("#txCat").value,date,note:$("#txNote").value.trim(),created:Date.now()});
  $("#txAmt").value="";$("#txNote").value="";
  if(!date.startsWith(ym(ui.finMonth))){ui.finMonth=new Date(parse(date).getFullYear(),parse(date).getMonth(),1);render()}});
function resetRecForm(){ui.recEdit=null;$("#recName").value="";$("#recAmt").value="";$("#recFreq").value="monthly";$("#recStart").value=T;$("#recErr").hidden=true;render()}
$("#recForm").addEventListener("submit",e=>{e.preventDefault();const err=$("#recErr"),name=$("#recName").value.trim(),a=parseAmt($("#recAmt").value),start=$("#recStart").value;
  const fail=(m,el)=>{err.textContent=m;err.hidden=false;el.focus()};
  if(!name)return fail("Wpisz nazwę płatności.",$("#recName"));
  if(!(a>0))return fail("Wpisz kwotę większą od zera, np. 69,99.",$("#recAmt"));
  if(!start)return fail("Wybierz najbliższy termin płatności.",$("#recStart"));
  err.hidden=true;const f={name,amount:a,freq:$("#recFreq").value,cat:$("#recCat").value,start};
  if(ui.recEdit){const old=items.get(ui.recEdit);if(old)put(ui.recEdit,{...old,...f,since:[old.since||old.start,start].sort()[0]})}
  else put(uid("r"),{kind:"rec",...f,since:start<T?start:T,active:true,paid:{},created:Date.now()});
  resetRecForm()});
$("#importFile").addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;const msg=$("#backupMsg");
  try{const data=JSON.parse(await f.text());if(!data||data.app!=="life"||typeof data.items!=="object")throw 0;
    const entries=Object.entries(data.items).filter(([k,v])=>v&&typeof v==="object"&&typeof v.kind==="string");
    await putMany(entries);msg.textContent=`Wczytano ${entries.length} wpisów z pliku ${f.name}.`}
  catch(_){msg.textContent="Ten plik nie jest kopią Life. Wybierz plik .json pobrany przyciskiem „Pobierz kopię”."}
  e.target.value=""});
$("#budgetForm").addEventListener("submit",e=>{e.preventDefault();const v=parseAmt($("#budgetIn").value);
  put("settings",{...(items.get("settings")||{kind:"settings"}),budget:v>0?v:0});$("#budgetIn").blur()});

let nT;
function flushNote(){clearTimeout(nT);const id=ui.note,n=id&&items.get(id);if(!n)return;
  const title=$("#nTitle").value,body=$("#nBody").value;if(title===(n.title||"")&&body===(n.body||""))return;
  put(id,{...n,title,body,updated:Date.now(),ex:false});}
["#nTitle","#nBody"].forEach(s=>{$(s).addEventListener("input",()=>{clearTimeout(nT);nT=setTimeout(flushNote,700)});$(s).addEventListener("blur",flushNote)});

async function loadExamples(){
  const D=i=>iso(addDays(today,i)),now=Date.now();let n=0;const W=[];
  const add=(p,o)=>W.push([uid(p),{...o,created:now+n++,ex:true}]);
  [[0,"A","Wysłać ofertę do klienta"],[0,"B","Zapłacić rachunek za prąd"],[0,"C","Oddzwonić do Marka"],[-1,"B","Oddać książki do biblioteki"],
   [1,"A","Przygotować prezentację na czwartek"],[2,"C","Umyć samochód"],[4,"B","Zakupy na weekend"],[9,"B","Przegląd budżetu domowego"]]
   .forEach(([d,prio,title],i)=>add("t",{kind:"task",title,date:D(d),prio,done:i===2}));
  ["Umówić wizytę u dentysty","Kupić prezent dla mamy","Przejrzeć subskrypcje"].forEach(title=>add("t",{kind:"task",title,date:null,prio:"C",done:false}));
  [[0,"18:00","spotkanie","Kolacja z Kasią"],[1,"10:00","praca","Spotkanie projektowe"],[3,"08:15","zdrowie","Badania krwi"],[3,"","praca","Prezentacja dla zarządu"],
   [5,"11:00","dom","Przegląd kotła"],[8,"19:30","spotkanie","Urodziny Tomka"],[13,"17:00","zdrowie","Fizjoterapeuta"],[-3,"16:00","inne","Kurs fotografii"]]
   .forEach(([d,time,cat,title])=>add("e",{kind:"event",title,date:D(d),time,cat}));
  [[-1,"in",7200,"Wynagrodzenie","Pensja"],[-1,"out",2150,"Mieszkanie","Czynsz"],[0,"out",86.4,"Jedzenie","Zakupy spożywcze"],[-2,"out",139,"Transport","Bilet miesięczny"],
   [-3,"out",54.9,"Rozrywka","Kino"],[-4,"out",212.3,"Jedzenie","Zakupy na tydzień"],[-6,"out",89.99,"Zdrowie","Apteka"],[-8,"out",249,"Zakupy","Buty do biegania"],
   [-10,"in",450,"Dodatkowe","Zlecenie: projekt logo"],[-12,"out",64,"Jedzenie","Pizza ze znajomymi"],[-15,"out",180,"Transport","Paliwo"],[-20,"out",39.99,"Rozrywka","Subskrypcja muzyki"]]
   .forEach(([d,type,amount,cat,note])=>add("x",{kind:"tx",type,amount,cat,date:D(d),note}));
  const pat={"Woda 2 l":[1,1,0,1,1,1,0,1,1,1,1,0,1,1],"Czytanie 20 min":[1,0,1,1,0,1,1,1,0,0,1,1,1,0],"Bez telefonu po 22:00":[0,1,1,0,0,1,0,1,1,1,0,0,1,1]};
  for(const[name,p]of Object.entries(pat)){const c={};p.forEach((v,i)=>{if(v)c[D(-(i+1))]=true});add("h",{kind:"habit",name,checks:c})}
  add("n",{kind:"note",title:"Pomysły na prezenty",body:"Mama: książka kucharska, kurs ceramiki.\nTomek: słuchawki, bilety na koncert.",pinned:true,updated:now});
  add("n",{kind:"note",title:"Cele na listopad",body:"Odłożyć 1000 zł.\nPrzeczytać dwie książki.\nBiegać 3 razy w tygodniu.",pinned:false,updated:now-3600e3});
  const rent=W.find(([,o])=>o.note==="Czynsz"),music=W.find(([,o])=>o.note==="Subskrypcja muzyki");
  rent[1].rec="__rent";music[1].rec="__music";
  const recEx=[["__rent","Czynsz",2150,"monthly","Mieszkanie",-1,{[D(-1)]:rent[0]}],["__music","Subskrypcja muzyki",39.99,"monthly","Rozrywka",-20,{[D(-20)]:music[0]}],
    [null,"Siłownia",139,"monthly","Zdrowie",-3,{}],[null,"Internet",69,"monthly","Mieszkanie",5,{}],[null,"Telefon",45,"monthly","Inne",12,{}],
    [null,"Ubezpieczenie samochodu",1240,"yearly","Transport",40,{}],[null,"Kieszonkowe dla Zosi",50,"weekly","Inne",2,{}]];
  for(const[key,name,amount,freq,cat,d,paid]of recEx){const rid=uid("r");
    if(key)for(const w of W)if(w[1].rec===key)w[1].rec=rid;
    W.push([rid,{kind:"rec",name,amount,freq,cat,start:D(d),since:D(Math.min(d,0)),active:true,paid,created:now+n++,ex:true}])}
  W.push(["settings",{kind:"settings",budget:4500,ex:true}]);
  await putMany(W);
}

/* ---------- boot ---------- */
/* ---------- theme ---------- */
const LS_THEME="life.theme",darkMQ=matchMedia("(prefers-color-scheme: dark)");
const curTheme=()=>document.documentElement.dataset.theme||(darkMQ.matches?"dark":"light");
function syncThemeUI(){const dark=curTheme()==="dark",b=$("#themeBtn"),l=dark?"Włącz jasny motyw":"Włącz ciemny motyw";
  b.querySelector("use").setAttribute("href",dark?"#i-sun":"#i-moon");b.setAttribute("aria-label",l);b.title=l;
  const bg=getComputedStyle(document.body).backgroundColor;$$('meta[name="theme-color"]').forEach(m=>m.setAttribute("content",bg))}
function toggleTheme(){const t=curTheme()==="dark"?"light":"dark";document.documentElement.dataset.theme=t;lsSet(LS_THEME,t);syncThemeUI()}
{const t=lsGet(LS_THEME);if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}
darkMQ.addEventListener?.("change",syncThemeUI);

/* ---------- refresh: button + pull down on touch screens ---------- */
function refreshPage(){
  try{flushNote()}catch(e){}
  $("#refreshBtn").classList.add("spin");
  setTimeout(()=>location.reload(),250);
}
(()=>{
  const el=$("#ptr"),txt=$("#ptrTxt"),icon=el.querySelector("svg"),TH=70,MAX=105;
  let y0=null,dy=0,pulling=false;
  const atTop=()=>(document.scrollingElement||document.documentElement).scrollTop<=0;
  const blocked=t=>t.closest("input,textarea,select,.dock,.htable,.acct");
  function show(d){el.hidden=false;el.classList.remove("back");el.style.transform=`translate(-50%,${d}px)`;
    const ready=d>=TH;el.classList.toggle("ready",ready);icon.style.transform=`rotate(${Math.round(d/TH*300)}deg)`;
    txt.textContent=ready?"Puść, aby odświeżyć":"Pociągnij, aby odświeżyć"}
  function reset(){el.classList.add("back");el.style.transform="translate(-50%,0)";el.classList.remove("ready");
    setTimeout(()=>{if(!pulling&&!el.classList.contains("go"))el.hidden=true},200)}
  addEventListener("touchstart",e=>{y0=(e.touches.length===1&&atTop()&&!blocked(e.target))?e.touches[0].clientY:null;dy=0;pulling=false},{passive:true});
  addEventListener("touchmove",e=>{
    if(y0===null)return;
    const d=e.touches[0].clientY-y0;
    if(!pulling&&(d<=6||!atTop())){if(d<0)y0=null;return}
    pulling=true;e.preventDefault();dy=Math.min(MAX,(d-6)*.5);show(dy)},{passive:false});
  const end=()=>{if(!pulling){y0=null;return}pulling=false;y0=null;
    if(dy>=TH){el.classList.add("go");el.style.transform=`translate(-50%,${TH}px)`;txt.textContent="Odświeżam…";refreshPage()}else reset()};
  addEventListener("touchend",end);addEventListener("touchcancel",()=>{pulling=false;y0=null;reset()});
})();

loadLocal();setStatus("local");initCloud();route();syncThemeUI();
(async()=>{
  if(!IN_CLAUDE)return;
  try{
    const[db,user]=await Promise.all([claude.use("db"),claude.use("user")]);
    const id=user?await user.id():null;
    if(!db||!id)return;
    col=db.collection("data/users/"+id);
    const timer=setTimeout(()=>{if(mode!=="db")setStatus("slow")},10000);
    col.onSnapshot(snap=>{
      if(!snap.metadata.fromCache)clearTimeout(timer);
      mode="db";items=new Map(snap.docs.map(d=>[d.id,{...d.data()}]));setStatus("db");render();
    },()=>{clearTimeout(timer);setStatus("error")});
  }catch(e){}
})();
