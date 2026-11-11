(function(root){
'use strict';
var E=typeof module!=='undefined'&&module.exports?require('../plan_pdf/src/engine.js'):root.PlanEngine;
var TYPES={test:'定期テスト',exam:'検定',juken:'大学受験（教材の日割り）',habit:'習慣づくり',task:'課題・タスク'};
function fail(s){throw new Error(s)}
function copy(x){return JSON.parse(JSON.stringify(x))}
function text(x,max){return String(x==null?'':x).trim().slice(0,max||120)}
function number(x,min,max){var n=Number(x);if(!Number.isInteger(n)||n<min||n>max)fail(min+'〜'+max+'の整数を入力してください');return n}
function date(x){if(!/^\d{4}-\d{2}-\d{2}$/.test(x)||new Date(x+'T00:00:00Z').toISOString().slice(0,10)!==x)fail('日付を確認してください');return x}
function add(d,n){return E.addDays(d,n)}
function days(a,b){return Math.round((Date.parse(b)-Date.parse(a))/86400000)}
function empty(){return {version:1,plans:[],activeId:null,records:{},feedback:[],history:[],settings:{todo:'07:00',report:'20:00',same:false,wd:0,wt:'20:00'},teacherSettings:{wd:1,wt:'09:00',late:true,lateDays:3,edited:true,mode:'まとめて1通'},checkedWeek:null}}
function active(doc){return doc.plans.find(function(p){return p.id===doc.activeId})||null}
function normalize(input,today){
 var a=copy(input||{});if(!TYPES[a.type])fail('計画の種類を選んでください');a.title=text(a.title);if(!a.title)fail('計画の名前を入力してください');
 a.start=date(a.start||today);a.goal=date(a.goal||add(a.start,a.type==='habit'?27:14));if(days(a.start,a.goal)<0||days(a.start,a.goal)>180)fail('開始日から180日以内の終了日を選んでください');
 if(a.start<today)fail('開始日は今日以降にしてください');
 a.materials=(a.materials||[]).map(function(m){var name=text(m.name);if(!name)fail('教材・課題の名前を入力してください');return {name:name,subject:text(m.subject||'学習',30),from:number(m.from,1,100000),to:number(m.to,1,100000),unit:['ページ','問題の番号','単語の番号'].indexOf(m.unit)>=0?m.unit:'ページ',minutes:number(m.minutes,1,60)};});
 if(!a.materials.length||a.materials.length>10)fail('教材は1〜10件で入力してください');a.materials.forEach(function(m){if(m.to<m.from)fail('終わりの番号は始めの番号以上にしてください')});
 if(!Array.isArray(a.availability)||a.availability.length!==7)fail('曜日ごとの時間を入力してください');a.availability=a.availability.map(function(n){n=number(n,0,180);if([0,30,60,90,120,180].indexOf(n)<0)fail('勉強時間を選び直してください');return n});if(!a.availability.some(function(n){return n>0}))fail('少なくとも1日は勉強時間を選んでください');a.target=text(a.target,200);return a;
}
function build(input,today,id){
 var a=normalize(input,today),labels={0:'0分',30:'30分',60:'1時間',90:'1時間半',120:'2時間',180:'3時間以上'},row={style:a.type==='exam'?'検定':'定期テスト',goal_date:a.goal,'作成日':add(a.start,-1),test_type:a.title,exam_name:a.title,school_hw_weekly_min:'ほとんどない'};
 ['mon','tue','wed','thu','fri','sat','sun'].forEach(function(k,i){row['avail_'+k]=labels[a.availability[i]]});
 a.materials.forEach(function(m,i){var k='task'+(i+1)+'_';Object.assign(row,{[k+'subject']:m.subject,[k+'material']:m.name,[k+'unit']:m.unit,[k+'start']:m.from,[k+'end']:m.to,[k+'unit_min']:m.minutes+'分'})});
 // The engine accepts enumerated measured minutes; preserve arbitrary numeric inputs by using its read-material objects below.
 var built=E._internal.buildDays(a.start,a.goal,row),mats=E._internal.readMaterials(row);
 mats.forEach(function(m,i){m.unitMin=Math.ceil(a.materials[i].minutes*1.5);m.unitRaw=a.materials[i].minutes;m.provisional=false});
 var remaining=[];
 if(a.type==='habit'){
  built.days.forEach(function(d){if(!d.cap)return;a.materials.forEach(function(m,i){var minutes=Math.floor(d.cap/a.materials.length)+(i<d.cap%a.materials.length?1:0);if(minutes)d.items.push({text:m.name+' · '+minutes+'分',name:m.name,subject:m.subject,min:minutes,from:null,to:null,unit:'分'})})});
 }else{remaining=E._internal.fill(built.days,mats)}
 var tasks=[];built.days.forEach(function(d){d.items.forEach(function(t){tasks.push({id:id+'-'+tasks.length,date:d.date,name:t.name,subject:t.subject,text:t.text,from:t.from,to:t.to,unit:t.unit,minutes:t.min})})});
 return {id:id,type:a.type,title:a.title,target:a.target,input:a,start:a.start,goal:a.goal,tasks:tasks,leftovers:remaining,status:'active',resumeAfter:null};
}
function validateSettings(s,teacher){var out=copy(s||{});['todo','report','wt'].forEach(function(k){if(k in out&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(out[k]))fail('時刻を確認してください')});if('wd' in out)number(out.wd,0,6);if('lateDays' in out&&[2,3,5].indexOf(out.lateDays)<0)fail('通知する日数を確認してください');if(teacher&&out.mode&&['まとめて1通','生徒ごと'].indexOf(out.mode)<0)fail('通知の届き方を確認してください');if(out.same)out.report=out.todo;return out}
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
 case 'roadmap':if(actor.role!=='teacher')fail('講師の操作が必要です');if(!p)fail('計画が見つかりません');if(!Array.isArray(a.months)||a.months.length>36)fail('月ごとの道筋は36件までです');p.roadmap=a.months.map(function(m){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m.month))fail('月はYYYY-MMの形で入力してください');return {month:m.month,text:text(m.text,300)}});msg='月ごとの道筋を変更';break;
 case 'feedback':if(actor.role!=='teacher')fail('講師の操作が必要です');var v=text(a.text,1000);if(!v)fail('ひとことを入力してください');d.feedback.unshift({id:ctx.id,text:v,at:now,by:actor.name||'講師'});d.feedback=d.feedback.slice(0,30);msg='講師のひとことを送信';break;
 case 'check':if(actor.role!=='teacher')fail('講師の操作が必要です');d.checkedWeek=week(today);msg='今週の進み具合を確認';break;
 case 'settings':d.settings=validateSettings(a.settings);msg='生徒の通知設定を変更';break;
 default:fail('対応していない操作です');
 }
 d.history.unshift({id:ctx.id,at:now,by:actor.role==='teacher'?'講師':'生徒',text:msg});d.history=d.history.slice(0,100);return d;
}
function week(today){var w=(new Date(today+'T00:00:00Z').getUTCDay()+6)%7;return add(today,-w)}
function shiftPaused(p,d,today){if(!p.pausedAt)return;var delta=Math.max(0,days(p.pausedAt,today));p.tasks.forEach(function(t){if(!d.records[t.id]&&t.date>=p.pausedAt)t.date=add(t.date,delta)});p.goal=add(p.goal,delta);p.input.goal=p.goal;p.pausedAt=null}
function resume(doc,today){var d=copy(doc),p=active(d);if(!p||p.goal>=today)return d;var q=d.plans.find(function(q){return q.status==='paused'&&q.resumeAfter&&q.resumeAfter<=today});if(q){p.status='finished';shiftPaused(q,d,today);q.status='active';q.resumeAfter=null;d.activeId=q.id;d.history.unshift({id:'resume-'+today,at:today,by:'システム',text:'計画「'+q.title+'」を自動再開'})}return d}
var api={TYPES:TYPES,empty:empty,build:build,apply:apply,resume:resume,active:active,add:add,week:week,validateSettings:validateSettings,copy:copy};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StudyCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
