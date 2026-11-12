(function(root){
'use strict';
var E=typeof module!=='undefined'&&module.exports?require('../plan_pdf/src/engine.js'):root.PlanEngine;
var JC=typeof module!=='undefined'&&module.exports?require('./juken-core.js'):root.JukenCore;
var TYPES={test:'定期テスト',exam:'検定',juken:'大学受験（教材の日割り）',habit:'習慣づくり',task:'課題・タスク'};
function fail(s){throw new Error(s)}
function copy(x){return JSON.parse(JSON.stringify(x))}
function text(x,max){return String(x==null?'':x).trim().slice(0,max||120)}
function number(x,min,max){var n=Number(x);if(!Number.isInteger(n)||n<min||n>max)fail(min+'〜'+max+'の整数を入力してください');return n}
function date(x){if(!/^\d{4}-\d{2}-\d{2}$/.test(x)||new Date(x+'T00:00:00Z').toISOString().slice(0,10)!==x)fail('日付を確認してください');return x}
function add(d,n){return E.addDays(d,n)}
function days(a,b){return Math.round((Date.parse(b)-Date.parse(a))/86400000)}
function empty(){return {version:1,plans:[],activeId:null,records:{},feedback:[],history:[],settings:{todo:'07:00',report:'20:00',same:false,wd:0,wt:'20:00',notifyTo:'auto'},teacherSettings:{wd:1,wt:'09:00',late:true,lateDays:3,edited:true,mode:'まとめて1通'},checkedWeek:null}}
function active(doc){return doc.plans.find(function(p){return p.id===doc.activeId})||null}
function normalize(input,today){
 var a=copy(input||{});if(!TYPES[a.type])fail('計画の種類を選んでください');a.title=text(a.title);if(!a.title)fail('計画の名前を入力してください');
 a.start=date(a.start||today);a.goal=date(a.goal||add(a.start,a.type==='habit'?27:14));if(days(a.start,a.goal)<0||days(a.start,a.goal)>180)fail('開始日から180日以内の終了日を選んでください');
 if(a.start<today)fail('開始日は今日以降にしてください');
 a.materials=(a.materials||[]).map(function(m){var name=text(m.name);if(!name)fail('教材・課題の名前を入力してください');return {name:name,subject:text(m.subject||'学習',30),from:number(m.from,1,100000),to:number(m.to,1,100000),unit:['ページ','問題の番号','単語の番号'].indexOf(m.unit)>=0?m.unit:'ページ',minutes:number(m.minutes,1,60)};});
 var auto=a.type==='juken'&&a.juken&&a.juken.autoTasks&&Array.isArray(a.juken.subjects)&&a.juken.subjects.length>0;
 if((!a.materials.length&&!auto)||a.materials.length>10)fail('教材は1〜10件で入力してください');a.materials.forEach(function(m){if(m.to<m.from)fail('終わりの番号は始めの番号以上にしてください')});
 if(!Array.isArray(a.availability)||a.availability.length!==7)fail('曜日ごとの時間を入力してください');a.availability=a.availability.map(function(n){n=number(n,0,180);if([0,30,60,90,120,180].indexOf(n)<0)fail('勉強時間を選び直してください');return n});if(!a.availability.some(function(n){return n>0}))fail('少なくとも1日は勉強時間を選んでください');a.target=text(a.target,200);
 if(a.type==='juken'&&a.juken){var j=a.juken,ex=/^\d{4}-\d{2}$/.test(j.examYm)?j.examYm:fail('入試の年月を、YYYY-MMの形で入力してください');
  var span=days(a.start,ex+'-01');if(span<0||span>365*8)fail('入試の年月を確認してください');
  a.juken={band:number(j.band,1,7),examYm:ex,univ:text(j.univ,60),dev:j.dev==null||j.dev===''?null:Number(j.dev),mockType:['河合','東進','進研','駿台'].indexOf(j.mockType)>=0?j.mockType:'',mockScore:j.mockScore==null||j.mockScore===''?null:Number(j.mockScore),route:j.route==='std'||j.route==='short'?j.route:'',autoTasks:!!auto,owned:Array.isArray(j.owned)?j.owned.slice(0,20).map(function(x){return {id:text(x&&x.id,20),name:text(x&&x.name,60)}}).filter(function(x){return x.id||x.name}):[],others:Array.isArray(j.others)?j.others.map(Number).filter(function(b,i,arr){return Number.isInteger(b)&&b>=1&&b<=7&&arr.indexOf(b)===i}).slice(0,6):[],subjects:Array.isArray(j.subjects)?j.subjects.map(function(x){return text(x,20)}).filter(function(x,i,arr){return x&&arr.indexOf(x)===i}):[]};
  if(a.juken.subjects.length>12)fail('科目は12個までです');var known=JC.subjectsOf();a.juken.subjects.forEach(function(x){if(known.indexOf(x)<0)fail('科目を確認してください：'+x)});
  if(a.juken.dev!=null&&!(a.juken.dev>=30&&a.juken.dev<=85))fail('志望校の偏差値を確認してください');if(a.juken.mockScore!=null&&!(a.juken.mockScore>=20&&a.juken.mockScore<=85))fail('模試の偏差値を確認してください');}
 // 元のエンジンの決まり：学校の課題の時間（週）・予備日・行事の日は、使える時間から引く／勉強しない。定期テスト・検定・受験は、ゴールの2日前まで（前日は見直しだけ）
 a.hwWeekly=['ほとんどない','1〜2時間','3〜4時間','5時間以上'].indexOf(a.hwWeekly)>=0?a.hwWeekly:'ほとんどない';
 a.reserveDay=['月','火','水','木','金','土','日'].indexOf(a.reserveDay)>=0?a.reserveDay:'';
 a.busyNote=text(a.busyNote,200);
 a.end=(a.type==='test'||a.type==='exam'||a.type==='juken')?add(a.goal,-2):a.goal;
 if(days(a.start,a.end)<0)fail('終了日は、開始日の2日後以降にしてください（終了日の前日は、見直しだけの日です）');
 return a;
}
function rowOf(a){
 var labels={0:'0分',30:'30分',60:'1時間',90:'1時間半',120:'2時間',180:'3時間以上'},row={style:a.type==='exam'?'検定':'定期テスト',goal_date:a.goal,'作成日':add(a.start,-1),test_type:a.title,exam_name:a.title,school_hw_weekly_min:a.hwWeekly,reserve_day:a.reserveDay,busy_note:a.busyNote};
 ['mon','tue','wed','thu','fri','sat','sun'].forEach(function(k,i){row['avail_'+k]=labels[a.availability[i]]});
 a.materials.forEach(function(m,i){var k='task'+(i+1)+'_';Object.assign(row,{[k+'subject']:m.subject,[k+'material']:m.name,[k+'unit']:m.unit,[k+'start']:m.from,[k+'end']:m.to,[k+'unit_min']:m.minutes+'分'})});
 return row;
}
function materialsOf(a,row){var mats=E._internal.readMaterials(row);mats.forEach(function(m,i){m.unitMin=Math.ceil(a.materials[i].minutes*1.5);m.unitRaw=a.materials[i].minutes;m.provisional=false});return mats}
// ---------- 上段（教材ごとの期間）から、下段（日ごとのやること）を作る／下段の実績を、上段に返す ----------
function unitInfo(u){
 if(u==='ページ')return {u:'ページ',f:function(x,y){return 'p.'+x+(y>x?'〜'+y:'')}};
 if(u==='題'||u==='問')return {u:'問題の番号',f:function(x,y){return 'No.'+x+(y>x?'〜'+y:'')}};
 if(u==='語')return {u:'単語の番号',f:function(x,y){return x+(y>x?'〜'+y:'')+'番'}};
 return {u:'',f:function(x,y){return x+(y>x?'〜'+y:'')+u}};
}
// 教材の期間のうち、勉強できる日（時間がある曜日・行事でない・予備日でない）に、残りの量を均等に割る
function tasksFromRoute(a,id,plans,fromDate,tag){
 var limit=a.end||a.goal,maxTo=fromDate;plans.forEach(function(sp){if(!sp.missing)sp.items.forEach(function(it){if(!it.finished&&it.to>maxTo)maxTo=it.to})});
 var days=E._internal.buildDays(fromDate,maxTo>limit?maxTo:limit,rowOf(a)).days.filter(function(d){return d.kind==='study'&&d.cap>0}),out=[],n=0;      // 量は、教材の期間の全体（計画の終了日を過ぎても）に割り、計画の終了日までの分だけ、やることにする
 plans.forEach(function(sp){if(sp.missing)return;sp.items.forEach(function(it){
  if(it.finished||!it.total)return;var done=it.doneUnits||0,remain=it.total-done;if(remain<=0)return;
  var lo0=it.from<fromDate?fromDate:it.from,ds=days.filter(function(d){return d.date>=lo0&&d.date<=it.to});if(!ds.length)return;var ui=unitInfo(it.unit);
  ds.forEach(function(d,k){var lo=done+Math.floor(remain*k/ds.length)+1,hi=done+Math.floor(remain*(k+1)/ds.length);if(hi<lo)return;
   if(d.date>limit)return;out.push({id:id+'-'+tag+'-'+(n++),date:d.date,name:it.name,subject:sp.subject,text:it.name+' '+ui.f(lo,hi),from:lo,to:hi,unit:ui.u,minutes:Math.max(1,Math.ceil((hi-lo+1)*(it.minPerUnit||5))),item:it.id,jsubj:sp.subject})})})});
 return out;
}
// 教材ごとの、実際に進んだ量（できた＝全部、途中まで＝位置まで）
function itemActual(p,records,it,subj){var done=0;p.tasks.forEach(function(t){if(t.item===it.id&&t.jsubj===subj&&t.from!=null){var r=records[t.id];if(!r)return;if(r.mode==='done')done+=t.to-t.from+1;else if(r.mode==='partial'&&r.position!=null)done+=Math.max(0,Math.min(r.position,t.to)-t.from+1)}});return done}
function lastRecord(p,records,it,subj){var last=null;p.tasks.forEach(function(t){if(t.item===it.id&&t.jsubj===subj&&records[t.id]&&records[t.id].mode!=='none'&&(!last||t.date>last))last=t.date});return last}
// 日ごとの実績を、上段に反映する：終わった教材（実績の合計≧総学習量）は固定。遅れている教材は、残りの量で、今日から並べ直す（後ろの教材が、ずれる）。早く終わると、次が早まる
function syncUpper(p,records,today){
 (p.juken.materials||[]).forEach(function(sp){if(sp.missing)return;
  sp.items.forEach(function(it){if(!it.tracked||!it.total)return;
   it.doneUnits=itemActual(p,records,it,sp.subject);
   if(it.doneUnits>=it.total){it.finished=true;var last=lastRecord(p,records,it,sp.subject);if(last&&last<it.to)it.to=last}
   else{it.finished=false;if(it.doneUnits>0||it.from<=today)it.weeks=Math.max(1,Math.ceil((it.total-it.doneUnits)/(it.pace*(it.speed||1))))}});
  JC.relayoutFrom(sp,today,p.juken.examYm)});
}
// 上段を直したあと：今日以降で、記録のない日ごとのやることを作り直す。過去の未記録には「組み直し済み」の印
function regenTasks(p,records,today,tag){
 p.tasks.forEach(function(t){if(t.item!==undefined&&t.date<today&&!records[t.id]&&!t.rescheduled)t.rescheduled=today});
 var keep=p.tasks.filter(function(t){return t.item===undefined||t.date<today||records[t.id]}),fresh=tasksFromRoute(p.input,p.id,p.juken.materials,today<p.start?p.start:today,tag);
 p.tasks=keep.concat(fresh).sort(function(x,y){return x.date<y.date?-1:x.date>y.date?1:0});
}
function build(input,today,id){
 var a=normalize(input,today),row=rowOf(a);
 // The engine accepts enumerated measured minutes; preserve arbitrary numeric inputs by using its read-material objects below.
 var built=E._internal.buildDays(a.start,a.end,row),mats=materialsOf(a,row);
 var remaining=[];
 if(a.type==='habit'){
  built.days.forEach(function(d){if(!d.cap)return;a.materials.forEach(function(m,i){var minutes=Math.floor(d.cap/a.materials.length)+(i<d.cap%a.materials.length?1:0);if(minutes)d.items.push({text:m.name+' · '+minutes+'分',name:m.name,subject:m.subject,min:minutes,from:null,to:null,unit:'分'})})});
 }else{remaining=E._internal.fill(built.days,mats)}
 var tasks=[];built.days.forEach(function(d){d.items.forEach(function(t){tasks.push({id:id+'-'+tasks.length,date:d.date,name:t.name,subject:t.subject,text:t.text,from:t.from,to:t.to,unit:t.unit,minutes:t.min})})});
 var jk=null,rm,wm=a.juken&&a.juken.autoTasks?Math.max(30,Math.round(a.availability.reduce(function(x,y){return x+y},0)/Math.max(1,a.juken.subjects.length))):undefined;
 if(a.juken){var jp=JC.plan({weeklyMinutes:wm,band:a.juken.band,others:a.juken.others,univ:{dev:a.juken.dev},mock:a.juken.mockType&&a.juken.mockScore!=null?{type:a.juken.mockType,score:a.juken.mockScore}:null,start:a.start,examYm:a.juken.examYm,route:a.juken.route||undefined,subjects:a.juken.subjects,owned:a.juken.owned});rm=jp.roadmap;if(a.juken.autoTasks){jp.materials.forEach(function(sp){(sp.items||[]).forEach(function(i){i.tracked=true})});tasks=tasksFromRoute(a,id,jp.materials,a.start,'u')}
  jk={autoTasks:!!a.juken.autoTasks,weeklyMinutes:wm,start:a.start,dev:a.juken.dev,mock:a.juken.mockType&&a.juken.mockScore!=null?{type:a.juken.mockType,score:a.juken.mockScore}:null,subjects:a.juken.subjects,ownedInput:a.juken.owned,reviews:[],lastReview:null,materials:jp.materials,owned:jp.owned,baseBand:jp.baseBand,mixedNote:jp.mixedNote,others:a.juken.others,band:jp.band,bandName:jp.bandName,route:jp.route,routeName:jp.routeName,gap:jp.gap,adjustNote:jp.adjustNote,ratioNote:jp.ratioNote,univ:a.juken.univ,examYm:a.juken.examYm}}
 return {id:id,type:a.type,title:a.title,target:a.target,input:a,start:a.start,goal:a.goal,end:a.end,tasks:tasks,leftovers:remaining,roadmap:rm,juken:jk,warnings:built.busy.unparsed.map(function(x){return '行事のメモを読み取れませんでした：'+x}),status:'active',resumeAfter:null};
}

// ---------- 遅れの組み直し（記録を残したまま、まだ終わっていない範囲を、残りの日に並べ直す）----------
// 決めたこと：記録のある予定と、過去の予定は、そのまま残す。終わっていない範囲（やらなかった・途中まで・記録なし）を集め直し、今日（今日に記録があれば明日）から終了日まで並べる。
// 予備日には置かない（予備日は、余裕として残す）。手で足した予定（教材にない予定）は、そのまま残す。手で直した日割りは、組み直しで置き換わる。
function doneRange(t,rec){
 if(!rec||rec.mode==='none')return null;
 if(t.from==null||t.to==null)return rec.mode==='done'?[0,0]:null;           // 番号のない予定は、「できた」のときだけ終わり
 if(rec.mode==='done')return [t.from,t.to];
 return rec.position!=null&&rec.position>=t.from?[t.from,Math.min(rec.position,t.to)]:null;
}
function subtract(list,lo,hi){var out=[];list.forEach(function(r){if(hi<r[0]||lo>r[1]){out.push(r);return}if(lo>r[0])out.push([r[0],lo-1]);if(hi<r[1])out.push([hi+1,r[1]])});return out}
function replan(p,records,today,id){
 var a=p.input,end=p.end||p.goal,rec=function(t){return records[t.id]};
 var startDay=p.tasks.some(function(t){return t.date===today&&rec(t)})?add(today,1):today;if(startDay<p.start)startDay=p.start;
 if(days(startDay,end)<0)fail('終了日までに、組み直せる日が残っていません');
 var row=rowOf(a),mats=materialsOf(a,row),names={};mats.forEach(function(m){names[m.name]=true});
 var kept=p.tasks.filter(function(t){return t.date<startDay||rec(t)||!names[t.name]});       // 過去・記録済み・手で足した予定
 var queue=[];
 mats.forEach(function(m){
  var mine=p.tasks.filter(function(t){return t.name===m.name&&rec(t)});
  if(!m.numeric){var fin=mine.some(function(t){return records[t.id].mode==='done'});if(!fin)queue.push(m);return}
  var left=[[m.start,m.end]];
  mine.forEach(function(t){var r=doneRange(t,records[t.id]);if(r)left=subtract(left,r[0],r[1])});
  left.forEach(function(r){queue.push(Object.assign({},m,{start:r[0],end:r[1],units:Math.ceil((r[1]-r[0]+1)/m.size)}))});
 });
 p.tasks.forEach(function(t){if(t.date<startDay&&!rec(t)&&names[t.name])t.rescheduled=today});   // 過去の未記録は「組み直し済み」の印（遅れとして数え続けない）
 var built=E._internal.buildDays(startDay,end,row),leftovers=E._internal.fill(built.days,queue),made=[];
 built.days.forEach(function(d){d.items.forEach(function(t){made.push({id:p.id+'-r'+today+'-'+made.length,date:d.date,name:t.name,subject:t.subject,text:t.text,from:t.from,to:t.to,unit:t.unit,minutes:t.min})})});
 return {tasks:kept.concat(made).sort(function(x,y){return x.date<y.date?-1:x.date>y.date?1:0}),leftovers:leftovers,moved:made.length,startDay:startDay};
}

// ---------- 進み具合（達成率・遅れ・連続記録）----------
// 達成率は、やることの数ではなく、時間（量）で数える：できた＝全部、途中まで＝位置から割合、やらなかった・記録なし＝0。今日までの予定が分母
function fraction(t,rec){
 if(!rec||rec.mode==='none')return 0;if(rec.mode==='done')return 1;
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
 if(days(from,end)>=0&&p.type!=='habit')E._internal.buildDays(from,end,rowOf(p.input)).days.forEach(function(d){if(d.kind==='study')cap+=d.cap});
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
function printHtml(doc,plan,name,today){
 var rec=doc.records||{},g=progressOf(doc,plan,today)||{achievement:{}},end=plan.end||plan.goal,a=g.achievement||{};
 var h='<html><head><meta charset="utf-8"><style>@page{size:A4;margin:12mm}body{font-family:sans-serif;font-size:10pt;color:#222}h1{font-size:18pt;margin:0 0 4px}h2{font-size:12pt;margin:16px 0 6px;border-bottom:2px solid #f28c28;padding-bottom:2px}h3{font-size:10.5pt;margin:12px 0 4px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:5px 7px;text-align:left;vertical-align:top}th{background:#fdeedd}tr{page-break-inside:avoid}.sub{color:#666;margin:2px 0}.warn{color:#b26a00}.lt{color:#888}</style></head><body>';
 h+='<h1>'+esc(plan.title)+'</h1><p class="sub">'+esc(name)+'　'+md(plan.start)+'〜'+md(plan.goal)+(end!==plan.goal?'（やることは、'+md(end)+'まで。前日は見直し）':'')+'　作成：'+esc(today)+'</p>';
 if(plan.target)h+='<p class="sub">目標：'+esc(plan.target)+'</p>';
 (plan.warnings||[]).forEach(function(w){h+='<p class="warn">'+esc(w)+'</p>'});
 h+='<h2>進み具合</h2><table><tr><th>今週</th><th>先週</th><th>先々週</th><th>ここまでの全体</th><th>記録の連続</th><th>遅れ</th></tr><tr><td>'+pctText(a.thisWeek)+'</td><td>'+pctText(a.lastWeek)+'</td><td>'+pctText(a.twoWeeksAgo)+'</td><td>'+pctText(a.overall)+'</td><td>'+(g.streak||0)+'日</td><td>'+(g.missedCount?g.missedCount+'件（約'+g.missedMinutes+'分）':'なし')+'</td></tr></table>';
 if(g.remainingMinutes!=null&&plan.type!=='habit')h+='<p class="sub">残りの量：約'+g.remainingMinutes+'分　残りの日の枠：約'+g.capacityMinutes+'分'+(g.fits?'（入ります）':'<span class="warn">（入りきりません。組み直しや、量の見直しが必要です）</span>')+'</p>';
 if((plan.roadmap||[]).length)h+='<h2>月ごとの道筋（講師）</h2><table><tr><th style="width:18%">月</th><th>方針</th></tr>'+plan.roadmap.map(function(m){return '<tr><td>'+Number(m.month.slice(5))+'月（'+m.month.slice(0,4)+'）</td><td>'+esc(m.text)+'</td></tr>'}).join('')+'</table>';
 h+='<h2>日ごとの計画と実績</h2>';
 var tasks=plan.tasks.slice().sort(function(x,y){return x.date<y.date?-1:x.date>y.date?1:(x.id<y.id?-1:1)}),weeks={},order=[];
 tasks.forEach(function(t){var k=week(t.date);if(!weeks[k]){weeks[k]=[];order.push(k)}weeks[k].push(t)});
 if(!tasks.length)h+='<p class="sub">やることはありません。</p>';
 order.forEach(function(k){
  var ts=weeks[k],mins=ts.reduce(function(s2,t){return s2+t.minutes},0),pc=k<=today?pctOf(plan,rec,k,add(k,6),today):null,times=[];
  for(var i=0;i<7;i++){var r=rec['time:'+add(k,i)];if(r)times.push(md(add(k,i))+' '+r.minutes+'分')}
  h+='<h3>'+md(k)+'〜'+md(add(k,6))+(k===week(today)?'（今週）':'')+'　計画 約'+mins+'分'+(pc==null?'':'　達成 '+pc+'%')+'</h3><table><tr><th style="width:15%">日付</th><th>やること</th><th style="width:11%">目安</th><th style="width:19%">結果</th></tr>';
  ts.forEach(function(t){var l=recLabel(t,rec[t.id],today);h+='<tr><td>'+md(t.date)+'（'+dowOf(t.date)+'）</td><td>'+esc(t.text)+'</td><td>'+t.minutes+'分</td><td'+(l==='未記録'?' class="warn"':l==='組み直し済み'?' class="lt"':'')+'>'+esc(l)+'</td></tr>'});
  h+='</table>'+(times.length?'<p class="sub">勉強時間の記録：'+esc(times.join('、'))+'</p>':'');
 });
 if((plan.leftovers||[]).length)h+='<h2>入りきらなかった範囲</h2>'+plan.leftovers.map(function(t){return '<p>'+esc(t.text)+'（約'+t.min+'分）</p>'}).join('');
 var fb=(doc.feedback||[]).slice(0,5);
 if(fb.length)h+='<h2>講師のひとこと</h2>'+fb.map(function(f){return '<p><span class="lt">'+esc(String(f.at||'').slice(0,10))+'　'+esc(f.by)+'</span><br>'+esc(f.text).replace(/\n/g,'<br>')+'</p>'}).join('');
 var hs=(doc.history||[]).slice(0,10);
 if(hs.length)h+='<h2>変更の履歴</h2><table><tr><th style="width:18%">日付</th><th style="width:12%">だれが</th><th>内容</th></tr>'+hs.map(function(x){return '<tr><td>'+esc(String(x.at||'').slice(0,10))+'</td><td>'+esc(x.by)+'</td><td>'+esc(x.text)+'</td></tr>'}).join('')+'</table>';
 return h+'</body></html>';
}
function validateSettings(s,teacher){var out=copy(s||{});['todo','report','wt'].forEach(function(k){if(k in out&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(out[k]))fail('時刻を確認してください')});if('wd' in out)number(out.wd,0,6);if('notifyTo' in out&&['auto','self','mother','father','all'].indexOf(out.notifyTo)<0)fail('通知を受け取る人を確認してください');if('lateDays' in out&&[2,3,5].indexOf(out.lateDays)<0)fail('通知する日数を確認してください');if(teacher&&out.mode&&['まとめて1通','生徒ごと'].indexOf(out.mode)<0)fail('通知の届き方を確認してください');if(out.same)out.report=out.todo;return out}
function apply(doc,action,actor,ctx){
 var d=copy(doc),a=action||{},p=d.plans.find(function(p){return p.id===a.planId}),msg='',now=ctx.now,today=ctx.today;
 function task(){if(!p)fail('計画が見つかりません');var t=p.tasks.find(function(t){return t.id===a.taskId});if(!t)fail('やることが見つかりません');return t}
 switch(a.type){
 case 'create':
  p=build(a.input,today,ctx.id);if(d.plans.length>=8)fail('テスト環境では計画は8件までです');d.plans.forEach(function(q){if(q.status==='active'){q.status='paused';q.pausedAt=today;q.resumeAfter=p.type==='test'?add(p.goal,1):null}});d.plans.push(p);d.activeId=p.id;msg='計画「'+p.title+'」を作成';break;
 case 'activate':if(!p)fail('計画が見つかりません');shiftPaused(p,d,today);d.plans.forEach(function(q){if(q.id!==p.id&&q.status==='active'){q.status='paused';q.pausedAt=today}q.resumeAfter=null});p.status='active';d.activeId=p.id;msg='計画「'+p.title+'」を再開';break;
 case 'report':var t=task();if(actor.role==='teacher')fail('記録は生徒の画面から行ってください');if(t.date>today)fail('未来の日の実績は記録できません');if(['done','partial','none'].indexOf(a.mode)<0)fail('記録の種類を確認してください');var end=a.mode==='partial'?number(a.position,t.from==null?0:t.from,t.to==null?180:t.to):null;d.records[t.id]={mode:a.mode,position:end,date:t.date,updatedAt:now};msg=t.name+'の進み具合を記録';break;
 case 'study_time':if(actor.role==='teacher')fail('学習時間は生徒が記録します');date(a.date);if(a.date>today)fail('未来の学習時間は記録できません');d.records['time:'+a.date]={minutes:number(a.minutes,0,1440),updatedAt:now};msg='勉強時間を記録';break;
 case 'edit_task':var t=task();if(d.records[t.id])fail('記録済みのやることは変更できません');t.date=date(a.date);if(t.date<today||t.date>p.goal)fail('移動先は今日から計画終了日までにしてください');t.text=text(a.text,200);if(!t.text)fail('やることを入力してください');t.minutes=number(a.minutes,1,360);if(t.from!=null&&a.from!=null){var from=number(a.from,1,100000),to=number(a.to,from,100000);if(from!==t.from||to!==t.to)t.text=t.name+' '+(t.unit==='ページ'?'p.':t.unit==='問題の番号'?'No.':'')+from+'〜'+to+(t.unit==='単語の番号'?'番':'');t.from=from;t.to=to}msg=t.name+'の日割りを変更';break;
 case 'delete_task':var t=task();if(d.records[t.id])fail('記録済みのやることは削除できません');p.tasks=p.tasks.filter(function(t){return t.id!==a.taskId});msg=t.name+'を予定から削除';break;
 case 'add_task':if(!p)fail('計画が見つかりません');var dt=date(a.date);if(dt<today||dt>p.goal)fail('追加する日付を確認してください');var nm=text(a.name);if(!nm)fail('教材名を入力してください');p.tasks.push({id:ctx.id,date:dt,name:nm,subject:text(a.subject||'学習',30),text:text(a.text||nm,200),minutes:number(a.minutes,1,360),from:null,to:null,unit:''});msg='やることを追加';break;
 case 'move_day':if(!p)fail('計画が見つかりません');var dest=date(a.date);if(dest<=today||dest>p.goal)fail('移動先は明日以降、計画終了日までにしてください');var moving=p.tasks.filter(function(t){return t.date===today&&!d.records[t.id]});if(!moving.length)fail('今日から移せる予定がありません');moving.forEach(function(t){t.date=dest});msg='今日の未記録の予定を'+dest+'へ移動';break;
 case 'rebuild':if(!p)fail('計画が見つかりません');var input=copy(a.input);input.start=today;var n=build(input,today,ctx.id);var retained=p.tasks.filter(function(t){return t.date<today||d.records[t.id]});var names={};retained.forEach(function(t){names[t.name]=true});if(retained.length)fail('記録がある計画は、新しい計画として残りの範囲を入力してください');p.input=n.input;p.tasks=n.tasks;p.goal=n.goal;p.title=n.title;p.target=n.target;p.leftovers=n.leftovers;msg='条件を変更して予定を再作成';break;
 case 'replan':if(!p||p.status!=='active')fail('進行中の計画だけ、組み直せます');if(p.type==='habit')fail('習慣づくりの計画は、組み直しません');if(p.juken&&p.juken.autoTasks){syncUpper(p,d.records,today);regenTasks(p,d.records,today,'r'+today);msg='上段の教材の進みを反映して、日ごとの計画を組み直し';break}
  var rp=replan(p,d.records,today,ctx.id);p.tasks=rp.tasks;p.leftovers=rp.leftovers;p.replannedAt=today;msg='遅れを組み直し（'+rp.startDay+'から'+rp.moved+'件）';break;
 case 'juken_adjust':
  // 講師が、受験逆算の教材を調整する（自動で作った下書きを、最後に直す）。操作：weeks（期間）／skip（見送り）／replace（差し替え）／accept_hold・reject_hold（保留を決める）／add（追加）
  if(actor.role!=='teacher')fail('講師の操作が必要です');if(!p||!p.juken||!p.juken.materials)fail('受験逆算の計画ではありません');
  var ops=Array.isArray(a.ops)&&a.ops.length&&a.ops.length<=20?a.ops:fail('調整の内容は、1〜20件で入力してください'),touched={},cat=JC.catalog();
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
  var fresh=JC.materialPlan({band:jr.band,subjects:jr.subjects,start:today,examYm:jr.examYm,level:level,route:jr.route,owned:jr.ownedInput,weeklyMinutes:jr.weeklyMinutes,dev:devNow});
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
   var sp2={subject:old.subject,items:out,skipped:nw.skipped||old.skipped||[]};JC.relayoutFrom(sp2,today,jr.examYm);
   if(!sp2.fits)rv.warnings.push(old.subject+'：入試までに入りきりません（約'+sp2.shortDays+'日の超過）。教材の見送りや、期間の見直しを検討してください');
   return sp2});
  if(jr.autoTasks)regenTasks(p,d.records,today,'v'+today);
  var pr=progressOf(d,p,today);if(pr&&(pr.missedCount>0||(pr.achievement.lastWeek!=null&&pr.achievement.lastWeek<60)))rv.warnings.push('日ごとの計画に、遅れがあります（先週の達成率 '+(pr.achievement.lastWeek==null?'—':pr.achievement.lastWeek+'%')+'、遅れ '+pr.missedCount+'件）。上段の到達点の見直しや、組み直しを検討してください');
  jr.owned=jr.owned;if(!p.roadmapEdited)p.roadmap=JC.withMaterials(JC.roadmap({band:jr.band,route:jr.route,start:jr.start,examYm:jr.examYm}),jr.materials);
  rv.at=today;rv.level=level;jr.reviews=[rv].concat(jr.reviews||[]).slice(0,12);jr.lastReview=today;
  msg='月1回の見直し（変更'+rv.changes.length+'件、注意'+rv.warnings.length+'件）';break;
 case 'roadmap':if(actor.role!=='teacher')fail('講師の操作が必要です');if(!p)fail('計画が見つかりません');if(!Array.isArray(a.months)||a.months.length>36)fail('月ごとの道筋は36件までです');p.roadmapEdited=true;p.roadmap=a.months.map(function(m){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m.month))fail('月はYYYY-MMの形で入力してください');return {month:m.month,text:text(m.text,300)}});msg='月ごとの道筋を変更';break;
 case 'feedback':if(actor.role!=='teacher')fail('講師の操作が必要です');var v=text(a.text,1000);if(!v)fail('ひとことを入力してください');d.feedback.unshift({id:ctx.id,text:v,at:now,by:actor.name||'講師'});d.feedback=d.feedback.slice(0,30);msg='講師のひとことを送信';break;
 case 'check':if(actor.role!=='teacher')fail('講師の操作が必要です');d.checkedWeek=week(today);msg='今週の進み具合を確認';break;
 case 'settings':d.settings=validateSettings(a.settings);msg='生徒の通知設定を変更';break;
 default:fail('対応していない操作です');
 }
 d.history.unshift({id:ctx.id,at:now,by:actor.role==='teacher'?'講師':(actor.relation&&actor.relation!=='本人'?'保護者':'生徒'),text:msg});d.history=d.history.slice(0,100);return d;
}
// 月1回の見直しの時期か（受験逆算の計画で、今月まだ見直していない）
function reviewDue(doc,today){var p=active(doc);if(!p||!p.juken||!p.juken.materials)return false;var last=p.juken.lastReview||p.start;return String(last).slice(0,7)<String(today).slice(0,7)}
function week(today){var w=(new Date(today+'T00:00:00Z').getUTCDay()+6)%7;return add(today,-w)}
function shiftPaused(p,d,today){if(!p.pausedAt)return;var delta=Math.max(0,days(p.pausedAt,today));p.tasks.forEach(function(t){if(!d.records[t.id]&&t.date>=p.pausedAt)t.date=add(t.date,delta)});p.goal=add(p.goal,delta);p.input.goal=p.goal;p.pausedAt=null}
function resume(doc,today){var d=copy(doc),p=active(d);if(!p||p.goal>=today)return d;var q=d.plans.find(function(q){return q.status==='paused'&&q.resumeAfter&&q.resumeAfter<=today});if(q){p.status='finished';shiftPaused(q,d,today);q.status='active';q.resumeAfter=null;d.activeId=q.id;d.history.unshift({id:'resume-'+today,at:today,by:'システム',text:'計画「'+q.title+'」を自動再開'})}return d}
var api={reviewDue:reviewDue,TYPES:TYPES,empty:empty,build:build,apply:apply,resume:resume,progress:progress,progressOf:progressOf,printHtml:printHtml,active:active,add:add,week:week,validateSettings:validateSettings,copy:copy};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StudyCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
