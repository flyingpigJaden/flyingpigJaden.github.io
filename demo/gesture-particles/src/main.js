const DEMO_BASE = new URL('./', window.location.href);
const THREE_URL = new URL('vendor/three/three.module.js', DEMO_BASE).href;
const MEDIAPIPE_URL = new URL('vendor/mediapipe/vision_bundle.mjs', DEMO_BASE).href;
const MEDIAPIPE_WASM_URL = new URL('vendor/mediapipe/wasm', DEMO_BASE).href;
const HAND_MODEL_URL = new URL('vendor/mediapipe/models/hand_landmarker.task', DEMO_BASE).href;

const PARTICLE_COUNT = 18000;
const DUST_COUNT = 52000;
const NEAR_STAR_COUNT = 12000;

const canvas = document.querySelector("#scene");
const video = document.querySelector("#camera");
const debugCanvas = document.querySelector("#debug-canvas");
const debugCtx = debugCanvas.getContext("2d");
const statusText = document.querySelector("#status-text");
const statusDot = document.querySelector("#status-dot");
const startButton = document.querySelector("#start-camera");
const previewButton = document.querySelector("#start-preview");
const moveMeter = document.querySelector("#move-meter");
const spreadMeter = document.querySelector("#spread-meter");

let THREE;
let DrawingUtils;
let FilesetResolver;
let HandLandmarker;

let scene;
let renderer;
let viewCamera;
let group;
let geometry;
let dustGeometry;
let nearStarGeometry;
let material;
let glowMaterial;
let dustMaterial;
let nearStarMaterial;
let targets;
let shapeTargets;
let scatterTargets;
let scatterSeeds;
let colorSeeds;
let colorScratch;

let handLandmarker;
let lastVideoTime = -1;
let lastCenter = null;
let lastFingerShape = 0;
let pendingFingerShape = 0;
let pendingFingerFrames = 0;
let shapeModeIndex = 0;
let isStartingCamera = false;
let animationStarted = false;
let previewRunning = false;
let previewStartedAt = 0;
let lastPreviewShape = -1;

const gesture = {
  active: 0,
  offsetX: 0,
  offsetY: 0,
  spread: 0.35,
  pinch: 0,
  twist: 0,
  speed: 0,
};

const smooth = {
  active: 0,
  offsetX: 0,
  offsetY: 0,
  spread: 0.35,
  pinch: 0,
  twist: 0,
  speed: 0,
};

init();

function init() {
  window.__gestureParticleAppReady = true;
  startButton.addEventListener("pointerdown", startCameraTracking);
  startButton.addEventListener("click", startCameraTracking);
  previewButton.addEventListener("click", () => {
    if (previewRunning) stopPreview();
    else startPreview();
  });
  window.addEventListener("keydown", handleShapeKeydown);
  window.addEventListener("resize", resize);
  setStatus("正在加载粒子画面...", "loading");

  setupParticleScene()
    .then(() => {
      previewButton.disabled = false;
      window.__scriptedPreviewReady = true;
      if (new URLSearchParams(window.location.search).get("preview") === "1") startPreview();
    })
    .catch((error) => {
      console.error(error);
      setStatus("粒子库加载失败，请检查网络后刷新页面", "error");
    });
}

async function setupParticleScene() {
  THREE = await import(THREE_URL);
  colorScratch = new THREE.Color();

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x07090f, 0.055);

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  viewCamera = new THREE.PerspectiveCamera(58, 1, 0.1, 100);
  viewCamera.position.set(0, 0, 8);

  group = new THREE.Group();
  scene.add(group);

  dustGeometry = new THREE.BufferGeometry();
  const dustPositions = new Float32Array(DUST_COUNT * 3);
  const dustColors = new Float32Array(DUST_COUNT * 3);
  nearStarGeometry = new THREE.BufferGeometry();
  const nearStarPositions = new Float32Array(NEAR_STAR_COUNT * 3);
  const nearStarColors = new Float32Array(NEAR_STAR_COUNT * 3);
  geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  targets = new Float32Array(PARTICLE_COUNT * 3);
  shapeTargets = new Float32Array(PARTICLE_COUNT * 3);
  scatterTargets = new Float32Array(PARTICLE_COUNT * 3);
  scatterSeeds = new Float32Array(PARTICLE_COUNT * 3);
  colorSeeds = new Float32Array(PARTICLE_COUNT);
  const colors = new Float32Array(PARTICLE_COUNT * 3);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const point = randomSpherePoint();
    const scatterSeed = randomScatterSeed(i);
    const index = i * 3;
    targets[index] = point.x;
    targets[index + 1] = point.y;
    targets[index + 2] = point.z;
    shapeTargets[index] = point.x;
    shapeTargets[index + 1] = point.y;
    shapeTargets[index + 2] = point.z;
    scatterSeeds[index] = scatterSeed.x;
    scatterSeeds[index + 1] = scatterSeed.y;
    scatterSeeds[index + 2] = scatterSeed.z;
    colorSeeds[i] = Math.random();

    positions[index] = point.x * 0.2;
    positions[index + 1] = point.y * 0.2;
    positions[index + 2] = point.z * 0.2;

    const color = new THREE.Color().setHSL(0.55 + Math.random() * 0.18, 0.78, 0.58);
    colors[index] = color.r;
    colors[index + 1] = color.g;
    colors[index + 2] = color.b;
  }

  const viewSize = getViewSize();
  for (let i = 0; i < DUST_COUNT; i++) {
    const index = i * 3;
    dustPositions[index] = (Math.random() - 0.5) * viewSize.width * 2.15;
    dustPositions[index + 1] = (Math.random() - 0.5) * viewSize.height * 2.15;
    dustPositions[index + 2] = -1.8 - Math.random() * 5.4;

    const color = new THREE.Color().setHSL(0.55 + Math.random() * 0.24, 0.82, 0.58 + Math.random() * 0.28);
    dustColors[index] = color.r;
    dustColors[index + 1] = color.g;
    dustColors[index + 2] = color.b;
  }

  for (let i = 0; i < NEAR_STAR_COUNT; i++) {
    const index = i * 3;
    nearStarPositions[index] = (Math.random() - 0.5) * viewSize.width * 2.45;
    nearStarPositions[index + 1] = (Math.random() - 0.5) * viewSize.height * 2.45;
    nearStarPositions[index + 2] = 0.2 + Math.random() * 2.8;

    const color = new THREE.Color().setHSL(0.5 + Math.random() * 0.28, 0.78, 0.68 + Math.random() * 0.24);
    nearStarColors[index] = color.r;
    nearStarColors[index + 1] = color.g;
    nearStarColors[index + 2] = color.b;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  dustGeometry.setAttribute("color", new THREE.BufferAttribute(dustColors, 3));
  nearStarGeometry.setAttribute("position", new THREE.BufferAttribute(nearStarPositions, 3));
  nearStarGeometry.setAttribute("color", new THREE.BufferAttribute(nearStarColors, 3));

  material = new THREE.PointsMaterial({
    size: 0.03,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  glowMaterial = new THREE.PointsMaterial({
    size: 0.105,
    vertexColors: true,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  dustMaterial = new THREE.PointsMaterial({
    size: 0.018,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  nearStarMaterial = new THREE.PointsMaterial({
    size: 0.036,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  scene.add(new THREE.Points(dustGeometry, dustMaterial));
  scene.add(new THREE.Points(nearStarGeometry, nearStarMaterial));
  group.add(new THREE.Points(geometry, material));
  group.add(new THREE.Points(geometry, glowMaterial));
  resize();

  if (!animationStarted) {
    animationStarted = true;
    requestAnimationFrame(tick);
  }

  setStatus("粒子已启动，点击开启摄像头", "loading");
}

async function startCameraTracking(event) {
  event?.preventDefault();
  if (isStartingCamera || handLandmarker) {
    return;
  }

  if (previewRunning) stopPreview();
  isStartingCamera = true;
  startButton.disabled = true;
  startButton.textContent = "正在开启...";
  setStatus("正在请求摄像头权限...", "loading");

  try {
    await setupCamera();
    setStatus("摄像头已打开，正在加载手势识别模型...", "loading");
    await setupHandLandmarker();

    startButton.textContent = "摄像头已开启";
    startButton.classList.add("is-ready");
    previewButton.disabled = true;
    setStatus("举起手：移动手掌控制位置，张开/捏合控制扩散", "ready");
  } catch (error) {
    console.error(error);
    startButton.disabled = false;
    startButton.textContent = "重新开启摄像头";
    setStatus(getCameraErrorMessage(error), "error");
  } finally {
    isStartingCamera = false;
  }
}

async function setupCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("当前浏览器不支持摄像头访问，请换 Chrome 或 Edge 打开");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: "user",
    },
    audio: false,
  });

  video.srcObject = stream;
  await video.play();
}

async function setupHandLandmarker() {
  if (!FilesetResolver || !HandLandmarker || !DrawingUtils) {
    const mediaPipe = await import(MEDIAPIPE_URL);
    DrawingUtils = mediaPipe.DrawingUtils;
    FilesetResolver = mediaPipe.FilesetResolver;
    HandLandmarker = mediaPipe.HandLandmarker;
  }

  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
  const options = {
    baseOptions: {
      modelAssetPath: HAND_MODEL_URL,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
  };

  try {
    handLandmarker = await HandLandmarker.createFromOptions(vision, options);
  } catch (error) {
    console.warn("GPU hand tracking failed, retrying with CPU.", error);
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: {
        ...options.baseOptions,
        delegate: "CPU",
      },
    });
  }
}

function tick(time) {
  if (previewRunning) updateScriptedPreview(time);
  else updateHandTracking(time);
  updateParticles(time * 0.001);
  renderer.render(scene, viewCamera);
  requestAnimationFrame(tick);
}

function startPreview() {
  if (!renderer || handLandmarker || isStartingCamera) return;
  previewRunning = true;
  previewStartedAt = performance.now();
  lastPreviewShape = -1;
  document.querySelector(".app").classList.add("is-preview");
  previewButton.textContent = "结束预览";
  setStatus("脚本预览：模拟手掌移动、张开与捏合", "ready");
}

function stopPreview() {
  previewRunning = false;
  document.querySelector(".app").classList.remove("is-preview");
  previewButton.textContent = "观看无摄像头预览";
  gesture.active = 0;
  gesture.speed = 0;
  gesture.pinch = 0;
  gesture.spread = 0.35;
  setStatus("粒子已启动，点击开启摄像头", "loading");
}

function updateScriptedPreview(time) {
  const seconds = (time - previewStartedAt) * 0.001;
  const phase = seconds % 12;
  const shape = phase < 3 ? 0 : phase < 6 ? 3 : phase < 9 ? 2 : 1;
  if (shape !== lastPreviewShape) {
    lastPreviewShape = shape;
    shapeModeIndex = shape;
    setShapeTargets(shape);
  }

  gesture.active = 1;
  gesture.offsetX = Math.sin(seconds * 0.8) * 0.65;
  gesture.offsetY = Math.sin(seconds * 0.55) * 0.35;
  gesture.spread = phase < 3
    ? lerp(0.18, 0.48, phase / 3)
    : phase < 6
      ? lerp(0.48, 0.96, (phase - 3) / 3)
      : phase < 9
        ? lerp(0.96, 0.14, (phase - 6) / 3)
        : lerp(0.14, 0.36, (phase - 9) / 3);
  gesture.pinch = phase >= 8 && phase < 10 ? Math.sin(((phase - 8) / 2) * Math.PI) * 0.9 : 0;
  gesture.twist = Math.sin(seconds * 0.48) * 0.65;
  gesture.speed = 0.28 + Math.abs(Math.cos(seconds * 0.9)) * 0.24;
  moveMeter.value = gesture.speed;
  spreadMeter.value = gesture.spread;
}

function updateHandTracking(time) {
  if (!handLandmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return;
  }

  if (video.currentTime === lastVideoTime) {
    return;
  }
  lastVideoTime = video.currentTime;

  const result = handLandmarker.detectForVideo(video, time);
  drawDebug(result);

  if (!result.landmarks?.length) {
    gesture.active = 0;
    moveMeter.value = 0;
    spreadMeter.value = smooth.spread;
    return;
  }

  const landmarks = result.landmarks[0];
  const center = averagePoints([landmarks[0], landmarks[5], landmarks[9], landmarks[13], landmarks[17]]);
  const handOpenScore = getHandOpenScore(landmarks);
  const extendedFingerCount = countExtendedFingers(landmarks);
  const pinchScore = getPinchScore(landmarks);
  const palmAngle = Math.atan2(landmarks[9].y - landmarks[0].y, landmarks[9].x - landmarks[0].x);

  let speed = 0;
  if (lastCenter) {
    speed = distance2D(center, lastCenter) * 18;
  }
  lastCenter = center;
  updateShapeFromFingerCount(extendedFingerCount);

  gesture.active = 1;
  const viewSize = getViewSize();
  gesture.offsetX = clamp((0.5 - center.x) / 0.28, -1, 1) * viewSize.width * 0.48;
  gesture.offsetY = clamp((0.5 - center.y) / 0.28, -1, 1) * viewSize.height * 0.48;
  gesture.spread = extendedFingerCount >= 5 && handOpenScore > 0.72 ? handOpenScore : Math.min(handOpenScore, 0.48);
  gesture.pinch = pinchScore;
  gesture.twist = palmAngle + Math.PI / 2;
  gesture.speed = clamp(speed, 0, 1);

  moveMeter.value = gesture.speed;
  spreadMeter.value = gesture.spread;
}

function updateParticles(seconds) {
  if (!geometry || !shapeTargets || !scatterTargets || !group || !material || !glowMaterial) {
    return;
  }

  smooth.active = lerp(smooth.active, gesture.active, 0.08);
  smooth.offsetX = lerp(smooth.offsetX, gesture.offsetX, 0.1);
  smooth.offsetY = lerp(smooth.offsetY, gesture.offsetY, 0.1);
  smooth.spread = lerp(smooth.spread, gesture.spread, 0.12);
  smooth.pinch = lerp(smooth.pinch, gesture.pinch, 0.16);
  smooth.twist = lerpAngle(smooth.twist, gesture.twist, 0.08);
  smooth.speed = lerp(smooth.speed, gesture.speed, 0.1);

  const expansion = easeOutCubic(smooth.spread);
  const scatterAmount = smoothstep(0.58, 0.88, smooth.spread);
  const pinchAmount = smooth.pinch * (1 - scatterAmount);
  const compactScale = lerp(0.22, 1.72, expansion);
  const breathing = Math.sin(seconds * 1.8) * 0.04;
  const rotationBoost = 0.008 + smooth.speed * 0.045;
  const handRotation = smooth.twist * smooth.active * (1 - scatterAmount);

  group.position.x = smooth.offsetX * smooth.active * (1 - scatterAmount);
  group.position.y = smooth.offsetY * smooth.active * (1 - scatterAmount);
  group.rotation.z = handRotation + Math.sin(seconds * 0.7) * 0.08 * (1 - scatterAmount);
  group.rotation.x = Math.sin(handRotation) * 0.34 * (1 - scatterAmount);
  group.rotation.y += 0.003 + smooth.speed * 0.014 + Math.cos(handRotation) * 0.0015 * (1 - scatterAmount);
  material.size = lerp(0.026, 0.052, scatterAmount);
  material.opacity = lerp(0.86, 1, scatterAmount);
  glowMaterial.size = lerp(0.078, 0.16, Math.max(scatterAmount, pinchAmount));
  glowMaterial.opacity = lerp(0.2, 0.56, Math.max(scatterAmount, pinchAmount));
  dustMaterial.opacity = lerp(0, 0.88, scatterAmount);
  dustMaterial.size = lerp(0.012, 0.026, scatterAmount);
  nearStarMaterial.opacity = lerp(0, 0.52, scatterAmount);
  nearStarMaterial.size = lerp(0.024, 0.048, scatterAmount);

  const positionAttribute = geometry.getAttribute("position");
  const array = positionAttribute.array;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const index = i * 3;
    const wave = seconds * 1.8 + i * 0.019;
    const galaxyDrift = seconds * 0.14 + i * 0.00019;
    const swirl = Math.sin(wave) * (0.18 + smooth.speed * 0.8) * scatterAmount;
    const verticalDrift = Math.cos(wave * 0.72) * 0.35 * scatterAmount;
    const compactX = shapeTargets[index] * (compactScale + breathing);
    const compactY = shapeTargets[index + 1] * (compactScale + breathing);
    const compactZ = shapeTargets[index + 2] * (compactScale + breathing);
    const scatteredX = scatterTargets[index] + swirl + Math.cos(galaxyDrift) * 0.38 * scatterAmount;
    const scatteredY = scatterTargets[index + 1] + verticalDrift + Math.sin(galaxyDrift * 1.3) * 0.28 * scatterAmount;
    const scatteredZ = scatterTargets[index + 2] + Math.sin(wave * 0.43) * scatterAmount;
    const normalTargetX = lerp(compactX, scatteredX, scatterAmount);
    const normalTargetY = lerp(compactY, scatteredY, scatterAmount);
    const normalTargetZ = lerp(compactZ, scatteredZ, scatterAmount);
    const pointPulse = 0.08 + Math.sin(seconds * 8 + i * 0.03) * 0.035;
    const targetX = lerp(normalTargetX, shapeTargets[index] * pointPulse, pinchAmount);
    const targetY = lerp(normalTargetY, shapeTargets[index + 1] * pointPulse, pinchAmount);
    const targetZ = lerp(normalTargetZ, shapeTargets[index + 2] * pointPulse, pinchAmount);

    array[index] = lerp(array[index], targetX, 0.055);
    array[index + 1] = lerp(array[index + 1], targetY, 0.055);
    array[index + 2] = lerp(array[index + 2], targetZ, 0.055);
  }

  positionAttribute.needsUpdate = true;
  updateParticleColors(smooth.spread, seconds);
}

function updateParticleColors(spread, seconds) {
  if (!geometry || !colorSeeds || !colorScratch) {
    return;
  }

  const colorAttribute = geometry.getAttribute("color");
  const array = colorAttribute.array;
  const midAmount = smoothstep(0.12, 0.58, spread);
  const galaxyAmount = smoothstep(0.62, 0.98, spread);
  const pinchAmount = smooth.pinch * (1 - smoothstep(0.58, 0.88, spread));
  const baseHue = lerp(0.12, 0.56, midAmount);
  const hue = lerp(baseHue, 0.72, galaxyAmount);
  const saturation = lerp(0.86, 0.98, spread);
  const lightness = lerp(0.54, 0.68, galaxyAmount) + pinchAmount * 0.18;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const index = i * 3;
    const seed = colorSeeds[i];
    const shimmer = Math.sin(seconds * 1.7 + seed * 24) * 0.018;
    const hueVariation = (seed - 0.5) * 0.055 + shimmer;
    colorScratch.setHSL(wrapHue(lerp(hue, 0.12, pinchAmount) + hueVariation), saturation, lightness + seed * 0.08);
    array[index] = colorScratch.r;
    array[index + 1] = colorScratch.g;
    array[index + 2] = colorScratch.b;
  }

  colorAttribute.needsUpdate = true;
}

function drawDebug(result) {
  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;
  if (debugCanvas.width !== width || debugCanvas.height !== height) {
    debugCanvas.width = width;
    debugCanvas.height = height;
  }

  debugCtx.clearRect(0, 0, width, height);
  if (!result.landmarks?.length) {
    return;
  }

  const drawingUtils = new DrawingUtils(debugCtx);
  for (const landmarks of result.landmarks) {
    drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
      color: "#37d67a",
      lineWidth: 4,
    });
    drawingUtils.drawLandmarks(landmarks, {
      color: "#f4f7fb",
      radius: 3,
    });
  }
}

function randomSpherePoint() {
  const radius = Math.cbrt(Math.random()) * 1.9;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);

  return {
    x: radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.sin(phi) * Math.sin(theta),
    z: radius * Math.cos(phi),
  };
}

function handleShapeKeydown(event) {
  if (!shapeTargets || !/^[1-5]$/.test(event.key)) {
    return;
  }

  const nextMode = Number(event.key) - 1;
  if (nextMode !== shapeModeIndex) {
    shapeModeIndex = nextMode;
    setShapeTargets(shapeModeIndex);
  }
}

function updateShapeFromFingerCount(fingerCount) {
  if (fingerCount < 1 || fingerCount > 5) {
    pendingFingerShape = 0;
    pendingFingerFrames = 0;
    return;
  }

  if (fingerCount !== pendingFingerShape) {
    pendingFingerShape = fingerCount;
    pendingFingerFrames = 1;
    return;
  }

  pendingFingerFrames += 1;
  if (pendingFingerFrames < 6 || fingerCount === lastFingerShape) {
    return;
  }

  lastFingerShape = fingerCount;
  shapeModeIndex = fingerCount - 1;
  setShapeTargets(shapeModeIndex);
}

function countExtendedFingers(landmarks) {
  const palmWidth = Math.max(distance2D(landmarks[5], landmarks[17]), 0.001);
  const fingers = [
    { tip: 8, pip: 6, mcp: 5 },
    { tip: 12, pip: 10, mcp: 9 },
    { tip: 16, pip: 14, mcp: 13 },
    { tip: 20, pip: 18, mcp: 17 },
  ];

  let count = 0;
  for (const finger of fingers) {
    const reach = distance2D(landmarks[0], landmarks[finger.tip]) / palmWidth;
    const curled = distance2D(landmarks[finger.tip], landmarks[finger.mcp]) <
      distance2D(landmarks[finger.pip], landmarks[finger.mcp]) * 1.52;
    if (reach > 1.75 && !curled) {
      count += 1;
    }
  }

  const thumbSpread = distance2D(landmarks[4], landmarks[9]) / palmWidth;
  if (thumbSpread > 1.08 && distance2D(landmarks[4], landmarks[8]) / palmWidth > 0.72) {
    count += 1;
  }

  return count;
}

function setShapeTargets(modeIndex) {
  const textPoints = modeIndex === 4 ? createTextPoints("HCI") : null;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const index = i * 3;
    let point;

    if (modeIndex === 0) {
      point = targets ? { x: targets[index], y: targets[index + 1], z: targets[index + 2] } : randomSpherePoint();
    } else if (modeIndex === 1) {
      point = spiralPoint(i);
    } else if (modeIndex === 2) {
      point = nebulaPoint(i);
    } else if (modeIndex === 3) {
      point = ringPoint(i);
    } else {
      point = textPoint(i, textPoints);
    }

    shapeTargets[index] = point.x;
    shapeTargets[index + 1] = point.y;
    shapeTargets[index + 2] = point.z;
  }
}

function spiralPoint(index) {
  const progress = index / PARTICLE_COUNT;
  const angle = progress * Math.PI * 22;
  const radius = 0.2 + Math.pow(progress, 0.72) * 2.15;
  return {
    x: Math.cos(angle) * radius,
    y: (progress - 0.5) * 3.3,
    z: Math.sin(angle) * radius,
  };
}

function nebulaPoint(index) {
  const arm = index % 4;
  const radius = Math.pow(Math.random(), 0.36) * 2.3;
  const angle = Math.random() * Math.PI * 2 + arm * ((Math.PI * 2) / 4) + radius * 1.45;
  return {
    x: Math.cos(angle) * radius + (Math.random() - 0.5) * 0.52,
    y: Math.sin(angle) * radius * 0.72 + (Math.random() - 0.5) * 0.52,
    z: (Math.random() - 0.5) * 1.35,
  };
}

function ringPoint(index) {
  const angle = (index / PARTICLE_COUNT) * Math.PI * 2 * 9;
  const tube = (Math.random() - 0.5) * 0.38;
  const radius = 1.85 + tube;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    z: (Math.random() - 0.5) * 0.52,
  };
}

function createTextPoints(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 520;
  canvas.height = 180;
  const context = canvas.getContext("2d");
  context.fillStyle = "black";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "white";
  context.font = "bold 142px Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 8);

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const points = [];
  for (let y = 0; y < canvas.height; y += 3) {
    for (let x = 0; x < canvas.width; x += 3) {
      if (pixels[(y * canvas.width + x) * 4] > 80) {
        points.push({
          x: (x / canvas.width - 0.5) * 4.2,
          y: (0.5 - y / canvas.height) * 1.45,
          z: (Math.random() - 0.5) * 0.24,
        });
      }
    }
  }
  return points.length ? points : [{ x: 0, y: 0, z: 0 }];
}

function textPoint(index, points) {
  const point = points[index % points.length];
  return {
    x: point.x + (Math.random() - 0.5) * 0.045,
    y: point.y + (Math.random() - 0.5) * 0.045,
    z: point.z,
  };
}

function randomScatterSeed(seed) {
  const mix = Math.random();
  let x;
  let y;

  if (mix < 0.86) {
    x = (Math.random() - 0.5) * 3.65;
    y = (Math.random() - 0.5) * 3.65;
  } else {
    const arm = seed % 5;
    const angle = Math.random() * Math.PI * 2 + arm * 0.44;
    const radius = Math.pow(Math.random(), 0.34) * 1.92;
    const spiral = angle + radius * 2.1 + arm * ((Math.PI * 2) / 5);
    const noise = (Math.random() - 0.5) * 0.42;
    x = Math.cos(spiral) * radius + noise;
    y = Math.sin(spiral) * radius + noise * 0.72;
  }

  const z = (Math.random() - 0.5) * 2.6;

  return { x, y, z };
}

function refreshScatterTargets() {
  if (!scatterTargets || !scatterSeeds || !viewCamera) {
    return;
  }

  const { width: visibleWidth, height: visibleHeight } = getViewSize();

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const index = i * 3;
    const depthScale = 1 + Math.abs(scatterSeeds[index + 2]) * 0.08;
    scatterTargets[index] = scatterSeeds[index] * visibleWidth * 0.7 * depthScale;
    scatterTargets[index + 1] = scatterSeeds[index + 1] * visibleHeight * 0.7 * depthScale;
    scatterTargets[index + 2] = scatterSeeds[index + 2] * 2.35;
  }
}

function getViewSize() {
  if (!viewCamera) {
    return { width: 12, height: 7 };
  }

  const height = 2 * Math.tan((viewCamera.fov * Math.PI) / 360) * viewCamera.position.z;
  return {
    width: height * viewCamera.aspect,
    height,
  };
}

function getHandOpenScore(landmarks) {
  const fingers = [
    { tip: 8, pip: 6, mcp: 5 },
    { tip: 12, pip: 10, mcp: 9 },
    { tip: 16, pip: 14, mcp: 13 },
    { tip: 20, pip: 18, mcp: 17 },
  ];

  const scores = fingers.map((finger) => {
    const baseLength = Math.max(distance2D(landmarks[0], landmarks[finger.mcp]), 0.001);
    const reach = distance2D(landmarks[0], landmarks[finger.tip]) / baseLength;
    const straightness =
      distance2D(landmarks[finger.tip], landmarks[finger.mcp]) /
      Math.max(distance2D(landmarks[finger.pip], landmarks[finger.mcp]), 0.001);

    return clamp((reach * 0.72 + straightness * 0.28 - 1.18) / 0.86, 0, 1);
  });

  const thumbSpread =
    distance2D(landmarks[4], landmarks[8]) / Math.max(distance2D(landmarks[5], landmarks[17]), 0.001);
  const fingerAverage = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const thumbBonus = clamp((thumbSpread - 0.72) / 1.65, 0, 1) * 0.12;

  return clamp(fingerAverage * 0.94 + thumbBonus, 0, 1);
}

function getPinchScore(landmarks) {
  const palmWidth = Math.max(distance2D(landmarks[5], landmarks[17]), 0.001);
  const pinchDistance = distance2D(landmarks[4], landmarks[8]) / palmWidth;
  return smoothstep(0.72, 0.28, pinchDistance);
}

function resize() {
  if (!renderer || !viewCamera) {
    return;
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  viewCamera.aspect = width / height;
  viewCamera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  refreshScatterTargets();
  refreshDustField();
  refreshNearStarField();
}

function refreshDustField() {
  if (!dustGeometry || !viewCamera) {
    return;
  }

  const positionAttribute = dustGeometry.getAttribute("position");
  if (!positionAttribute) {
    return;
  }

  const viewSize = getViewSize();
  const array = positionAttribute.array;
  for (let i = 0; i < DUST_COUNT; i++) {
    const index = i * 3;
    array[index] = (Math.random() - 0.5) * viewSize.width * 2.2;
    array[index + 1] = (Math.random() - 0.5) * viewSize.height * 2.2;
    array[index + 2] = -1.8 - Math.random() * 5.4;
  }
  positionAttribute.needsUpdate = true;
}

function refreshNearStarField() {
  if (!nearStarGeometry || !viewCamera) {
    return;
  }

  const positionAttribute = nearStarGeometry.getAttribute("position");
  if (!positionAttribute) {
    return;
  }

  const viewSize = getViewSize();
  const array = positionAttribute.array;
  for (let i = 0; i < NEAR_STAR_COUNT; i++) {
    const index = i * 3;
    array[index] = (Math.random() - 0.5) * viewSize.width * 2.55;
    array[index + 1] = (Math.random() - 0.5) * viewSize.height * 2.55;
    array[index + 2] = 0.2 + Math.random() * 2.8;
  }
  positionAttribute.needsUpdate = true;
}

function setStatus(text, mode) {
  statusText.textContent = text;
  statusDot.className = `status-dot ${mode === "ready" ? "ready" : mode === "error" ? "error" : ""}`;
}

function getCameraErrorMessage(error) {
  const detail = `${error?.name || "Error"}: ${error?.message || "unknown error"}`;

  if (error?.message?.includes("Failed to fetch dynamically imported module")) {
    return `手势识别库加载失败：${detail}`;
  }

  if (error?.name === "NotAllowedError") {
    return "摄像头权限被拒绝，请在浏览器地址栏左侧重新允许";
  }

  if (error?.name === "NotFoundError") {
    return "没有找到可用摄像头";
  }

  if (error?.name === "NotReadableError") {
    return "摄像头正在被其他软件占用";
  }

  return error?.message || detail || "摄像头启动失败";
}

function averagePoints(points) {
  return points.reduce(
    (sum, point) => ({
      x: sum.x + point.x / points.length,
      y: sum.y + point.y / points.length,
      z: sum.z + point.z / points.length,
    }),
    { x: 0, y: 0, z: 0 },
  );
}

function averageDistanceFrom(origin, points) {
  return points.reduce((sum, point) => sum + distance2D(origin, point), 0) / points.length;
}

function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function smoothstep(edge0, edge1, value) {
  const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function wrapHue(value) {
  return ((value % 1) + 1) % 1;
}

function lerpAngle(a, b, amount) {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * amount;
}
