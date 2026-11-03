// @ts-check
// Multiply/screen colors for pixi-live2d-display 0.4.0. Install before loading
// any models; review these hooks when changing the pinned library version.
const INSTALLED = Symbol.for("live2d-web-ui.cubism-colors");
const warned = new Set();

/** @param {string} message */
function warn(message) {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[cubism-colors] ${message}`);
}

/** @param {unknown} source @returns {string | null} */
function addColors(source) {
  if (typeof source !== "string" || source.includes("isInside") ||
      source.includes("u_multiplyColor") || source.includes("u_screenColor")) return null;
  const sample = /texture2D\(s_texture0\s*,\s*v_texCoord\)\s*\*\s*u_baseColor/g;
  if (source.split("void main(){").length !== 2 || source.match(sample)?.length !== 1) return null;
  return source.replace(sample, "texColor * u_baseColor").replace("void main(){", `
uniform vec4 u_multiplyColor;
uniform vec4 u_screenColor;
void main(){
  vec4 texColor = texture2D(s_texture0, v_texCoord);
  texColor.rgb = texColor.rgb * u_multiplyColor.rgb;
  texColor.rgb = (texColor.rgb + u_screenColor.rgb * texColor.a) - (texColor.rgb * u_screenColor.rgb);
`);
}

/** Install once per pair of library prototypes, even across repeated imports.
 * @returns {boolean} whether compatible hooks are installed
 */
export function installCubismColors() {
  const library = /** @type {any} */ (globalThis).PIXI?.live2d;
  const shader = library?.CubismShader_WebGL?.prototype;
  const renderer = library?.CubismRenderer_WebGL?.prototype;
  if (library?.VERSION !== "0.4.0" ||
      typeof shader?.loadShaderProgram !== "function" ||
      typeof shader?.setupShaderProgram !== "function" ||
      typeof renderer?.doDrawModel !== "function" ||
      typeof renderer?.getModel !== "function" ||
      typeof renderer?.preDraw !== "function") {
    warn("Expected pixi-live2d-display 0.4.0 classes are unavailable; colors were not installed.");
    return false;
  }
  if (shader[INSTALLED] === renderer && renderer[INSTALLED] === shader) return true;
  if (shader[INSTALLED] || renderer[INSTALLED]) {
    warn("Renderer/shader hooks do not match; colors were not installed again.");
    return false;
  }

  const sources = [library.fragmentShaderSrcPremultipliedAlpha,
    library.fragmentShaderSrcMaskPremultipliedAlpha,
    library.fragmentShaderSrcMaskInvertedPremultipliedAlpha];
  const maskSource = library.fragmentShaderSrcsetupMask;
  const replacements = sources.map(addColors);
  if (replacements.some(source => source === null) || new Set(sources).size !== 3 ||
      typeof maskSource !== "string" || !maskSource.includes("isInside")) {
    warn("Expected 0.4.0 shader sources are unavailable; colors were not installed.");
    return false;
  }
  const rewritten = new Map(sources.map((source, i) => [source, replacements[i]]));
  const colorPrograms = new WeakSet();
  /** @type {WeakMap<WebGLProgram, {multiply: WebGLUniformLocation | null, screen: WebGLUniformLocation | null}>} */
  const locations = new WeakMap();
  /** @type {WeakMap<object, {index: number, drawables: any}>} */
  const drawing = new WeakMap();
  const missingColors = new WeakSet();
  const originalLoad = shader.loadShaderProgram;
  const originalSetup = shader.setupShaderProgram;
  const originalDraw = renderer.doDrawModel;

  /** @this {any} @param {string} vertex @param {string} fragment */
  shader.loadShaderProgram = function (vertex, fragment) {
    const replacement = rewritten.get(fragment);
    if (!replacement && fragment !== maskSource) {
      warn("Unrecognized fragment shader; leaving it unchanged.");
    }
    const program = originalLoad.call(this, vertex, replacement ?? fragment);
    if (replacement && program) colorPrograms.add(program);
    return program;
  };

  /** @this {any} @param {any} target @param {...any} args */
  shader.setupShaderProgram = function (target, ...args) {
    const result = originalSetup.call(this, target, ...args);
    // Mask generation encodes alpha/coverage only, never drawable colors.
    if (target.getClippingContextBufferForMask() != null) return result;
    const gl = /** @type {WebGLRenderingContext} */ (this.gl);
    const program = gl.getParameter(gl.CURRENT_PROGRAM);
    if (!program || !colorPrograms.has(program)) return result;
    let uniforms = locations.get(program);
    if (!uniforms) {
      uniforms = { multiply: gl.getUniformLocation(program, "u_multiplyColor"),
        screen: gl.getUniformLocation(program, "u_screenColor") };
      locations.set(program, uniforms);
    }
    const current = drawing.get(target);
    if (current) {
      const offset = current.index * 4;
      const { multiplyColors: m, screenColors: s } = current.drawables;
      gl.uniform4f(uniforms.multiply, m[offset], m[offset + 1], m[offset + 2], 1);
      gl.uniform4f(uniforms.screen, s[offset], s[offset + 1], s[offset + 2], 1);
    } else {
      // A legacy Core/renderer still uses these shared programs. Reset both
      // uniforms so it cannot inherit colors from the last compatible model.
      gl.uniform4f(uniforms.multiply, 1, 1, 1, 1);
      gl.uniform4f(uniforms.screen, 0, 0, 0, 1);
    }
    return result;
  };

  /** @this {any} */
  renderer.doDrawModel = function () {
    const model = this.getModel();
    const drawables = model?.getModel?.()?.drawables;
    const count = model.getDrawableCount();
    if (!drawables?.multiplyColors || !drawables?.screenColors ||
        drawables.multiplyColors.length < count * 4 || drawables.screenColors.length < count * 4) {
      if (!missingColors.has(this)) {
        missingColors.add(this);
        warn("Core drawable colors are unavailable; keeping the original renderer for this model.");
      }
      return originalDraw.call(this);
    }

    // Follow 0.4.0's draw order, clipping, visibility and culling exactly; track
    // the drawable here instead of replacing the model's visibility getter.
    this.preDraw();
    const clipping = this._clippingManager;
    if (clipping != null) clipping.setupClippingContext(model, this);
    const order = model.getDrawableRenderOrders();
    for (let i = 0; i < count; i++) this._sortedDrawableIndexList[order[i]] = i;
    try {
      for (let i = 0; i < count; i++) {
        const index = this._sortedDrawableIndexList[i];
        if (!model.getDrawableDynamicFlagIsVisible(index)) continue;
        this.setClippingContextBufferForDraw(clipping != null ? clipping.getClippingContextListForDraw()[index] : null);
        this.setIsCulling(model.getDrawableCulling(index));
        drawing.set(this, { index, drawables });
        this.drawMesh(model.getDrawableTextureIndices(index), model.getDrawableVertexIndexCount(index),
          model.getDrawableVertexCount(index), model.getDrawableVertexIndices(index),
          model.getDrawableVertices(index), model.getDrawableVertexUvs(index),
          model.getDrawableOpacity(index), model.getDrawableBlendMode(index), model.getDrawableInvertedMaskBit(index));
      }
    } finally {
      drawing.delete(this);
    }
  };
  shader[INSTALLED] = renderer;
  renderer[INSTALLED] = shader;
  return true;
}
