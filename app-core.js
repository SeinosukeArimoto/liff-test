(function(root){
'use strict';
var E=typeof module!=='undefined'&&module.exports?require('../plan_pdf/src/engine.js'):root.PlanEngine;
var JC=typeof module!=='undefined'&&module.exports?require('./juken-core.js'):root.JukenCore;
var TYPES={test:'定期テスト',exam:'検定',juken:'大学受験（志望校から逆算）',habit:'習慣作り',task:'課題・タスク'};
function fail(s){throw new Error(s)}
function copy(x){return JSON.parse(JSON.stringify(x))}
function text(x,max){return String(x==null?'':x).trim().slice(0,max||120)}
function number(x,min,max){var n=Number(x);if(!Number.isInteger(n)||n<min||n>max)fail(min+'〜'+max+'の整数を入力してください');return n}
function date(x){if(!/^\d{4}-\d{2}-\d{2}$/.test(x)||new Date(x+'T00:00:00Z').toISOString().slice(0,10)!==x)fail('日付を確認してください');return x}
function add(d,n){return E.addDays(d,n)}
function days(a,b){return Math.round((Date.parse(b)-Date.parse(a))/86400000)}
function defaultProfile(){return {availability:[30,30,30,30,30,60,0],reserveDay:'',busyDates:[],custom:false}}
function empty(){return {version:1,plans:[],activeId:null,records:{},feedback:[],history:[],settings:{todo:'07:00',report:'20:00',same:false,wd:0,wt:'20:00',notifyTo:'auto'},teacherSettings:{wd:1,wt:'09:00',late:true,lateDays:3,edited:true,mode:'まとめて1通'},checkedWeek:null,profile:defaultProfile()}}
function activePlans(doc){return doc.plans.filter(function(p){return p.status==='active'})}
function active(doc){var m=doc.plans.find(function(p){return p.id===doc.activeId&&p.status==='active'});return m||activePlans(doc)[0]||null}
function withProfile(d,input){var o=copy(input||{}),pr=d.profile||defaultProfile();['availability','reserveDay','busyDates'].forEach(function(k){if(pr.custom||o[k]===undefined)o[k]=copy(pr[k])});if(pr.custom)o.busyNote='';return o}
function validateProfile(p){var o=copy(p||{});if(!Array.isArray(o.availability)||o.availability.length!==7)fail('曜日ごとの時間を入力してください');o.availability=o.availability.map(function(n){return number(n,0,720)});if(!o.availability.some(function(n){return n>0}))fail('少なくとも1日は、勉強時間を選んでください');o.reserveDay=['月','火','水','木','金','土','日'].indexOf(o.reserveDay)>=0?o.reserveDay:'';o.busyDates=(Array.isArray(o.busyDates)?o.busyDates:[]).filter(function(x){return x&&x.from}).map(function(x){var f=date(x.from),e=x.to?date(x.to):f;if(e<f)fail('勉強できない日の終わりは、始まり以降にしてください');if(days(f,e)>61)fail('勉強できない日は、1つにつき62日までにしてください');return {from:f,to:e}}).slice(0,12);o.custom=true;return o}
function normalize(input,today){
 var a=copy(input||{});if(!TYPES[a.type])fail('計画の種類を選んでください');a.title=text(a.title);if(!a.title)fail('計画の名前を入力してください');
 a.start=date(a.start||today);a.goal=date(a.type==='habit'?add(a.start,27):a.type==='task'?add(a.start,6):(a.goal||add(a.start,14)));if(days(a.start,a.goal)<0||days(a.start,a.goal)>180)fail('開始日から180日以内の終了日を選んでください');
 if(a.start<today)fail('開始日は今日以降にしてください');

 // Notion「計画アンケートv3」：C＝習慣作り（週何日・1日何分・曜日ごとのメニュー）、C'＝課題・タスク（残りの量・提出日・提出日が近い順・期間は1週間）
 if(a.type==='task'){
  a.homeworks=(Array.isArray(a.homeworks)?a.homeworks:[]).map(function(h,i){h=h||{};var nm=text(h.name);if(!nm)fail('課題の名前を入力してください');var u=['ページ','枚','問題の番号'].indexOf(h.unit)>=0?h.unit:fail('数え方を選んでください');var um=(h.unitMin===''||h.unitMin==null)?null:number(h.unitMin,1,60);var fr=h.from==null?1:number(h.from,1,100000),am=number(h.amount,1,100000),due=date(h.due);if(due<a.start)fail('提出日は、開始日以降にしてください');return {name:nm,subject:text(h.subject||'学習',30),unit:u,amount:am,from:fr,due:due,unitMin:um,_i:i}});
  if(!a.homeworks.length||a.homeworks.length>10)fail('課題は1〜10件で入力してください');
  a.homeworks.sort(function(x,y){return x.due<y.due?-1:x.due>y.due?1:x._i-y._i});a.homeworks.forEach(function(h){delete h._i});a.goal=a.homeworks[a.homeworks.length-1].due;if(days(a.start,a.goal)>180)fail('提出日は、開始日から180日以内にしてください');
  a.materials=a.homeworks.map(function(h){return {name:h.name,subject:h.subject,from:h.from,to:h.from+h.amount-1,unit:h.unit,minutes:h.unitMin==null?(/数学/.test(h.subject)?15:10):h.unitMin,provisional:h.unitMin==null}});}
 if(a.type==='habit'){
  var hb=a.habit||{},menu=(Array.isArray(hb.menu)?hb.menu:[]).map(function(x){return x==='やらない日'?'休み':x}),OPT=['英語','数学','国語','理科・社会','学校の宿題','休み'];
  if(menu.length!==7||menu.some(function(x){return OPT.indexOf(x)<0}))fail('曜日ごとのメニューを選んでください');
  var gmn=number(hb.goalMin,5,360);
  var gd=menu.filter(function(x){return x!=='休み'}).length;if(gd<1)fail('取り組む日を、1日以上入れてください');   // 週に何日かは、曜日ごとのメニュー（休み以外）の数
  a.habit={goalDays:gd,goalMin:gmn,lastWeekDays:['0日','1〜2日','3〜4日','5日以上'].indexOf(hb.lastWeekDays)>=0?hb.lastWeekDays:'',menu:menu.slice(),cMaterials:text(hb.cMaterials||'',200)};a.materials=[]}
 a.materials=(a.materials||[]).map(function(m){var name=text(m.name);if(!name)fail('教材・課題の名前を入力してください');return {name:name,subject:text(m.subject||'学習',30),from:number(m.from,1,100000),to:number(m.to,1,100000),unit:['ページ','問題の番号','単語の番号','枚'].indexOf(m.unit)>=0?m.unit:'ページ',minutes:number(m.minutes,1,60),provisional:!!m.provisional};});
 var auto=a.type==='juken'&&a.juken&&a.juken.autoTasks&&Array.isArray(a.juken.subjects)&&a.juken.subjects.length>0;
 if((!a.materials.length&&!auto&&a.type!=='habit')||a.materials.length>10)fail('教材は1〜10個で入力してください');a.materials.forEach(function(m){if(m.to<m.from)fail('終わりの番号は始めの番号以上にしてください')});
 if(!Array.isArray(a.availability)||a.availability.length!==7)fail('曜日ごとの時間を入力してください');a.availability=a.availability.map(function(n){return number(n,0,720)});if(!a.availability.some(function(n){return n>0}))fail('少なくとも1日は勉強時間を選んでください');a.target=text(a.target,200);
 if(a.type==='juken'&&a.juken){var j=a.juken,ex=/^\d{4}-\d{2}$/.test(j.examYm)?j.examYm:fail('入試の年月を、YYYY-MMの形で入力してください');
  var span=days(a.start,ex+'-01');if(span<0||span>365*8)fail('入試の年月を確認してください');
  a.juken={band:number(j.band,1,7),examYm:ex,univ:text(j.univ,60),dev:j.dev==null||j.dev===''?null:Number(j.dev),mockType:['河合','東進','進研','駿台'].indexOf(j.mockType)>=0?j.mockType:'',mockScore:j.mockScore==null||j.mockScore===''?null:Number(j.mockScore),route:'',autoTasks:!!auto,owned:Array.isArray(j.owned)?j.owned.slice(0,20).map(function(x){return {id:text(x&&x.id,20),name:text(x&&x.name,60)}}).filter(function(x){return x.id||x.name}):[],doneMats:(Array.isArray(j.doneMats)?j.doneMats:[]).slice(0,40).map(function(x){var ck=['ok','half','weak','part'].indexOf(x&&x.check)>=0?x.check:'ok',o={id:text(x&&x.id,20),name:text(x&&x.name,60),check:ck};if(ck==='part'){var cm=JC.catalog()[o.id],ps=Math.floor(Number(x.pos));if(!(ps>=1)||(cm&&ps>cm[3]))fail('どこまで終わったかを、確認してください（最大'+(cm?cm[3]:'')+'）');o.pos=ps}return o}).filter(function(x){return x.id}),others:Array.isArray(j.others)?j.others.map(Number).filter(function(b,i,arr){return Number.isInteger(b)&&b>=1&&b<=7&&arr.indexOf(b)===i}).slice(0,6):[],subjects:Array.isArray(j.subjects)?j.subjects.map(function(x){return text(x,20)}).filter(function(x,i,arr){return x&&arr.indexOf(x)===i}):[]};
  var sd={},sdr=j.subjectDevs&&typeof j.subjectDevs==='object'?j.subjectDevs:{};a.juken.subjects.forEach(function(x){var v=sdr[x];if(v==null||v==='')return;v=Number(v);if(!(v>=20&&v<=85))fail('偏差値を確認してください：'+x);sd[x]=v});a.juken.subjectDevs=sd;
  a.juken.finished=(Array.isArray(j.finished)?j.finished:[]).filter(function(f){return f&&a.juken.subjects.indexOf(f.subject)>=0&&['ok','half','weak'].indexOf(f.check)>=0&&text(f.id,20)}).slice(0,80).map(function(f){return {subject:f.subject,id:text(f.id,20),check:f.check}});
  if(a.juken.subjects.length>12)fail('科目は12個までです');var known=JC.subjectsOf();a.juken.subjects.forEach(function(x){if(known.indexOf(x)<0)fail('科目を確認してください：'+x)});
  if(a.juken.dev!=null&&!(a.juken.dev>=30&&a.juken.dev<=85))fail('志望校の偏差値を確認してください');if(a.juken.mockScore!=null&&!(a.juken.mockScore>=20&&a.juken.mockScore<=85))fail('模試の偏差値を確認してください');}
 // 元のエンジンの決まり：学校の課題の時間（週）・予備日・行事の日は、使える時間から引く／勉強しない。定期テスト・検定・受験は、ゴールの2日前まで（前日は見直しだけ）
 
 a.reserveDay=['月','火','水','木','金','土','日'].indexOf(a.reserveDay)>=0?a.reserveDay:'';
 a.busyNote=text(a.busyNote,200);if(Array.isArray(a.busyDates)&&a.busyDates.length){var md=function(x){return Number(x.slice(5,7))+'/'+Number(x.slice(8,10))};a.busyDates=a.busyDates.filter(function(x){return x&&x.from}).map(function(x){var f=date(x.from),e=x.to?date(x.to):f;if(e<f)fail('勉強できない日の終わりは、始まり以降にしてください');if(days(f,e)>61)fail('勉強できない日は、1つにつき62日までにしてください');return {from:f,to:e}});a.busyNote=a.busyDates.map(function(x){return x.from===x.to?md(x.from):md(x.from)+'〜'+md(x.to)}).join('、')}
 a.end=(a.type==='test'||a.type==='exam'||a.type==='juken')?add(a.goal,-2):a.goal;
 if(days(a.start,a.end)<0)fail('終了日は、開始日の2日後以降にしてください（終了日の前日は、見直しだけの日です）');
 return a;
}
function rowOf(a){
 var labels=null,row={style:a.type==='exam'?'検定':'定期テスト',goal_date:a.goal,'作成日':add(a.start,-1),test_type:a.title,exam_name:a.title,reserve_day:a.reserveDay,busy_note:a.busyNote};
 ['mon','tue','wed','thu','fri','sat','sun'].forEach(function(k,i){row['avail_'+k]=a.availability[i]+'分'});
 a.materials.forEach(function(m,i){var k='task'+(i+1)+'_';Object.assign(row,{[k+'subject']:m.subject,[k+'material']:m.name,[k+'unit']:m.unit,[k+'start']:m.from,[k+'end']:m.to,[k+'unit_min']:m.minutes+'分'})});
 return row;
}
function materialsOf(a,row){var mats=E._internal.readMaterials(row);mats.forEach(function(m,i){m.unitMin=Math.ceil(a.materials[i].minutes*1.5);m.unitRaw=a.materials[i].minutes;m.provisional=false});return mats}
// ---------- 上段（教材ごとの期間）から、下段（日ごとの取り組むこと）を作る／下段の実績を、上段に返す ----------
function unitInfo(u){
 if(u==='ページ')return {u:'ページ',f:function(x,y){return 'p.'+x+(y>x?'〜'+y:'')}};
 if(u==='題'||u==='問')return {u:'問題の番号',f:function(x,y){return 'No.'+x+(y>x?'〜'+y:'')}};
 if(u==='語')return {u:'単語の番号',f:function(x,y){return x+(y>x?'〜'+y:'')+'番'}};
 return {u:'',f:function(x,y){return x+(y>x?'〜'+y:'')+u}};
}
// 教材の期間のうち、勉強できる日（時間がある曜日・行事でない・予備日でない）に、残りの量を均等に割る
function winEnd(a,from){var l=a.end||a.goal,w=add(from,13);return w<l?w:l}
function tasksFromRoute(a,id,plans,fromDate,tag,until){
 var limit=a.end||a.goal,outLimit=until||winEnd(a,fromDate),maxTo=fromDate;plans.forEach(function(sp){if(!sp.missing)sp.items.forEach(function(it){if(!it.finished&&it.to>maxTo)maxTo=it.to})});
 var days=bdays(fromDate,maxTo>limit?maxTo:limit,rowOf(a)).days.filter(function(d){return d.kind==='study'&&d.cap>0}),out=[],n=0,lanes=[];      // 量は、教材の期間の全体（計画の終了日を過ぎても）に割り、計画の終了日までの分だけ、取り組むことにする
 plans.forEach(function(sp){if(sp.missing)return;sp.items.forEach(function(it){
  if(it.finished||!it.total)return;var done=it.doneUnits||0,remain=it.total-done;if(remain<=0)return;
  var lo0=it.from<fromDate?fromDate:it.from,ds=days.filter(function(d){return d.date>=lo0&&d.date<=it.to});if(!ds.length)return;
  lanes.push({it:it,sp:sp,ui:unitInfo(it.unit),first:ds[0].date,last:ds[ds.length-1].date,ds:ds,next:done+1,left:remain,um:it.minPerUnit||5})})});
 lanes.sort(function(x,y){return x.it.to<y.it.to?-1:x.it.to>y.it.to?1:0});      // 終わりが早い教材から
 // 1日ずつ、その日の使える時間の中で、教材ごとに「残りの量÷残りの日数」を置く。単位（1問・1ページ）で割り切れない端数は、前の日と後ろの日に、散らす
 days.forEach(function(day){
  var left=day.cap,placed=0;
  var put=function(l,k){var lo=l.next,hi=lo+k-1,mins=Math.max(1,Math.ceil(k*l.um));l.next=hi+1;l.left-=k;left-=mins;placed++;
   if(day.date<=outLimit)out.push({id:id+'-'+tag+'-'+(n++),date:day.date,name:l.it.name,subject:l.sp.subject,text:l.it.name+' '+l.ui.f(lo,hi),from:lo,to:hi,unit:l.ui.u,minutes:mins,item:l.it.id,jsubj:l.sp.subject})};
  // その日に置く教材：「残りの量÷残りの日数」を、教材ごとの希望にして、合計が使える時間を超えるときは、希望の割合で、全部の教材から、同じ割合で減らす。余った時間は、希望の足りない教材から、1つずつ
  var act=lanes.filter(function(l){return l.left>0&&day.date>=l.first&&day.date<=l.last}).map(function(l){var rd=0;l.ds.forEach(function(x){if(x.date>=day.date)rd++});var want=Math.min(Math.ceil(l.left/Math.max(1,rd)),l.left);return {l:l,want:want,k:want}});
  var tw=act.reduce(function(m,x){return m+x.want*x.l.um},0);
  if(tw>left){var sc=left/tw;act.forEach(function(x){x.k=Math.floor(x.want*sc+1e-9)});var spent=act.reduce(function(m,x){return m+x.k*x.l.um},0),rest=left-spent;
   for(;;){var best=null;act.forEach(function(x){if(x.k<x.want&&x.l.um<=rest+1e-9&&(!best||(x.want-x.k)/x.want>(best.want-best.k)/best.want))best=x});if(!best)break;best.k++;rest-=best.l.um}}
  act.forEach(function(x){if(x.k>0)put(x.l,x.k)});
  if(!placed&&!day.noForce){var f=lanes.filter(function(l){return l.left>0&&day.date>=l.first&&day.date<=l.last})[0];if(f)put(f,1)}      // 1つも置けない日は、いちばん急ぐ教材を1つだけ
 });
 return out;
}
// 教材ごとの、実際に進んだ量（できた＝全部、途中まで＝位置まで）
function itemActual(p,records,it,subj){var done=0;p.tasks.forEach(function(t){if(t.item===it.id&&t.jsubj===subj&&t.from!=null){var r=records[t.id];if(!r)return;if(r.mode==='done')done+=t.to-t.from+1;else if(r.mode==='partial'&&r.position!=null)done+=Math.max(0,Math.min(r.position,t.to)-t.from+1)}});return done}
function lastRecord(p,records,it,subj){var last=null;p.tasks.forEach(function(t){if(t.item===it.id&&t.jsubj===subj&&records[t.id]&&records[t.id].mode!=='none'&&(!last||t.date>last))last=t.date});return last}
// 日ごとの実績を、上段に反映する：終わった教材（実績の合計≧総学習量）は固定。遅れている教材は、残りの量で、今日から並べ直す（後ろの教材が、ずれる）。早く終わると、次が早まる
function syncUpper(p,records,today){
 (p.juken.materials||[]).forEach(function(sp){if(sp.missing)return;
  sp.items.forEach(function(it){if(!it.tracked||!it.total||it.preDone)return;
   it.doneUnits=(it.baseDone||0)+itemActual(p,records,it,sp.subject);
   if(it.doneUnits>=it.total){it.finished=true;var last=lastRecord(p,records,it,sp.subject);if(last&&last<it.to)it.to=last}
   else{it.finished=false;if(it.doneUnits>0||it.from<=today)it.weeks=Math.max(1,Math.ceil((it.total-it.doneUnits)/(it.pace*(it.speed||1))))}});
  JC.relayoutFrom(sp,today,p.juken.examYm)});
}
// 上段を直したあと：今日以降で、記録のない日ごとの取り組むことを作り直す。過去の未記録には「組み直し済み」の印
function regenTasks(p,records,today,tag,keepMiss){
 if(!keepMiss)p.tasks.forEach(function(t){if(t.item!==undefined&&t.date<today&&!records[t.id]&&!t.rescheduled)t.rescheduled=today});
 var keep=p.tasks.filter(function(t){return t.item===undefined||t.date<today||records[t.id]}),fresh=tasksFromRoute(p.input,p.id,p.juken.materials,today<p.start?p.start:today,tag);
 p.tasks=keep.concat(fresh).sort(function(x,y){return x.date<y.date?-1:x.date>y.date?1:0});p.tasksUntil=winEnd(p.input,today<p.start?p.start:today);
}
function hwWarnings(a,tasks,remaining){var w=[];if(a.type!=='task')return w;var mdd=function(x){return Number(x.slice(5,7))+'/'+Number(x.slice(8,10))};a.homeworks.forEach(function(h){var last='';tasks.forEach(function(t){if(t.name===h.name&&t.date>last)last=t.date});var left=(remaining||[]).some(function(l){return String(l.text).indexOf(h.name)===0});if(left||(last&&last>h.due))w.push('「'+h.name+'」は、提出日（'+mdd(h.due)+'）までに終わりません。削るものを、講師と決めてください');if(h.unitMin==null)w.push('「'+h.name+'」の1ページの時間は、仮の値です。実際に計って、直してください')});return w}
// ---------- 教材を並行して進める（定期テスト・検定）----------
// 決めたこと：教材は、前から順ではなく、毎日、残りの量に応じて、時間を分け合って進める（残りが多い教材ほど、多く）。どの教材も、同じころに終わる。
// 1日の時間が余れば、残りが多い教材に1ページずつ足す。1日に1つも置けないときは、その日の最初の1つだけ置く。
function fillPar(days,tasks){
 var lanes=[],by={};
 tasks.forEach(function(t){var l=by[t.name];if(!l){l=by[t.name]={segs:[],si:0,used:0};lanes.push(l)}l.segs.push(t)});
 function cur(l){return l.si<l.segs.length?l.segs[l.si]:null}
 function rem(l){var r=0;for(var i=l.si;i<l.segs.length;i++)r+=(i===l.si?l.segs[i].units-l.used:l.segs[i].units)*l.segs[i].unitMin;return r}
 function room(l,c){var t=cur(l);return t?t.units-l.used-c:0}
 days.forEach(function(day){
  if(day.kind!=='study'||day.cap<=0)return;
  var left=day.cap,cnt=lanes.map(function(){return 0}),placed=0;
  for(var round=0;round<6&&left>0;round++){
   var tot=0;lanes.forEach(function(l,i){tot+=Math.max(0,rem(l)-cnt[i]*(cur(l)?cur(l).unitMin:0))});if(tot<=0)break;
   var before=placed,L=left;
   lanes.forEach(function(l,i){var t=cur(l);if(!t)return;var r=rem(l)-cnt[i]*t.unitMin,n=Math.min(Math.floor(L*r/tot/t.unitMin),room(l,cnt[i]));if(n>0){cnt[i]+=n;left-=n*t.unitMin;placed+=n}});
   for(;;){var bi=-1,br=0;lanes.forEach(function(l,i){var t=cur(l);if(!t||room(l,cnt[i])<=0||t.unitMin>left)return;var r=rem(l)-cnt[i]*t.unitMin;if(r>br){br=r;bi=i}});if(bi<0)break;cnt[bi]++;left-=cur(lanes[bi]).unitMin;placed++}
   if(placed===before)break;
  }
  if(!placed&&!day.noForce){var bi2=-1,br2=0;lanes.forEach(function(l,i){if(cur(l)&&rem(l)>br2){br2=rem(l);bi2=i}});if(bi2>=0){cnt[bi2]=1;placed=1}}
  lanes.forEach(function(l,i){
   var n=cnt[i];if(n<=0)return;var t=cur(l);
   var a=t.numeric?t.start+l.used*t.size:null,b=t.numeric?Math.min(t.end,t.start+(l.used+n)*t.size-1):null,minutes=n*t.unitMin;
   day.items.push({text:t.label(a,b),min:minutes,subject:t.subject,provisional:t.provisional,name:t.name,from:a,to:b,unit:t.unit});day.minutes+=minutes;
   l.used+=n;if(l.used>=t.units){l.si++;l.used=0}
  });
 });
 var leftovers=[];
 lanes.forEach(function(l){for(var i=l.si;i<l.segs.length;i++){var t2=l.segs[i],u0=i===l.si?l.used:0,rest=t2.units-u0;if(rest<=0)continue;var a2=t2.numeric?t2.start+u0*t2.size:null,b2=t2.numeric?t2.end:null;leftovers.push({text:t2.label(a2,b2),min:rest*t2.unitMin})}});
 return leftovers;
}
// 課題の計画：課題ごとに、提出日の前日までの勉強できる日数で、均等に割る。提出日が近い課題から先に置く。足りない分は後ろに回り、置ききれなければ「入りきらない範囲」に出る
function fillDue(days,tasks,dueOf){
 var lanes=[],by={};
 tasks.forEach(function(t){var l=by[t.name];if(!l){l=by[t.name]={segs:[],si:0,used:0,due:dueOf(t.name)||'9999-12-31'};lanes.push(l)}l.segs.push(t)});
 lanes.sort(function(x,y){return x.due<y.due?-1:x.due>y.due?1:0});
 function cur(l){return l.si<l.segs.length?l.segs[l.si]:null}
 function remU(l){var r=0;for(var i=l.si;i<l.segs.length;i++)r+=i===l.si?l.segs[i].units-l.used:l.segs[i].units;return r}
 days.forEach(function(day){
  if(day.kind!=='study'||day.cap<=0)return;
  var left=day.cap,placed=0;
  function put(l,n){var t=cur(l),a=t.numeric?t.start+l.used*t.size:null,b=t.numeric?Math.min(t.end,t.start+(l.used+n)*t.size-1):null,minutes=n*t.unitMin;day.items.push({text:t.label(a,b),min:minutes,subject:t.subject,provisional:t.provisional,name:t.name,from:a,to:b,unit:t.unit});day.minutes+=minutes;left-=minutes;placed+=n;l.used+=n;if(l.used>=t.units){l.si++;l.used=0}}
  lanes.forEach(function(l){
   var t=cur(l);if(!t)return;
   var last=l.due>day.date?add(l.due,-1):day.date,dl=0;days.forEach(function(d){if(d.kind==='study'&&d.cap>0&&d.date>=day.date&&d.date<=last)dl++});if(dl<1)dl=1;
   var n=Math.min(Math.ceil(remU(l)/dl),t.units-l.used,Math.floor(left/t.unitMin));
   if(n>0)put(l,n)});
  if(!placed&&!day.noForce){for(var i=0;i<lanes.length;i++){if(cur(lanes[i])){put(lanes[i],1);break}}}
 });
 var leftovers=[];
 lanes.forEach(function(l){for(var i=l.si;i<l.segs.length;i++){var t2=l.segs[i],u0=i===l.si?l.used:0,rest=t2.units-u0;if(rest<=0)continue;var a2=t2.numeric?t2.start+u0*t2.size:null,b2=t2.numeric?t2.end:null;leftovers.push({text:t2.label(a2,b2),min:rest*t2.unitMin})}});
 return leftovers;
}
function dueMap(a){var m={};(a.homeworks||[]).forEach(function(h){if(m[h.name]==null)m[h.name]=h.due});return function(n){return m[n]}}
var OTHER=null,OTHERH=null;   // 日付 → ほかの進行中の計画が、その日に使っている分数（勉強できる時間は、全部の計画で共有。計画ごとには、増えない）
function bdays(start,end,row,habit){var b=E._internal.buildDays(start,end,row),oth=habit?OTHERH:OTHER;if(oth)b.days.forEach(function(dy){var o=oth(dy.date);if(o>0&&dy.kind==='study'){dy.cap=Math.max(0,dy.cap-o);dy.noForce=true}});return b}
function finMap(list){var m={};(list||[]).forEach(function(f){(m[f.subject]=m[f.subject]||{})[f.id]=f.check});return m}
function examEndOf(examYm,from,fallback){var e=examYm+'-15';return e>=from?e:fallback}   // 入試の月の15日（計画の期間は、受験では、最長180日だが、使える量は、入試まで数える）
function capacityOf(built){var t=0;built.days.forEach(function(d){if(d.kind==='study')t+=d.cap});return t}   // 使える量：日ごとの時間の合計（予備日・行事の日・ほかの計画が使う分は、引いてある）
function build(input,today,id){
 var a=normalize(input,today),row=rowOf(a);
 // The engine accepts enumerated measured minutes; preserve arbitrary numeric inputs by using its read-material objects below.
 var built=bdays(a.start,a.end,row,a.type==='habit'),mats=materialsOf(a,row);
 var remaining=[];
 if(a.type==='habit'){
  built.days.forEach(function(d){var m=a.habit.menu[d.dow];if(!m||m==='休み'||d.kind!=='study')return;var minutes=Math.min(a.habit.goalMin,d.cap);if(minutes<=0)return;   /* 1日の時間（宿題・勉強しない日・予備日・ほかの計画の分を引いたもの）と、目標の小さいほう */
  d.items.push({text:m+' ・ '+minutes+'分',name:m,subject:m,min:minutes,from:null,to:null,unit:'分'})});
 }else{remaining=a.type==='task'?fillDue(built.days,mats,dueMap(a)):fillPar(built.days,mats)}
 var tasks=[];built.days.forEach(function(d){d.items.forEach(function(t){tasks.push({id:id+'-'+tasks.length,date:d.date,name:t.name,subject:t.subject,text:t.text,from:t.from,to:t.to,unit:t.unit,minutes:t.min})})});
 var jk=null,rm,wm=undefined;
 if(a.juken){var jp=JC.plan({weeklyMinutes:wm,band:a.juken.band,others:a.juken.others,univ:{dev:a.juken.dev},mock:a.juken.mockType&&a.juken.mockScore!=null?{type:a.juken.mockType,score:a.juken.mockScore}:null,mockType:a.juken.mockType||'河合',subjectDevs:a.juken.subjectDevs,finished:finMap(a.juken.finished),doneMats:a.juken.doneMats,capacity:capacityOf(bdays(a.start,examEndOf(a.juken.examYm,a.start,a.end),row)),start:a.start,examYm:a.juken.examYm,subjects:a.juken.subjects,owned:a.juken.owned});rm=jp.roadmap;if(a.juken.autoTasks){jp.materials.forEach(function(sp){(sp.items||[]).forEach(function(i){i.tracked=true})});tasks=tasksFromRoute(a,id,jp.materials,a.start,'u')}
  jk={autoTasks:!!a.juken.autoTasks,weeklyMinutes:wm,subjectDevs:a.juken.subjectDevs,mockType:a.juken.mockType||'河合',finishedInput:a.juken.finished,doneInput:a.juken.doneMats,load:jp.load,recommend:jp.recommend,start:a.start,dev:a.juken.dev,mock:a.juken.mockType&&a.juken.mockScore!=null?{type:a.juken.mockType,score:a.juken.mockScore}:null,subjects:a.juken.subjects,ownedInput:a.juken.owned,reviews:[],lastReview:null,materials:jp.materials,owned:jp.owned,baseBand:jp.baseBand,mixedNote:jp.mixedNote,others:a.juken.others,band:jp.band,bandName:jp.bandName,route:jp.route,routeName:jp.routeName,gap:jp.gap,adjustNote:jp.adjustNote,ratioNote:jp.ratioNote,univ:a.juken.univ,examYm:a.juken.examYm}}
 return {id:id,type:a.type,title:a.title,target:a.target,input:a,start:a.start,goal:a.goal,end:a.end,tasks:tasks,leftovers:remaining,roadmap:rm,juken:jk,warnings:built.busy.unparsed.map(function(x){return '行事のメモを読み取れませんでした：'+x}).concat(hwWarnings(a,tasks,remaining)),status:'active',resumeAfter:null,tasksUntil:(a.juken&&a.juken.autoTasks)?winEnd(a,a.start):null};
}

// ---------- 遅れの組み直し（記録を残したまま、まだ終わっていない範囲を、残りの日に並べ直す）----------
// 決めたこと：記録のある取り組むことと、過去の取り組むことは、そのまま残す。終わっていない範囲（やらなかった・途中まで・記録なし）を集め直し、今日（今日に記録があれば明日）から終了日まで並べる。
// 予備日には置かない（予備日は、余裕として残す）。手で足した取り組むこと（教材にない取り組むこと）は、そのまま残す。手で直した日割りは、組み直しで置き換わる。
function doneRange(t,rec){
 if(!rec||rec.mode==='none')return null;
 if(t.from==null||t.to==null)return rec.mode==='done'?[0,0]:null;           // 番号のない取り組むことは、「できた」のときだけ終わり
 if(rec.mode==='done')return [t.from,rec.position!=null&&rec.position>t.to?rec.position:t.to];
 return rec.position!=null&&rec.position>=t.from?[t.from,Math.min(rec.position,t.to)]:null;
}
function subtract(list,lo,hi){var out=[];list.forEach(function(r){if(hi<r[0]||lo>r[1]){out.push(r);return}if(lo>r[0])out.push([r[0],lo-1]);if(hi<r[1])out.push([hi+1,r[1]])});return out}
function replan(p,records,today,id){
 var a=p.input,end=p.end||p.goal,rec=function(t){return records[t.id]};
 var startDay=p.tasks.some(function(t){return t.date===today&&rec(t)})?add(today,1):today;if(startDay<p.start)startDay=p.start;
 if(days(startDay,end)<0)fail('終了日までに、組み直せる日が残っていません');
 var row=rowOf(a),mats=materialsOf(a,row),names={};mats.forEach(function(m){names[m.name]=true});
 var kept=p.tasks.filter(function(t){return t.date<startDay||rec(t)||!names[t.name]});       // 過去・記録済み・手で足した取り組むこと
 var queue=[];
 mats.forEach(function(m){
  var mine=p.tasks.filter(function(t){return t.name===m.name&&rec(t)});
  if(!m.numeric){var fin=mine.some(function(t){return records[t.id].mode==='done'});if(!fin)queue.push(m);return}
  var left=[[m.start,m.end]];
  mine.forEach(function(t){var r=doneRange(t,records[t.id]);if(r)left=subtract(left,r[0],r[1])});
  left.forEach(function(r){queue.push(Object.assign({},m,{start:r[0],end:r[1],units:Math.ceil((r[1]-r[0]+1)/m.size)}))});
 });
 p.tasks.forEach(function(t){if(t.date<startDay&&!rec(t)&&names[t.name])t.rescheduled=today});   // 過去の未記録は「組み直し済み」の印（遅れとして数え続けない）
 var built=bdays(startDay,end,row),leftovers=(a.type==='task'?function(dd,q){return fillDue(dd,q,dueMap(a))}:fillPar)(built.days,queue),made=[];
 built.days.forEach(function(d){d.items.forEach(function(t){made.push({id:p.id+'-r'+today+'-'+made.length,date:d.date,name:t.name,subject:t.subject,text:t.text,from:t.from,to:t.to,unit:t.unit,minutes:t.min})})});
 return {tasks:kept.concat(made).sort(function(x,y){return x.date<y.date?-1:x.date>y.date?1:0}),leftovers:leftovers,moved:made.length,startDay:startDay};
}

// ---------- 進み具合（達成率・遅れ・連続記録）----------
// 達成率は、取り組むことの数ではなく、時間（量）で数える：できた＝全部、途中まで＝位置から割合、やらなかった・記録なし＝0。今日までの取り組むことが分母
function fraction(t,rec){
 if(!rec||rec.mode==='none')return 0;if(rec.mode==='done')return 1;
 if(t.from==null&&t.unit==='分')return rec.position!=null&&t.minutes>0?Math.max(0,Math.min(1,rec.position/t.minutes)):0;   // 習慣：分数の割合
 if(t.from==null||t.to==null||rec.position==null||t.to<t.from)return 0;
 return Math.max(0,Math.min(1,(rec.position-t.from+1)/(t.to-t.from+1)));
}
function progress(doc,today){return progressOf(doc,active(doc),today)}
function pctOf(p,rec,from,to,today){var m=0,d=0;p.tasks.forEach(function(t){if(t.date<from||t.date>to||t.date>today)return;m+=t.minutes;d+=t.minutes*fraction(t,rec[t.id])});return m?Math.round(d/m*100):null}
function progressOf(doc,p,today){
 if(!p)return null;
 var rec=doc.records,ws=week(today);
 function pct(from,to){return pctOf(p,rec,from,to,today)}
 var missed=p.tasks.filter(function(t){return t.date<today&&!rec[t.id]&&!t.rescheduled});
 var remaining=0;p.tasks.forEach(function(t){if(t.rescheduled)return;remaining+=t.minutes*(1-fraction(t,rec[t.id]))});(p.leftovers||[]).forEach(function(l){remaining+=l.min||0});
 var cap=0,from=p.tasks.some(function(t){return t.date===today&&rec[t.id]})?add(today,1):today,end=p.end||p.goal;
 if(from<p.start)from=p.start;
 var oth={};doc.plans.forEach(function(q){if(q.status==='active'&&q.id!==p.id)q.tasks.forEach(function(t){oth[t.date]=(oth[t.date]||0)+(t.minutes||0)})});   // 勉強できる時間は、ほかの進行中の計画と共有
 if(days(from,end)>=0&&p.type!=='habit')E._internal.buildDays(from,end,rowOf(p.input)).days.forEach(function(d){if(d.kind==='study')cap+=Math.max(0,d.cap-(oth[d.date]||0))});
 var set={};p.tasks.forEach(function(t){if(rec[t.id])set[t.date]=1});Object.keys(rec).forEach(function(k){if(k.indexOf('time:')===0)set[k.slice(5)]=1});
 var streak=0,d=set[today]?today:add(today,-1);while(set[d]){streak++;d=add(d,-1)}
 return {planId:p.id,achievement:{thisWeek:pct(ws,add(ws,6)),lastWeek:pct(add(ws,-7),add(ws,-1)),twoWeeksAgo:pct(add(ws,-14),add(ws,-8)),overall:pct(p.start,today)},
  missedCount:missed.length,missedMinutes:missed.reduce(function(a,t){return a+t.minutes},0),remainingMinutes:Math.round(remaining),capacityMinutes:cap,
  fits:p.type==='habit'||remaining<=cap,needsReplan:p.type!=='habit'&&missed.length>0,streak:streak};
}

// ---------- 帳票（PDFの元のHTML）：計画表・進み具合・月ごとの道筋・実績・講師のひとこと・履歴 ----------
var DOW=['月','火','水','木','金','土','日'];
function esc(x){return String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function md(x){return Number(x.slice(5,7))+'/'+Number(x.slice(8,10))}
function dowOf(x){return DOW[(new Date(x+'T00:00:00Z').getUTCDay()+6)%7]}
function posText(t,pos){var u=t.unit;return (u==='ページ'?'p.'+pos:u==='問題の番号'?'No.'+pos:u==='単語の番号'?pos+'番':String(pos))+'まで'}
function recLabel(t,rec,today){
 if(rec){if(rec.mode==='done')return 'できた';if(rec.mode==='none')return 'やらなかった';return rec.position!=null?posText(t,rec.position):'途中まで'}
 if(t.rescheduled)return '組み直し済み';return t.date<today?'未記録':'';
}
function pctText(v){return v==null?'—':v+'%'}
// その日の勉強時間：取り組むことの記録から、自動で合計する（できた＝予定の分数、一部＝予定の分数×進んだ割合、習慣で多くやった＝入れた分数、やらなかった＝0）。記録がなければ null。以前に手で入れた時間があれば、それを使う
function studyMinutes(doc,date){var m=doc.records['time:'+date];if(m)return m.minutes;var tot=0,any=false;doc.plans.forEach(function(q){q.tasks.forEach(function(t){if(t.date!==date)return;var r=doc.records[t.id];if(!r)return;any=true;if(r.mode==='none')return;if(r.mode==='done')tot+=(t.unit==='分'&&r.position!=null&&r.position>t.minutes)?r.position:t.minutes;else tot+=Math.round(t.minutes*fraction(t,r))})});return any?tot:null}
function printHtml(doc,plan,name,today){
 var rec=doc.records||{},g=progressOf(doc,plan,today)||{achievement:{}},end=plan.end||plan.goal,a=g.achievement||{};
 var h='<html><head><meta charset="utf-8"><style>@page{size:A4;margin:12mm}body{font-family:sans-serif;font-size:10pt;color:#222}h1{font-size:18pt;margin:0 0 4px}h2{font-size:12pt;margin:16px 0 6px;border-bottom:2px solid #f28c28;padding-bottom:2px}h3{font-size:10.5pt;margin:12px 0 4px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:5px 7px;text-align:left;vertical-align:top}th{background:#fdeedd}tr{page-break-inside:avoid}.sub{color:#666;margin:2px 0}.warn{color:#b26a00}.lt{color:#888}</style></head><body>';
 h+='<h1>'+esc(plan.title)+'</h1><p class="sub">'+esc(name)+'　'+md(plan.start)+'〜'+md(plan.goal)+(end!==plan.goal?'（取り組むことは、'+md(end)+'まで。前日は見直し）':'')+'　作成：'+esc(today)+'</p>';
 if(plan.target)h+='<p class="sub">目標：'+esc(plan.target)+'</p>';
 (plan.warnings||[]).forEach(function(w){h+='<p class="warn">'+esc(w)+'</p>'});
 h+='<h2>進み具合</h2><table><tr><th>今週</th><th>先週</th><th>先々週</th><th>ここまでの全体</th><th>記録の連続</th><th>遅れ</th></tr><tr><td>'+pctText(a.thisWeek)+'</td><td>'+pctText(a.lastWeek)+'</td><td>'+pctText(a.twoWeeksAgo)+'</td><td>'+pctText(a.overall)+'</td><td>'+(g.streak||0)+'日</td><td>'+(g.missedCount?g.missedCount+'個（約'+g.missedMinutes+'分）':'なし')+'</td></tr></table>';
 if(g.remainingMinutes!=null&&plan.type!=='habit')h+='<p class="sub">残りの量：約'+g.remainingMinutes+'分　残りの日の枠：約'+g.capacityMinutes+'分'+(g.fits?'（入ります）':'<span class="warn">（入りきりません。組み直しや、量の見直しが必要です）</span>')+'</p>';
 if((plan.roadmap||[]).length)h+='<h2>月ごとの道筋（講師）</h2><table><tr><th style="width:18%">月</th><th>方針</th></tr>'+plan.roadmap.map(function(m){return '<tr><td>'+Number(m.month.slice(5))+'月（'+m.month.slice(0,4)+'）</td><td>'+esc(m.text)+'</td></tr>'}).join('')+'</table>';
 h+='<h2>日ごとの計画と実績</h2>';
 var tasks=plan.tasks.slice().sort(function(x,y){return x.date<y.date?-1:x.date>y.date?1:(x.id<y.id?-1:1)}),weeks={},order=[];
 tasks.forEach(function(t){var k=week(t.date);if(!weeks[k]){weeks[k]=[];order.push(k)}weeks[k].push(t)});
 if(!tasks.length)h+='<p class="sub">取り組むことはありません。</p>';
 order.forEach(function(k){
  var ts=weeks[k],mins=ts.reduce(function(s2,t){return s2+t.minutes},0),pc=k<=today?pctOf(plan,rec,k,add(k,6),today):null,times=[];
  for(var i=0;i<7;i++){var sm=studyMinutes(doc,add(k,i));if(sm!=null)times.push(md(add(k,i))+' '+sm+'分')}
  h+='<h3>'+md(k)+'〜'+md(add(k,6))+(k===week(today)?'（今週）':'')+'　計画 約'+mins+'分'+(pc==null?'':'　達成 '+pc+'%')+'</h3><table><tr><th style="width:15%">日付</th><th>取り組むこと</th><th style="width:11%">目安</th><th style="width:19%">結果</th></tr>';
  ts.forEach(function(t){var l=recLabel(t,rec[t.id],today);h+='<tr><td>'+md(t.date)+'（'+dowOf(t.date)+'）</td><td>'+esc(t.text)+'</td><td>'+t.minutes+'分</td><td'+(l==='未記録'?' class="warn"':l==='組み直し済み'?' class="lt"':'')+'>'+esc(l)+'</td></tr>'});
  h+='</table>'+(times.length?'<p class="sub">勉強時間の記録：'+esc(times.join('、'))+'</p>':'');
 });
 if((plan.leftovers||[]).length)h+='<h2>入りきらなかった範囲</h2>'+plan.leftovers.map(function(t){return '<p>'+esc(t.text)+'（約'+t.min+'分）</p>'}).join('');
 var fb=(doc.feedback||[]).slice(0,5);
 if(fb.length)h+='<h2>講師のひとこと</h2>'+fb.map(function(f){return '<p><span class="lt">'+esc(String(f.at||'').slice(0,10))+'　'+esc(f.by)+'</span><br>'+esc(f.text).replace(/\n/g,'<br>')+'</p>'}).join('');
 var hs=(doc.history||[]).slice(0,10);
 if(hs.length)h+='<h2>変更履歴</h2><table><tr><th style="width:18%">日付</th><th style="width:12%">だれが</th><th>内容</th></tr>'+hs.map(function(x){return '<tr><td>'+esc(String(x.at||'').slice(0,10))+'</td><td>'+esc(x.by)+'</td><td>'+esc(x.text)+'</td></tr>'}).join('')+'</table>';
 return h+'</body></html>';
}
function validateSettings(s,teacher){var out=copy(s||{});['todo','report','wt'].forEach(function(k){if(k in out&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(out[k]))fail('時刻を確認してください')});if('wd' in out)number(out.wd,0,6);if('notifyTo' in out&&['auto','self','mother','father','all'].indexOf(out.notifyTo)<0)fail('通知を受け取る人を確認してください');if(out.same)out.report=out.todo;return teacher?teacherSettingsOf(out):out}
// 講師の通知：曜日・時刻だけ設定できる。必要なときの通知（報告が3日ない・生徒が計画を作成／修正）と、届き方（まとめて1通）は、決まり
function teacherSettingsOf(s){var o=Object.assign({},empty().teacherSettings,s||{});o.late=true;o.lateDays=3;o.edited=true;o.mode='まとめて1通';return o}
// ---------- 個別に直す：番号のある取り組むことは、範囲と時間を自動で決め、抜け・重なりが出ないよう、同じ教材の残りを並べ直す ----------
function sizeOf(t){return t.unit==='単語の番号'?10:1}
function matOf(p,name){var l=(p.input&&p.input.materials)||[];for(var i=0;i<l.length;i++)if(l[i].name===name)return l[i];return null}
function taskMin(p,t,from,to){var m=matOf(p,t.name);return m?Math.max(1,Math.ceil((to-from+1)/sizeOf(t))*Math.ceil(m.minutes*1.5)):t.minutes}
function labelOf(t,from,to){return t.name+' '+(t.unit==='ページ'?'p.':t.unit==='問題の番号'?'No.':'')+from+(to>from?'〜'+to:'')+(t.unit==='単語の番号'?'番':t.unit==='枚'?'枚':'')}
function editable(t){return t.from!=null&&t.to!=null&&!t.item}
function reflow(p,records,today,name,ov,extra){
 var fut=p.tasks.filter(function(t){return t.name===name&&editable(t)&&!records[t.id]&&t.date>=today});if(!fut.length)return {};
 var rs=fut.map(function(t){return [t.from,t.to]}).concat(extra||[]).sort(function(x,y){return x[0]-y[0]}),R=[];
 rs.forEach(function(r){var l=R[R.length-1];if(l&&r[0]<=l[1]+1)l[1]=Math.max(l[1],r[1]);else R.push([r[0],r[1]])});
 var total=0;R.forEach(function(r){total+=r[1]-r[0]+1});if(ov&&ov.size>total)fail('この教材の残りの範囲（'+total+'）を超えています');
 fut.sort(function(x,y){return x.date<y.date?-1:x.date>y.date?1:x.id<y.id?-1:x.id>y.id?1:0});
 var ri=0,pos=R[0][0],out=[];
 fut.forEach(function(t){var size=ov&&ov.id===t.id?ov.size:t.to-t.from+1;while(ri<R.length&&pos>R[ri][1]){ri++;if(ri<R.length)pos=R[ri][0]}
  if(ri>=R.length){out.push({t:t,lo:null});return}var hi=Math.min(R[ri][1],pos+size-1);out.push({t:t,lo:pos,hi:hi});pos=hi+1});
 var rest=[];for(var k=ri;k<R.length;k++){var st=(k===ri)?pos:R[k][0];if(st<=R[k][1])rest.push([st,R[k][1]])}
 var used=out.filter(function(o){return o.lo!=null}),grown=0;
 if(ov&&out.some(function(o){return o.t.id===ov.id&&o.lo==null}))fail('この日には、入りきりません。ほかの日を選んでください');
 if(rest.length){var last=used[used.length-1];if(last&&rest.length===1&&rest[0][0]===last.hi+1){grown=rest[0][1]-last.hi;last.hi=rest[0][1]}else fail('この変更だと、範囲に抜けが出ます。終わりの番号を変えてください')}
 used.forEach(function(o){o.t.from=o.lo;o.t.to=o.hi;o.t.text=labelOf(o.t,o.lo,o.hi);o.t.minutes=taskMin(p,o.t,o.lo,o.hi)});
 var drop={};out.forEach(function(o){if(o.lo==null)drop[o.t.id]=true});if(Object.keys(drop).length)p.tasks=p.tasks.filter(function(t){return !drop[t.id]});
 return {grown:grown,dropped:Object.keys(drop).length}
}
function remainingMaterials(p,records,collapse){
 // 記録した範囲（できた・途中まで）を引いた、残りの範囲。飛び飛びでも、そのまま別々の範囲にする（やった範囲を、また置かないため）。10件を超えるときは、最初から最後までを1つにする
 var out=[],all=(p.input.materials||[]);all.forEach(function(m){var left=[[m.from,m.to]];p.tasks.forEach(function(t){if(t.name===m.name&&records[t.id]){var r=doneRange(t,records[t.id]);if(r&&r[0]>0)left=subtract(left,r[0],r[1])}});
  if(!left.length)return;if(collapse){var c=copy(m);c.from=left[0][0];c.to=left[left.length-1][1];out.push(c);return}
  left.forEach(function(r){var c=copy(m);c.from=r[0];c.to=r[1];out.push(c)})});
 if(!collapse&&out.length>10)return remainingMaterials(p,records,true);return out
}
// 教材（範囲のリスト）を、今日以降の空いている時間に、並行して並べる。すでにある取り組むことの時間は引く。入りきらない分を返す
function layMaterials(p,today,ctx,segs,tag){
 var inp2=copy(p.input);inp2.materials=segs;inp2.start=today<p.start?p.start:today;inp2.goal=p.goal;var a2=normalize(inp2,today),row2=rowOf(a2),bt=bdays(a2.start,a2.end,row2);
 bt.days.forEach(function(dy){var used=p.tasks.reduce(function(m,t){return t.date===dy.date?m+(t.minutes||0):m},0);dy.cap=Math.max(0,dy.cap-used);if(used>0)dy.noForce=true});
 var lo=fillPar(bt.days,materialsOf(a2,row2)),n=0;bt.days.forEach(function(dy){dy.items.forEach(function(t){p.tasks.push({id:ctx.id+'-'+tag+(n++),date:dy.date,name:t.name,subject:t.subject,text:t.text,from:t.from,to:t.to,unit:t.unit,minutes:t.min})})});
 p.tasks.sort(function(x,y){return x.date<y.date?-1:x.date>y.date?1:0});return lo
}
// 今日以降の、記録のない取り組むことを、全部の教材で、並行して並べ直す（教材を足す・外す・範囲を直す・休む のあと）。やった範囲と、過去の未記録（遅れ）は、そのまま
function relayFuture(p,d,today,ctx,tag){
 var mats=p.input.materials||[],names={};mats.forEach(function(m){names[m.name]=1});
 p.tasks=p.tasks.filter(function(t){return !(names[t.name]&&editable(t)&&t.date>=today&&!d.records[t.id])});
 var segs=[];mats.forEach(function(m){var left=[[m.from,m.to]];
  p.tasks.forEach(function(t){if(t.name!==m.name||!editable(t))return;if(!d.records[t.id]&&t.rescheduled)return;var r=d.records[t.id]?doneRange(t,d.records[t.id]):[t.from,t.to];if(r&&r[0]>0)left=subtract(left,r[0],r[1])});
  left.forEach(function(r){var c=copy(m);c.from=r[0];c.to=r[1];segs.push(c)})});
 if(segs.length>10){var by={};segs.forEach(function(c){var b=by[c.name];if(!b)by[c.name]=copy(c);else{b.from=Math.min(b.from,c.from);b.to=Math.max(b.to,c.to)}});segs=Object.keys(by).map(function(k){return by[k]})}
 p.leftovers=(p.leftovers||[]).filter(function(l){return !mats.some(function(m){return String(l.text).indexOf(m.name)===0})});
 if(segs.length)p.leftovers=p.leftovers.concat(layMaterials(p,today,ctx,segs,tag))
}
// 習慣の、今日以降の記録のない取り組むことを、今の勉強できる時間で、作り直す（ほかの習慣の分だけ引く。ほかの計画の分は引かない）
function relayHabit(q,d,today,ctx,tag){
 var inp2=withProfile(d,copy(q.input));inp2.start=today<q.start?q.start:today;inp2.goal=q.goal;var a2=normalize(inp2,today);a2.end=q.end||q.goal;var row2=rowOf(a2);
 q.tasks=q.tasks.filter(function(t){return t.date<today||d.records[t.id]});
 var bt=bdays(a2.start,a2.end,row2,true),n=0;
 bt.days.forEach(function(dy){var m=q.input.habit.menu[dy.dow];if(!m||m==='休み'||dy.kind!=='study')return;var minutes=Math.min(q.input.habit.goalMin,dy.cap);if(minutes<=0)return;if(q.tasks.some(function(t){return t.date===dy.date}))return;q.tasks.push({id:ctx.id+'-'+tag+'-'+(n++),date:dy.date,name:m,subject:m,text:m+' ・ '+minutes+'分',from:null,to:null,unit:'分',minutes:minutes})});
 q.tasks.sort(function(x,y){return x.date<y.date?-1:x.date>y.date?1:0})
}
function apply(doc,action,actor,ctx){
 var d=copy(doc),a=action||{},p=d.plans.find(function(p){return p.id===a.planId}),msg='',now=ctx.now,today=ctx.today;
 function mkOther(excl,habitOnly){return function(date){var m=0;d.plans.forEach(function(q){if(q.status==='active'&&q.id!==excl&&(!habitOnly||q.type==='habit'))q.tasks.forEach(function(t){if(t.date===date)m+=(t.minutes||0)})});return m}}
 OTHER=mkOther(p?p.id:null,false);OTHERH=mkOther(p?p.id:null,true);
 // 計画を足した・消した・止めた・勉強できる時間を変えたとき：進行中のすべての計画の、今日以降の記録のない取り組むことを、今の時間で計算し直す
 // 習慣が先（作った順）。そのあと、ほかの計画は、1日の残りの時間を、「1日に必要な量」（残りの量÷残りの日数）の割合で分ける。分けた時間に入りきらない分は、ほかの計画が使い残した時間に入れる。やった分と、過去の未記録は、そのまま
 function mkOtherOrd(q,habitOnly,doneIds){return function(date){var m=0;d.plans.forEach(function(r){if(r.status!=='active'||r.id===q.id||(habitOnly&&r.type!=='habit'))return;r.tasks.forEach(function(t){if(t.date===date&&(t.date<today||d.records[t.id]||doneIds[r.id]))m+=(t.minutes||0)})});return m}}
 function fixedUse(q,date){var m=0;d.plans.forEach(function(r){if(r.status!=='active'||r.id===q.id)return;r.tasks.forEach(function(t){if(t.date===date&&(r.type==='habit'||t.date<today||d.records[t.id]))m+=(t.minutes||0)})});return m}
 function remainMin(q){var m=0;if(q.juken&&q.juken.materials){q.juken.materials.forEach(function(sp){if(sp.missing)return;sp.items.forEach(function(it){if(it.finished||!it.total)return;m+=Math.max(0,it.total-(it.doneUnits||0))*(it.minPerUnit||5)})});return m}q.tasks.forEach(function(t){if(t.date>=today&&!d.records[t.id])m+=(t.minutes||0)});(q.leftovers||[]).forEach(function(l){m+=(l.min||0)});return m}
 function rawCaps(q,from,to){var inp2=withProfile(d,copy(q.input));inp2.start=from;inp2.goal=q.goal;var a2=normalize(inp2,today),map={};E._internal.buildDays(from,to,rowOf(a2)).days.forEach(function(dy){map[dy.date]=dy.kind==='study'?dy.cap:0});return map}
 function relayAll(){
  var act=d.plans.filter(function(q){return q.status==='active'}),done={},hab=act.filter(function(q){return q.type==='habit'}),oth=act.filter(function(q){return q.type!=='habit'});
  act.forEach(function(q){var w=withProfile(d,q.input);['availability','reserveDay','busyDates','busyNote'].forEach(function(k){if(w[k]!==undefined)q.input[k]=w[k]})});
  var run=function(q,k,tag){
   try{
    if(q.type==='habit')relayHabit(q,d,today,ctx,tag+k);
    else if(q.juken){if(q.juken.autoTasks){syncUpper(q,d.records,today);refreshUpper(q,{changes:[],warnings:[]},tag+k)}}
    else if(q.type==='task'){var rr=replan(q,d.records,today,ctx.id);q.tasks=rr.tasks;q.leftovers=rr.leftovers}
    else relayFuture(q,d,today,ctx,tag+k)
   }catch(e){/* 並べ直せる日が残っていない計画は、そのまま */}};
  hab.forEach(function(q,k){OTHER=mkOtherOrd(q,false,done);OTHERH=mkOtherOrd(q,true,done);run(q,k,'q');done[q.id]=true});
  // ほかの計画：1日に必要な量の割合で、時間を分ける
  var W={},span={},raw={};oth.forEach(function(q){var from=today<q.start?q.start:today,end=q.juken?examEndOf(q.juken.examYm,from,q.end||q.goal):(q.end||q.goal);span[q.id]=[from,end];W[q.id]=Math.max(1,remainMin(q))/Math.max(1,days(from,end)+1);try{raw[q.id]=rawCaps(q,from,end)}catch(e){raw[q.id]=null}});
  oth.forEach(function(q,k){
   OTHERH=mkOtherOrd(q,true,done);
   OTHER=function(date){var hf=fixedUse(q,date),rc=raw[q.id],s=span[q.id];if(!rc||rc[date]==null||date<s[0]||date>s[1])return hf;var tot=0;oth.forEach(function(r){var sr=span[r.id];if(date>=sr[0]&&date<=sr[1])tot+=W[r.id]});var free=Math.max(0,rc[date]-hf);return hf+free*(1-(tot>0?W[q.id]/tot:1))};
   run(q,k,'p')});
  // 分けた時間に入りきらなかった計画は、ほかの計画が使い残した時間に入れる
  oth.forEach(function(q,k){if(q.juken||!(q.leftovers&&q.leftovers.length))return;OTHER=function(date){var m=0;d.plans.forEach(function(r){if(r.status==='active'&&r.id!==q.id)r.tasks.forEach(function(t){if(t.date===date)m+=(t.minutes||0)})});return m};OTHERH=mkOtherOrd(q,true,done);run(q,k,'s')});
  OTHER=mkOther(p?p.id:null,false);OTHERH=mkOther(p?p.id:null,true)}
 // 受験の計画の教材の期間を、今の時間・偏差値・終わった教材で、計算し直す（月1回の見直しと、勉強できる時間を変えたときに使う）。終わった教材・講師が直した教材・手で足した教材は、そのまま
 function refreshUpper(p,rv,tag){var jr=p.juken,devNow=jr.gap?jr.gap.current:(jr.mock?JC.correct0(jr.mock.type,jr.mock.score):null);
   var rdevs={};Object.keys(jr.subjectDevs||{}).forEach(function(sn){rdevs[sn]=JC.correct0(jr.mockType||'河合',jr.subjectDevs[sn])});
   var fresh=JC.materialPlan({band:jr.band,subjects:jr.subjects,start:today,examYm:jr.examYm,route:jr.route,owned:jr.ownedInput,dev:devNow,devs:rdevs,target:jr.dev,finished:finMap(jr.finishedInput),doneMats:jr.doneInput,capacity:capacityOf(bdays(today<p.start?p.start:today,examEndOf(jr.examYm,today<p.start?p.start:today,p.end||p.goal),rowOf(p.input)))});jr.load=fresh.load;jr.recommend=fresh.recommend;
  jr.materials=jr.materials.map(function(old){
   var nw=fresh.filter(function(x){return x.subject===old.subject})[0];if(!nw||nw.missing||old.missing)return old;
   var bySlot={};nw.items.forEach(function(i){bySlot[i.slot]=i});var out=[],seen={};
   old.items.forEach(function(it){
    if(it.slot==null||it.locked||it.finished||(!it.tracked&&it.to<today)){out.push(it);if(it.slot!=null)seen[it.slot]=1;return}
    var n2=bySlot[it.slot];seen[it.slot]=1;if(!n2){rv.changes.push(old.subject+'：「'+it.name+'」は、見送りになりました');return}
    if(it.tracked){n2.tracked=true;n2.doneUnits=it.doneUnits||0;if(n2.doneUnits>0)n2.weeks=Math.max(1,Math.ceil((n2.total-n2.doneUnits)/(n2.pace*(n2.speed||1))))}
    if(n2.weeks!==it.weeks)rv.changes.push(old.subject+'：「'+it.name+'」の期間が、'+it.weeks+'週から'+n2.weeks+'週に変わりました');
    if(n2.replaced&&!it.replaced)rv.changes.push(old.subject+'：「'+n2.name+'」を、手持ちの教材として使えるようになりました');
    if(it.hold&&!n2.hold&&!n2.replaced)rv.changes.push(old.subject+'：保留の「'+it.hold.ownName+'」が、解除されました');
    out.push(n2)});
   nw.items.forEach(function(i){if(!seen[i.slot]){if(jr.autoTasks)i.tracked=true;out.push(i)}});
   out.sort(function(x,y){return (x.slot==null?9999:x.slot)-(y.slot==null?9999:y.slot)||0});
   var sp2={subject:old.subject,dev:nw.dev,minutes:nw.minutes,items:out,skipped:nw.skipped||old.skipped||[]};JC.relayoutFrom(sp2,today,jr.examYm);
   if(!sp2.fits)rv.warnings.push(old.subject+'：入試までに終わりません（約'+sp2.shortDays+'日、足りません）。教材の見送りや、期間の見直しを検討してください');
   return sp2});
  if(jr.autoTasks)regenTasks(p,d.records,today,tag);
  if(!p.roadmapEdited)p.roadmap=JC.withMaterials(JC.roadmap({band:jr.band,route:jr.route,start:jr.start,examYm:jr.examYm}),jr.materials)}
 function task(){if(!p)fail('計画が見つかりません');var t=p.tasks.find(function(t){return t.id===a.taskId});if(!t)fail('取り組むことが見つかりません');return t}
 switch(a.type){
 case 'create':
  p=build(withProfile(d,a.input),today,ctx.id);if(d.plans.length>=8)fail('テスト環境では計画は8個までです');d.plans.push(p);d.activeId=p.id;relayAll();msg='計画「'+p.title+'」を作成';break;
 case 'pause_plan':if(!p)fail('計画が見つかりません');if(p.status!=='active')fail('進行中の計画だけ、一時停止できます');p.status='paused';p.pausedAt=today;p.resumeAfter=null;if(d.activeId===p.id){var nx0=activePlans(d)[0];d.activeId=nx0?nx0.id:p.id}relayAll();msg='計画「'+p.title+'」を一時停止';break;
 case 'set_profile':d.profile=validateProfile(a.profile);relayAll();msg='勉強に使える時間を変更';break;
 case 'activate':if(!p)fail('計画が見つかりません');shiftPaused(p,d,today);p.status='active';p.resumeAfter=null;d.activeId=p.id;if(p.type==='habit')relayAll();msg='計画「'+p.title+'」を再開';break;
 case 'report':var t=task();if(actor.role==='teacher')fail('記録は生徒の画面から行ってください');if(t.date>today)fail('未来の日の実績は記録できません');if(['done','partial','extra','none'].indexOf(a.mode)<0)fail('記録の種類を確認してください');
  // 途中まで：予定の範囲の中の位置（最後まで入れたら、全部できた）。予定より多く：予定の最後より先の位置（先にやった分を、あとの取り組むことから消す）
  var hab=(t.from==null&&t.unit==='分');   // 習慣作りの取り組むこと：番号ではなく、分数で記録する
  var matEnd=t.to==null?null:Math.max(t.to,((p.input.materials||[]).find(function(m){return m.name===t.name})||{to:t.to}).to);
  if(a.mode==='extra'&&!hab&&(t.to==null||matEnd<=t.to))fail('この取り組むことには、予定より多くは記録できません');
  var end=a.mode==='partial'&&hab?number(a.position,1,t.minutes):a.mode==='extra'&&hab?number(a.position,t.minutes+1,360):a.mode==='partial'?(a.position==null&&t.from==null?null:number(a.position,t.from==null?0:t.from,t.to==null?180:t.to)):a.mode==='extra'?number(a.position,t.to+1,matEnd):null;var rmode=a.mode;
  if(rmode==='partial'&&(hab?end>=t.minutes:t.to!=null&&end!=null&&end>=t.to)){rmode='done';end=null}
  if(rmode==='extra'&&hab)rmode='done';
  if(rmode==='extra'){rmode='done';var xe=end,xs=t.to+1;p.tasks=p.tasks.filter(function(x){return !(x.id!==t.id&&x.name===t.name&&editable(x)&&!d.records[x.id]&&x.from>=xs&&x.to<=xe)});p.tasks.forEach(function(x){if(x.id!==t.id&&x.name===t.name&&editable(x)&&!d.records[x.id]&&x.from<=xe&&x.to>xe){x.from=xe+1;x.text=labelOf(x,x.from,x.to);x.minutes=taskMin(p,x,x.from,x.to)}})}
 var prevRec=d.records[t.id];d.records[t.id]={mode:rmode,position:end,date:t.date,updatedAt:now};
 if(prevRec&&prevRec.mode==='done'&&prevRec.position!=null&&t.to!=null&&prevRec.position>t.to&&!(end!=null&&end>=prevRec.position)&&p.type!=='habit'&&p.type!=='task'&&!p.juken)relayFuture(p,d,today,ctx,'x');/* 先にやった分を取り消したら、あとの取り組むことに戻す */msg=t.name+'の進み具合を記録';if(a.carry&&t.from==null&&a.mode!=='done'){var nd=add(today,1);if(nd>p.goal)fail('計画の終了日を過ぎるため、明日には回せません');p.tasks.push({id:ctx.id+'-c',date:nd,name:t.name,subject:t.subject,text:t.text+'（続き）',minutes:t.minutes,from:null,to:null,unit:''})}break;
 case 'study_time':if(actor.role==='teacher')fail('学習時間は生徒が記録します');date(a.date);if(a.date>today)fail('未来の学習時間は記録できません');d.records['time:'+a.date]={minutes:number(a.minutes,0,1440),updatedAt:now};msg='勉強時間を記録';break;
 case 'edit_task':var t=task();if(d.records[t.id])fail('記録済みの取り組むことは変更できません');t.date=date(a.date);if(t.date<today||t.date>p.goal)fail('移動先は今日から計画終了日までにしてください');
  if(editable(t)){var size=a.to!=null?number(a.to,t.from,100000)-t.from+1:t.to-t.from+1,rf=reflow(p,d.records,today,t.name,{id:t.id,size:size});msg=t.name+'の日割りを変更'+(rf.grown?'（最後の取り組むことが'+rf.grown+'増えました）':'')}
  else if(t.item){msg=t.name+'の日割りを変更'}
  else{t.text=text(a.text,200);if(!t.text)fail('取り組むことを入力してください');t.minutes=number(a.minutes,1,360);msg=t.name+'の日割りを変更'}break;
 case 'delete_plan':if(!p)fail('計画が見つかりません');var dpTitle=p.title,wasActive=d.activeId===p.id;p.tasks.forEach(function(t){delete d.records[t.id]});d.plans=d.plans.filter(function(q){return q.id!==p.id});
  if(wasActive){var nx=activePlans(d)[0]||null;d.activeId=nx?nx.id:null}
  relayAll();msg='計画「'+dpTitle+'」を削除';break;
 case 'delete_task':var t=task();if(d.records[t.id])fail('記録済みの取り組むことは削除できません');var wasEd=editable(t)&&t.date>=today;p.tasks=p.tasks.filter(function(x){return x.id!==a.taskId});if(wasEd){if(p.tasks.some(function(x){return x.name===t.name&&editable(x)&&!d.records[x.id]&&x.date>=today}))reflow(p,d.records,today,t.name,null,[[t.from,t.to]]);else p.leftovers=(p.leftovers||[]).concat([{text:labelOf(t,t.from,t.to),min:t.minutes}])}msg=t.name+'を取り組むことから削除';break;
 case 'add_material':
  if(!p)fail('計画が見つかりません');if(p.type==='habit'||p.type==='task'||p.juken)fail('この計画には、教材を足せません');
  var am=a.material||{},amn=text(am.name);if(!amn)fail('教材の名前を入力してください');var amats=p.input.materials=p.input.materials||[];
  if(amats.some(function(m){return m.name===amn}))fail('同じ名前の教材が、すでにあります');if(amats.length>=10)fail('教材は10個までです');
  var nmat={name:amn,subject:text(am.subject||'学習',30),from:number(am.from,1,100000),to:number(am.to,1,100000),unit:['ページ','問題の番号','単語の番号','枚'].indexOf(am.unit)>=0?am.unit:'ページ',minutes:number(am.minutes,1,60),provisional:false};
  if(nmat.to<nmat.from)fail('終わりの番号は始めの番号以上にしてください');
  amats.push(nmat);relayFuture(p,d,today,ctx,'m');
  msg='教材を追加：'+amn;break;
 case 'edit_material':
  if(!p)fail('計画が見つかりません');if(p.type==='habit'||p.type==='task'||p.juken)fail('この計画では、教材の範囲を修正できません');
  var en=text(a.name),emats=p.input.materials||[],em=emats.find(function(m){return m.name===en});if(!em)fail('その教材は、この計画にありません');
  var ef=number(a.from,1,100000),et=number(a.to,1,100000),emin=number(a.minutes==null||a.minutes===''?em.minutes:a.minutes,1,60);if(et<ef)fail('終わりの番号は始めの番号以上にしてください');
  em.from=ef;em.to=et;em.minutes=emin;relayFuture(p,d,today,ctx,'e');msg='教材の範囲を修正：'+en;break;
 case 'drop_material':
  if(!p)fail('計画が見つかりません');if(p.type==='habit'||p.type==='task'||p.juken)fail('この計画では、教材を外せません');
  var dn=text(a.name),dmats=p.input.materials||[];if(!dmats.some(function(m){return m.name===dn}))fail('その教材は、この計画にありません');if(dmats.length<=1)fail('教材が1つだけのときは、外せません。計画ごと削除してください');
  p.tasks=p.tasks.filter(function(t){return t.name!==dn||d.records[t.id]});p.input.materials=dmats.filter(function(m){return m.name!==dn});p.leftovers=(p.leftovers||[]).filter(function(l){return String(l.text).indexOf(dn)!==0});relayFuture(p,d,today,ctx,'d');msg='教材を外しました：'+dn;break;
 case 'add_task':if(!p)fail('計画が見つかりません');var dt=date(a.date);if(dt<today||dt>p.goal)fail('追加する日付を確認してください');var nm=text(a.name);if(!nm)fail('教材名を入力してください');
  if(a.unit&&p.type!=='habit'){if(['ページ','問題の番号','単語の番号'].indexOf(a.unit)<0)fail('数え方を確認してください');var mats=p.input.materials=p.input.materials||[];if(mats.some(function(m){return m.name===nm}))fail('同じ名前の教材が、すでにあります。「取り組むことを直す」で、範囲を変えてください');if(mats.length>=10)fail('教材は10個までです');var f0=number(a.from,1,100000),e0=number(a.to,f0,100000),um=number(a.unitMinutes==null||a.unitMinutes===''?5:a.unitMinutes,1,60),sj=text(a.subject||'学習',30);mats.push({name:nm,subject:sj,from:f0,to:e0,unit:a.unit,minutes:um});var nt={id:ctx.id,date:dt,name:nm,subject:sj,from:f0,to:e0,unit:a.unit,text:'',minutes:0};nt.text=labelOf(nt,f0,e0);nt.minutes=taskMin(p,nt,f0,e0);p.tasks.push(nt);msg='取り組むことを追加';break}
  p.tasks.push({id:ctx.id,date:dt,name:nm,subject:text(a.subject||'学習',30),text:text(a.text||nm,200),minutes:number(a.minutes,1,360),from:null,to:null,unit:''});msg='取り組むことを追加';break;
 case 'rest_today':
  if(!p||p.status!=='active')fail('進行中の計画だけ、休めます');var rtk=p.tasks.filter(function(t){return t.date===today&&!d.records[t.id]});if(!rtk.length)fail('今日は、休める取り組むことがありません');
  if(p.type==='habit'||p.juken){rtk.forEach(function(t){d.records[t.id]={mode:'none',position:null,date:t.date,updatedAt:now}});msg='今日は休む（今日取り組むことを、やらなかったにした）';break}
  // 今日を、勉強しない日にして、今日取り組むことを、これからの日に組み直す
  p.input.busyDates=(p.input.busyDates||[]).concat([{from:today,to:''}]);if(p.type==='task'){var rrp=replan(p,d.records,today,ctx.id);p.tasks=rrp.tasks;p.leftovers=rrp.leftovers;p.replannedAt=today}else relayFuture(p,d,today,ctx,'z');msg='今日は休む（今日取り組むことを、あとの日に回した）';break;
 case 'move_day':if(!p)fail('計画が見つかりません');var dest=date(a.date);if(dest<=today||dest>p.goal)fail('移動先は明日以降、計画終了日までにしてください');var moving=p.tasks.filter(function(t){return t.date===today&&!d.records[t.id]});if(!moving.length)fail('今日から移せる取り組むことがありません');moving.forEach(function(t){t.date=dest});msg='今日の未記録の取り組むことを'+dest+'へ移動';break;
 case 'rebuild':if(!p)fail('計画が見つかりません');var input=withProfile(d,a.input);input.start=(a.input&&a.input.start&&a.input.start>today)?a.input.start:today;   // 開始日を先にしたら、その日から。それ以外は、今日から
var retained=p.tasks.filter(function(t){return t.date<today||d.records[t.id]});
  if(p.juken){var jn=build(input,today,ctx.id);retained.forEach(function(t){if(!d.records[t.id]&&t.date<today)t.rescheduled=today});jn.juken.reviews=p.juken.reviews||[];jn.juken.lastReview=p.juken.lastReview||null;var keepRoad=p.roadmapEdited?p.roadmap:null;
   p.input=jn.input;p.juken=jn.juken;p.roadmap=keepRoad||jn.roadmap;p.title=jn.title;p.target=jn.target;p.goal=jn.goal;p.end=jn.end;p.warnings=jn.warnings;
   if(p.juken.autoTasks){syncUpper(p,d.records,today);p.leftovers=[];regenTasks(p,d.records,today,'b'+today)}else{p.tasks=p.tasks.filter(function(t){return t.date<today||d.records[t.id]}).concat(jn.tasks);p.leftovers=jn.leftovers}
   msg='条件を変更して取り組むことを再作成（受験逆算）';break}
  if(retained.length){if(p.juken)fail('受験逆算の計画は、「遅れを組み直す」を使ってください');if(p.type!=='habit'){input.materials=remainingMaterials(p,d.records,p.type==='task');if(!input.materials.length)fail('すべての範囲が終わっています');if(p.type==='task')input.homeworks=(p.input.homeworks||[]).map(function(h){var rm=input.materials.find(function(m){return m.name===h.name});return rm?Object.assign({},h,{from:rm.from,amount:rm.to-rm.from+1}):null}).filter(Boolean)}}
  var n=build(input,today,ctx.id);retained.forEach(function(t){if(!d.records[t.id]&&t.date<today)t.rescheduled=today});
  p.input=n.input;p.tasks=retained.concat(n.tasks);p.goal=n.goal;p.title=n.title;p.target=n.target;p.leftovers=n.leftovers;if(p.type==='habit')relayAll();msg='条件を変更して取り組むことを再作成';break;
 case 'replan':if(!p||p.status!=='active')fail('進行中の計画だけ、組み直せます');if(p.type==='habit')fail('習慣作りの計画は、組み直しません');if(p.juken&&p.juken.autoTasks){syncUpper(p,d.records,today);regenTasks(p,d.records,today,'r'+today);msg='上段の教材の進みを反映して、日ごとの計画を組み直し';break}
  var rp=replan(p,d.records,today,ctx.id);p.tasks=rp.tasks;p.leftovers=rp.leftovers;p.replannedAt=today;msg='遅れを組み直し（'+rp.startDay+'から'+rp.moved+'件）';break;
 case 'juken_adjust':
  // 講師が、受験逆算の教材を調整する（自動で作った下書きを、最後に直す）。操作：weeks（期間）／skip（見送り）／replace（差し替え）／accept_hold・reject_hold（保留を決める）／add（追加）
  if(actor.role!=='teacher')fail('講師の操作が必要です');if(!p||!p.juken||!p.juken.materials)fail('受験逆算の計画ではありません');
  var ops=Array.isArray(a.ops)&&a.ops.length&&a.ops.length<=20?a.ops:fail('調整の内容は、1〜20個で入力してください'),touched={},cat=JC.catalog();
  if(p.juken.autoTasks)syncUpper(p,d.records,today);
  ops.forEach(function(op){
   var sp=p.juken.materials.filter(function(x){return x.subject===op.subject})[0];
   if(!sp)fail('この科目は、受験逆算に入っていません：'+text(op.subject,20));
   if(sp.missing){if(op.op!=='add')fail('この科目は、ルートがありません。教材を追加してください');delete sp.missing;delete sp.note;sp.items=[];sp.skipped=[]}
   var idx=op.index==null?null:number(op.index,0,sp.items.length),item=idx!=null?sp.items[idx]:null;
   var fill=function(it,id,name,weeks){if(id){var m=cat[id];if(!m)fail('教材マスタにない教材です');it.id=id;it.name=m[0];it.total=m[3];it.unit=m[4];it.pace=m[5];it.weeks=weeks?number(weeks,1,104):Math.max(1,Math.ceil(m[3]/m[5]))}else{it.id='';it.name=text(name,60);if(!it.name)fail('教材名を入力してください');it.total=null;it.unit='';it.pace=null;it.weeks=number(weeks,1,104);it.manual=true}it.locked=true;delete it.stretch;delete it.hold};
   if(op.op==='add'){var ni={phase:text(op.phase||'',30),slot:null};fill(ni,text(op.withId,20),op.withName,op.weeks);sp.items.splice(idx==null?sp.items.length:idx,0,ni)}
   else{if(!item)fail('調整する教材が見つかりません');
    if(op.op==='weeks'){item.weeks=number(op.weeks,1,104);item.locked=true;delete item.stretch}
    else if(op.op==='skip'){sp.items.splice(idx,1);sp.skipped=sp.skipped||[];sp.skipped.push({id:item.id,name:item.name,reason:'講師が見送り'})}
    else if(op.op==='replace'){var from={fromId:item.id,fromName:item.name,why:'講師が差し替え'};fill(item,text(op.withId,20),op.withName,op.weeks);item.replaced=from}
    else if(op.op==='accept_hold'){if(!item.hold)fail('保留の教材ではありません');var h=item.hold,from2={fromId:item.id,fromName:item.name,why:'講師が、保留を承認（手持ちの教材に置き換え）'};fill(item,h.ownId,h.ownName);item.replaced=from2}
    else if(op.op==='reject_hold'){if(!item.hold)fail('保留の教材ではありません');delete item.hold;item.locked=true}
    else fail('対応していない調整です')}
   touched[op.subject]=sp;
  });
  Object.keys(touched).forEach(function(k){JC.relayoutFrom(touched[k],today,p.juken.examYm)});
  if(p.juken.autoTasks)regenTasks(p,d.records,today,'a'+today);
  if(!p.roadmapEdited)p.roadmap=JC.withMaterials(JC.roadmap({band:p.juken.band,route:p.juken.route,start:p.juken.start,examYm:p.juken.examYm}),p.juken.materials);
  msg='受験逆算の教材を調整（'+ops.length+'件）';break;
 case 'juken_review':
  // 月1回の見直し（講師が実行）：新しい模試で差を直し、まだ始まっていない教材を並べ直す。終わった教材・講師が直した教材・手で足した教材は、そのまま
  if(actor.role!=='teacher')fail('講師の操作が必要です');if(!p||!p.juken||!p.juken.materials)fail('受験逆算の計画ではありません');
  var jr=p.juken,rv={changes:[],warnings:[]},oldLevel=jr.gap?jr.gap.level:null;
  if(jr.autoTasks)syncUpper(p,d.records,today);
  if(a.mock&&a.mock.score!=null){var mt=['河合','東進','進研','駿台'].indexOf(a.mock.type)>=0?a.mock.type:fail('模試の種類を確認してください'),ms=Number(a.mock.score);if(!(ms>=20&&ms<=85))fail('模試の偏差値を確認してください');jr.mock={type:mt,score:ms};if(jr.dev!=null){var cur=JC.correct0(mt,ms),g2=JC.gapLevel(jr.dev,cur);g2.current=cur;jr.gap=g2}}
  var level=jr.gap?jr.gap.level:null,devNow=jr.gap?jr.gap.current:(jr.mock?JC.correct0(jr.mock.type,jr.mock.score):null);
  if(level!==oldLevel)rv.changes.push('差の区分が、「'+(oldLevel||'不明')+'」から「'+(level||'不明')+'」に変わりました');
  if(a.mock&&a.mock.score!=null){jr.subjectDevs=jr.subjectDevs||{};jr.subjects.forEach(function(sn){jr.subjectDevs[sn]=Number(a.mock.score)});jr.mockType=a.mock.type}
   if(a.mockType&&['河合','東進','進研','駿台'].indexOf(a.mockType)>=0)jr.mockType=a.mockType;
   if(a.devs&&typeof a.devs==='object'){jr.subjectDevs=jr.subjectDevs||{};Object.keys(a.devs).forEach(function(sn){var v=a.devs[sn];if(jr.subjects.indexOf(sn)<0||v==null||v==='')return;v=Number(v);if(!(v>=20&&v<=85))fail('偏差値を確認してください：'+sn);if(jr.subjectDevs[sn]!==v)rv.changes.push(sn+'：偏差値が、'+(jr.subjectDevs[sn]==null?'未入力':jr.subjectDevs[sn])+'から'+v+'に変わりました');jr.subjectDevs[sn]=v;if(jr.mockType==null)jr.mockType='河合'})}
   refreshUpper(p,rv,'v'+today);
  var pr=progressOf(d,p,today);if(pr&&(pr.missedCount>0||(pr.achievement.lastWeek!=null&&pr.achievement.lastWeek<60)))rv.warnings.push('日ごとの計画に、遅れがあります（先週の達成率 '+(pr.achievement.lastWeek==null?'—':pr.achievement.lastWeek+'%')+'、遅れ '+pr.missedCount+'個）。上段の到達点の見直しや、組み直しを検討してください');
  jr.owned=jr.owned;if(!p.roadmapEdited)p.roadmap=JC.withMaterials(JC.roadmap({band:jr.band,route:jr.route,start:jr.start,examYm:jr.examYm}),jr.materials);
  rv.at=today;rv.level=level;jr.reviews=[rv].concat(jr.reviews||[]).slice(0,12);jr.lastReview=today;
  msg='月1回の見直し（変更'+rv.changes.length+'個、注意'+rv.warnings.length+'個）';break;
 case 'roadmap':if(actor.role!=='teacher')fail('講師の操作が必要です');if(!p)fail('計画が見つかりません');if(!Array.isArray(a.months)||a.months.length>36)fail('月ごとの道筋は36か月までです');p.roadmapEdited=true;p.roadmap=a.months.map(function(m){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m.month))fail('月はYYYY-MMの形で入力してください');return {month:m.month,text:text(m.text,300)}});msg='月ごとの道筋を変更';break;
 case 'feedback':if(actor.role!=='teacher')fail('講師の操作が必要です');var v=text(a.text,1000);if(!v)fail('ひとことを入力してください');d.feedback.unshift({id:ctx.id,text:v,at:now,by:actor.name||'講師'});d.feedback=d.feedback.slice(0,30);msg='講師のひとことを送信';break;
 case 'check':if(actor.role!=='teacher')fail('講師の操作が必要です');d.checkedWeek=week(today);msg='今週の進み具合を確認';break;
 case 'settings':d.settings=validateSettings(a.settings);msg='生徒の通知設定を変更';break;
 default:fail('対応していない操作です');
 }
 if(!/通知設定|勉強に使える時間|勉強時間を記録|の進み具合を記録|今週の進み具合を確認|ひとことを送信/.test(msg))d.history.unshift({id:ctx.id,at:now,by:actor.role==='teacher'?'講師':(actor.relation&&actor.relation!=='本人'?'保護者':'生徒'),text:msg});d.history=d.history.slice(0,100);return d;
}
// 計画がいま、どの段階か（画面の案内に使う）：before＝始まる前／during＝取り組み中／after＝終わった／paused＝一時停止
function stateOf(p,today){if(!p)return null;var end=p.end||p.goal;if(p.status==='paused')return {phase:'paused'};if(p.status==='finished')return {phase:'after',daysAgo:Math.max(0,days(end,today))};if(today<p.start)return {phase:'before',daysTo:days(today,p.start)};if(today>end&&(p.goal<today))return {phase:'after',daysAgo:days(p.goal,today)};return {phase:'during',daysLeft:Math.max(0,days(today,p.goal))}}
// 講師の一覧に出す、生徒ごとのまとめ（数字は、達成率と同じ方式：時間（量）で数える）
function studentSummary(doc,today){var p=active(doc),g=p?progressOf(doc,p,today):null,last=null;Object.keys(doc.records||{}).forEach(function(k){var r=doc.records[k];if(r&&r.updatedAt&&(!last||r.updatedAt>last))last=r.updatedAt});
 return {hasPlan:!!p,title:p?p.title:'',state:stateOf(p,today),thisWeek:g?g.achievement.thisWeek:null,lastWeek:g?g.achievement.lastWeek:null,missedCount:g?g.missedCount:0,needsReplan:!!(g&&g.needsReplan),fits:g?g.fits:true,streak:g?g.streak:0,lastRecord:last?last.slice(0,10):null,idleDays:p?Math.max(0,days(last?last.slice(0,10):p.start,today)):null,checkedThisWeek:doc.checkedWeek===week(today),reviewDue:reviewDue(doc,today)}}
// 月1回の見直しの時期か（受験逆算の計画で、今月まだ見直していない）
function reviewDue(doc,today){return activePlans(doc).some(function(p){if(!p.juken||!p.juken.materials)return false;var last=p.juken.lastReview||p.start;return String(last).slice(0,7)<String(today).slice(0,7)})}
function week(today){var w=(new Date(today+'T00:00:00Z').getUTCDay()+6)%7;return add(today,-w)}
function shiftPaused(p,d,today){if(!p.pausedAt)return;var delta=Math.max(0,days(p.pausedAt,today));p.tasks.forEach(function(t){if(!d.records[t.id]&&t.date>=p.pausedAt)t.date=add(t.date,delta)});p.goal=add(p.goal,delta);p.input.goal=p.goal;p.pausedAt=null}
// 2週間より先は、週ごとの合計だけ（Notion v3）：日ごとの取り組むことと同じ計算で、週にまとめる
function futureWeeks(p,today){if(!p||!p.juken||!p.juken.autoTasks||!p.tasksUntil)return [];var end=p.end||p.goal;if(p.tasksUntil>=end)return [];var ts=tasksFromRoute(p.input,'fw',p.juken.materials,today<p.start?p.start:today,'fw',end),map={};ts.forEach(function(t){if(t.date<=p.tasksUntil)return;var wk=week(t.date),o=map[wk]=map[wk]||{week:wk,total:0,subjects:{}};o.total+=t.minutes;o.subjects[t.jsubj]=(o.subjects[t.jsubj]||0)+t.minutes});return Object.keys(map).sort().map(function(k){return map[k]})}
function extendWindow(p,records,today){(p.juken.materials||[]).forEach(function(sp){if(sp.missing)return;sp.items.forEach(function(it){if(it.tracked&&it.total)it.doneUnits=itemActual(p,records,it,sp.subject)})});regenTasks(p,records,today,'w'+today,true)}
function resume(doc,today){var d=copy(doc),p=active(d);activePlans(d).forEach(function(q){if(q.juken&&q.juken.autoTasks&&q.tasksUntil&&q.tasksUntil<(q.end||q.goal)&&q.tasksUntil<add(today,7)&&today>=q.start)extendWindow(q,d.records,today)});if(!p||p.goal>=today)return d;var q=d.plans.find(function(q){return q.status==='paused'&&q.resumeAfter&&q.resumeAfter<=today});if(q){p.status='finished';shiftPaused(q,d,today);q.status='active';q.resumeAfter=null;d.activeId=q.id;d.history.unshift({id:'resume-'+today,at:today,by:'システム',text:'計画「'+q.title+'」を自動再開'})}return d}
var api={teacherSettingsOf:teacherSettingsOf,studyMinutes:studyMinutes,fraction:fraction,activePlans:activePlans,defaultProfile:defaultProfile,futureWeeks:futureWeeks,estimate:taskMin,stateOf:stateOf,studentSummary:studentSummary,reviewDue:reviewDue,TYPES:TYPES,empty:empty,build:build,apply:apply,resume:resume,progress:progress,progressOf:progressOf,printHtml:printHtml,active:active,add:add,week:week,validateSettings:validateSettings,copy:copy};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StudyCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
