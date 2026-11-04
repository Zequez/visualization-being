import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";

// --------------------------------------------------
// Configuration
// --------------------------------------------------

const CONFIG = {
  radius: 2.4,
  cells: 72,
  cornerRadius: 0.12,
  gap: 0.3,
  elevation: 0.025,
  background: 0x090d16,
};

export function mountSphere(canvas: HTMLCanvasElement) {
  // --------------------------------------------------
  // Canvas and renderer
  // --------------------------------------------------

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // --------------------------------------------------
  // Scene and camera
  // --------------------------------------------------

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.background);

  const camera = new THREE.PerspectiveCamera(
    42,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );

  camera.position.set(0, 0, 8);

  // --------------------------------------------------
  // Controls
  // --------------------------------------------------

  const controls = new TrackballControls(camera, renderer.domElement);

  // const basePanSpeed = 1;
  controls.rotateSpeed = 3;
  controls.zoomSpeed = 1.2;

  controls.noZoom = false;

  controls.panSpeed = 0.7;
  controls.noPan = true;

  controls.minDistance = CONFIG.radius * 1.5;
  controls.maxDistance = CONFIG.radius * 3;

  controls.staticMoving = false;
  controls.dynamicDampingFactor = 0.12;

  const baseRotateSpeed = 1;
  const referenceDistance = camera.position.distanceTo(controls.target);

  function updateRotateSensitivity() {
    const distance = camera.position.distanceTo(controls.target);

    controls.rotateSpeed = baseRotateSpeed * (distance / referenceDistance);
  }

  // --------------------------------------------------
  // Fibonacci sphere distribution
  // --------------------------------------------------

  function generateSeeds(count: number): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = goldenAngle * i;

      points.push(
        new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r),
      );
    }

    return points;
  }

  // --------------------------------------------------
  // Spherical Voronoi clipping
  // --------------------------------------------------

  function generateCell(
    seed: THREE.Vector3,
    seeds: THREE.Vector3[],
    radius: number,
  ): THREE.Vector3[] {
    // Establish a local coordinate system around the seed.
    const up = seed.clone();

    const reference =
      Math.abs(up.y) > 0.9
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0, 1, 0);

    const tangent = new THREE.Vector3().crossVectors(reference, up).normalize();

    const bitangent = new THREE.Vector3().crossVectors(up, tangent).normalize();

    // Start with a large polygon in the tangent plane.
    const extent = radius * 2.5;
    let polygon = [
      new THREE.Vector2(-extent, -extent),
      new THREE.Vector2(extent, -extent),
      new THREE.Vector2(extent, extent),
      new THREE.Vector2(-extent, extent),
    ];

    // Clip against the perpendicular bisector of each seed.
    for (const other of seeds) {
      if (other === seed) continue;

      // In the seed's tangent plane:
      // point must be closer to this seed than the other.
      const normal = new THREE.Vector2(
        other.dot(tangent),
        other.dot(bitangent),
      );

      const threshold = radius * (1 - other.dot(up));

      if (normal.lengthSq() < 1e-12) continue;

      const clipped: THREE.Vector2[] = [];

      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];

        const da = normal.dot(a) - threshold;
        const db = normal.dot(b) - threshold;

        const insideA = da <= 0;
        const insideB = db <= 0;

        if (insideA) clipped.push(a);

        if (insideA !== insideB) {
          const t = da / (da - db);

          clipped.push(
            new THREE.Vector2(
              THREE.MathUtils.lerp(a.x, b.x, t),
              THREE.MathUtils.lerp(a.y, b.y, t),
            ),
          );
        }
      }

      polygon = clipped;

      if (polygon.length === 0) break;
    }

    // Map the planar polygon back onto the sphere.
    return polygon.map((p) => {
      const point = up
        .clone()
        .multiplyScalar(radius)
        .addScaledVector(tangent, p.x)
        .addScaledVector(bitangent, p.y);

      return point.normalize().multiplyScalar(radius);
    });
  }

  // --------------------------------------------------
  // Rounded polygon geometry
  // --------------------------------------------------

  function createRoundedCell(
    vertices: THREE.Vector3[],
    center: THREE.Vector3,
    radius: number,
    cornerRadius: number,
    gap: number,
    elevation: number,
  ): THREE.BufferGeometry | null {
    if (vertices.length < 3) return null;

    const count = vertices.length;

    // Shrink each vertex toward the cell center.
    const inset = vertices.map((v) => {
      const direction = center.clone().sub(v);
      const distance = direction.length();

      return v
        .clone()
        .addScaledVector(direction.normalize(), Math.min(gap, distance * 0.2));
    });

    // Create rounded corners using quadratic Bezier curves.
    const points: THREE.Vector3[] = [];

    for (let i = 0; i < count; i++) {
      const prev = inset[(i - 1 + count) % count];
      const curr = inset[i];
      const next = inset[(i + 1) % count];

      const toPrev = prev.clone().sub(curr);
      const toNext = next.clone().sub(curr);

      const r = Math.min(
        cornerRadius,
        toPrev.length() * 0.35,
        toNext.length() * 0.35,
      );

      const start = curr.clone().addScaledVector(toPrev.normalize(), r);

      const end = curr.clone().addScaledVector(toNext.normalize(), r);

      points.push(start);

      for (let step = 1; step <= 5; step++) {
        const t = step / 6;
        const u = 1 - t;

        points.push(
          start
            .clone()
            .multiplyScalar(u * u)
            .addScaledVector(curr, 2 * u * t)
            .addScaledVector(end, t * t),
        );
      }

      points.push(end);
    }

    // Project the rounded polygon slightly outward.
    const projected = points.map((p) =>
      p
        .clone()
        .normalize()
        .multiplyScalar(radius + elevation),
    );

    // Triangulate as a fan from the center.
    const positions: number[] = [];
    const normals: number[] = [];

    const cellCenter = projected
      .reduce((sum, p) => sum.add(p), new THREE.Vector3())
      .divideScalar(projected.length);

    for (let i = 0; i < projected.length; i++) {
      const a = projected[i];
      const b = projected[(i + 1) % projected.length];

      const normal = cellCenter.clone().normalize();

      positions.push(
        cellCenter.x,
        cellCenter.y,
        cellCenter.z,
        a.x,
        a.y,
        a.z,
        b.x,
        b.y,
        b.z,
      );

      for (let j = 0; j < 3; j++) {
        normals.push(normal.x, normal.y, normal.z);
      }
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );

    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normals, 3),
    );

    return geometry;
  }

  function darknessProbability(
    seed: THREE.Vector3,
    centers: THREE.Vector3[],
    radius: number,
    strength = 0.8,
  ): number {
    let darkness = 0;

    for (const center of centers) {
      const distance = seed.angleTo(center) * radius;

      // Influence decreases with distance
      const influence = Math.exp(
        (-distance * distance) / (2 * strength * strength),
      );

      darkness = Math.max(darkness, influence);
    }

    return darkness;
  }

  // --------------------------------------------------
  // Build the surface
  // --------------------------------------------------

  // ██████╗ ██╗   ██╗██╗██╗     ██████╗
  // ██╔══██╗██║   ██║██║██║     ██╔══██╗
  // ██████╔╝██║   ██║██║██║     ██║  ██║
  // ██╔══██╗██║   ██║██║██║     ██║  ██║
  // ██████╔╝╚██████╔╝██║███████╗██████╔╝
  // ╚═════╝  ╚═════╝ ╚═╝╚══════╝╚═════╝
  // MARK: BUILD

  const seeds = generateSeeds(CONFIG.cells);
  const darknessCenters = generateSeeds(7);
  const darknessStrength = 1;

  const geometriesLight: THREE.BufferGeometry[] = [];
  const geometriesDark: THREE.BufferGeometry[] = [];

  for (const seed of seeds) {
    const vertices = generateCell(seed, seeds, CONFIG.radius);

    if (vertices.length < 3) continue;

    const probability = darknessProbability(
      seed,
      darknessCenters,
      CONFIG.radius,
      darknessStrength,
    );

    const geometry = createRoundedCell(
      vertices,
      seed,
      CONFIG.radius,
      CONFIG.cornerRadius,
      CONFIG.gap,
      CONFIG.elevation,
    );

    if (geometry) {
      if (Math.random() < probability) {
        geometriesDark.push(geometry);
      } else {
        geometriesLight.push(geometry);
      }
    }
  }

  const surfaceGeometryLight = BufferGeometryUtils.mergeGeometries(
    geometriesLight,
    false,
  );
  const surfaceGeometryDark = BufferGeometryUtils.mergeGeometries(
    geometriesDark,
    false,
  );

  const materialLight = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

  const materialDark = new THREE.MeshBasicMaterial({
    color: 0x333333,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

  const surfaceLight = new THREE.Mesh(surfaceGeometryLight, materialLight);
  const surfaceDark = new THREE.Mesh(surfaceGeometryDark, materialDark);
  scene.add(surfaceLight);
  scene.add(surfaceDark);

  // Inner sphere
  const innerSphereGeometry = new THREE.SphereGeometry(
    CONFIG.radius * 0.955,
    64,
    64,
  );

  const innerSphereMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const innerSphere = new THREE.Mesh(innerSphereGeometry, innerSphereMaterial);

  scene.add(innerSphere);

  // Release temporary geometries.
  geometriesLight.forEach((geometry) => geometry.dispose());

  // --------------------------------------------------
  // Animation
  // --------------------------------------------------

  //  █████╗ ███╗   ██╗██╗███╗   ███╗ █████╗ ████████╗███████╗
  // ██╔══██╗████╗  ██║██║████╗ ████║██╔══██╗╚══██╔══╝██╔════╝
  // ███████║██╔██╗ ██║██║██╔████╔██║███████║   ██║   █████╗
  // ██╔══██║██║╚██╗██║██║██║╚██╔╝██║██╔══██║   ██║   ██╔══╝
  // ██║  ██║██║ ╚████║██║██║ ╚═╝ ██║██║  ██║   ██║   ███████╗
  // ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝╚═╝     ╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝
  // MARK: ANIM

  function animate() {
    requestAnimationFrame(animate);

    updateRotateSensitivity();
    controls.update();

    renderer.render(scene, camera);
  }

  animate();

  // --------------------------------------------------
  // Resize
  // --------------------------------------------------

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
