// Run with: node tools/test_cubism_colors.mjs (no browser or network required).
import assert from 'node:assert/strict';
import { installCubismColors } from '../web/cubism-colors.js';

// Exact fragment shader strings from the pinned distribution:
// https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0/dist/cubism4.js
const sources = {
  fragmentShaderSrcsetupMask: "precision mediump float;varying vec2       v_texCoord;varying vec4       v_myPos;uniform vec4       u_baseColor;uniform vec4       u_channelFlag;uniform sampler2D  s_texture0;void main(){   float isInside =        step(u_baseColor.x, v_myPos.x/v_myPos.w)       * step(u_baseColor.y, v_myPos.y/v_myPos.w)       * step(v_myPos.x/v_myPos.w, u_baseColor.z)       * step(v_myPos.y/v_myPos.w, u_baseColor.w);   gl_FragColor = u_channelFlag * texture2D(s_texture0, v_texCoord).a * isInside;}",
  fragmentShaderSrcPremultipliedAlpha: "precision mediump float;varying vec2       v_texCoord;uniform vec4       u_baseColor;uniform sampler2D  s_texture0;void main(){   gl_FragColor = texture2D(s_texture0 , v_texCoord) * u_baseColor;}",
  fragmentShaderSrcMaskPremultipliedAlpha: "precision mediump float;varying vec2       v_texCoord;varying vec4       v_clipPos;uniform vec4       u_baseColor;uniform vec4       u_channelFlag;uniform sampler2D  s_texture0;uniform sampler2D  s_texture1;void main(){   vec4 col_formask = texture2D(s_texture0 , v_texCoord) * u_baseColor;   vec4 clipMask = (1.0 - texture2D(s_texture1, v_clipPos.xy / v_clipPos.w)) * u_channelFlag;   float maskVal = clipMask.r + clipMask.g + clipMask.b + clipMask.a;   col_formask = col_formask * maskVal;   gl_FragColor = col_formask;}",
  fragmentShaderSrcMaskInvertedPremultipliedAlpha: "precision mediump float;varying vec2 v_texCoord;varying vec4 v_clipPos;uniform sampler2D s_texture0;uniform sampler2D s_texture1;uniform vec4 u_channelFlag;uniform vec4 u_baseColor;void main(){vec4 col_formask = texture2D(s_texture0, v_texCoord) * u_baseColor;vec4 clipMask = (1.0 - texture2D(s_texture1, v_clipPos.xy / v_clipPos.w)) * u_channelFlag;float maskVal = clipMask.r + clipMask.g + clipMask.b + clipMask.a;col_formask = col_formask * (1.0 - maskVal);gl_FragColor = col_formask;}",
};

function libraryFixture() {
  class Shader {
    loadShaderProgram(vertex, fragment) { return { vertex, fragment }; }
    setupShaderProgram(_renderer, mode = 1) {
      this.gl.current = this.programs[mode];
      return 'setup';
    }
  }
  class Renderer {
    constructor(model, shader) {
      this.model = model;
      this.shader = shader;
      this._sortedDrawableIndexList = Array(model.getDrawableCount()).fill(0);
      this.preDraws = 0;
      this.fallbacks = 0;
      this.calls = [];
      this.mask = null;
      this.clip = null;
    }
    getModel() { return this.model; }
    preDraw() { this.preDraws++; }
    doDrawModel() {
      this.fallbacks++;
      this.shader.setupShaderProgram(this);
      return 'fallback';
    }
    getClippingContextBufferForMask() { return this.mask; }
    getClippingContextBufferForDraw() { return this.clip; }
    setClippingContextBufferForDraw(clip) { this.clip = clip; }
    setIsCulling(value) { this.culling = value; }
    drawMesh(...args) {
      const before = this.shader.gl.writes.length;
      const mode = this.mask ? 0 : this.clip ? (args[8] ? 3 : 2) : 1;
      this.shader.setupShaderProgram(this, mode);
      this.calls.push({ args, mode, culling: this.culling, clip: this.clip,
        writes: this.shader.gl.writes.slice(before) });
      this.mask = null;
      this.clip = null;
    }
  }
  return { ...sources, VERSION: '0.4.0', CubismShader_WebGL: Shader, CubismRenderer_WebGL: Renderer };
}

function shaderFixture(library) {
  const shader = new library.CubismShader_WebGL();
  shader.gl = {
    CURRENT_PROGRAM: 'current', current: null, writes: [], lookups: 0,
    getParameter() { return this.current; },
    getUniformLocation(program, name) { this.lookups++; return { program, name }; },
    uniform4f(location, ...value) { this.writes.push({ location, value }); },
  };
  shader.programs = [sources.fragmentShaderSrcsetupMask, sources.fragmentShaderSrcPremultipliedAlpha,
    sources.fragmentShaderSrcMaskPremultipliedAlpha, sources.fragmentShaderSrcMaskInvertedPremultipliedAlpha]
    .map(fragment => shader.loadShaderProgram('vertex', fragment));
  return shader;
}

function modelFixture() {
  const drawables = { multiplyColors: [], screenColors: [] };
  for (let i = 0; i < 4; i++) {
    drawables.multiplyColors.push(i / 4, i / 5, i / 6, 1);
    drawables.screenColors.push(i / 7, i / 8, i / 9, 1);
  }
  return {
    drawables,
    getModel() { return { drawables }; },
    getDrawableCount: () => 4,
    getDrawableRenderOrders: () => [2, 0, 3, 1],
    getDrawableDynamicFlagIsVisible: index => index !== 2,
    getDrawableCulling: index => index % 2 === 0,
    getDrawableTextureIndices: index => index,
    getDrawableVertexIndexCount: index => index + 10,
    getDrawableVertexCount: index => index + 20,
    getDrawableVertexIndices: index => [index + 30],
    getDrawableVertices: index => [index + 40],
    getDrawableVertexUvs: index => [index + 50],
    getDrawableOpacity: index => index / 4,
    getDrawableBlendMode: index => index % 3,
    getDrawableInvertedMaskBit: index => index === 1,
  };
}

const savedPIXI = globalThis.PIXI;
const savedWarn = console.warn;
const warnings = [];
console.warn = message => warnings.push(message);
try {
  // Guards leave every original method intact and allow a later valid install.
  for (const damage of [lib => delete lib.CubismShader_WebGL,
    lib => { lib.VERSION = '0.5.0'; },
    lib => delete lib.fragmentShaderSrcPremultipliedAlpha,
    lib => { lib.fragmentShaderSrcMaskPremultipliedAlpha = 'unknown shader'; },
    lib => { lib.fragmentShaderSrcsetupMask = undefined; }]) {
    const library = libraryFixture();
    const draw = library.CubismRenderer_WebGL.prototype.doDrawModel;
    const load = library.CubismShader_WebGL.prototype.loadShaderProgram;
    damage(library);
    globalThis.PIXI = { live2d: library };
    assert.equal(installCubismColors(), false);
    assert.equal(library.CubismRenderer_WebGL.prototype.doDrawModel, draw);
    if (library.CubismShader_WebGL) assert.equal(library.CubismShader_WebGL.prototype.loadShaderProgram, load);
  }
  assert.ok(warnings.some(message => message.includes('classes')));
  assert.ok(warnings.some(message => message.includes('shader sources')));

  const library = libraryFixture();
  globalThis.PIXI = { live2d: library };
  assert.equal(installCubismColors(), true);
  const draw = library.CubismRenderer_WebGL.prototype.doDrawModel;
  const load = library.CubismShader_WebGL.prototype.loadShaderProgram;
  assert.equal(installCubismColors(), true);
  // A second module instance must not wrap the same library again.
  const reimported = await import('../web/cubism-colors.js?duplicate-install-test');
  assert.equal(reimported.installCubismColors(), true);
  assert.equal(library.CubismRenderer_WebGL.prototype.doDrawModel, draw);
  assert.equal(library.CubismShader_WebGL.prototype.loadShaderProgram, load);

  const shader = shaderFixture(library);
  assert.equal(shader.programs[0].fragment, sources.fragmentShaderSrcsetupMask);
  for (const program of shader.programs.slice(1)) {
    assert.equal(program.vertex, 'vertex');
    assert.equal(program.fragment.match(/uniform vec4 u_multiplyColor;/g)?.length, 1);
    assert.equal(program.fragment.match(/uniform vec4 u_screenColor;/g)?.length, 1);
    assert.ok(program.fragment.includes('texColor.rgb = texColor.rgb * u_multiplyColor.rgb;'));
    assert.ok(program.fragment.includes('(texColor.rgb + u_screenColor.rgb * texColor.a) - (texColor.rgb * u_screenColor.rgb)'));
    assert.equal(program.fragment.match(/texture2D\(s_texture0/g)?.length, 1);
    assert.ok(program.fragment.indexOf('texColor.rgb =') < program.fragment.indexOf('texColor * u_baseColor'));
  }
  assert.ok(shader.programs[2].fragment.includes('col_formask = col_formask * maskVal;'));
  assert.ok(shader.programs[3].fragment.includes('col_formask = col_formask * (1.0 - maskVal);'));
  const unknown = shader.loadShaderProgram('vertex', 'unknown fragment');
  assert.equal(unknown.fragment, 'unknown fragment');
  assert.ok(warnings.some(message => message.includes('Unrecognized')));

  const model = modelFixture();
  const visible = model.getDrawableDynamicFlagIsVisible;
  const renderer = new library.CubismRenderer_WebGL(model, shader);
  const clips = [{ id: 0 }, { id: 1 }, null, null];
  renderer._clippingManager = {
    setupClippingContext(target, current) {
      assert.equal(target, model);
      current.mask = {};
      current.drawMesh(-1); // A separate mask pass must not upload colors.
    },
    getClippingContextListForDraw: () => clips,
  };
  renderer.doDrawModel();
  assert.equal(renderer.preDraws, 1);
  assert.equal(renderer.fallbacks, 0);
  assert.equal(model.getDrawableDynamicFlagIsVisible, visible);
  assert.equal(renderer.calls[0].mode, 0);
  assert.deepEqual(renderer.calls[0].writes, []);
  assert.deepEqual(renderer.calls.slice(1).map(call => call.args[0]), [1, 3, 0]);
  assert.deepEqual(renderer.calls.slice(1).map(call => call.mode), [3, 1, 2]);
  for (const call of renderer.calls.slice(1)) {
    const i = call.args[0];
    assert.deepEqual(call.args, [i, i + 10, i + 20, [i + 30], [i + 40], [i + 50], i / 4, i % 3, i === 1]);
    assert.equal(call.culling, i % 2 === 0);
    assert.equal(call.clip, clips[i]);
    assert.deepEqual(call.writes.map(write => write.value), [model.drawables.multiplyColors.slice(i * 4, i * 4 + 4),
      model.drawables.screenColors.slice(i * 4, i * 4 + 4)]);
    assert.deepEqual(call.writes.map(write => write.location.name), ['u_multiplyColor', 'u_screenColor']);
  }
  assert.equal(shader.gl.lookups, 6, 'two locations per drawing program');
  model.drawables.multiplyColors[4] = 0.9;
  renderer.calls = [];
  renderer.doDrawModel();
  assert.equal(shader.gl.lookups, 6, 'uniform locations are cached');
  assert.equal(renderer.calls[1].writes[0].value[0], 0.9, 'read colors again on every draw');

  // Legacy Core keeps its original draw method and resets shared uniforms.
  delete model.drawables.multiplyColors;
  assert.equal(renderer.doDrawModel(), 'fallback');
  assert.equal(renderer.fallbacks, 1);
  assert.deepEqual(shader.gl.writes.slice(-2).map(write => write.value), [[1, 1, 1, 1], [0, 0, 0, 1]]);
  assert.ok(warnings.some(message => message.includes('Core drawable colors')));

  // An exception cannot leave a stale drawable active for a later call.
  const throwing = new library.CubismRenderer_WebGL(modelFixture(), shader);
  throwing.drawMesh = () => { throw new Error('draw failed'); };
  assert.throws(() => throwing.doDrawModel(), /draw failed/);
  shader.setupShaderProgram(throwing);
  assert.deepEqual(shader.gl.writes.slice(-2).map(write => write.value), [[1, 1, 1, 1], [0, 0, 0, 1]]);

  // Fresh libraries/contexts install independently; WebGL locations never cross.
  const secondLibrary = libraryFixture();
  globalThis.PIXI = { live2d: secondLibrary };
  assert.equal(installCubismColors(), true);
  const secondShader = shaderFixture(secondLibrary);
  new secondLibrary.CubismRenderer_WebGL(modelFixture(), secondShader).doDrawModel();
  assert.equal(secondShader.gl.lookups, 2);
  assert.ok(secondShader.gl.writes.every(write => secondShader.programs.includes(write.location.program)));
  console.log('Cubism colors: shader variants, guards, draw order, uniforms, masks and repeated installs passed.');
} finally {
  globalThis.PIXI = savedPIXI;
  console.warn = savedWarn;
}
