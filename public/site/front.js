(function(){
var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
var ICON = {
  code:'<svg viewBox="0 0 16 16"><path d="M6 4.5 2.5 8 6 11.5M10 4.5 13.5 8 10 11.5"/></svg>',
  draft:'<svg viewBox="0 0 16 16"><path d="M10.5 2.5 13.5 5.5 6 13H3v-3z"/><path d="M9 4l3 3"/></svg>',
  review:'<svg viewBox="0 0 16 16"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/><path d="m5.5 7 1.5 1.5L10.5 5"/></svg>',
  deadlines:'<svg viewBox="0 0 16 16"><circle cx="8" cy="8.5" r="5.5"/><path d="M8 5.5v3l2 1.5M6 1.5h4"/></svg>',
  records:'<svg viewBox="0 0 16 16"><path d="M2.5 4.5h4l1.5 1.5h5.5v7h-11z"/><path d="M2.5 4.5v-1h4"/></svg>'
};
var REF = [
  {k:'code',t:'Code',p:'I can confidently say that this is the main way I spend my time. Even though at this point AI writes most of my code'},
  {k:'design',t:'Design',p:'This one I actually do, both because AI still sucks at it and because I really enjoy the process'},
  {k:'keys',t:'Writing',p:'I write about design, code, and whatever comes through my mind. ',type:"I’m also writing a fantasy novel"},
  {k:'chart',t:'Building',p:'I’m on a mission to build my own stuff. I am starting a secret challenge around this, wanna participate?'}
];
var OURS = [
  {k:'draft',t:'Draft',tag:'Step 1 \u00b7 Drafting',tc:'#B8901F',p:'Answer a few questions and DraftHR writes the letter section by section, following the right process for where you are.'},
  {k:'review',t:'Review',tag:'Step 2 \u00b7 Reviewing',tc:'#3E9A33',p:'Before it goes out, a teammate, someone you trust or an employment law expert checks it. You accept or reject every change.'},
  {k:'deadlines',t:'Deadlines',tag:'Step 3 \u00b7 Time limits',tc:'#2A9AA3',p:'DraftHR works out the dates that matter, from appeal windows to tribunal time limits, and reminds you before they pass.'},
  {k:'records',t:'Records',tag:'Step 4 \u00b7 Records',tc:'#7A5BE0',p:'Every answer, upload and letter is saved with its date and who added it, so you have a clear record if a decision is questioned.'}
];

function h(tag,cls,html){var e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e}
function wait(ms){return new Promise(function(r){setTimeout(r,ms)})}
/* Runs an async loop only while its card is on screen. */
function runner(card,fn){
  var vis=false,busy=false;
  function on(){return vis&&(!card.parentNode||card.parentNode.dataset.scroll!=='1'||card.classList.contains('on'))}
  function kick(){if(on()&&!busy)go()}
  new IntersectionObserver(function(es){vis=es[0].isIntersecting;kick()},{threshold:.15}).observe(card);
  new MutationObserver(kick).observe(card,{attributes:true,attributeFilter:['class']});
  function go(){busy=true;fn(on).then(function(){busy=false;if(on())setTimeout(kick,50)})}
}
function runner_orig(card,fn){
  var on=false,busy=false;
  new IntersectionObserver(function(es){on=es[0].isIntersecting;if(on&&!busy)go()},{threshold:.15}).observe(card);
  function go(){busy=true;fn(function(){return on}).then(function(){busy=false;if(on)setTimeout(function(){if(!busy&&on)go()},50)})}
}
function fit(ill){
  var sc=ill.querySelector('.scene');
  new ResizeObserver(function(){var s=Math.min(1,ill.clientWidth/440);sc.style.setProperty('--s',s);ill.style.height=(300*s)+'px'}).observe(ill);
}

function build(gridId,list,isRef){
  var g=gridId;
  list.forEach(function(d){
    var c=h('article','card');
    var tx=h('div','txt');
    var tag=h('div','tag',d.tag||'');tag.style.setProperty('--tc',d.tc||'#999');
    var ch=h('div','ch');ch.appendChild(h('span','ico',isRef?ICON.code:ICON[d.k]));ch.appendChild(h('h3',null,d.t));
    var p=h('p');p.textContent=d.p;
    if(!isRef)tx.appendChild(tag);
    tx.appendChild(ch);tx.appendChild(p);c.appendChild(tx);
    var ill=h('div','ill');var sc=h('div','scene');ill.appendChild(sc);c.appendChild(ill);
    g.appendChild(c);fit(ill);
    SCENES[d.k](sc,c,d,p);
  });
}

var SCENES={};

/* ---------- Reference: code editor ---------- */
var CODE=[[0,[[32,'w'],[30,'g'],['d','g']]],[28,[[36,'w'],['d','g']]],[52,[['d','g'],[26,'g'],[28,'g']]],[76,[['d','w'],[18,'g']]],[96,[[30,'g'],[18,'g']]],
  [96,[[16,'g'],[16,'g']]],[76,[[38,'w']]],[52,[[26,'g'],[24,'w']]],[28,[[36,'w'],['d','g']]],[0,[['d','w'],[30,'g'],['d','g']]]];
function editor(x,y,w,ht,ghost){
  var win=h('div','rw'+(ghost?' ghost':''));win.style.cssText='left:'+x+'px;top:'+y+'px;width:'+w+'px;height:'+ht+'px';
  win.innerHTML='<div class="rbar"><i></i><i></i><i></i><span class="pl"><b></b><b></b><b></b></span></div>';
  var body=h('div','cbody');var nums=h('div','nums');var ls=h('div','clines cfade');
  for(var i=1;i<=10;i++)nums.appendChild(h('span',null,String(i)));
  CODE.forEach(function(r){var l=h('div','cl');l.style.marginLeft=r[0]+'px';r[1].forEach(function(s){var e=h('i','seg '+(s[0]==='d'?'dot ':'')+s[1]);e.dataset.w=s[0];l.appendChild(e)});ls.appendChild(l)});
  body.appendChild(nums);body.appendChild(ls);win.appendChild(body);return {win:win,lines:ls};
}
function showAll(ls){ls.querySelectorAll('.seg').forEach(function(s){if(s.dataset.w==='d')s.classList.add('on');else s.style.width=s.dataset.w+'px'})}
SCENES.code=function(sc,card){
  var gl=editor(-170,30,230,222,true),gr=editor(380,30,230,222,true),m=editor(70,26,300,226,false);
  showAll(gl.lines);showAll(gr.lines);
  sc.appendChild(gl.win);sc.appendChild(gr.win);sc.appendChild(m.win);
  var segs=[].slice.call(m.lines.querySelectorAll('.seg'));
  if(RM){showAll(m.lines);return}
  runner(card,async function(on){
    m.lines.classList.remove('out');
    segs.forEach(function(s){s.classList.remove('on');s.style.width=s.dataset.w==='d'?'':'0'});
    await wait(350);
    for(var i=0;i<segs.length;i++){if(!on())return;var s=segs[i];if(s.dataset.w==='d')s.classList.add('on');else s.style.width=s.dataset.w+'px';await wait(s.dataset.w==='d'?110:150+(+s.dataset.w||0)*2)}
    await wait(1800);m.lines.classList.add('out');await wait(550);
  });
};

/* ---------- Reference: design screen ---------- */
var DV=[{h:176,l:[[16,0],[56,1],[20,0],[30,0]],l2:[[30,0],[18,0],[24,1],[56,0]]},{h:128,l:[[40,0],[22,1],[34,0]],l2:[[18,0],[48,0],[26,1]]},{h:200,l:[[24,0],[30,1],[42,0],[14,0]],l2:[[44,0],[20,1],[30,0]]}];
SCENES.design=function(sc,card){
  var L=h('div','dside ghost');L.style.cssText='left:-70px;transform:perspective(500px) rotateY(38deg)';
  var R=h('div','dside ghost');R.style.cssText='left:390px;transform:perspective(500px) rotateY(-38deg)';
  var w=h('div','rw dw');w.innerHTML='<div class="tb"><i></i><span class="mid"><b></b><b></b><b></b></span><span class="r"></span></div>';
  var c=h('div','dc');c.innerHTML='<span class="k"></span><span class="h"></span><span class="ln a"></span><span class="ln b"></span><span class="bt"><b></b><b></b></span>';
  w.appendChild(c);
  var arc=document.createElementNS('http://www.w3.org/2000/svg','svg');arc.setAttribute('class','arc');arc.setAttribute('viewBox','0 0 440 100');
  arc.innerHTML='<path d="M-10 40 Q220 0 450 40" fill="none" stroke="#2c2c2c" stroke-width="1.2"/><circle r="5.5" fill="#141414" stroke="#6a6a6a" stroke-width="1.2" cx="220" cy="20"/>';
  sc.appendChild(L);sc.appendChild(R);sc.appendChild(w);sc.appendChild(arc);
  var dot=arc.querySelector('circle'),hb=c.querySelector('.h'),la=c.querySelector('.ln.a'),lb=c.querySelector('.ln.b');
  function fill(row,arr){row.innerHTML='';arr.forEach(function(x){var b=h('b',x[1]?'hi':'');b.style.width=x[0]+'px';row.appendChild(b)})}
  function set(i){var v=DV[i];hb.style.width=v.h+'px';fill(la,v.l);fill(lb,v.l2)}
  set(0);if(RM)return;
  var i=0,xs=[220,196,244];
  runner(card,async function(on){
    await wait(2600);if(!on())return;i=(i+1)%DV.length;set(i);
    var x=xs[i],t=(x+10)/460,y=(1-t)*(1-t)*40+2*(1-t)*t*0+t*t*40;
    dot.setAttribute('cx',x);dot.setAttribute('cy',y.toFixed(1));
  });
};

/* ---------- Reference: keyboard ---------- */
var ROWS=[[['`',1],['1',1],['2',1],['3',1],['4',1],['5',1],['6',1],['7',1],['8',1],['9',1],['0',1],['-',1],['=',1],['bk',1.6]],
  [['tab',1.5],['q',1],['w',1],['e',1],['r',1],['t',1],['y',1],['u',1],['i',1],['o',1],['p',1],['[',1],[']',1],['\\',1.1]],
  [['caps',1.8],['a',1],['s',1],['d',1],['f',1],['g',1],['h',1],['j',1],['k',1],['l',1],[';',1],["'",1],['ret',1.8]],
  [['sh',2.3],['z',1],['x',1],['c',1],['v',1],['b',1],['n',1],['m',1],[',',1],['.',1],['/',1],['sh2',2.3]],
  [['fn',1],['ct',1],['al',1],['cm',1.3],[' ',5.2],['cm2',1.3],['al2',1],['lf',1],['ud',1],['rt',1]]];
SCENES.keys=function(sc,card,d,p){
  var kb=h('div','kb'),map={};
  ROWS.forEach(function(r){var row=h('div','kr');r.forEach(function(k){var e=h('i','key');e.style.flex=k[1]+' 1 0';row.appendChild(e);map[k[0]]=e});kb.appendChild(row)});
  sc.appendChild(kb);sc.appendChild(h('div','pad'));
  p.textContent='';var base=document.createTextNode(d.p),typed=document.createTextNode(''),dot=h('span','tdot');
  p.appendChild(base);p.appendChild(typed);p.appendChild(dot);
  if(RM){typed.data=d.type;return}
  function hit(ch){var k=map[ch.toLowerCase()]||(ch==='’'?map["'"]:null);if(!k)return;k.classList.remove('mid');k.classList.add('hit');setTimeout(function(){k.classList.remove('hit');k.classList.add('mid');setTimeout(function(){k.classList.remove('mid')},260)},90)}
  runner(card,async function(on){
    for(var i=1;i<=d.type.length;i++){if(!on())return;typed.data=d.type.slice(0,i);hit(d.type[i-1]);await wait(d.type[i-1]===' '?150:70+Math.random()*90)}
    await wait(1800);
    for(var j=d.type.length;j>=0;j--){if(!on())return;typed.data=d.type.slice(0,j);if(j%3===0)hit('bk');await wait(28)}
    await wait(500);
  });
};

/* ---------- Reference: revenue chart ---------- */
SCENES.chart=function(sc,card){
  var ring=document.createElementNS('http://www.w3.org/2000/svg','svg');ring.setAttribute('class','ring');ring.setAttribute('viewBox','0 0 330 330');
  var segs='',n=7,r=135,C=2*Math.PI*r,gap=8,len=C/n-gap;
  for(var i=0;i<n;i++)segs+='<circle cx="165" cy="165" r="'+r+'" fill="none" stroke="#232323" stroke-width="46" stroke-dasharray="'+len.toFixed(1)+' '+(C-len).toFixed(1)+'" stroke-dashoffset="'+(-i*C/n).toFixed(1)+'"/>';
  ring.innerHTML=segs;sc.appendChild(ring);
  var w=h('div','mrr');w.style.position='absolute';w.innerHTML='<div class="hd"><i></i>MRR<b></b></div>';
  var W=300,H=196,pts=[],N=48;
  for(var k=0;k<N;k++){var t=k/(N-1);var y=0.13+0.06*Math.sin(t*22)*(1-t)+0.03*Math.sin(t*41)+Math.pow(t,3.2)*0.72;pts.push([t*W,H-12-y*(H-30)])}
  var line=pts.map(function(q,i){return(i?'L':'M')+q[0].toFixed(1)+' '+q[1].toFixed(1)}).join(' ');
  var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 '+W+' '+H);svg.setAttribute('width',W);svg.setAttribute('height',H);svg.style.display='block';
  svg.innerHTML='<defs><clipPath id="cc"><rect x="0" y="0" width="0" height="'+H+'"/></clipPath></defs><g clip-path="url(#cc)"><path d="'+line+' L'+W+' '+H+' L0 '+H+'Z" fill="#6f6f6f"/><path d="'+line+'" fill="none" stroke="#f4f4f2" stroke-width="1.6"/></g><circle r="4" fill="#f4f4f2" stroke="#191919" stroke-width="2"/>';
  w.appendChild(svg);sc.appendChild(w);
  var tip=h('div','tip','<div class="r1">Revenue</div><div class="r2"><span class="dt"></span><b class="v"></b></div>');sc.appendChild(tip);
  var clip=svg.querySelector('rect'),dot=svg.querySelector('circle'),dt=tip.querySelector('.dt'),vv=tip.querySelector('.v');
  var start=new Date(2025,8,1);
  function ord(n){var s=['TH','ST','ND','RD'],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0])}
  function place(f){
    var x=f*W,i=Math.min(N-1,Math.round(f*(N-1))),q=pts[i];
    clip.setAttribute('width',x.toFixed(1));dot.setAttribute('cx',q[0]);dot.setAttribute('cy',q[1]);
    var day=new Date(start.getTime()+f*50*864e5);
    dt.textContent=day.toLocaleString('en-GB',{month:'short'}).toUpperCase()+' '+ord(day.getDate());
    var val=1.1+(H-12-q[1])/(H-30)*5.6;vv.textContent='$'+val.toFixed(1)+'k';
    tip.style.left=Math.min(70+q[0],352)+'px';tip.style.top=(76+33+q[1]-14)+'px';
  }
  place(1);if(RM)return;
  runner(card,async function(on){
    var t0=performance.now(),D=3600;
    while(on()){var f=Math.min(1,(performance.now()-t0)/D);f=f<.5?2*f*f:1-Math.pow(-2*f+2,2)/2;place(Math.max(.02,f));if(f>=1)break;await new Promise(requestAnimationFrame)}
    await wait(2200);
  });
};

/* ---------- DraftHR: Draft ---------- */
var SECS=[['Allegation','It is alleged that on Wednesday 14 October 2026 you left site during your shift without permission.'],
  ['The hearing','The hearing will be on Tuesday 3 November 2026 at 10am in Meeting Room 2.'],
  ['Your right to be accompanied','You may bring a colleague or a trade union representative with you.']];
SCENES.draft=function(sc,card){
  var pa=h('div','surf paper','<div class="meta"><span>Confidential</span><span>27 Oct 2026</span></div><h4>Invitation to a disciplinary hearing</h4>');
  var spans=SECS.map(function(s){var e=h('div','sec','<b>'+s[0]+'</b><span></span>');pa.appendChild(e);return e});
  var rail=h('div','surf rail','<div class="lbl">Sections</div>');
  var steps=SECS.map(function(s){var e=h('div','step','<i></i>'+s[0]);rail.appendChild(e);return e});
  var chk=h('div','step','<i></i>Checks');rail.appendChild(chk);steps.push(chk);
  var ready=h('div','ready','<span class="chip">Ready for review</span>');rail.appendChild(ready);
  sc.appendChild(pa);sc.appendChild(rail);
  var caret=h('span','caret');
  function reset(){spans.forEach(function(e){e.className='sec';e.querySelector('span').textContent=''});steps.forEach(function(e){e.className='step'});ready.classList.remove('on')}
  if(RM){spans.forEach(function(e,i){e.className='sec done';e.querySelector('span').textContent=SECS[i][1]});steps.forEach(function(e){e.className='step done'});ready.classList.add('on');return}
  runner(card,async function(on){
    reset();await wait(500);
    for(var i=0;i<SECS.length;i++){
      var e=spans[i],sp=e.querySelector('span'),txt=SECS[i][1];e.className='sec on';steps[i].className='step on';
      var tn=document.createTextNode('');sp.textContent='';sp.appendChild(tn);sp.appendChild(caret);
      for(var j=1;j<=txt.length;j++){if(!on())return;tn.data=txt.slice(0,j);await wait(txt[j-1]===' '?34:22)}
      e.className='sec done';steps[i].className='step done';await wait(380);
    }
    if(caret.parentNode)caret.parentNode.removeChild(caret);
    steps[3].className='step on';await wait(1100);steps[3].className='step done';ready.classList.add('on');
    await wait(3000);
  });
};

/* ---------- DraftHR: Review ---------- */
var EDITS=[
  {pre:'If the allegation is upheld, this ',del:'will result in',ins:'may result in',post:' your dismissal from employment.',
   msg:'This reads as if the outcome is already decided. Keep it open until after the hearing.'},
  {pre:'At the hearing ',del:'you must attend alone.',ins:'you may bring a colleague or a trade union representative.',post:'',
   msg:'Employees have a legal right to be accompanied at a disciplinary hearing.'}
];
SCENES.review=function(sc,card){
  var pa=h('div','surf rpaper','<div class="lbl">Outcome of hearing</div><div class="ghostline" style="width:92%"></div><div class="ghostline" style="width:74%"></div>');
  var para=h('p');pa.appendChild(para);
  pa.appendChild(h('div','ghostline','')).style.width='88%';pa.appendChild(h('div','ghostline','')).style.width='60%';
  var bub=h('div','surf bubble','<div class="who"><span class="av"><svg viewBox="0 0 12 12"><circle cx="6" cy="4.2" r="2.2"/><path d="M1.8 11c.6-2.2 2.2-3.2 4.2-3.2s3.6 1 4.2 3.2"/></svg></span><span><b>Reviewer</b><small>Suggested a change</small></span></div><p class="msg"></p><div class="acts"><span class="b">Reject</span><span class="b pri">Accept</span></div><div class="done-note">✓ Change accepted</div>');
  var cur=document.createElementNS('http://www.w3.org/2000/svg','svg');cur.setAttribute('class','cursor');cur.setAttribute('viewBox','0 0 16 20');
  cur.innerHTML='<path d="M1.5 1.5v14.5l4-3.8 2.6 6 2.6-1.1-2.6-5.9h5.6z" fill="#fff" stroke="#111" stroke-width="1.2" stroke-linejoin="round"/>';
  sc.appendChild(pa);sc.appendChild(bub);sc.appendChild(cur);
  var msg=bub.querySelector('.msg'),acc=bub.querySelector('.b.pri');
  function set(e){para.className='';para.innerHTML='';para.appendChild(document.createTextNode(e.pre));var d=h('del','ed');d.textContent=e.del;var n=h('ins','ed');n.textContent=e.ins;para.appendChild(d);para.appendChild(n);para.appendChild(document.createTextNode(e.post));msg.textContent=e.msg;bub.classList.remove('ok')}
  set(EDITS[0]);cur.style.transform='translate(400px,270px)';
  if(RM)return;
  var i=0;
  runner(card,async function(on){
    set(EDITS[i]);cur.style.transition='none';cur.style.transform='translate(410px,280px)';await wait(60);cur.style.transition='';
    await wait(1400);if(!on())return;
    var ar=acc.getBoundingClientRect(),sr=sc.getBoundingClientRect(),s=sr.width/440;
    var x=(ar.left-sr.left)/s+ar.width/s*0.55,y=(ar.top-sr.top)/s+ar.height/s*0.6;
    cur.style.transform='translate('+x+'px,'+y+'px)';await wait(1000);if(!on())return;
    acc.classList.add('down');await wait(160);acc.classList.remove('down');
    para.className='merged';bub.classList.add('ok');await wait(2600);
    i=(i+1)%EDITS.length;
  });
};

/* ---------- DraftHR: Deadlines ---------- */
SCENES.deadlines=function(sc,card){
  var box=h('div','surf dl',
    '<div class="hd"><b>Time limits</b><span class="chip">Example case</span></div>'+
    '<div class="big"><span class="n">180</span><span class="u">days left to make a tribunal claim</span></div>'+
    '<div class="track"><span class="fill"></span><span class="tick" style="left:3.9%"></span><span class="now"></span><span class="tl" style="left:4%">13 Nov</span></div>'+
    '<div class="rows">'+
      '<div class="row"><span>Dismissal took effect</span><span class="d">6 Nov 2026</span><span class="st"><span class="chip past">Done</span></span></div>'+
      '<div class="row"><span>Appeal deadline<small>Set in the outcome letter</small></span><span class="d">13 Nov 2026</span><span class="st a"></span></div>'+
      '<div class="row"><span>Tribunal claim time limit<small>6 months less one day</small></span><span class="d">5 May 2027</span><span class="st b"></span></div>'+
    '</div><div class="foot">ACAS early conciliation can pause the clock.</div>');
  var rem=h('div','remind','<span class="chip">● Reminder sent: 30 days left</span>');box.appendChild(rem);
  sc.appendChild(box);
  var n=box.querySelector('.n'),fill=box.querySelector('.fill'),now=box.querySelector('.now'),a=box.querySelector('.st.a'),b=box.querySelector('.st.b');
  function show(day){
    var left=180-day,f=day/180;n.textContent=left;n.classList.toggle('near',left<=30);
    fill.style.width=(f*100)+'%';now.style.left=(f*100)+'%';
    a.innerHTML=day>=7?'<span class="chip past">Passed</span>':'<span class="chip open">'+(7-day)+' days</span>';
    b.innerHTML='<span class="chip open">Open</span>';rem.classList.toggle('on',left<=30);
  }
  if(RM){show(150);return}
  runner(card,async function(on){
    show(0);await wait(900);
    var t0=performance.now(),D=5200;
    while(on()){var f=Math.min(1,(performance.now()-t0)/D);var e=1-Math.pow(1-f,2.2);show(Math.round(e*152));if(f>=1)break;await new Promise(requestAnimationFrame)}
    await wait(2800);
  });
};

/* ---------- DraftHR: Records ---------- */
var ENTS=[['14 Oct','Concern raised','Added by line manager','Note'],['16 Oct','Witness statement uploaded','Added by HR','File'],['21 Oct','Investigation meeting held','Notes added by HR','Meeting'],
  ['27 Oct','Invitation to hearing sent','Letter, approved by HR','Letter'],['3 Nov','Hearing notes added','Added by the hearing chair','Note']];
SCENES.records=function(sc,card){
  var box=h('div','surf rec','<div class="hd"><b>Case file</b><span class="lock"><svg viewBox="0 0 12 12"><rect x="2" y="5.5" width="8" height="5.5" rx="1.2"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5"/></svg>Saved, never overwritten</span></div>');
  var list=h('div','tl-list');box.appendChild(list);
  var els=ENTS.map(function(e){var x=h('div','ent','<span class="d">'+e[0]+'</span><span class="t">'+e[1]+'<small>'+e[2]+'</small></span><span class="chip">'+e[3]+'</span>');list.appendChild(x);return x});
  sc.appendChild(box);
  if(RM){els.forEach(function(x){x.classList.add('on')});return}
  runner(card,async function(on){
    els.forEach(function(x){x.classList.remove('on','new')});await wait(500);
    for(var i=0;i<els.length;i++){if(!on())return;els.forEach(function(x){x.classList.remove('new')});els[i].classList.add('on','new');await wait(1100)}
    await wait(2600);els.forEach(function(x){x.classList.remove('on')});await wait(500);
  });
};

/* ---------- DraftHR case engine: Tell, Ask (one question at a time), Plan ---------- */
var STORY='One of our warehouse team has left shifts early three times this month without telling anyone. We want to deal with it fairly.';
var READS=['Possible misconduct','England','You are the employer','Disciplinary process'];
SCENES.tell=function(sc,card){
  var box=h('div','surf tell','<div class="hd"><b>New case</b><span class="chip">Example</span></div><h5>What’s going on?</h5><div class="ta"><span class="tx"></span></div><div class="reading"><span class="dots"><i></i><i></i><i></i></span>Reading your story</div><div class="lbl">What DraftHR picked up</div><div class="reads"></div>');
  sc.appendChild(box);
  var tx=box.querySelector('.tx'),rd=box.querySelector('.reading'),rs=box.querySelector('.reads');
  var chips=READS.map(function(r){var c=h('span','chip',r);rs.appendChild(c);return c});
  var caret=h('span','caret');
  if(RM){tx.textContent=STORY;chips.forEach(function(c){c.classList.add('on')});return}
  runner(card,async function(on){
    tx.textContent='';chips.forEach(function(c){c.classList.remove('on')});rd.classList.remove('on');
    var tn=document.createTextNode('');tx.appendChild(tn);tx.appendChild(caret);await wait(500);
    for(var j=1;j<=STORY.length;j++){if(!on())return;tn.data=STORY.slice(0,j);await wait(STORY[j-1]===' '?40:20)}
    if(caret.parentNode)caret.parentNode.removeChild(caret);
    rd.classList.add('on');await wait(1300);rd.classList.remove('on');
    for(var k=0;k<chips.length;k++){if(!on())return;chips[k].classList.add('on');await wait(380)}
    await wait(3000);
  });
};
var QS=[
  {n:4,q:'Has this person had a warning before?',o:['No earlier warnings','A verbal warning','A written warning'],pick:0,f:['Earlier warnings','None']},
  {n:5,q:'Has anyone looked into what happened yet?',o:['Not yet','A meeting was held','Statements were taken'],pick:1,f:['Investigation','Meeting held']},
  {n:6,q:'Is there a written policy on absence?',o:['Yes, in the handbook','No','Not sure'],pick:0,f:['Policy','Staff handbook']}
];
SCENES.ask=function(sc,card){
  var qc=h('div','surf qcard','<div class="prog"><span></span></div><div class="qwrap"></div>');
  var cf=h('div','surf cfile','<div class="lbl">Case file</div><div class="facts"></div>');
  sc.appendChild(qc);sc.appendChild(cf);
  var wrap=qc.querySelector('.qwrap'),bar=qc.querySelector('.prog span'),facts=cf.querySelector('.facts');
  var base=[['Situation','Possible misconduct'],['Where','England'],['Absences','3 this month']];
  function fact(f,isNew){var e=h('div','fact'+(isNew?' new':''),'<i></i><span>'+f[0]+'<b>'+f[1]+'</b></span>');facts.appendChild(e);return e}
  function q(d){
    var e=h('div','q','<div class="qn">'+d.n+' <span>→</span></div><div class="qt">'+d.q+'</div>');
    var os=d.o.map(function(t,i){var o=h('div','opt','<kbd>'+'ABC'[i]+'</kbd>'+t);e.appendChild(o);return o});
    wrap.innerHTML='';wrap.appendChild(e);return {e:e,os:os};
  }
  function reset(){facts.innerHTML='';base.forEach(function(f){fact(f,false)})}
  reset();
  if(RM){q(QS[0]);bar.style.width='30%';return}
  runner(card,async function(on){
    reset();
    for(var i=0;i<QS.length;i++){
      var d=QS[i],x=q(d);bar.style.width=(d.n/14*100)+'%';
      x.e.classList.add('in');await wait(60);x.e.classList.remove('in');await wait(1500);if(!on())return;
      var o=x.os[d.pick];o.classList.add('sel');await wait(140);o.classList.remove('sel');await wait(110);o.classList.add('sel');
      await wait(450);var nf=fact(d.f,true);await wait(500);if(!on())return;
      x.e.classList.add('out');await wait(380);nf.classList.remove('new');
    }
    await wait(1600);
  });
};
var ROUTE=[
  ['Investigation meeting','Find out what happened','done'],
  ['Invite to a disciplinary hearing','Letter, with the evidence attached','next'],
  ['Hold the hearing','They can bring a colleague or union rep',''],
  ['Outcome letter','The decision and the reasons',''],
  ['Appeal','A chance to challenge the decision','']
];
SCENES.plan=function(sc,card){
  var box=h('div','surf plan','<div class="hd"><b>Your fair process</b><span class="chip">Disciplinary, England</span></div><div class="route"></div><div class="foot">Follows the Acas Code of Practice</div>');
  var rt=box.querySelector('.route');
  var els=ROUTE.map(function(r){var e=h('div','rs '+r[2],'<i></i><span class="t">'+r[0]+'<small>'+r[1]+'</small></span>'+(r[2]==='done'?'<span class="chip past">Done</span>':r[2]==='next'?'<span class="chip nx">Next letter</span>':''));rt.appendChild(e);return e});
  sc.appendChild(box);
  if(RM){els.forEach(function(e){e.classList.add('on')});return}
  runner(card,async function(on){
    els.forEach(function(e){e.classList.remove('on','glow')});await wait(500);
    for(var i=0;i<els.length;i++){if(!on())return;els[i].classList.add('on');await wait(420)}
    await wait(500);els[1].classList.add('glow');await wait(3400);
  });
};

var OURS7=[{k:'tell'},{k:'ask'},{k:'plan'}].concat(OURS);
window.FC_BUILD7=function(grid){grid.dataset.scroll='1';build(grid,OURS7)};
window.FC_BUILD=function(grid){build(grid,OURS)};
})();

(function(){
  var cssGrid = document.getElementById('fc-css').textContent, cssScroll = document.getElementById('fc-css-scroll').textContent;
  document.querySelectorAll('.fc-host').forEach(function(host){
    var scroll = host.dataset.mode !== 'grid';
    var r = host.attachShadow({mode:'open'});
    r.innerHTML = '<style>' + (scroll ? cssScroll : cssGrid) + '</style><section class="band web"><div class="band-in"><div class="grid"></div></div></section>';
    (scroll ? window.FC_BUILD7 : window.FC_BUILD)(r.querySelector('.grid'));
    if (!scroll) return;
    var cards = r.querySelectorAll('.card'), items = document.querySelectorAll('.how2-steps > li'), dots = document.querySelectorAll('.how2-dots i'), count = document.querySelector('.how2-count b'), track = document.querySelector('.how2-track');
    function show(n){
      cards.forEach(function(c,k){ c.classList.toggle('on', k === n); });
      items.forEach(function(li,k){ li.classList.toggle('on', k === n); });
      dots.forEach(function(d,k){ d.classList.toggle('on', k === n); });
      if (count) count.textContent = n + 1;
    }
    show(0);
    // Each step holds still for a stretch of scrolling, then the next one docks in.
    var cur = 0, ticking = false;
    function update(){
      ticking = false;
      var step = parseFloat(getComputedStyle(track.parentNode).getPropertyValue('--step')) / 100 * innerHeight;
      var n = Math.max(0, Math.min(items.length - 1, Math.round(-track.getBoundingClientRect().top / step)));
      if (n !== cur) { cur = n; show(n); }
    }
    addEventListener('scroll', function(){ if (!ticking) { ticking = true; requestAnimationFrame(update); } }, {passive:true});
    addEventListener('resize', update);
    update();
  });
  var links = document.querySelectorAll('.vswitch a');
  function pick(o, jump){
    document.body.dataset.how = o;
    document.documentElement.style.scrollSnapType = o === 'b' ? 'y proximity' : '';
    links.forEach(function(a){ a.setAttribute('aria-current', a.dataset.opt === o ? 'true' : 'false'); });
    if (jump) { var t = document.querySelector('.how-opt[data-opt="' + o + '"]'); if (t) t.scrollIntoView({behavior:'smooth', block:'start'}); }
  }
  links.forEach(function(a){ a.addEventListener('click', function(e){ e.preventDefault(); pick(a.dataset.opt, true); try{ history.replaceState(null, '', '#' + a.dataset.opt); }catch(_){} }); });
  pick('b', false);
})();

(function(){
  var hero=document.querySelector('.hero'), imgs=[].slice.call(hero.querySelectorAll('.hx')), i=0;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || imgs.length<2) return;
  setInterval(function(){
    if (document.hidden) return;
    imgs[i].classList.remove('on'); i=(i+1)%imgs.length; imgs[i].classList.add('on');
    hero.setAttribute('data-h', imgs[i].getAttribute('data-h'));
  }, 7000);
})();
