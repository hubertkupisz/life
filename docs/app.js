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
  if(it&&it.kind==="fuel"){for(const x of txs())if(x.fuel===id&&items.has(x.id)){items.delete(x.id);saveLocal();remoteDel(x.id)}}
  if(it&&it.kind==="tx"&&it.fuel&&items.has(it.fuel)){items.delete(it.fuel);saveLocal();remoteDel(it.fuel)}
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
  const ab=$("#acctBtn"),ini=sbUser&&(sbUser.email||"?").trim()[0].toUpperCase();
  ab.textContent=sbUser?ini:"Zaloguj się";ab.classList.toggle("in",!!sbUser);
  ab.setAttribute("aria-label",sbUser?`Konto: ${sbUser.email||""}`:"Zaloguj się");ab.title=sbUser?`Konto: ${sbUser.email||""}`:"";
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
const VIEWS=["start","kalendarz","zadania","finanse","samochod","nawyki","notatki"];
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
function render(){({start:rStart,kalendarz:rCal,zadania:rTasks,finanse:rFin,samochod:rCar,nawyki:rHab,notatki:rNotes})[ui.view]()}

const PRIO={A:"!!!",B:"!!",C:""},PRION={A:"wysoki",B:"średni",C:"niski"};
function taskItem(t,showDate){
  const late=t.date&&t.date<T&&!t.done;
  return `<li class="item${t.done?" done":""}">
    <input type="checkbox" id="c-${t.id}" data-act="toggle" data-id="${t.id}"${t.done?" checked":""} aria-label="${esc(t.title)}">
    <label class="t" for="c-${t.id}">${esc(t.title)}</label>
    <span class="meta">${showDate&&t.date?`<span class="when${late?" late":""}">${dayLabel(t.date)}</span>`:""}<span class="prio p${t.prio}" title="Priorytet ${PRION[t.prio]}">${PRIO[t.prio]}</span>${showDate==="full"?`<button class="icon" data-act="del" data-id="${t.id}" aria-label="Usuń zadanie" title="Usuń">×</button>`:""}</span></li>`;
}
/* spending per day for the last 7 days, recurring payments left out */
function spend7(){
  const days=[];for(let i=6;i>=0;i--){const d=addDays(today,-i);days.push({k:iso(d),d,v:0})}
  for(const t of txs())if(t.type==="out"&&!t.rec){const x=days.find(z=>z.k===t.date);if(x)x.v+=t.amount}
  return days;
}
function chart7(H,wide){
  const days=spend7(),max=Math.max(0,...days.map(d=>d.v)),top=days.reduce((a,b)=>b.v>a.v?b:a,days[0]);
  const desc=max?`Wydatki z ostatnich 7 dni bez płatności cyklicznych. Najwięcej ${money0(max)} (${DAYS[wd(top.d)].toLowerCase()}), dziś ${money0(days[6].v)}.`:"Brak wydatków w ostatnich 7 dniach.";
  const bars=days.map(d=>`<span class="${d.k===T?"now":""}" style="height:${max&&d.v?Math.max(4,Math.round(d.v/max*H)):3}px" title="${DAYS[wd(d.d)]}: ${money(d.v)}"></span>`).join("");
  const labels=days.map(d=>`<span class="${d.k===T?"now":""}">${SH[wd(d.d)]}</span>`).join("");
  return `<figure class="c7${wide?" wide":""}" role="img" aria-label="${desc}"><div class="c7h"><span class="label">Ostatnie 7 dni</span><span class="c7m">${max?"maks. "+money0(max):"brak wydatków"}</span></div>
    <div class="c7b" style="height:${H+2}px" aria-hidden="true">${bars}</div><div class="c7l" aria-hidden="true">${labels}</div></figure>`;
}
function ring(frac,done){const C=113.1,v=Math.max(0,Math.min(1,frac))*C;
  return `<svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18" fill="none" stroke="var(--ring-bg)" stroke-width="5"/>${v>0?`<circle cx="22" cy="22" r="18" fill="none" stroke="var(--purple-f)" stroke-width="5" stroke-dasharray="${v.toFixed(1)} ${C}" stroke-linecap="round" transform="rotate(-90 22 22)"/>`:""}${done?`<path d="M15 22.5l4.5 4.5L29 17.5" fill="none" stroke="var(--purple-f)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`:""}</svg>`}

function rStart(){
  const h=new Date().getHours();
  const nm=(items.get("settings")||{}).name||"";
  $("#greet").textContent=nm?`Cześć, ${nm}`:"Cześć!";
  $("#nameAsk").hidden=!!nm;
  if(document.activeElement!==$("#nameIn"))$("#nameIn").value=nm;
  $("#hDate").textContent=`${DAYS[wd(today)]}, ${today.getDate()} ${MON[today.getMonth()]} · Tydzień ${isoWeek(today)}`;
  const tT=tasks().filter(t=>t.date===T),open=tT.filter(t=>!t.done).length,evT=events().filter(e=>e.date===T);
  const m=ym(today),{inc,out}=monthTotals(m),b=budget();
  const bits=[];
  bits.push(open?`${open} ${plural(open,"zadanie","zadania","zadań")} na dziś`:"Wszystkie dzisiejsze zadania zrobione");
  if(evT.length)bits.push(evT[0].time?`${evT[0].title} o ${evT[0].time}`:evT[0].title);
  if(b)bits.push(`wydano ${Math.round(out/b*100)}% budżetu`);
  $("#hSummary").textContent=items.size?bits.join(", ").replace(/^./,c=>c.toUpperCase())+".":"Twój plan dnia, pieniądze i nawyki w jednym miejscu.";
  $("#homeEmpty").hidden=items.size>0;
  $("#exTools").hidden=!all().some(x=>x.ex);

  // calendar
  $("#wDay").textContent=DAYS[wd(today)];
  const up=events().filter(e=>e.date>=T).slice(0,3);
  $("#wCal").innerHTML=`<div class="wdate num">${today.getDate()}</div>
    <div style="display:grid;gap:10px">${up.length?up.map(e=>`<div class="ev"><i class="cdot c-${e.cat}"></i><span><b>${esc(e.title)}</b><span class="k">${dayLabel(e.date)}${e.time?", "+e.time:""}</span></span></div>`).join(""):`<span class="muted" style="font-size:.92rem">Brak zaplanowanych wydarzeń.</span>`}</div>`;

  // tasks
  const wt=tasks().filter(t=>t.date&&t.date<=T&&(!t.done||t.date===T)).sort((a,b)=>(a.done-b.done)||tcmp(a,b));
  const late=tasks().filter(t=>t.date&&t.date<T&&!t.done).length;
  $("#wTasksCount").textContent=open+late||"";
  $("#wTasks").innerHTML=wt.length?`<div>${wt.slice(0,5).map(t=>`<label class="wrow${t.done?" done":""}"><input type="checkbox" data-act="toggle" data-id="${t.id}"${t.done?" checked":""}><span class="t">${esc(t.title)}</span><span class="prio p${t.prio}" title="Priorytet ${PRION[t.prio]}">${PRIO[t.prio]}</span></label>`).join("")}</div>
    ${wt.length>5?`<span class="wfoot">i ${wt.length-5} więcej</span>`:""}${late?`<span class="wfoot late">${late} ${plural(late,"zaległe","zaległe","zaległych")} z poprzednich dni</span>`:""}`
    :`<p class="muted" style="font-size:.92rem">Nic na dziś. Dodaj zadanie w zakładce Zadania.</p>`;

  // finance
  $("#wFinTitle").textContent=`Finanse · ${MONN[today.getMonth()].toLowerCase()}`;
  const bal=inc-out,pct=b?out/b*100:0;
  let fin=`<div class="finrow"><div class="finl">
      <div style="display:grid;gap:2px"><span class="label">Saldo</span><span class="big num${bal<0?" neg":""}">${money0(bal)}</span></div>
      <div class="inout"><div><span class="label">Przychody</span><b class="num pos">+${money0(inc)}</b></div><div><span class="label">Wydatki</span><b class="num">−${money0(out)}</b></div></div>
      ${b?`<div style="display:grid;gap:6px"><div class="meter${pct>=100?" over":pct>=80?" warn":""}"><i style="width:${Math.min(100,pct)}%"></i></div><span class="muted num" style="font-size:.85rem">Wydano ${money0(out)} z ${money0(b)} budżetu</span></div>`:`<span class="muted" style="font-size:.85rem">Ustaw miesięczny budżet w zakładce Finanse.</span>`}
    </div>${chart7(96)}</div>`;
  const nd=dueList(30),lateN=nd.filter(x=>x.d<T).length;
  if(nd.length){const x=nd[0];fin+=`<a class="wnext" href="#finanse-cykliczne"><span class="chip" style="background:var(--orange-f);width:30px;height:30px;border-radius:9px"><svg class="i"><use href="#i-repeat"/></svg></span><span><b>${esc(x.r.name)}</b><small class="${x.d<T?"neg":""}">Płatność cykliczna · ${inDays(x.d)}${lateN>1?` · ${lateN} po terminie`:""}</small></span><span class="amt">${money(x.r.amount)}</span></a>`}
  $("#wFin").innerHTML=fin;

  // habits
  const hs=habits(),ws=monday(today),daysSoFar=wd(today)+1;
  const doneToday=hs.filter(x=>(x.checks||{})[T]).length;
  $("#wHabTitle").textContent=hs.length?`Nawyki · dziś ${doneToday} z ${hs.length}`:"Nawyki";
  $("#wHab").innerHTML=hs.length?`<div class="htiles">${hs.map(x=>{const c=x.checks||{},on=!!c[T];let wk=0;for(let i=0;i<daysSoFar;i++)if(c[iso(addDays(ws,i))])wk++;const s=streak(x);
      return`<button class="htile" data-act="habit" data-id="${x.id}" data-date="${T}" aria-pressed="${on}" aria-label="${esc(x.name)}: ${on?"zrobione dziś":"jeszcze nie dziś"}, ${wk} z ${daysSoFar} dni w tym tygodniu">${ring(wk/daysSoFar,on)}<b>${esc(x.name)}</b><small>${s?`Seria ${s} ${plural(s,"dzień","dni","dni")}`:"Zacznij serię"}</small></button>`}).join("")}</div>`
    :`<p class="muted" style="font-size:.92rem">Dodaj pierwszy nawyk w zakładce Nawyki.</p>`;

  // notes
  const ns=notes().slice(0,2);
  $("#wNotes").innerHTML=ns.length?`<div class="ngrid">${ns.map(n=>`<div class="ncard">${n.pinned?`<span class="pin">Przypięta</span>`:""}<b>${esc(n.title||"Bez tytułu")}</b><p>${esc(n.body||"")}</p></div>`).join("")}</div>`:`<p class="muted" style="font-size:.92rem">Brak notatek.</p>`;
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
  $("#finChart").innerHTML=chart7(140,true);
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
    carEdit:()=>{const f=$("#carEditForm"),open=f.hidden;f.hidden=!open;$("#carEditBtn").setAttribute("aria-expanded",open);if(open){fillCarForm();$("#ceMake").focus()}},
    carPhotoDel:()=>{put("car",{...car(),kind:"car",photo:null});ui.carMode="3d";$("#cePhotoDel").hidden=true},
    carMode:()=>{ui.carMode=b.dataset.m;render();if(ui.carMode==="3d")Car3D.draw()},
    carMark:()=>{const rows=$$(`.ctask[data-part="${b.dataset.part}"]`);if(rows[0]){rows[0].scrollIntoView({behavior:"smooth",block:"center"});rows.forEach(r=>{r.classList.remove("flash");void r.offsetWidth;r.classList.add("flash")})}},
    cfocus:()=>{if(b.dataset.part){if(ui.carMode!=="3d"){ui.carMode="3d";render()}Car3D.focus(b.dataset.part);$("#carStage").scrollIntoView({behavior:"smooth",block:"nearest"})}},
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
document.addEventListener("change",e=>{const t=e.target;if(t.dataset.act==="toggle"||t.dataset.act==="ctoggle"){const it=items.get(t.dataset.id);if(it)put(t.dataset.id,{...it,done:t.checked,...(t.dataset.act==="ctoggle"?{doneAt:t.checked?Date.now():null}:{})})}});

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
function saveName(v){const name=v.trim().replace(/\s+/g," ").slice(0,30);put("settings",{...(items.get("settings")||{kind:"settings"}),kind:"settings",name,ex:false})}
$("#nameAsk").addEventListener("submit",e=>{e.preventDefault();const v=$("#nameAskIn").value;if(!v.trim()){$("#nameAskIn").focus();return}saveName(v)});
$("#nameForm").addEventListener("submit",e=>{e.preventDefault();saveName($("#nameIn").value);$("#nameIn").blur()});
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
   [-10,"in",450,"Dodatkowe","Zlecenie: projekt logo"],[-12,"out",64,"Jedzenie","Pizza ze znajomymi"],[-20,"out",39.99,"Rozrywka","Subskrypcja muzyki"]]
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
  {const nm=(items.get("settings")||{}).name;W.push(["settings",{kind:"settings",budget:4500,ex:true,...(nm?{name:nm,ex:false}:{})}])}
  // car: Audi Q3 2012 with sample service items and fuel history
  W.push(["car",{kind:"car",make:"Audi",model:"Q3",year:2012,engine:"2.0 TDI 140 KM quattro",plate:"",mileage:186400,photo:null,ex:true}]);
  [["Wymienić żarówkę","lampa-pp",D(7),null],["Wymiana opon na zimowe","",D(29),null],["Olej i filtry","silnik",null,188200],["Pióra wycieraczek","szyba",null,null],["Rozrząd z pompą wody","silnik",null,210000]]
    .forEach(([title,part,due,dueKm])=>add("c",{kind:"carTask",title,part,due,dueKm,done:false}));
  W.push([uid("r"),{kind:"rec",name:"Przegląd techniczny",amount:98,freq:"yearly",cat:"Transport",start:D(132),since:D(0),active:true,paid:{},created:now+n++,ex:true}]);
  for(let i=14;i>=0;i--){const L=i?Math.round((44+((i*7)%9))*10)/10:52.4,pr=i?6.18+((i*13)%17)/100:6.39,fid=uid("f"),date=D(-4-i*12),odo=186400-Math.round(i*705+((i*37)%60));
    W.push([fid,{kind:"fuel",date,liters:L,cost:i?Math.round(L*pr*100)/100:334.84,odo,created:now+n++,ex:true}]);
    W.push([uid("x"),{kind:"tx",type:"out",amount:i?Math.round(L*pr*100)/100:334.84,cat:"Transport",date,note:"Tankowanie",fuel:fid,created:now+n++,ex:true}])}
  await putMany(W);
}

/* ---------- boot ---------- */
/* ---------- car: data ---------- */
const CAR_ANCHORS={
 "lampa-pp": {
  "label": "Lampa przednia prawa",
  "p": [
   2.231,
   0.735,
   0.669
  ],
  "n": [
   0.852,
   0.05,
   0.521
  ]
 },
 "lampa-pl": {
  "label": "Lampa przednia lewa",
  "p": [
   2.231,
   0.735,
   -0.669
  ],
  "n": [
   0.852,
   0.05,
   -0.521
  ]
 },
 "lampa-tp": {
  "label": "Lampa tylna prawa",
  "p": [
   -2.194,
   0.884,
   0.665
  ],
  "n": [
   -0.796,
   0.1,
   0.597
  ]
 },
 "lampa-tl": {
  "label": "Lampa tylna lewa",
  "p": [
   -2.194,
   0.884,
   -0.665
  ],
  "n": [
   -0.796,
   0.1,
   -0.597
  ]
 },
 "kolo-pp": {
  "label": "Koło przednie prawe",
  "p": [
   1.34,
   0.42,
   0.94
  ],
  "n": [
   0.0,
   0.0,
   1.0
  ]
 },
 "kolo-pl": {
  "label": "Koło przednie lewe",
  "p": [
   1.34,
   0.42,
   -0.94
  ],
  "n": [
   0.0,
   0.0,
   -1.0
  ]
 },
 "kolo-tp": {
  "label": "Koło tylne prawe",
  "p": [
   -1.34,
   0.42,
   0.94
  ],
  "n": [
   0.0,
   0.0,
   1.0
  ]
 },
 "kolo-tl": {
  "label": "Koło tylne lewe",
  "p": [
   -1.34,
   0.42,
   -0.94
  ],
  "n": [
   0.0,
   0.0,
   -1.0
  ]
 },
 "silnik": {
  "label": "Silnik i olej",
  "p": [
   1.448,
   0.929,
   0.0
  ],
  "n": [
   0.15,
   0.989,
   0.0
  ]
 },
 "szyba": {
  "label": "Szyba przednia",
  "p": [
   0.595,
   1.242,
   0.0
  ],
  "n": [
   0.552,
   0.834,
   0.0
  ]
 },
 "lusterko-p": {
  "label": "Lusterko prawe",
  "p": [
   0.55,
   1.085,
   1.099
  ],
  "n": [
   0.0,
   0.301,
   0.954
  ]
 },
 "lusterko-l": {
  "label": "Lusterko lewe",
  "p": [
   0.55,
   1.085,
   -1.099
  ],
  "n": [
   0.0,
   0.301,
   -0.954
  ]
 },
 "drzwi-p": {
  "label": "Drzwi prawe",
  "p": [
   -0.5,
   0.75,
   0.94
  ],
  "n": [
   0.0,
   0.0,
   1.0
  ]
 },
 "drzwi-l": {
  "label": "Drzwi lewe",
  "p": [
   -0.5,
   0.75,
   -0.94
  ],
  "n": [
   0.0,
   0.0,
   -1.0
  ]
 },
 "zderzak-p": {
  "label": "Zderzak przedni",
  "p": [
   2.189,
   0.42,
   0.0
  ],
  "n": [
   1.0,
   0.0,
   0.0
  ]
 },
 "bagaznik": {
  "label": "Tył i bagażnik",
  "p": [
   -2.241,
   0.75,
   0.0
  ],
  "n": [
   -1.0,
   0.0,
   0.0
  ]
 },
 "dach": {
  "label": "Dach",
  "p": [
   -0.6,
   1.5,
   0.0
  ],
  "n": [
   0.0,
   1.0,
   0.0
  ]
 }
};
const CAR_SHADOW="data:image/png;base64,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";
const CAR_DEFAULT={kind:"car",make:"Audi",model:"Q3",year:2012,engine:"",plate:"",mileage:null,photo:null};
const car=()=>({...CAR_DEFAULT,...(items.get("car")||{})});
const carTasks=()=>ofKind("carTask");
const fuels=()=>ofKind("fuel").sort((a,b)=>a.date.localeCompare(b.date)||a.created-b.created);
const fmtKm=n=>new Intl.NumberFormat("pl-PL").format(Math.round(n))+" km";
const fmtNum=(n,d)=>new Intl.NumberFormat("pl-PL",{minimumFractionDigits:d,maximumFractionDigits:d}).format(n);
function taskDue(t,km){
  const out=[];let score=1e9,cls="";
  if(t.due){const n=Math.round((parse(t.due)-today)/864e5);score=Math.min(score,n*40);
    out.push(n<0?`${-n} ${plural(-n,"dzień","dni","dni")} po terminie`:n===0?"dziś":`za ${n} ${plural(n,"dzień","dni","dni")}`);
    if(n<0)cls="late";else if(n<=14)cls="warn"}
  if(t.dueKm!=null&&km!=null){const r=t.dueKm-km;score=Math.min(score,r);
    out.push(r<0?`${fmtKm(-r)} po terminie`:`za ${fmtKm(r)}`);
    if(r<0)cls="late";else if(r<=2000&&cls!=="late")cls="warn"}
  return{txt:out.join(" · "),cls,score};
}
function taskWhen(t){const w=[];if(t.due){const d=parse(t.due);w.push(`Do ${d.getDate()} ${MON[d.getMonth()]}`)}if(t.dueKm!=null)w.push(`przy ${fmtKm(t.dueKm)}`);return w.join(", ")}
function fuelStats(){
  const f=fuels();if(!f.length)return null;
  const m0=new Date(today.getFullYear(),today.getMonth()-5,1),months=[];
  for(let i=0;i<6;i++){const d=new Date(m0.getFullYear(),m0.getMonth()+i,1);months.push({k:ym(d),d,v:0})}
  for(const x of f){const mm=months.find(m=>x.date.startsWith(m.k));if(mm)mm.v+=x.cost}
  const first=months.findIndex(m=>m.v>0),span=first<0?1:6-first,perMonth=months.reduce((s,m)=>s+m.v,0)/span;
  const o=f.filter(x=>x.odo).sort((a,b)=>a.odo-b.odo);let cons=null,perKm=null,kmMonth=null;
  if(o.length>=2){const km=o[o.length-1].odo-o[0].odo;
    if(km>0){const rest=o.slice(1),L=rest.reduce((s,x)=>s+x.liters,0),C=rest.reduce((s,x)=>s+x.cost,0);cons=L/km*100;perKm=C/km;
      const days=(parse(o[o.length-1].date)-parse(o[0].date))/864e5;if(days>=7)kmMonth=km/days*30.44}}
  return{months,perMonth,cons,perKm,kmMonth,last:f[f.length-1],hasAny:months.some(m=>m.v>0)};
}
function monthChart(months){
  const max=Math.max(0,...months.map(m=>m.v)),H=96,cur=ym(today),MS=["Sty","Lut","Mar","Kwi","Maj","Cze","Lip","Sie","Wrz","Paź","Lis","Gru"];
  const desc=`Koszt paliwa w ostatnich 6 miesiącach: ${months.map(m=>`${MONN[m.d.getMonth()].toLowerCase()} ${money0(m.v)}`).join(", ")}.`;
  return `<figure class="c7 wide" role="img" aria-label="${desc}"><div class="c7h"><span class="label">Koszt paliwa · 6 miesięcy</span><span class="c7m">${max?"maks. "+money0(max):""}</span></div>
    <div class="c7b" style="height:${H+2}px" aria-hidden="true">${months.map(m=>`<span class="${m.k===cur?"now fuel":""}" style="height:${max&&m.v?Math.max(4,Math.round(m.v/max*H)):3}px" title="${MONN[m.d.getMonth()]}: ${money(m.v)}"></span>`).join("")}</div>
    <div class="c7l" aria-hidden="true">${months.map(m=>`<span class="${m.k===cur?"now":""}">${MS[m.d.getMonth()]}</span>`).join("")}</div></figure>`;
}

/* ---------- car: 3D viewer (own small WebGL renderer, mesh baked from the SDF model) ---------- */
const Car3D=(()=>{
  const AZ=-0.7266,DIST=6.93,TGT=[0.05,0.5,0],TANF=0.255;
  let cv,gl,prog,sprog,buf={},nIdx=0,idxType,lo,hi,stex,started=false,ready=false,failed=false;
  let yaw=0,pitch=0.2985,vel=0,raf=0,dragging=false,lastX=0,lastT=0,moved=false,marks=[],VP=null,cam=null,W=1,H=1;
  const VS=`attribute vec3 aP;attribute vec3 aN;attribute vec4 aA;uniform mat4 uM,uVP;uniform vec3 uLo,uHi;varying vec3 vN;varying vec3 vW;varying vec4 vA;
void main(){vec3 p=uLo+aP*(uHi-uLo);vec4 w=uM*vec4(p,1.0);vW=w.xyz;vN=(uM*vec4(aN,0.0)).xyz;vA=aA;gl_Position=uVP*w;}`;
  const FS=`precision highp float;varying vec3 vN;varying vec3 vW;varying vec4 vA;uniform vec3 uCam;uniform float uDark;
void main(){vec3 n=normalize(vN);vec3 v=normalize(uCam-vW);
vec3 L1=normalize(vec3(0.35,0.85,-0.45));vec3 L2=normalize(vec3(-0.6,0.5,0.6));
float alb=vA.x,ao=vA.y,mat=floor(vA.z*255.0+0.5),line=vA.w;
float dif=max(dot(n,L1),0.0),fil=max(dot(n,L2),0.0),sky=0.5+0.5*n.y,bnc=0.5-0.5*n.y;
vec3 h=normalize(v+L1);float sp=max(dot(n,h),0.0);
float pw=mat<0.5?18.0:mat<1.5?10.0:mat<2.5?30.0:60.0;
float ks=mat<0.5?0.05:mat<1.5?0.03:mat<2.5?0.08:0.18;
float fr=pow(1.0-max(dot(n,v),0.0),3.0);
float c=alb*(0.45*dif+0.10*fil+0.55*sky*(0.6+0.4*ao))+0.12*ao+pow(sp,pw)*ks+0.04*fr;
c*=0.72+0.28*ao;c*=1.0-0.45*line;c=pow(clamp(c,0.0,1.0),0.85);c*=mix(1.0,0.94,uDark);
gl_FragColor=vec4(c*0.985,c*0.99,c,1.0);}`;
  const SVS=`attribute vec2 aQ;uniform mat4 uM,uVP;varying vec2 vUV;void main(){vUV=vec2((aQ.x+3.0)/6.0,(aQ.y+2.2)/4.4);gl_Position=uVP*uM*vec4(aQ.x,0.0015,aQ.y,1.0);}`;
  const SFS=`precision mediump float;varying vec2 vUV;uniform sampler2D uT;uniform float uK;void main(){float a=texture2D(uT,vUV).r*uK;gl_FragColor=vec4(0.0,0.0,0.0,a);}`;
  function sh(t,s){const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(o));return o}
  function pg(v,f){const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,v));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,f));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p}
  const persp=(f,a,n,fa)=>{const t=1/f;return[t/a,0,0,0,0,t,0,0,0,0,(fa+n)/(n-fa),-1,0,0,2*fa*n/(n-fa),0]};
  function look(e,c){let z=[e[0]-c[0],e[1]-c[1],e[2]-c[2]];let l=Math.hypot(...z);z=z.map(v=>v/l);let x=[z[2],0,-z[0]];l=Math.hypot(...x);x=x.map(v=>v/l);
    const y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];
    return[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-(x[0]*e[0]+x[1]*e[1]+x[2]*e[2]),-(y[0]*e[0]+y[1]*e[1]+y[2]*e[2]),-(z[0]*e[0]+z[1]*e[1]+z[2]*e[2]),1]}
  function mul(a,b){const o=new Array(16);for(let i=0;i<4;i++)for(let j=0;j<4;j++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+j]*b[i*4+k];o[i*4+j]=s}return o}
  const rotY=t=>{const c=Math.cos(t),s=Math.sin(t);return[c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]};
  const rot=(p,t)=>{const c=Math.cos(t),s=Math.sin(t);return[c*p[0]+s*p[2],p[1],-s*p[0]+c*p[2]]};
  async function gunzip(u8){if(typeof DecompressionStream==="undefined")throw new Error("gzip");
    return await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()}
  async function loadMesh(){
    let u8;
    if(window.LIFE_CAR_B64)u8=Uint8Array.from(atob(window.LIFE_CAR_B64),c=>c.charCodeAt(0));
    else{const r=await fetch("car.bin.gz?v=4f6fcbf3");if(!r.ok)throw new Error("mesh");u8=new Uint8Array(await r.arrayBuffer())}
    const ab=await gunzip(u8),dv=new DataView(ab);
    if(String.fromCharCode(...new Uint8Array(ab,0,4))!=="LCAR")throw new Error("format");
    const nv=dv.getUint32(4,true),nt=dv.getUint32(8,true);lo=[0,1,2].map(i=>dv.getFloat32(12+i*4,true));hi=[0,1,2].map(i=>dv.getFloat32(24+i*4,true));
    let off=36;const pos=new Uint16Array(ab.slice(off,off+nv*6));off+=nv*6;
    const nrm=new Int8Array(ab.slice(off,off+nv*3));off+=nv*3;off+=(4-(nv*3)%4)%4;
    const att=new Uint8Array(ab.slice(off,off+nv*4));off+=nv*4;
    const idx=new Uint32Array(ab.slice(off,off+nt*12));
    return{pos,nrm,att,idx,nv};
  }
  function setup(m){
    prog=pg(VS,FS);sprog=pg(SVS,SFS);
    const mk=(arr,tgt=gl.ARRAY_BUFFER)=>{const b=gl.createBuffer();gl.bindBuffer(tgt,b);gl.bufferData(tgt,arr,gl.STATIC_DRAW);return b};
    buf.p=mk(m.pos);buf.n=mk(m.nrm);buf.a=mk(m.att);
    if(m.nv<65536){buf.i=mk(new Uint16Array(m.idx),gl.ELEMENT_ARRAY_BUFFER);idxType=gl.UNSIGNED_SHORT}
    else{if(!(gl instanceof WebGL2RenderingContext)&&!gl.getExtension("OES_element_index_uint"))throw new Error("uint");buf.i=mk(m.idx,gl.ELEMENT_ARRAY_BUFFER);idxType=gl.UNSIGNED_INT}
    nIdx=m.idx.length;
    buf.q=mk(new Float32Array([-3,-2.2,3,-2.2,-3,2.2,3,2.2]));
    stex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,stex);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,1,1,0,gl.LUMINANCE,gl.UNSIGNED_BYTE,new Uint8Array([0]));
    if(CAR_SHADOW){const im=new Image();im.onload=()=>{gl.bindTexture(gl.TEXTURE_2D,stex);gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,gl.LUMINANCE,gl.UNSIGNED_BYTE,im);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);draw()};im.src=CAR_SHADOW}
  }
  function attr(p,name,b,size,type,norm){const l=gl.getAttribLocation(p,name);if(l<0)return;gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,size,type,norm,0,0)}
  function resize(){const r=cv.getBoundingClientRect(),d=Math.min(2,window.devicePixelRatio||1);W=Math.max(1,r.width);H=Math.max(1,r.height);
    const w=Math.round(W*d),h=Math.round(H*d);if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h}}
  function draw(){
    if(!ready||!cv.offsetParent)return;resize();
    cam=[TGT[0]+DIST*Math.cos(pitch)*Math.cos(AZ),TGT[1]+DIST*Math.sin(pitch),TGT[2]+DIST*Math.cos(pitch)*Math.sin(AZ)];
    const asp=W/H,tf=asp<1.45?TANF*1.45/asp:TANF;
    VP=mul(persp(tf,asp,0.5,40),look(cam,TGT));const M=rotY(yaw);
    gl.viewport(0,0,cv.width,cv.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(sprog);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.disable(gl.DEPTH_TEST);
    attr(sprog,"aQ",buf.q,2,gl.FLOAT,false);
    gl.uniformMatrix4fv(gl.getUniformLocation(sprog,"uM"),false,M);gl.uniformMatrix4fv(gl.getUniformLocation(sprog,"uVP"),false,VP);
    gl.uniform1f(gl.getUniformLocation(sprog,"uK"),curTheme()==="dark"?0.95:0.8);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,stex);gl.uniform1i(gl.getUniformLocation(sprog,"uT"),0);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    gl.disable(gl.BLEND);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);
    gl.useProgram(prog);
    attr(prog,"aP",buf.p,3,gl.UNSIGNED_SHORT,true);attr(prog,"aN",buf.n,3,gl.BYTE,true);attr(prog,"aA",buf.a,4,gl.UNSIGNED_BYTE,true);
    gl.uniformMatrix4fv(gl.getUniformLocation(prog,"uM"),false,M);gl.uniformMatrix4fv(gl.getUniformLocation(prog,"uVP"),false,VP);
    gl.uniform3fv(gl.getUniformLocation(prog,"uLo"),lo);gl.uniform3fv(gl.getUniformLocation(prog,"uHi"),hi);
    gl.uniform3fv(gl.getUniformLocation(prog,"uCam"),cam);gl.uniform1f(gl.getUniformLocation(prog,"uDark"),curTheme()==="dark"?1:0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,buf.i);gl.drawElements(gl.TRIANGLES,nIdx,idxType,0);
    placeMarks();
  }
  function project(p){const c=[0,1,2,3].map(j=>VP[j]*p[0]+VP[4+j]*p[1]+VP[8+j]*p[2]+VP[12+j]);return[(c[0]/c[3]*0.5+0.5)*W,(0.5-c[1]/c[3]*0.5)*H]}
  function placeMarks(){
    const box=$("#carMarks");if(!VP)return;
    box.innerHTML=marks.map(m=>{const a=CAR_ANCHORS[m.part];if(!a)return"";const p=rot(a.p,yaw),n=rot(a.n,yaw),[x,y]=project(p);
      const v=[cam[0]-p[0],cam[1]-p[1],cam[2]-p[2]],vl=Math.hypot(...v),facing=(n[0]*v[0]+n[1]*v[1]+n[2]*v[2])/vl>-0.05;
      const label=`${a.label}: ${m.titles.join(", ")}`;
      return`<button class="car-mark${facing?"":" back"}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px" data-act="carMark" data-part="${m.part}" aria-label="${esc(label)}">!<span class="tipx">${esc(label)}</span></button>`}).join("");
  }
  function tick(){raf=0;if(dragging)return;if(Math.abs(vel)<0.0004){vel=0;return}yaw+=vel;vel*=0.94;draw();raf=requestAnimationFrame(tick)}
  function bind(){
    cv.addEventListener("pointerdown",e=>{dragging=true;moved=false;lastX=e.clientX;lastT=performance.now();vel=0;cv.setPointerCapture(e.pointerId);$("#carHint").hidden=true});
    cv.addEventListener("pointermove",e=>{if(!dragging)return;const dx=e.clientX-lastX,now=performance.now();if(Math.abs(dx)>1)moved=true;
      yaw+=dx*0.011;vel=dx*0.011*Math.min(1,16/Math.max(1,now-lastT));lastX=e.clientX;lastT=now;draw()});
    const up=()=>{if(!dragging)return;dragging=false;if(!raf&&Math.abs(vel)>0.001)raf=requestAnimationFrame(tick)};
    cv.addEventListener("pointerup",up);cv.addEventListener("pointercancel",up);
    cv.addEventListener("dblclick",()=>animTo(0));
    cv.addEventListener("keydown",e=>{if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();yaw+=e.key==="ArrowLeft"?-0.25:0.25;draw()}else if(e.key==="Home"){animTo(0)}});
    if(window.ResizeObserver)new ResizeObserver(()=>draw()).observe(cv);
    darkMQ.addEventListener?.("change",()=>draw());
  }
  function animTo(t){const s=yaw,d=((t-s+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI,t0=performance.now();vel=0;
    const step=now=>{const k=Math.min(1,(now-t0)/500),e=1-Math.pow(1-k,3);yaw=s+d*e;draw();if(k<1)requestAnimationFrame(step)};requestAnimationFrame(step)}
  function fallback(){failed=true;cv.hidden=true;$("#carHint").hidden=true;const f=$("#carFallback");if(!window.LIFE_CAR_B64){f.src="car-clay.webp?v=4f6fcbf3";f.hidden=false}}
  async function start(){
    if(started)return;started=true;cv=$("#carCanvas");
    try{gl=cv.getContext("webgl2",{antialias:true,premultipliedAlpha:true,alpha:true})||cv.getContext("webgl",{antialias:true,premultipliedAlpha:true,alpha:true});
      if(!gl)throw new Error("webgl");bind();const m=await loadMesh();setup(m);ready=true;draw()}
    catch(e){console.warn("Model 3D niedostępny:",e&&e.message);fallback()}
  }
  function focus(part){const a=CAR_ANCHORS[part];if(!a||Math.abs(a.n[1])>0.9)return;animTo(Math.atan2(a.n[2],a.n[0])-AZ)}
  return{start,draw,focus,setMarks(list){marks=list;draw()},get failed(){return failed},reset:()=>animTo(0)};
})();

/* ---------- car: view ---------- */
ui.carMode="3d";
function rCar(){
  const c=car(),km=c.mileage;
  $("#carName").textContent=`${c.make||""} ${c.model||""}`.trim()||"Mój samochód";
  $("#carSub").textContent=[c.year,c.engine].filter(Boolean).join(" · ")||"Uzupełnij dane w „Edytuj”";
  $("#carPlate").textContent=c.plate||"";
  $("#carKm").innerHTML=km!=null?fmtKm(km).replace(" km"," <small>km</small>"):"—";
  const open=carTasks().filter(t=>!t.done).map(t=>({t,u:taskDue(t,km)})).sort((a,b)=>a.u.score-b.u.score||a.t.created-b.t.created);
  const nx=open.find(x=>x.u.txt);const nEl=$("#carNext");nEl.className="num"+(nx?" "+nx.u.cls:"");nEl.textContent=nx?nx.u.txt.split(" · ")[0]:"—";nEl.title=nx?nx.t.title:"";
  // stage: 3D model or photo
  const hasPhoto=!!c.photo;$("#carModeSeg").hidden=!hasPhoto;if(!hasPhoto)ui.carMode="3d";
  $$('[data-act="carMode"]').forEach(b=>b.setAttribute("aria-pressed",b.dataset.m===ui.carMode));
  const photo=ui.carMode==="photo";$("#carPhoto").hidden=!photo;if(photo&&$("#carPhoto").src!==c.photo)$("#carPhoto").src=c.photo;
  $("#carCanvas").hidden=photo||Car3D.failed;$("#carMarks").hidden=photo;
  // tasks
  const done=carTasks().filter(t=>t.done).sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));
  const row=(t,u)=>`<li class="ctask${t.done?" done":""}" data-part="${t.part||""}" id="ct-${t.id}"><input type="checkbox" data-act="ctoggle" data-id="${t.id}"${t.done?" checked":""} aria-label="${esc(t.title)}">
    <span class="t" data-act="cfocus" data-part="${t.part||""}"><b>${t.part&&!t.done?'<i class="partdot"></i>':""}${esc(t.title)}</b><small>${esc([t.part&&CAR_ANCHORS[t.part]?.label,taskWhen(t)].filter(Boolean).join(" · ")||"Bez terminu")}</small></span>
    <span class="meta">${u&&u.txt?`<span class="badge ${u.cls==="late"?"late":u.cls==="warn"?"soon":"off"}">${esc(u.txt.split(" · ")[0])}</span>`:""}<button class="icon" data-act="del" data-id="${t.id}" aria-label="Usuń: ${esc(t.title)}" title="Usuń">×</button></span></li>`;
  $("#carTasks").innerHTML=open.length||done.length?open.map(x=>row(x.t,x.u)).join("")+(done.length?`<li class="label" style="padding:12px 0 2px">Zrobione · ${done.length}</li>`+done.slice(0,5).map(t=>row(t,null)).join(""):"")
    :`<li class="muted" style="padding:4px 0">Nic do zrobienia. Dodaj np. wymianę oleju albo spaloną żarówkę i wskaż część, a pojawi się ona na modelu.</li>`;
  const sel=$("#ctPart");if(!sel.options.length)sel.innerHTML=`<option value="">Część samochodu (opcjonalnie)</option>`+Object.entries(CAR_ANCHORS).map(([k,a])=>`<option value="${k}">${esc(a.label)}</option>`).join("");
  // markers on the model
  const byPart={};for(const x of open)if(x.t.part&&CAR_ANCHORS[x.t.part])(byPart[x.t.part]=byPart[x.t.part]||[]).push(x.t.title);
  Car3D.setMarks(Object.entries(byPart).map(([part,titles])=>({part,titles})));
  // fees = recurring payments in Transport
  const fees=recs().filter(r=>r.cat==="Transport"&&r.active!==false).map(r=>({r,d:nextDue(r)})).sort((a,b)=>(a.d||"9").localeCompare(b.d||"9"));
  $("#carFees").innerHTML=fees.length?fees.map(({r,d})=>`<li class="ctask" style="grid-template-columns:minmax(0,1fr) auto"><a class="t" href="#finanse-cykliczne" style="color:inherit;text-decoration:none"><b>${esc(r.name)}</b><small class="${d&&d<T?"neg":""}">${d?`${parse(d).getDate()} ${MON[parse(d).getMonth()]} · ${inDays(d)}`:"Brak terminu"}</small></a><span class="amt">${money(r.amount)}</span></li>`).join("")
    :`<li class="muted" style="padding:4px 0">Brak opłat. Dodaj ubezpieczenie albo przegląd, a przypomnę o terminie.</li>`;
  if(!$("#cfDate").value)$("#cfDate").value=T;if(!$("#fuDate").value)$("#fuDate").value=T;
  // fuel
  const s=fuelStats();
  const tile=(l,v,u)=>`<div class="ctile"><span>${l}</span><b class="num">${v}${u?` <small>${u}</small>`:""}</b></div>`;
  $("#fuelStats").innerHTML=s?[tile("Miesięcznie średnio",money0(s.perMonth)),tile("Średnie spalanie",s.cons!=null?fmtNum(s.cons,1):"—",s.cons!=null?"l/100 km":""),
      tile("Koszt 1 km",s.perKm!=null?money(s.perKm):"—"),tile("Przejeżdżasz miesięcznie",s.kmMonth!=null?new Intl.NumberFormat("pl-PL").format(Math.round(s.kmMonth)):"—",s.kmMonth!=null?"km":"")].join("")
    :`<p class="muted" style="grid-column:1/-1">Dodaj tankowania, a policzę średni koszt paliwa, spalanie i koszt kilometra. Do spalania potrzebne są co najmniej 2 tankowania ze stanem licznika.</p>`;
  $("#fuelChart").innerHTML=s&&s.hasAny?monthChart(s.months):"";
  const fl=fuels().slice(-4).reverse();
  $("#fuelList").innerHTML=fl.map(x=>`<li class="ctask" style="grid-template-columns:minmax(0,1fr) auto auto"><span class="t" style="cursor:default"><b>${dayLabel(x.date)} · ${fmtNum(x.liters,1)} l</b><small>${x.liters?fmtNum(x.cost/x.liters,2)+" zł/l":""}${x.odo?` · ${fmtKm(x.odo)}`:""}</small></span><span class="amt">${money(x.cost)}</span><button class="icon" data-act="del" data-id="${x.id}" aria-label="Usuń tankowanie" title="Usuń">×</button></li>`).join("");
  Car3D.start();
}
function readImage(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=r.result};r.onerror=rej;r.readAsDataURL(file)})}
async function photoToData(file){
  const im=await readImage(file);let max=1280,q=0.82,out="";
  for(let i=0;i<4;i++){const k=Math.min(1,max/Math.max(im.width,im.height)),cv=document.createElement("canvas");cv.width=Math.round(im.width*k);cv.height=Math.round(im.height*k);
    cv.getContext("2d").drawImage(im,0,0,cv.width,cv.height);out=cv.toDataURL("image/jpeg",q);if(out.length<200000)break;max*=0.8;q-=0.08}
  return out;
}
function fillCarForm(){const c=car();$("#ceMake").value=c.make||"";$("#ceModel").value=c.model||"";$("#ceYear").value=c.year||"";$("#ceEngine").value=c.engine||"";
  $("#cePlate").value=c.plate||"";$("#ceKm").value=c.mileage!=null?c.mileage:"";$("#cePhotoDel").hidden=!c.photo;$("#ceErr").hidden=true}
const intOrNull=v=>{const n=parseInt(String(v).replace(/\s/g,""),10);return isFinite(n)&&n>=0?n:null};
$("#carEditForm").addEventListener("submit",e=>{e.preventDefault();const yr=intOrNull($("#ceYear").value),km=intOrNull($("#ceKm").value),err=$("#ceErr");
  if($("#ceYear").value&&(yr==null||yr<1900||yr>today.getFullYear()+1)){err.textContent="Wpisz rok produkcji, np. 2012.";err.hidden=false;return}
  if($("#ceKm").value&&km==null){err.textContent="Wpisz przebieg jako liczbę kilometrów, np. 186400.";err.hidden=false;return}
  const c=car();put("car",{...c,kind:"car",make:$("#ceMake").value.trim(),model:$("#ceModel").value.trim(),year:yr,engine:$("#ceEngine").value.trim(),plate:$("#cePlate").value.trim().toUpperCase(),mileage:km,ex:false});
  $("#carEditForm").hidden=true;$("#carEditBtn").setAttribute("aria-expanded","false")});
$("#cePhoto").addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;const err=$("#ceErr");
  try{const data=await photoToData(f);put("car",{...car(),kind:"car",photo:data});ui.carMode="photo";$("#cePhotoDel").hidden=false;err.hidden=true}
  catch(_){err.textContent="Nie udało się wczytać zdjęcia. Wybierz plik JPG, PNG albo HEIC zapisany jako JPG.";err.hidden=false}
  e.target.value=""});
$("#carTaskForm").addEventListener("submit",e=>{e.preventDefault();const title=$("#ctTitle").value.trim(),err=$("#ctErr"),kmv=$("#ctKm").value;
  if(!title){err.textContent="Wpisz, co trzeba zrobić.";err.hidden=false;$("#ctTitle").focus();return}
  if(kmv&&intOrNull(kmv)==null){err.textContent="Przebieg wpisz jako liczbę, np. 188200.";err.hidden=false;return}
  err.hidden=true;put(uid("c"),{kind:"carTask",title,part:$("#ctPart").value,due:$("#ctDate").value||null,dueKm:kmv?intOrNull(kmv):null,done:false,created:Date.now()});
  $("#ctTitle").value="";$("#ctDate").value="";$("#ctKm").value="";$("#ctPart").value=""});
$("#carFeeForm").addEventListener("submit",e=>{e.preventDefault();const name=$("#cfName").value.trim(),a=parseAmt($("#cfAmt").value),d=$("#cfDate").value,err=$("#cfErr");
  if(!name){err.textContent="Wpisz nazwę opłaty.";err.hidden=false;return}
  if(!(a>0)){err.textContent="Wpisz kwotę większą od zera, np. 1240.";err.hidden=false;return}
  if(!d){err.textContent="Wybierz najbliższy termin.";err.hidden=false;return}
  err.hidden=true;put(uid("r"),{kind:"rec",name,amount:a,freq:$("#cfFreq").value,cat:"Transport",start:d,since:d<T?d:T,active:true,paid:{},created:Date.now()});
  $("#cfName").value="";$("#cfAmt").value=""});
$("#fuelForm").addEventListener("submit",e=>{e.preventDefault();const L=parseAmt($("#fuL").value),C=parseAmt($("#fuCost").value),ov=$("#fuOdo").value,odo=ov?intOrNull(ov):null,date=$("#fuDate").value||T,err=$("#fuErr");
  if(!(L>0)){err.textContent="Wpisz liczbę litrów, np. 52,4.";err.hidden=false;return}
  if(!(C>0)){err.textContent="Wpisz kwotę za tankowanie, np. 334,84.";err.hidden=false;return}
  if(ov&&odo==null){err.textContent="Stan licznika wpisz jako liczbę kilometrów.";err.hidden=false;return}
  err.hidden=true;const fid=uid("f"),now=Date.now();
  put(fid,{kind:"fuel",date,liters:L,cost:C,odo,created:now},true);
  put(uid("x"),{kind:"tx",type:"out",amount:C,cat:"Transport",date,note:"Tankowanie",fuel:fid,created:now},true);
  const c=car();if(odo!=null&&(c.mileage==null||odo>c.mileage))put("car",{...c,kind:"car",mileage:odo},true);
  render();$("#fuL").value="";$("#fuCost").value="";$("#fuOdo").value=""});


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
