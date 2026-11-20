/* askkestrel.ca/proposal: the options a prospect can add as they accept a proposal (extra questions and
   extra areas), with the running monthly total. Config comes from the page n8n builds (Kestrel – Proposal Page). */
(function(){
var C=window.KESTREL_PROPOSAL;if(!C)return;
var f=document.getElementById("af");if(!f)return;
var TIERS={s:["Small town",125],m:["Mid-size city",175],b:["Big city",250]};
var PROV={10:"NL",11:"PE",12:"NS",13:"NB",24:"QC",35:"ON",46:"MB",47:"SK",48:"AB",59:"BC",60:"YT",61:"NT",62:"NU"};
var xq=0,areas=[],places=null,taken=null,loading=false;
function $(id){return document.getElementById(id);}
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;}
function money(n){var w=Math.round(n*100)%100===0;return "$"+Number(n).toLocaleString("en-CA",w?{}:{minimumFractionDigits:2,maximumFractionDigits:2});}
function norm(s){return String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
function plan(){var r=f.querySelector("input[name=plan]:checked");return r?r.value:"fix_track";}
function provOf(id){return /^TOR/.test(id)?"ON":PROV[String(id).slice(0,2)];}
function open(id){if(!taken||!C.spot)return null;var t=taken[id];var u=(t&&t[C.spot]||0)+((taken.CANADA||{})[C.spot]||0)+((taken["PROV"+provOf(id)]||{})[C.spot]||0);return Math.max(0,3-u);}
function load(){
  if(places||loading)return;loading=true;$("xam").textContent="Loading the list of areas…";
  fetch("https://askkestrel.ca/assets/map/index.json").then(function(r){return r.json();}).then(function(j){
    places=(j.places||[]).filter(function(x){return TIERS[x[3]];}).map(function(x){return {id:x[0],n:x[1].replace(/ \(Toronto\)$/,", Toronto"),pt:x[2],r:x[3],p:x[4]||0,k:norm(x[1])};});
    $("xam").textContent="";search();
  }).catch(function(){loading=false;$("xam").textContent="The list of areas didn’t load. Tell Dave which areas you’d like in the note below.";});
  if(C.spot)fetch("https://automation.rootedai.ca/webhook/kestrel-spots").then(function(r){return r.json();}).then(function(j){if(j&&typeof j.taken==="object"){taken=j.taken;search();render();}}).catch(function(){});
}
function search(){
  var box=$("xar");box.innerHTML="";if(!places)return;
  var n=norm($("xas").value);if(n.length<2)return;
  if(areas.length>=10){box.appendChild(el("p","muted","That’s 10 extra areas. For more, ask Dave in the note below."));return;}
  var chosen={};areas.forEach(function(a){chosen[a.id]=1;});
  var st=[],has=[];
  places.forEach(function(x){if(chosen[x.id]||x.k===C.home)return;if(x.k.indexOf(n)===0)st.push(x);else if(x.k.indexOf(n)>0)has.push(x);});
  var by=function(a,b){return b.p-a.p;};
  var list=st.sort(by).concat(has.sort(by)).slice(0,6);
  if(!list.length){box.appendChild(el("p","muted","No area found by that name."));return;}
  list.forEach(function(x){
    var o=open(x.id),full=o===0;
    var b=el("button","pick");b.type="button";b.disabled=full;
    b.appendChild(el("b",null,x.n+", "+x.pt));
    b.appendChild(el("small",null,TIERS[x.r][0]+" · "+(full?"no spots open":"+"+money(TIERS[x.r][1])+" a month"+(o!=null?" · "+o+" of 3 spots open":""))));
    b.onclick=function(){areas.push(x);$("xas").value="";box.innerHTML="";render();$("xas").focus();};
    box.appendChild(b);
  });
}
function render(){
  var p=plan(),fix=p==="fix_track",max=C.maxq[p];if(xq>max)xq=max;
  $("xqv").textContent=xq+(xq===1?" extra question":" extra questions")+(xq?" (+"+money(xq*10)+" a month)":"");
  $("xqn").textContent=(C.inc+xq)+" questions a month in all."+(!fix&&xq>=max?" Track goes up to 6. Fix & Track can track more.":"");
  $("xqm").disabled=xq<=0;$("xqp").disabled=xq>=max;
  f.elements.extra_questions.value=xq;
  $("xa").style.display=fix?"":"none";
  var ul=$("xal");ul.innerHTML="";
  areas.forEach(function(a,i){
    var li=el("li");li.appendChild(el("b",null,a.n+", "+a.pt));
    li.appendChild(el("small",null,TIERS[a.r][0]+" · +"+money(TIERS[a.r][1])+" a month"));
    var b=el("button","x","Remove");b.type="button";b.setAttribute("aria-label","Remove "+a.n);b.onclick=function(){areas.splice(i,1);render();};
    li.appendChild(b);ul.appendChild(li);
  });
  f.elements.extra_areas.value=JSON.stringify(fix?areas.map(function(a){return {id:a.id,n:a.n,pt:a.pt,r:a.r};}):[]);
  var rr=fix&&f.elements.review_requests&&f.elements.review_requests.checked;
  var pr=fix?C.fix:C.track;
  var add=xq*10+(fix?areas.reduce(function(s,a){return s+TIERS[a.r][1];},0):0)+(rr?C.rrm:0);
  var t=$("tot");t.innerHTML="";
  var l1=el("p");l1.appendChild(el("b",null,"Monthly: "+money(pr.now+add)));
  if(pr.months&&pr.now!==pr.base)l1.appendChild(document.createTextNode(" for your first "+(pr.months===1?"month":pr.months+" months")+", then "+money(pr.base+add)));
  t.appendChild(l1);
  if(fix){var l2=el("p");l2.appendChild(el("b",null,"One-time setup: "+money(C.setup+(rr?C.rrs:0))));l2.appendChild(document.createTextNode(", with your first payment"));t.appendChild(l2);}
  t.appendChild(el("p","small","HST is added at checkout."));
}
$("xqm").onclick=function(){xq=Math.max(0,xq-1);render();};
$("xqp").onclick=function(){xq=xq+1;render();};
$("xas").addEventListener("focus",load);
$("xas").addEventListener("input",function(){load();search();});
f.addEventListener("change",function(e){if(e.target.name==="plan"||e.target.name==="review_requests")render();});
render();
})();
