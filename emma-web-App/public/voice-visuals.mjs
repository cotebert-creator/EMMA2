console.log("EMMA GPU visual loaded");
// GPU-rendered Emma orb.
// Audio analysers remain independent so microphone input never reaches speakers.
export function createVoiceVisuals(doc, environment = globalThis) {
  let audioContext;
  let frame;
  let inputNode;
  let outputNode;
  let canvas;
  let gl;
  let program;
  let buffer;
  let muted = false;
  let active = false;
  let emmaLevel = 0;
  let patientLevel = 0;
  let startedAt = 0;

  const orb = doc.getElementById("talkBtn");
  const wave = doc.getElementById("patientWave");
  const reducedMotion = environment.matchMedia?.(
    "(prefers-reduced-motion: reduce)"
  );

  const vertexShader = `#version 300 es
    in vec2 position;
    out vec2 uv;

    void main() {
      uv = position * 0.5 + 0.5;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;

  const fragmentShader = `#version 300 es
    precision highp float;

    uniform vec2 resolution;
    uniform float time;
    uniform float voice;
    uniform float patient;
    uniform float connected;

    in vec2 uv;
    out vec4 color;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);

      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
      );
    }

    void main() {
      vec2 point =
        (gl_FragCoord.xy - 0.5 * resolution) /
        min(resolution.x, resolution.y);

      float radius = length(point);
      float breathing = 0.5 + 0.5 * sin(time * 0.0011);
      float distortion = noise(point * 4.0 + vec2(time * 0.00018));

      float body = smoothstep(
        0.54,
        0.20,
        radius + distortion * 0.035 + voice * 0.018
      );

      float rim =
        smoothstep(0.52, 0.40, radius) -
        smoothstep(0.40, 0.25, radius);

      float glow = exp(-max(radius - 0.22, 0.0) * 9.0) * 0.55;

      vec3 warm = vec3(1.0, 0.54, 0.43);
      vec3 gold = vec3(1.0, 0.86, 0.48);
      vec3 pearl = vec3(1.0, 0.98, 0.82);
      vec3 cool = vec3(0.52, 0.63, 1.0);

      vec3 base = mix(
        warm,
        gold,
        0.45 + 0.25 * sin(time * 0.0007 + distortion * 3.0)
      );

      base = mix(base, cool, connected * 0.10);
      base += pearl * (glow + rim * 0.7);

      float aura =
        smoothstep(0.72, 0.25, radius) *
        (1.0 - smoothstep(0.18, 0.0, radius));

      float alpha = max(body * 0.98, aura * 0.30 + glow * 0.28);
      alpha += voice * 0.10 + patient * 0.04;

      color = vec4(
        base * (0.82 + 0.18 * breathing) +
        vec3(0.12, 0.04, 0.08) * voice,
        alpha
      );
    }
  `;

  function detach(node) {
    try {
      node?.source.disconnect();
      node?.analyser.disconnect();
    } catch {}
  }

  function getAudioLevel(node) {
    if (!node) return 0;

    node.analyser.getByteTimeDomainData(node.buffer);

    let sum = 0;

    for (const sample of node.buffer) {
      sum += ((sample - 128) / 128) ** 2;
    }

    return Math.min(
      1,
      Math.max(0, Math.sqrt(sum / node.buffer.length) - 0.008) * 5
    );
  }

  function attachAudio(stream, type) {
    try {
      const AudioContext =
        environment.AudioContext || environment.webkitAudioContext;

      if (!AudioContext) return;

      audioContext ||= new AudioContext();
      audioContext.resume().catch(() => {});

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const node = {
        source,
        analyser,
        buffer: new Uint8Array(256)
      };

      if (type === "input") {
        detach(inputNode);
        inputNode = node;
      } else {
        detach(outputNode);
        outputNode = node;
      }

      startRenderer();
    } catch {}
  }

  function compileShader(type, source) {
    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }

    return shader;
  }

  function setupGPU() {
    if (gl || !canvas) return;

    gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true
    });

    if (!gl) return;

    try {
      program = gl.createProgram();

      gl.attachShader(
        program,
        compileShader(gl.VERTEX_SHADER, vertexShader)
      );

      gl.attachShader(
        program,
        compileShader(gl.FRAGMENT_SHADER, fragmentShader)
      );

      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program));
      }

      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
          -1, -1,
           1, -1,
          -1,  1,
           1,  1
        ]),
        gl.STATIC_DRAW
      );

      const position = gl.getAttribLocation(program, "position");

      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      canvas.addEventListener(
        "webglcontextlost",
        () => {
          gl = null;
        },
        { passive: true }
      );
    } catch {
      gl = null;
    }
  }

  function resizeCanvas() {
    if (!canvas || !gl) return;

    const scale = Math.min(environment.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();

    canvas.width = Math.max(1, Math.floor(rect.width * scale));
    canvas.height = Math.max(1, Math.floor(rect.height * scale));

    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function draw(time) {
    frame = null;

    emmaLevel =
      emmaLevel * 0.78 + getAudioLevel(outputNode) * 0.22;

    patientLevel =
      patientLevel * 0.68 +
      (muted ? 0 : getAudioLevel(inputNode)) * 0.32;

    if (gl) {
      resizeCanvas();

      gl.useProgram(program);

      gl.uniform2f(
        gl.getUniformLocation(program, "resolution"),
        canvas.width,
        canvas.height
      );

      gl.uniform1f(
        gl.getUniformLocation(program, "time"),
        time - startedAt
      );

      gl.uniform1f(
        gl.getUniformLocation(program, "voice"),
        emmaLevel
      );

      gl.uniform1f(
        gl.getUniformLocation(program, "patient"),
        patientLevel
      );

      gl.uniform1f(
        gl.getUniformLocation(program, "connected"),
        active ? 1 : 0
      );

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    orb?.style?.setProperty(
      "--voice-scale",
      reducedMotion?.matches
        ? "1"
        : (1 + emmaLevel * 0.07).toFixed(3)
    );

    const paths = wave?.querySelectorAll?.("path") || [];

    paths.forEach((path, index) => {
      let d = "";

      for (let x = 0; x <= 600; x += 5) {
        const envelope = Math.sin(Math.PI * x / 600) ** 2;
        const phase = reducedMotion?.matches ? 0 : time / 700;

        const y =
          50 +
          envelope *
            (2 + patientLevel * 34) *
            Math.sin(x / 37 - phase + index * 0.65) *
            Math.cos(x / 91 + index);

        d += `${x ? " L" : "M"}${x},${y.toFixed(2)}`;
      }

      path.setAttribute("d", d);
    });

    if (active || inputNode || outputNode) {
      frame = environment.requestAnimationFrame(draw);
    }
  }

  function startRenderer() {
    if (!canvas) {
      canvas = doc.createElement("canvas");
      canvas.className = "emma-gpu-orb";
      canvas.setAttribute("aria-hidden", "true");

      orb?.prepend(canvas);

      setupGPU();
      resizeCanvas();
    }

    if (!frame) {
      startedAt ||= performance.now();
      frame = environment.requestAnimationFrame(draw);
    }
  }

  return {
    prepare() {
      try {
        const AudioContext =
          environment.AudioContext || environment.webkitAudioContext;

        if (AudioContext) {
          audioContext ||= new AudioContext();
          audioContext.resume().catch(() => {});
        }
      } catch {}

      startRenderer();
    },

    input(stream) {
      attachAudio(stream, "input");
    },

    output(stream) {
      attachAudio(stream, "output");
    },

    mute(value) {
      muted = value;
    },

    active(value) {
      active = value;
      doc.body?.classList.toggle("voice-connected", value);
      startRenderer();
    },

    stop() {
      active = false;
      muted = false;

      detach(inputNode);
      detach(outputNode);

      inputNode = null;
      outputNode = null;

      if (frame) {
        environment.cancelAnimationFrame(frame);
      }

      frame = null;
      emmaLevel = 0;
      patientLevel = 0;

      orb?.style?.setProperty("--voice-scale", "1");

      wave?.querySelectorAll?.("path").forEach(path => {
        path.setAttribute(
          "d",
          "M0,50 Q150,46 300,50 T600,50"
        );
      });

      doc.body?.classList.remove("voice-connected");

      if (audioContext) {
        audioContext.close().catch(() => {});
        audioContext = null;
      }
    }
  };
}