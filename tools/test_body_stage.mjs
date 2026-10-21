// Run with: node tools/test_body_stage.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { BodyPose } from '../web/body-tracking.js';
import { attachBodyStage, stageMessage, STAGE_ZERO, STAGE_LIMITS } from '../web/body-stage.js';
import { relayMessage, sendRelay } from '../web/relay.js';
import { attachStreamView } from '../web/stream-view.js';
import { fixture } from './test_body_tracking.mjs';
let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
const options={mirror:false,sensitivity:1,smoothing:.35,stage:true,moveStrength:1,rotationStrength:1};
function steady(mirror=false,x=.1,y=.1,roll=20,width=.3){
 const p=new BodyPose();p.update(fixture(0,0,0,true,0,0,width),0);
 for(let t=100;t<=5000;t+=100){p.update(fixture(0,0,roll,true,x,y,width),t);p.sample(t,.1,{...options,mirror});}
 return p;
}
const normal=steady(),mirror=steady(true);
check(normal.stage.x>0 && normal.stage.y>0 && normal.stage.rot>0,'translation and rotation active');
for(const k of ['x','rot'])check(Math.abs(normal.stage[k]+mirror.stage[k])<1e-8,'mirror '+k);
check(normal.stage.y===mirror.stage.y,'mirror preserves Y');
const small=steady(false,.05,.05,0,.15);
check(Math.abs(small.stage.x-normal.stage.x)<1e-8 && Math.abs(small.stage.y-normal.stage.y)<1e-8,'shoulder normalization invariant to image scale');
const capped=steady(false,4,-4,60);
for(const [key,limit]of Object.entries(STAGE_LIMITS))check(Math.abs(capped.stage[key])<=limit && Math.abs(capped.stage[key])>limit*.99,'cap '+key);
let loss=normal.sample(5600,.6,options).stage;check(Math.abs(loss.x)<.001,'loss fades translation');
loss=normal.sample(9000,3.4,options).stage;check(Object.values(loss).every(v=>v===0),'loss fully clears stage');
normal.update(fixture(),9100);check(normal.stage.x===0,'loss recovery starts neutral');
check(Object.values(normal.sample(9100,0,{...options,stage:false}).stage).every(v=>v===0),'stage OFF output zero');
const active=steady();active.calibrate(5000);check(Object.values(active.stage).every(v=>v===0),'reset clears stage');
const valid={type:'pose',face:null,weight:0,mouth:null,stage:{x:.15,y:-.08,rot:8}};
check(relayMessage(valid)?.stage?.rot===8,'client accepts caps');
check(!('stage'in relayMessage({type:'pose',face:null,weight:0,mouth:null})),'old sender omits stage');
for(const stage of [null,[],{}, {x:0,y:0,rot:0,landmarks:[]},...['x','y','rot'].flatMap(k=>[NaN,Infinity,'0',true,STAGE_LIMITS[k]+.001].map(v=>({...STAGE_ZERO,[k]:v})))]){
 check(stageMessage(stage)===null,'stage malformed rejected');check(relayMessage({...valid,stage})===null,'relay malformed rejected');
}
const point=()=>({x:0,y:0,set(x,y){this.x=x;this.y=y;}});
const model={x:300,y:400},container={pivot:point(),position:point(),rotation:0};
const apply=attachBodyStage({screen:{width:600,height:800}},model,container);
apply({x:.1,y:-.05,rot:5});check(container.position.x===360 && container.position.y===360,'viewport offset');
check(model.x===300 && model.y===400 && container.pivot.x===300,'placement untouched');
model.x=330;apply({x:.1,y:-.05,rot:5});check(container.position.x===390,'drag remains additive');apply(null);
check(container.position.x===330 && container.rotation===0,'old/invalid stage clears transform');

// Exercise actual stream placement handlers while a transient transform is active.
globalThis.location=new URL('http://localhost:8792/stream.html');const saved=[];
globalThis.localStorage={getItem:()=>null,setItem:(key,value)=>saved.push(JSON.parse(value))};
const events={},canvasEvents={};const m={x:0,y:0,scale:{x:1,set(v){this.x=v;}},anchor:{set(){}},
 internalModel:{width:300,height:600},on:(name,fn)=>events[name]=fn};
m.position={set(x,y){m.x=x;m.y=y;}};
const app={screen:{width:600,height:800},renderer:{on(){}},view:{addEventListener:(name,fn)=>canvasEvents[name]=fn,getBoundingClientRect:()=>({left:0,top:0,width:600,height:800})}};
attachStreamView(app,m,'fixture.json',new URLSearchParams(),()=>({x:.1,y:.05}));
events.pointerdown({data:{global:{x:360,y:480}}});events.pointermove({data:{global:{x:390,y:500}}});events.pointerup();
check(m.x===330 && Math.abs(m.y-460)<1e-8,'stream drag moves placement by screen delta');
check(saved.at(-1).x===.55 && Math.abs(saved.at(-1).y-.575)<1e-8,'storage contains only placement');
const scale=m.scale.x;canvasEvents.wheel({preventDefault(){},clientX:390,clientY:500,deltaY:-100});
check(m.scale.x>scale && m.x===330 && Math.abs(m.y-460)<1e-8,'zoom about transient anchor');
canvasEvents.dblclick();check(m.x===300 && Math.abs(m.y-440)<1e-8,'doubleclick resets base placement');
check(!Object.keys(saved.at(-1)).some(k=>['stage','rot'].includes(k)),'stage never stored');

// Busy-pose dropping and discrete-command ordering are preserved.
const sent=[],releases=[];globalThis.fetch=async(url,request)=>{sent.push(JSON.parse(request.body));return new Promise(resolve=>releases.push(()=>resolve({ok:true})));};
const flush=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
sendRelay(valid);check(sendRelay(valid)===false,'busy stage pose dropped');sendRelay({type:'stop'});
releases[0]();await flush();releases[1]();await flush();check(sent.length===2 && sent[1].type==='stop','discrete command retained');

// Run the real stream module against a small renderer stub: legacy packets and
// sender disappearance must clear offsets even when face weight is zero.
let receive,now=0;const ticks=[],applied=[];
const streamSource=(await fs.readFile(new URL('../web/stream.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
const context=vm.createContext({URLSearchParams,location:{search:'?model=fixture.json',reload(){}},performance:{now:()=>now},window:{devicePixelRatio:1},
 document:{getElementById:()=>({appendChild(){}}),documentElement:{style:{}}},
 PIXI:{Container:class{addChild(){}},Application:class{constructor(){this.view={};this.stage={addChild(){}};this.ticker={add:fn=>ticks.push(fn)};}},live2d:{Live2DModel:{from:async()=>({internalModel:{settings:{groups:[]},on(){}}})}}},
 attachStreamView(){},attachBodyStage:()=>value=>applied.push({...value}),STAGE_ZERO,createMotionPlayer:()=>({}),loadBodyLimits:async()=>({ranges:{}}),
 attachFaceDriver:()=>({set(){}}),attachExpressions:()=>({select(){}}),receiveRelay:fn=>receive=fn});
vm.runInContext(streamSource,context);await flush();check(typeof receive==='function','stream initializes');
receive(valid);ticks.forEach(fn=>fn());check(applied.at(-1).x===.15,'stream receives stage with face weight zero');
now=2000;ticks.forEach(fn=>fn());check(applied.at(-1).x<.00001,'quiet sender fades stage');
receive(valid);receive({type:'pose',face:null,weight:0,mouth:null});ticks.forEach(fn=>fn());check(applied.at(-1).x===0,'old sender clears previous stage');
receive(valid);receive({type:'model',name:'other'});ticks.forEach(fn=>fn());check(applied.at(-1).rot===0,'model notification clears stage');
console.log(`PASS: ${checks} stage, placement, relay and streaming checks`);
