// The landing page's 3D capsule scene (three.js). Loaded on demand by capsule-scene.tsx, so it never
// slows down the first paint. The capsule turns as the page scrolls, leans toward the mouse, can be
// dragged to spin, and floats gently. It only renders while it's on screen.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

interface Options {
  reducedMotion: boolean;
  onReady: () => void;
}

interface Floater {
  object: THREE.Object3D;
  base: THREE.Vector3;
  spin: THREE.Vector3;
  phase: number;
  depth: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** One half of a capsule: an open tube with a dome, from y = 0 up to y = length + radius. */
function capsuleHalf(radius: number, length: number, material: THREE.Material, segments: number): THREE.Group {
  const group = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments, 1, true), material);
  tube.position.y = length / 2;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(radius, segments, Math.round(segments / 2), 0, Math.PI * 2, 0, Math.PI / 2),
    material,
  );
  dome.position.y = length;
  group.add(tube, dome);
  return group;
}

/** A two-tone capsule: the cap is a touch wider than the body and overlaps it, like a real one. */
function capsule(capMaterial: THREE.Material, bodyMaterial: THREE.Material, segments: number): THREE.Group {
  const group = new THREE.Group();
  const cap = capsuleHalf(1, 1.05, capMaterial, segments);
  const body = capsuleHalf(0.985, 1.4, bodyMaterial, segments);
  body.rotation.x = Math.PI;
  body.position.y = 0.3;
  group.add(cap, body);
  return group;
}

function tablet(material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 40, 20), material);
  mesh.scale.set(1, 0.42, 1);
  return mesh;
}

export function mountCapsuleScene(container: HTMLElement, { reducedMotion, onReady }: Options): () => void {
  const small = container.clientWidth < 520;
  const segments = small ? 40 : 64;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    opacity: "0",
    transition: "opacity 0.9s ease",
  });
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;
  scene.environmentIntensity = 0.95;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 10.5);

  const key = new THREE.DirectionalLight("#ffffff", 1.4);
  key.position.set(4, 6, 6);
  const rim = new THREE.DirectionalLight("#5eead4", 1.6);
  rim.position.set(-6, -3, -4);
  scene.add(new THREE.HemisphereLight("#ffffff", "#134e4a", 0.5), key, rim);

  const materials = {
    teal: new THREE.MeshPhysicalMaterial({
      color: "#0d9488",
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      sheen: 0.5,
      sheenColor: new THREE.Color("#5eead4"),
    }),
    cream: new THREE.MeshPhysicalMaterial({ color: "#f7f7f4", roughness: 0.36, clearcoat: 0.9, clearcoatRoughness: 0.16 }),
    mint: new THREE.MeshPhysicalMaterial({ color: "#5eead4", roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 }),
    amber: new THREE.MeshPhysicalMaterial({ color: "#f59e0b", roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.15 }),
    white: new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3 }),
  };

  // The hero capsule, tilted like the Saathi logo.
  const hero = new THREE.Group();
  const main = capsule(materials.teal, materials.cream, segments);
  hero.add(main);
  hero.scale.setScalar(0.84);
  hero.rotation.z = -0.72;
  scene.add(hero);

  // Small capsules and tablets drifting around it.
  const floaters: Floater[] = [];
  const addFloater = (object: THREE.Object3D, base: [number, number, number], depth: number, phase: number) => {
    object.position.set(...base);
    scene.add(object);
    floaters.push({
      object,
      base: new THREE.Vector3(...base),
      spin: new THREE.Vector3(0.2 + phase * 0.05, 0.35 - phase * 0.04, 0.12),
      phase,
      depth,
    });
  };
  const mini = (cap: THREE.Material, scale: number) => {
    const group = capsule(cap, materials.cream, 32);
    group.scale.setScalar(scale);
    return group;
  };
  // Kept clear of the three status chips (top left, middle right, bottom left) and inside the frame.
  addFloater(mini(materials.mint, 0.3), [1.75, 1.95, -0.8], 0.8, 0);
  addFloater(mini(materials.amber, 0.24), [1.7, -1.7, 0.3], 1.2, 1.3);
  addFloater(tablet(materials.white), [-2.0, 0.45, -0.6], 1.1, 2.1);
  addFloater(tablet(materials.white), [0.15, 2.3, -1.9], 0.6, 3.4);
  addFloater(mini(materials.teal, 0.19), [0.4, -2.25, -1.4], 0.5, 4.2);
  if (!small) addFloater(tablet(materials.mint), [-1.45, -0.95, -2.2], 0.7, 5.1);

  // --- sizing
  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Keep everything in frame on narrow screens.
    camera.position.z = width / height < 0.85 ? 12.5 : 10.5;
    camera.updateProjectionMatrix();
    if (reducedMotion) renderer.render(scene, camera);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  // --- interaction state
  const pointer = { x: 0, y: 0, smoothX: 0, smoothY: 0 };
  let spinVelocity = 0;
  let spinAngle = 0;
  let dragging: { x: number } | null = null;

  const onPointerMove = (event: PointerEvent) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
    if (dragging && event.pointerType === "mouse") {
      spinVelocity = clamp((event.clientX - dragging.x) * 0.012, -0.5, 0.5);
      dragging.x = event.clientX;
    }
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse") dragging = { x: event.clientX };
  };
  const onPointerUp = () => {
    dragging = null;
  };

  const scrollProgress = () => {
    const box = container.getBoundingClientRect();
    return clamp((window.innerHeight - box.top) / (window.innerHeight + box.height), 0, 1);
  };

  // --- render loop (only while visible)
  let frame = 0;
  let visible = true;
  let last = performance.now();
  let idle = 0;

  const pose = (progress: number, time: number) => {
    const t = time / 1000;
    hero.rotation.y = idle + spinAngle + progress * Math.PI * 1.8;
    hero.rotation.x = 0.25 + pointer.smoothY * 0.35;
    hero.rotation.z = -0.72 + pointer.smoothX * 0.25 + progress * 0.5;
    hero.position.y = Math.sin(t * 0.9) * 0.12 - progress * 0.4;
    for (const floater of floaters) {
      floater.object.rotation.x = floater.spin.x * t + floater.phase;
      floater.object.rotation.y = floater.spin.y * t + floater.phase;
      floater.object.rotation.z = floater.spin.z * t;
      floater.object.position.x = floater.base.x + pointer.smoothX * 0.25 * floater.depth;
      floater.object.position.y =
        floater.base.y + Math.sin(t * 0.8 + floater.phase) * 0.12 - pointer.smoothY * 0.18 * floater.depth + progress * 1.4 * floater.depth;
    }
  };

  const tick = (now: number) => {
    const delta = Math.min((now - last) / 1000, 0.05);
    last = now;
    pointer.smoothX += (pointer.x - pointer.smoothX) * 0.06;
    pointer.smoothY += (pointer.y - pointer.smoothY) * 0.06;
    idle += delta * 0.18;
    spinAngle += spinVelocity;
    spinVelocity *= dragging ? 0.6 : 0.95;
    pose(scrollProgress(), now);
    renderer.render(scene, camera);
    frame = visible && !document.hidden ? requestAnimationFrame(tick) : 0;
  };
  const start = () => {
    if (!frame && visible && !document.hidden) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  };

  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!reducedMotion) start();
  });
  const onVisibility = () => {
    if (!reducedMotion) start();
  };

  if (reducedMotion) {
    pointer.smoothX = 0.12;
    pointer.smoothY = -0.1;
    pose(0.15, 0);
    renderer.render(scene, camera);
  } else {
    intersection.observe(container);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    container.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    document.addEventListener("visibilitychange", onVisibility);
    start();
  }

  requestAnimationFrame(() => {
    canvas.style.opacity = "1";
    onReady();
  });

  return () => {
    cancelAnimationFrame(frame);
    frame = 0;
    intersection.disconnect();
    resizeObserver.disconnect();
    window.removeEventListener("pointermove", onPointerMove);
    container.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("visibilitychange", onVisibility);
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    Object.values(materials).forEach((material) => material.dispose());
    environment.dispose();
    pmrem.dispose();
    renderer.dispose();
    canvas.remove();
  };
}
