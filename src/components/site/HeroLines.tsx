"use client";

// The hero's background: the contour lines of a slowly moving noise field, in pale lavender on the hero's own colour,
// with a ring of Afinlo blue scanning out from the middle, one at a time. Two WebGL passes: the noise into a texture, then its edges to
// the screen. It stops while it's off the screen. Without WebGL there are no lines, and the hero stands as it is.
import { useEffect, useRef } from "react";

/** The most pixels it draws, so a large screen stays smooth. */
const MAX_PIXELS = 2_200_000;

const VERTEX = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif`;

const NOISE = `${PRECISION}
//
// Description : Array and textureless GLSL 2D/3D/4D simplex noise functions.
//      Author : Ian McEwan, Ashima Arts.
//  Maintainer : stegu
//     Lastmod : 20110822 (ijm)
//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
//               Distributed under the MIT License. See LICENSE file.
//               https://github.com/ashima/webgl-noise
//               https://github.com/stegu/webgl-noise
//
uniform float uTime;
uniform float uScale;
uniform float uSpeed;
uniform vec2 uOffset;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  // First corner
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  // Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  // Permutations
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  // Gradients: 7x7 points over a square, mapped onto an octahedron.
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  // Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  // Mix final noise value
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm(vec3 st) {
  float value = 0.0;
  float amplitude = 0.75;
  for (int i = 0; i < 4; i++) {
    value += amplitude * snoise(st);
    st *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  float n = fbm(vec3(uScale * gl_FragCoord.xy + uOffset, uTime * uSpeed));
  gl_FragColor = vec4(vec3(0.5 + 0.5 * n), 1.0);
}`;

const LINES = `${PRECISION}
// The edges are a basic Sobel filter, after Jeroen Baert (www.forceflow.be).
uniform vec2 uResolution;
uniform float uTime;
uniform float uPixel;
uniform sampler2D uNoise;

float intensity(float levels, vec4 color) {
  float x = floor(levels * color.x) / levels;
  return sqrt(3.0 * x * x);
}

float sobel(float levels, vec2 step, vec2 at) {
  float tleft = intensity(levels, texture2D(uNoise, at + vec2(-step.x, step.y)));
  float left = intensity(levels, texture2D(uNoise, at + vec2(-step.x, 0.0)));
  float bleft = intensity(levels, texture2D(uNoise, at + vec2(-step.x, -step.y)));
  float top = intensity(levels, texture2D(uNoise, at + vec2(0.0, step.y)));
  float bottom = intensity(levels, texture2D(uNoise, at + vec2(0.0, -step.y)));
  float tright = intensity(levels, texture2D(uNoise, at + vec2(step.x, step.y)));
  float right = intensity(levels, texture2D(uNoise, at + vec2(step.x, 0.0)));
  float bright = intensity(levels, texture2D(uNoise, at + vec2(step.x, -step.y)));
  float x = tleft + 2.0 * left + bleft - tright - 2.0 * right - bright;
  float y = -tleft - 2.0 * top - tright + bleft + 2.0 * bottom + bright;
  return sqrt(x * x + y * y);
}

// A ring growing out from the middle, kept round on any shape of hero, until it's past the corners.
float ring(float dist, float width, float time, float duration) {
  float t = mod(time, duration) / duration;
  return smoothstep(t, t + width, dist) * smoothstep(t + 3.0 * width, t + 2.0 * width, dist);
}

// The soft wash a ring leaves just behind it.
float wake(float dist, float time, float duration) {
  float t = mod(time, duration) / duration;
  return smoothstep(t - 0.2, t, dist) * smoothstep(t + 0.03, t, dist);
}

void main() {
  vec2 at = gl_FragCoord.xy / uResolution;
  float reach = 0.62 * max(uResolution.x, uResolution.y);
  float dist = length(gl_FragCoord.xy - 0.5 * uResolution) / reach;
  // The scan runs at half the lines' pace, so the eye can follow it.
  float sweep = 0.5 * uTime;
  float scan = ring(dist, 0.022, sweep, 15.0);
  float wash = wake(dist, sweep, 15.0);
  // Under the scan the lines draw thicker as well as blue.
  vec2 pixel = (1.0 + scan) * uPixel / uResolution;
  float lines = min(1.0, min(1.0, 2.0 * sobel(2.0, pixel, at)) + min(1.0, sobel(16.0, 1.5 * pixel, at)));
  // The resting lines are quieter behind the words; the scan isn't.
  vec2 fromCopy = (gl_FragCoord.xy - 0.5 * uResolution) / (0.5 * uResolution);
  float quiet = mix(0.5, 1.0, smoothstep(0.35, 0.95, length(fromCopy)));
  vec3 blue = vec3(0.263, 0.212, 1.0);
  vec3 ink = mix(vec3(0.74, 0.73, 0.88), blue, scan);
  float line = lines * (0.42 * quiet * (1.0 - scan) + scan);
  // The canvas is clear where there's nothing, so the hero's own colour shows through.
  float tint = 0.1 * wash * (1.0 - line);
  gl_FragColor = vec4(ink * line + blue * tint, line + tint);
}`;

function programOf(gl: WebGLRenderingContext, fragment: string) {
  const shader = (type: number, source: string) => {
    const made = gl.createShader(type);
    if (!made) return null;
    gl.shaderSource(made, source);
    gl.compileShader(made);
    return gl.getShaderParameter(made, gl.COMPILE_STATUS) ? made : null;
  };
  const vertex = shader(gl.VERTEX_SHADER, VERTEX),
    pixels = shader(gl.FRAGMENT_SHADER, fragment),
    program = gl.createProgram();
  if (!vertex || !pixels || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, pixels);
  gl.bindAttribLocation(program, 0, "aPosition");
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

export function HeroLines() {
  const box = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = box.current;
    const gl = canvas?.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, powerPreference: "low-power" });
    if (!canvas || !gl) return;
    const noise = programOf(gl, NOISE),
      lines = programOf(gl, LINES);
    const texture = gl.createTexture(),
      target = gl.createFramebuffer(),
      corners = gl.createBuffer();
    if (!noise || !lines || !texture || !target || !corners) return;

    const uniform = (program: WebGLProgram, name: string) => gl.getUniformLocation(program, name);
    const offset = [100 * Math.random(), 100 * Math.random()];
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 1, -1, 1, 1, -1, -1, -1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    const started = performance.now();
    let ratio = 1;

    const draw = (now: number) => {
      // The pace it was made at: a tenth of a step a frame, at 60 frames a second.
      const time = ((now - started) / 1000) * 6;
      const { width, height } = canvas;
      gl.viewport(0, 0, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.useProgram(noise);
      gl.uniform1f(uniform(noise, "uTime"), time);
      gl.uniform1f(uniform(noise, "uScale"), 1 / (500 * ratio));
      gl.uniform1f(uniform(noise, "uSpeed"), 1 / 1000);
      gl.uniform2fv(uniform(noise, "uOffset"), offset);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(lines);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform2f(uniform(lines, "uResolution"), width, height);
      gl.uniform1f(uniform(lines, "uTime"), time);
      gl.uniform1f(uniform(lines, "uPixel"), ratio);
      gl.uniform1i(uniform(lines, "uNoise"), 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const fit = () => {
      const { width, height } = canvas.getBoundingClientRect();
      ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(MAX_PIXELS / Math.max(1, width * height)));
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    };
    fit();
    const resized = new ResizeObserver(fit);
    resized.observe(canvas);

    let frame = 0;
    const tick = (now: number) => {
      draw(now);
      frame = requestAnimationFrame(tick);
    };
    const onScreen = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame);
      if (entry.isIntersecting) frame = requestAnimationFrame(tick);
    });
    onScreen.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      onScreen.disconnect();
      resized.disconnect();
    };
  }, []);

  return <canvas ref={box} className="af2-hero-lines" aria-hidden="true" />;
}
