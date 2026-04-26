var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

// src/components/VideoToAscii.tsx
import { useEffect as useEffect5 } from "react";

// src/hooks/useVideoToAscii.ts
import { useRef, useState, useCallback, useEffect, useMemo } from "react";

// src/lib/ascii-charsets.ts
var ASCII_CHARSETS = {
  /** Classic 10-character gradient - good balance of detail and performance */
  standard: {
    name: "Standard",
    chars: " .:-=+*#%@"
  },
  /** Unicode block characters - chunky retro aesthetic */
  blocks: {
    name: "Blocks",
    chars: " \u2591\u2592\u2593\u2588"
  },
  /** Minimal 5-character set - high contrast, fast rendering */
  minimal: {
    name: "Minimal",
    chars: " .oO@"
  },
  /** Binary on/off - pure silhouette mode */
  binary: {
    name: "Binary",
    chars: " \u2588"
  },
  /** 70-character gradient - maximum detail, best for high resolution */
  detailed: {
    name: "Detailed",
    chars: " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$"
  },
  /** Dot-based - pointillist aesthetic */
  dots: {
    name: "Dots",
    chars: " \xB7\u2022\u25CF"
  },
  /** Directional arrows - experimental */
  arrows: {
    name: "Arrows",
    chars: " \u2190\u2199\u2193\u2198\u2192\u2197\u2191\u2196"
  },
  /** Moon phases - decorative gradient */
  emoji: {
    name: "Emoji",
    chars: "  \u2591\u2592\u2593\u{1F311}\u{1F312}\u{1F313}\u{1F314}\u{1F315}"
  }
};
var DEFAULT_CHARSET = "standard";
function getCharArray(charset) {
  return [...ASCII_CHARSETS[charset].chars];
}

// src/lib/webgl/shaders/vertex.glsl
var vertex_default = "#version 300 es\n\n// Fullscreen quad - passes texture coords to fragment shader\n\nin vec2 a_position;\nin vec2 a_texCoord;\nout vec2 v_texCoord;\n\nvoid main() {\n  gl_Position = vec4(a_position, 0.0, 1.0);\n  v_texCoord = a_texCoord;\n}\n";

// src/lib/webgl/shaders/fragment.glsl
var fragment_default = "#version 300 es\nprecision highp float;\n\n// Textures\nuniform sampler2D u_video;\nuniform sampler2D u_asciiAtlas;\n\n// Dimensions\nuniform vec2 u_resolution;\nuniform vec2 u_charSize;\nuniform vec2 u_gridSize;\nuniform float u_numChars;\n\n// Rendering options\nuniform bool u_colored;\nuniform float u_blend;\nuniform float u_highlight;\nuniform float u_brightness;\n\n// Audio\nuniform float u_audioLevel;\nuniform float u_audioReactivity;\nuniform float u_audioSensitivity;\n\n// Mouse\nuniform vec2 u_mouse;\nuniform float u_mouseRadius;\nuniform vec2 u_trail[24];\nuniform int u_trailLength;\n\n// Ripple\nuniform vec4 u_ripples[8];\nuniform float u_time;\nuniform float u_rippleEnabled;\nuniform float u_rippleSpeed;\n\nin vec2 v_texCoord;\nout vec4 fragColor;\n\nvoid main() {\n  // Figure out which ASCII cell this pixel is in\n  vec2 cellCoord = floor(v_texCoord * u_gridSize);\n  vec2 thisCell = cellCoord;\n  \n  // Sample video at cell center (mipmaps handle averaging)\n  vec2 cellCenter = (cellCoord + 0.5) / u_gridSize;\n  vec4 videoColor = texture(u_video, cellCenter);\n  \n  // Perceived brightness using human eye sensitivity weights\n  float baseBrightness = dot(videoColor.rgb, vec3(0.299, 0.587, 0.114));\n  \n  // Audio reactivity - louder = brighter, silence = darker\n  float minBrightness = mix(0.3, 0.0, u_audioSensitivity);\n  float maxBrightness = mix(1.0, 5.0, u_audioSensitivity);\n  float audioMultiplier = mix(minBrightness, maxBrightness, u_audioLevel);\n  float audioModulated = baseBrightness * audioMultiplier;\n  float brightness = mix(baseBrightness, audioModulated, u_audioReactivity);\n  \n  // Cursor glow - blocky circle effect\n  float cursorGlow = 0.0;\n  float cursorRadius = 11.0;\n  \n  vec2 mouseCell = floor(u_mouse * u_gridSize);\n  float cellDist = length(thisCell - mouseCell);\n  if (cellDist <= cursorRadius && u_mouse.x >= 0.0) {\n    cursorGlow += 1.0 - cellDist / cursorRadius;\n  }\n  \n  // Trail effect\n  for (int i = 0; i < 12; i++) {\n    if (i >= u_trailLength) break;\n    vec2 trailPos = u_trail[i];\n    if (trailPos.x < 0.0) continue;\n    \n    vec2 trailCell = floor(trailPos * u_gridSize);\n    float trailDist = length(thisCell - trailCell);\n    float trailRadius = cursorRadius * 0.8;\n    \n    if (trailDist <= trailRadius) {\n      float fade = 1.0 - float(i) / float(u_trailLength);\n      cursorGlow += (1.0 - trailDist / trailRadius) * 0.5 * fade;\n    }\n  }\n  cursorGlow = min(cursorGlow, 1.0);\n  \n  // Ripple effect - expanding rings on click\n  float rippleGlow = 0.0;\n  if (u_rippleEnabled > 0.5) {\n    for (int i = 0; i < 8; i++) {\n      vec4 ripple = u_ripples[i];\n      if (ripple.w < 0.5) continue;\n      \n      float age = u_time - ripple.z;\n      if (age < 0.0) continue;\n      \n      vec2 rippleCell = floor(ripple.xy * u_gridSize);\n      float cellDist = length(thisCell - rippleCell);\n      float initialRadius = 5.0;\n      \n      float distFromEdge = max(0.0, cellDist - initialRadius);\n      float rippleSpeed = u_rippleSpeed;\n      float reachTime = distFromEdge / rippleSpeed;\n      float timeSinceReached = age - reachTime;\n      \n      float fadeDuration = 0.5;\n      if (timeSinceReached >= 0.0 && timeSinceReached < fadeDuration) {\n        float pop = 1.0 - timeSinceReached / fadeDuration;\n        pop = pop * pop;\n        rippleGlow += pop * 0.3;\n      }\n    }\n    rippleGlow = min(rippleGlow, 1.0);\n  }\n  \n  // Apply brightness multiplier\n  // brightness < 1.0: darkens (multiply)\n  // brightness > 1.0: brightens (compress dark values toward 1.0)\n  float adjustedBrightness;\n  if (u_brightness <= 1.0) {\n    adjustedBrightness = brightness * u_brightness;\n  } else {\n    // For brightness > 1.0, compress the range: dark values get pushed up\n    // Formula: 1.0 - (1.0 - brightness) / u_brightness\n    // This makes dark values brighter while keeping bright values near 1.0\n    adjustedBrightness = 1.0 - (1.0 - brightness) / u_brightness;\n  }\n  adjustedBrightness = clamp(adjustedBrightness, 0.0, 1.0);\n  \n  // Map brightness to character index (0 = darkest char, numChars-1 = brightest)\n  float charIndex = floor(adjustedBrightness * (u_numChars - 0.001));\n  \n  // Find the character in the atlas (horizontal strip of pre-rendered chars)\n  float atlasX = charIndex / u_numChars;\n  vec2 cellPos = fract(v_texCoord * u_gridSize);\n  vec2 atlasCoord = vec2(atlasX + cellPos.x / u_numChars, cellPos.y);\n  vec4 charColor = texture(u_asciiAtlas, atlasCoord);\n  \n  // Pick the color - video colors or green terminal aesthetic\n  vec3 baseColor;\n  if (u_colored) {\n    baseColor = videoColor.rgb;\n  } else {\n    baseColor = vec3(0.0, 1.0, 0.0);\n  }\n  \n  // Background highlight behind each character\n  float bgIntensity = 0.15 + u_highlight * 0.35;\n  vec3 bgColor = baseColor * bgIntensity;\n  vec3 textColor = baseColor * 1.2;\n  vec3 finalColor = mix(bgColor, textColor, charColor.r);\n  \n  // Add cursor and ripple glow\n  finalColor += cursorGlow * baseColor * 0.85;\n  finalColor += rippleGlow * baseColor;\n  \n  // Blend with original video if requested\n  vec3 blendedColor = mix(finalColor, videoColor.rgb, u_blend);\n  \n  fragColor = vec4(blendedColor, 1.0);\n}\n";

// src/lib/webgl/utils.ts
function compileShader(gl, source, type) {
  const shader = gl.createShader(type);
  if (!shader) {
    console.error("Failed to create shader");
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}
function createProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();
  if (!program) {
    console.error("Failed to create program");
    return null;
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}
function createFullscreenQuad(gl, program) {
  const positions = new Float32Array([
    -1,
    -1,
    // bottom-left
    1,
    -1,
    // bottom-right
    -1,
    1,
    // top-left
    -1,
    1,
    // top-left
    1,
    -1,
    // bottom-right
    1,
    1
    // top-right
  ]);
  const texCoords = new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]);
  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  const texBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
  const texLoc = gl.getAttribLocation(program, "a_texCoord");
  gl.enableVertexAttribArray(texLoc);
  gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);
}
function createVideoTexture(gl) {
  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}
function createAsciiAtlas(gl, chars, charSize = 64) {
  const canvas = document.createElement("canvas");
  canvas.width = charSize * chars.length;
  canvas.height = charSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = `${charSize * 0.8}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < chars.length; i++) {
    const x = i * charSize + charSize / 2;
    const y = charSize / 2;
    ctx.fillText(chars[i], x, y);
  }
  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}
function calculateGridDimensions(videoWidth, videoHeight, cols) {
  const aspectRatio = videoWidth / videoHeight;
  const rows = Math.round(cols / aspectRatio / 2);
  return { cols, rows };
}

// src/lib/webgl/types.ts
var CHAR_WIDTH_RATIO = 0.6;

// src/hooks/useVideoToAscii.ts
var MAX_TRAIL_LENGTH = 24;
var MAX_RIPPLES = 8;
function useVideoToAscii(options = {}) {
  const {
    fontSize,
    numColumns,
    colored = true,
    blend = 0,
    highlight = 0,
    brightness = 1,
    charset = DEFAULT_CHARSET,
    maxWidth,
    enableSpacebarToggle = false,
    onStats
  } = options;
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const programRef = useRef(null);
  const videoTextureRef = useRef(null);
  const atlasTextureRef = useRef(null);
  const animationRef = useRef(0);
  const uniformSettersRef = useRef(/* @__PURE__ */ new Map());
  const uniformLocationsRef = useRef(null);
  const frameCountRef = useRef(0);
  const frameTimesRef = useRef([]);
  const lastFpsTimeRef = useRef(performance.now());
  const [dimensions, setDimensions] = useState({ cols: 80, rows: 24 });
  const [stats, setStats] = useState({ fps: 0, frameTime: 0 });
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const defaultWidth = typeof window !== "undefined" ? window.innerWidth : 900;
  const containerWidth = maxWidth || defaultWidth;
  const calculatedFontSize = numColumns ? containerWidth / (numColumns * CHAR_WIDTH_RATIO) : fontSize || 10;
  const calculatedMaxWidth = numColumns ? numColumns * calculatedFontSize * CHAR_WIDTH_RATIO : maxWidth || 900;
  const charWidth = calculatedFontSize * CHAR_WIDTH_RATIO;
  const cols = numColumns || Math.floor(calculatedMaxWidth / charWidth);
  const chars = useMemo(() => getCharArray(charset), [charset]);
  const registerUniformSetter = useCallback(
    (id, setter) => {
      uniformSettersRef.current.set(id, setter);
    },
    []
  );
  const unregisterUniformSetter = useCallback((id) => {
    uniformSettersRef.current.delete(id);
  }, []);
  const cacheUniformLocations = useCallback(
    (gl, program) => {
      const get = (name) => gl.getUniformLocation(program, name);
      return {
        // Core uniforms
        u_video: get("u_video"),
        u_asciiAtlas: get("u_asciiAtlas"),
        u_resolution: get("u_resolution"),
        u_charSize: get("u_charSize"),
        u_gridSize: get("u_gridSize"),
        u_numChars: get("u_numChars"),
        u_colored: get("u_colored"),
        u_blend: get("u_blend"),
        u_highlight: get("u_highlight"),
        u_brightness: get("u_brightness"),
        // Mouse uniforms
        u_mouse: get("u_mouse"),
        u_mouseRadius: get("u_mouseRadius"),
        u_trailLength: get("u_trailLength"),
        u_trail: Array.from(
          { length: MAX_TRAIL_LENGTH },
          (_, i) => get(`u_trail[${i}]`)
        ),
        // Ripple uniforms
        u_time: get("u_time"),
        u_rippleEnabled: get("u_rippleEnabled"),
        u_rippleSpeed: get("u_rippleSpeed"),
        u_ripples: Array.from(
          { length: MAX_RIPPLES },
          (_, i) => get(`u_ripples[${i}]`)
        ),
        // Audio uniforms
        u_audioLevel: get("u_audioLevel"),
        u_audioReactivity: get("u_audioReactivity"),
        u_audioSensitivity: get("u_audioSensitivity")
      };
    },
    []
  );
  const initWebGL = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const container = containerRef.current;
    if (!canvas || !video || !video.videoWidth) return false;
    let finalFontSize = calculatedFontSize;
    let finalCols = cols;
    if (numColumns && container) {
      const actualWidth = container.clientWidth || defaultWidth;
      finalFontSize = actualWidth / (numColumns * CHAR_WIDTH_RATIO);
      finalCols = numColumns;
    }
    const grid = calculateGridDimensions(
      video.videoWidth,
      video.videoHeight,
      finalCols
    );
    setDimensions(grid);
    const finalCharWidth = finalFontSize * CHAR_WIDTH_RATIO;
    const pixelWidth = grid.cols * finalCharWidth;
    const pixelHeight = grid.rows * finalFontSize;
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      preserveDrawingBuffer: false
    });
    if (!gl) {
      console.error("WebGL2 not supported");
      return false;
    }
    glRef.current = gl;
    const vertexShader = compileShader(gl, vertex_default, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(
      gl,
      fragment_default,
      gl.FRAGMENT_SHADER
    );
    if (!vertexShader || !fragmentShader) return false;
    const program = createProgram(gl, vertexShader, fragmentShader);
    if (!program) return false;
    programRef.current = program;
    gl.useProgram(program);
    createFullscreenQuad(gl, program);
    videoTextureRef.current = createVideoTexture(gl);
    const finalFontSizeForAtlas = numColumns && container ? (container.clientWidth || defaultWidth) / (numColumns * CHAR_WIDTH_RATIO) : calculatedFontSize;
    atlasTextureRef.current = createAsciiAtlas(
      gl,
      chars,
      finalFontSizeForAtlas
    );
    const locations = cacheUniformLocations(gl, program);
    uniformLocationsRef.current = locations;
    gl.uniform1i(locations.u_video, 0);
    gl.uniform1i(locations.u_asciiAtlas, 1);
    gl.uniform2f(locations.u_resolution, pixelWidth, pixelHeight);
    gl.uniform2f(locations.u_charSize, finalCharWidth, finalFontSize);
    gl.uniform2f(locations.u_gridSize, finalCols, grid.rows);
    gl.uniform1f(locations.u_numChars, chars.length);
    gl.uniform1f(locations.u_brightness, brightness);
    gl.uniform2f(locations.u_mouse, -1, -1);
    gl.uniform1f(locations.u_mouseRadius, 0);
    gl.uniform1i(locations.u_trailLength, 0);
    gl.uniform1f(locations.u_rippleEnabled, 0);
    gl.uniform1f(locations.u_audioLevel, 0);
    gl.uniform1f(locations.u_audioReactivity, 0);
    gl.uniform1f(locations.u_audioSensitivity, 0);
    gl.viewport(0, 0, pixelWidth, pixelHeight);
    setIsReady(true);
    return true;
  }, [
    cols,
    numColumns,
    calculatedFontSize,
    chars,
    cacheUniformLocations,
    brightness,
    defaultWidth
  ]);
  const render = useCallback(() => {
    const gl = glRef.current;
    const video = videoRef.current;
    const program = programRef.current;
    const locations = uniformLocationsRef.current;
    if (!gl || !video || !program || !locations || video.paused || video.ended)
      return;
    const frameStart = performance.now();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, videoTextureRef.current);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, atlasTextureRef.current);
    gl.uniform1i(locations.u_colored, colored ? 1 : 0);
    gl.uniform1f(locations.u_blend, blend / 100);
    gl.uniform1f(locations.u_highlight, highlight / 100);
    gl.uniform1f(locations.u_brightness, brightness);
    for (const setter of uniformSettersRef.current.values()) {
      setter(gl, program, locations);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    const frameEnd = performance.now();
    frameCountRef.current++;
    frameTimesRef.current.push(frameEnd - frameStart);
    if (frameTimesRef.current.length > 60) frameTimesRef.current.shift();
    const now = performance.now();
    if (now - lastFpsTimeRef.current >= 1e3) {
      const avgFrameTime = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
      const newStats = { fps: frameCountRef.current, frameTime: avgFrameTime };
      setStats(newStats);
      onStats == null ? void 0 : onStats(newStats);
      frameCountRef.current = 0;
      lastFpsTimeRef.current = now;
    }
    animationRef.current = requestAnimationFrame(render);
  }, [colored, blend, highlight, brightness, onStats]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleLoadedMetadata = () => {
      initWebGL();
    };
    const handlePlay = () => {
      setIsPlaying(true);
      animationRef.current = requestAnimationFrame(render);
    };
    const handlePause = () => {
      setIsPlaying(false);
      cancelAnimationFrame(animationRef.current);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      cancelAnimationFrame(animationRef.current);
    };
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);
    if (video.readyState >= 1) {
      handleLoadedMetadata();
    }
    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
      cancelAnimationFrame(animationRef.current);
    };
  }, [initWebGL, render]);
  useEffect(() => {
    if (videoRef.current && videoRef.current.readyState >= 1) {
      initWebGL();
    }
  }, [initWebGL]);
  useEffect(() => {
    if (!numColumns || !containerRef.current) return;
    const container = containerRef.current;
    const resizeObserver = new ResizeObserver(() => {
      if (videoRef.current && videoRef.current.readyState >= 1) {
        const wasPlaying = !videoRef.current.paused;
        if (initWebGL() && wasPlaying) {
          requestAnimationFrame(() => {
            render();
          });
        }
      }
    });
    resizeObserver.observe(container);
    return () => {
      resizeObserver.disconnect();
    };
  }, [numColumns, initWebGL, render]);
  useEffect(() => {
    return () => {
      const gl = glRef.current;
      if (gl) {
        if (videoTextureRef.current) gl.deleteTexture(videoTextureRef.current);
        if (atlasTextureRef.current) gl.deleteTexture(atlasTextureRef.current);
        if (programRef.current) gl.deleteProgram(programRef.current);
      }
      cancelAnimationFrame(animationRef.current);
    };
  }, []);
  const play = useCallback(() => {
    var _a;
    (_a = videoRef.current) == null ? void 0 : _a.play();
  }, []);
  const pause = useCallback(() => {
    var _a;
    (_a = videoRef.current) == null ? void 0 : _a.pause();
  }, []);
  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }, []);
  useEffect(() => {
    if (!enableSpacebarToggle) return;
    const handleKeyDown = (e) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggle, enableSpacebarToggle]);
  return {
    containerRef,
    videoRef,
    canvasRef,
    glRef,
    programRef,
    uniformLocationsRef,
    registerUniformSetter,
    unregisterUniformSetter,
    dimensions,
    stats,
    isReady,
    isPlaying,
    play,
    pause,
    toggle
  };
}

// src/hooks/useAsciiMouseEffect.ts
import { useCallback as useCallback2, useEffect as useEffect2, useRef as useRef2 } from "react";
var MAX_TRAIL_LENGTH2 = 24;
function useAsciiMouseEffect(ascii, options = {}) {
  const { enabled = true, trailLength = 24 } = options;
  const mouseRef = useRef2({ x: -1, y: -1 });
  const trailRef = useRef2([]);
  const enabledRef = useRef2(enabled);
  const trailLengthRef = useRef2(trailLength);
  useEffect2(() => {
    enabledRef.current = enabled;
    trailLengthRef.current = trailLength;
  }, [enabled, trailLength]);
  useEffect2(() => {
    if (!enabled) return;
    const uniformSetter = (gl, _program, locations) => {
      gl.uniform2f(locations.u_mouse, mouseRef.current.x, mouseRef.current.y);
      const trail = trailRef.current;
      gl.uniform1i(locations.u_trailLength, trail.length);
      for (let i = 0; i < MAX_TRAIL_LENGTH2; i++) {
        const loc = locations.u_trail[i];
        if (loc) {
          const pos = trail[i] || { x: -1, y: -1 };
          gl.uniform2f(loc, pos.x, pos.y);
        }
      }
    };
    ascii.registerUniformSetter("mouse", uniformSetter);
    return () => {
      ascii.unregisterUniformSetter("mouse");
    };
  }, [ascii, enabled]);
  const onMouseMove = useCallback2((e) => {
    if (!enabledRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const newPos = {
      // Convert pixel coords to 0-1 range
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height
    };
    if (mouseRef.current.x >= 0) {
      trailRef.current.unshift(__spreadValues({}, mouseRef.current));
      if (trailRef.current.length > trailLengthRef.current) {
        trailRef.current.pop();
      }
    }
    mouseRef.current = newPos;
  }, []);
  const onMouseLeave = useCallback2(() => {
    mouseRef.current = { x: -1, y: -1 };
    trailRef.current = [];
  }, []);
  return { onMouseMove, onMouseLeave };
}

// src/hooks/useAsciiRipple.ts
import { useCallback as useCallback3, useEffect as useEffect3, useRef as useRef3 } from "react";
var MAX_RIPPLES2 = 8;
function useAsciiRipple(ascii, options = {}) {
  const { enabled = false, speed = 40 } = options;
  const ripplesRef = useRef3([]);
  const enabledRef = useRef3(enabled);
  const speedRef = useRef3(speed);
  useEffect3(() => {
    enabledRef.current = enabled;
    speedRef.current = speed;
  }, [enabled, speed]);
  useEffect3(() => {
    if (!enabled) return;
    const uniformSetter = (gl, _program, locations) => {
      const currentTime = performance.now() / 1e3;
      gl.uniform1f(locations.u_time, currentTime);
      gl.uniform1f(locations.u_rippleEnabled, 1);
      gl.uniform1f(locations.u_rippleSpeed, speedRef.current);
      const maxDist = Math.sqrt(
        ascii.dimensions.cols ** 2 + ascii.dimensions.rows ** 2
      );
      const maxLifetime = maxDist / speedRef.current + 1;
      ripplesRef.current = ripplesRef.current.filter(
        (r) => currentTime - r.startTime < maxLifetime
      );
      for (let i = 0; i < MAX_RIPPLES2; i++) {
        const loc = locations.u_ripples[i];
        if (loc) {
          const ripple = ripplesRef.current[i];
          if (ripple) {
            gl.uniform4f(loc, ripple.x, ripple.y, ripple.startTime, 1);
          } else {
            gl.uniform4f(loc, 0, 0, 0, 0);
          }
        }
      }
    };
    ascii.registerUniformSetter("ripple", uniformSetter);
    return () => {
      ascii.unregisterUniformSetter("ripple");
    };
  }, [ascii, enabled]);
  const onClick = useCallback3((e) => {
    if (!enabledRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    ripplesRef.current.unshift({
      x,
      y,
      startTime: performance.now() / 1e3
    });
    if (ripplesRef.current.length > MAX_RIPPLES2) {
      ripplesRef.current.pop();
    }
  }, []);
  return { onClick };
}

// src/hooks/useAsciiAudio.ts
import { useEffect as useEffect4, useRef as useRef4 } from "react";
function useAsciiAudio(ascii, options = {}) {
  const { enabled = false, reactivity = 50, sensitivity = 50 } = options;
  const audioContextRef = useRef4(null);
  const analyzerRef = useRef4(null);
  const sourceRef = useRef4(null);
  const dataArrayRef = useRef4(null);
  const volumeRef = useRef4(0);
  const connectedVideoRef = useRef4(null);
  const enabledRef = useRef4(enabled);
  const reactivityRef = useRef4(reactivity);
  const sensitivityRef = useRef4(sensitivity);
  useEffect4(() => {
    enabledRef.current = enabled;
    reactivityRef.current = reactivity;
    sensitivityRef.current = sensitivity;
  }, [enabled, reactivity, sensitivity]);
  const updateVolume = () => {
    const analyzer = analyzerRef.current;
    const dataArray = dataArrayRef.current;
    if (!analyzer || !dataArray) return;
    analyzer.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const average = sum / dataArray.length / 255;
    volumeRef.current = volumeRef.current * 0.7 + average * 0.3;
  };
  useEffect4(() => {
    if (!enabled) return;
    const video = ascii.videoRef.current;
    if (!video) return;
    const connectAudio = () => {
      if (connectedVideoRef.current === video && audioContextRef.current) {
        audioContextRef.current.resume();
        return;
      }
      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext();
        }
        const ctx = audioContextRef.current;
        const analyzer = ctx.createAnalyser();
        analyzer.fftSize = 256;
        analyzer.smoothingTimeConstant = 0.8;
        analyzerRef.current = analyzer;
        dataArrayRef.current = new Uint8Array(
          analyzer.frequencyBinCount
        );
        const source = ctx.createMediaElementSource(video);
        source.connect(analyzer);
        analyzer.connect(ctx.destination);
        sourceRef.current = source;
        connectedVideoRef.current = video;
        ctx.resume();
      } catch (error) {
        console.warn("Failed to connect audio analyzer:", error);
      }
    };
    const handlePlay = () => {
      connectAudio();
    };
    video.addEventListener("play", handlePlay);
    if (!video.paused) {
      connectAudio();
    }
    return () => {
      video.removeEventListener("play", handlePlay);
    };
  }, [ascii.videoRef, enabled]);
  useEffect4(() => {
    if (!enabled) return;
    const uniformSetter = (gl, _program, locations) => {
      updateVolume();
      gl.uniform1f(locations.u_audioLevel, volumeRef.current);
      gl.uniform1f(locations.u_audioReactivity, reactivityRef.current / 100);
      gl.uniform1f(locations.u_audioSensitivity, sensitivityRef.current / 100);
    };
    ascii.registerUniformSetter("audio", uniformSetter);
    return () => {
      ascii.unregisterUniformSetter("audio");
    };
  }, [ascii, enabled]);
  useEffect4(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);
}

// src/components/VideoToAscii.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function Video2Ascii({
  src,
  numColumns,
  colored = true,
  blend = 0,
  highlight = 0,
  brightness = 1,
  charset = "standard",
  enableMouse = true,
  trailLength = 24,
  enableRipple = false,
  rippleSpeed = 40,
  audioEffect = 0,
  audioRange = 50,
  isPlaying = true,
  autoPlay = true,
  enableSpacebarToggle = false,
  showStats = false,
  className = ""
}) {
  const ascii = useVideoToAscii({
    numColumns,
    colored,
    blend,
    highlight,
    brightness,
    charset,
    enableSpacebarToggle
  });
  const { containerRef, videoRef, canvasRef, stats, dimensions, isReady } = ascii;
  const mouseHandlers = useAsciiMouseEffect(ascii, {
    enabled: enableMouse,
    trailLength
  });
  const rippleHandlers = useAsciiRipple(ascii, {
    enabled: enableRipple,
    speed: rippleSpeed
  });
  useAsciiAudio(ascii, {
    enabled: audioEffect > 0,
    reactivity: audioEffect,
    sensitivity: audioRange
  });
  useEffect5(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      if (autoPlay && isReady) {
        video.play().catch(() => {
        });
      }
    } else {
      video.pause();
    }
  }, [isPlaying, autoPlay, isReady, videoRef]);
  return /* @__PURE__ */ jsxs("div", { className: `video-to-ascii ${className}`, children: [
    /* @__PURE__ */ jsx(
      "video",
      {
        ref: videoRef,
        ...(src ? { src } : {}),
        muted: audioEffect === 0,
        loop: true,
        playsInline: true,
        autoPlay: true,
        crossOrigin: "anonymous",
        style: { position: "absolute", left: "-9999px", top: "-9999px", width: "2px", height: "2px", opacity: 0, pointerEvents: "none" }
      }
    ),
    /* @__PURE__ */ jsxs(
      "div",
      __spreadProps(__spreadValues(__spreadValues({
        ref: containerRef,
        className: "relative cursor-pointer select-none overflow-hidden rounded bg-black"
      }, enableMouse ? mouseHandlers : {}), enableRipple ? rippleHandlers : {}), {
        children: [
          /* @__PURE__ */ jsx(
            "canvas",
            {
              ref: canvasRef,
              style: {
                width: "100%",
                height: "100%",
                display: "block"
              }
            }
          ),
          showStats && isReady && /* @__PURE__ */ jsxs("div", { className: "absolute top-2 left-2 bg-black/70 text-green-400 px-2 py-1 text-xs font-mono rounded", children: [
            stats.fps,
            " FPS | ",
            stats.frameTime.toFixed(2),
            "ms | ",
            dimensions.cols,
            "\xD7",
            dimensions.rows
          ] })
        ]
      })
    )
  ] });
}
var VideoToAscii_default = Video2Ascii;
export {
  ASCII_CHARSETS,
  Video2Ascii,
  VideoToAscii_default as default
};
//# sourceMappingURL=index.mjs.map