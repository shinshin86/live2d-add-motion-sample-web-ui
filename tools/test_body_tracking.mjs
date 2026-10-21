// Run with: node tools/test_body_tracking.mjs
import assert from 'node:assert/strict';
import { BodyPose, readBody, combineBody } from '../web/body-tracking.js';
import { OneEuro, bodyTimeConstant } from '../web/body-filter.js';
import { fakeBody } from '../web/fake-body.js';
import { FACE_NEUTRAL, smoothParameters } from '../web/tracking.js';

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const options = { mirror: false, sensitivity: 1, smoothing: .35 };
export function fixture(yaw = 0, pitch = 0, roll = 0, hips = true, x = 0, y = 0, width = .3) {
  const result = fakeBody(0, hips), r = Math.PI / 180;
  for (const [i, side] of [[11, 1], [12, -1]]) {
    result.worldLandmarks[0][i] = { x: side * .2 * Math.cos(yaw*r), y: -.5, z: side * .2 * Math.sin(yaw*r) };
    result.landmarks[0][i] = { x: .5 + x + side * width/2, y: .3 + y + side * width/2 * 4/3 * Math.tan(roll*r), z: 0, visibility: 1 };
  }
  for (const i of [23, 24]) result.worldLandmarks[0][i].z = .5 * Math.tan(pitch*r);
  return result;
}
const rms = values => Math.sqrt(values.reduce((s,v) => s + v*v, 0) / values.length);
// Compare against the previous body algorithm: raw geometry, then face-tau smoothing.
function simulate(input, interval = 100) {
  const pose = new BodyPose(), before = [], after = [];
  pose.update(fixture(), 0);
  let old = {bodyAngleX: 0}, target = 0;
  for (let frame = 1; frame <= 600; frame++) {
    const now = frame * 1000/60;
    if (frame % (interval / (1000/60)) < 1e-8 || frame % Math.round(interval/(1000/60)) === 0) {
      target = input(now/1000) * .7;
      pose.update(fixture(target/.7), now);
    }
    old = smoothParameters(old, {bodyAngleX: target}, 1/60, .35);
    before.push(old.bodyAngleX);
    after.push(pose.sample(now, 1/60, options).params.bodyAngleX);
  }
  return {before, after};
}
const jitter = simulate(t => Math.sin(Math.round(t*10)*2.4)*.7);
const beforeJitter = rms(jitter.before.slice(120)), afterJitter = rms(jitter.after.slice(120));
check(afterJitter < beforeJitter * .55, 'steady jitter reduced by at least 45%');
const ramp = simulate(t => Math.min(8, Math.max(0, (t-1)*10)));
const crossing = values => values.findIndex(v => v >= 2.8) * 1000/60;
const beforeLag = crossing(ramp.before)-1400, afterLag = crossing(ramp.after)-1400;
check(afterLag < 300, 'fast ramp midpoint lag under 300ms');
check(afterLag-beforeLag < 170, 'extra lag under 170ms');
const steps = simulate(t => Math.floor(t*5)*.2, 200);
const glideRatio = values => (values[237]-values[236])/(values[229]-values[228]);
check(glideRatio(steps.after) > .4, '200ms input still glides at end of interval');
check(glideRatio(steps.after) > glideRatio(steps.before)*2, 'late-interval speed ratio improves');
check(bodyTimeConstant(1,100)>bodyTimeConstant(0,100), 'slider changes body tau');
check(bodyTimeConstant(.35,200)>bodyTimeConstant(.35,100), 'sparse inference increases tau');
console.log(JSON.stringify({beforeJitter,afterJitter,jitterReduction:1-afterJitter/beforeJitter,beforeLag,afterLag,
 beforeGlideRatio:glideRatio(steps.before),afterGlideRatio:glideRatio(steps.after)},null,2));

const filter = new OneEuro(); filter.update(0,0);filter.update(10,100);
const held=filter.value; check(filter.update(500,100)===held,'duplicate timestamp ignored');
check(filter.update(NaN,200)===held,'nonfinite sample ignored');filter.reset();check(filter.update(20,200)===20,'filter reset starts fresh');
const pose=new BodyPose();pose.update(fixture(0,0,0,false),0);pose.update(fixture(5,20,5,false),100);
check(pose.sample(100,.1,options).params.bodyAngleX>0,'shoulder yaw without hips');
check(pose.delta().pitch===null,'no pitch without hips');pose.update(fixture(5,20,5),200);
check(pose.delta().pitch===0,'first hips calibrate independently');pose.update(fixture(5,25,5),300);
check(pose.delta().pitch>0,'pitch follows hips');pose.update(fixture(5,25,5,false),400);
check(pose.delta().pitch===null,'hidden hips reset pitch filter');pose.update(fixture(5,-20,5),500);
check(pose.delta().pitch===0,'returning hips recalibrate');check(pose.calibrate(500),'manual calibration');
check(pose.delta().yaw===0,'manual calibration resets filtered delta');pose.sample(1100,.6,options);
check(pose.filtered===null,'loss clears filters');pose.update(fixture(-20,10,0),1200);
check(pose.delta().yaw===0,'recovery recalibrates');pose.sample(1800,.6,options);pose.sample(5000,3.2,options);
check(pose.weight===0,'loss fades fully');pose.reset();check(pose.neutral===null,'reset clears neutral');
for(const id of [11,12]) {const bad=fixture();bad.landmarks[0][id].visibility=.59;check(readBody(bad)===null,'weak shoulder rejected');}
const bad=fixture();bad.worldLandmarks[0][11].x=NaN;check(readBody(bad)===null,'nonfinite shoulder rejected');
function steady(mirror) {
 const p=new BodyPose({bodyAngleX:[-10,10],bodyAngleY:[-7,10],bodyAngleZ:[-10,10]});p.update(fixture(),0);
 for(let now=100;now<=3000;now+=100){p.update(fixture(60,60,60),now);p.sample(now,.1,{...options,mirror});}
 return p.params;
}
const normal=steady(false),mirror=steady(true);
check(Math.abs(normal.bodyAngleX+mirror.bodyAngleX)<1e-8,'mirror reverses yaw');
check(Math.abs(normal.bodyAngleZ+mirror.bodyAngleZ)<1e-8,'mirror reverses roll');
check(normal.bodyAngleY===mirror.bodyAngleY && normal.bodyAngleY<=7,'signed asymmetric pitch clamp');
const combined=combineBody({...FACE_NEUTRAL,bodyAngleX:3},.5,{params:{bodyAngleX:4,bodyAngleY:0,bodyAngleZ:0},weight:.25});
check(combined.params.bodyAngleX*combined.weight===2.5,'independent face/body weights');
console.log(`PASS: ${checks} body smoothing and geometry checks`);
