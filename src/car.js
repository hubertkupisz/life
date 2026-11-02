/* ---------- car: data ---------- */
const CAR_ANCHORS=/*CAR_ANCHORS*/{};
const CAR_SHADOW=/*CAR_SHADOW*/"";
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
    else{const r=await fetch("car.bin.gz");if(!r.ok)throw new Error("mesh");u8=new Uint8Array(await r.arrayBuffer())}
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
  function fallback(){failed=true;cv.hidden=true;$("#carHint").hidden=true;const f=$("#carFallback");if(!window.LIFE_CAR_B64){f.src="car-clay.webp";f.hidden=false}}
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
