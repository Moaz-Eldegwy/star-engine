import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CONSTELLATION_KEYWORDS, MISSION_CENTERS, getStarColor } from './constants.js';

// --- WorldUILabel ---
// A 3D-anchored DOM label that projects to screen each frame.
// Used both for constellation names and (when a star is focused) for
// concept "planet" labels.

function WorldUILabel({ labelData, camera, canvasRef }) {
  const elRef = useRef(null);
  useEffect(() => {
    let animationFrameId;
    const animate = () => {
      if (elRef.current && camera && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const screenPosition = labelData.position.clone().project(camera);
        const x = ((screenPosition.x + 1) / 2) * rect.width;
        const y = ((-screenPosition.y + 1) / 2) * rect.height;
        elRef.current.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
        elRef.current.style.opacity = labelData.visible ? '0.3' : '0';
      }
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animationFrameId);
  }, [labelData, camera, canvasRef]);
  return <div ref={elRef} className="world-label">{labelData.name}</div>;
}

// --- GalaxyView ---
// The big Three.js scene. Renders one Sprite per paper plus optional
// constellation labels and (when focused) the rotating concept planets.

export function GalaxyView({
  publications,
  onStarClick,
  onStarDoubleClick,
  onBackgroundClick,
  onPlanetClick,
  focusedStar,
  pulsingConcept,
  filters,
  temporalFilter,
  lens,
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const tooltipRef = useRef(null);
  const starsRef = useRef(new Map());
  const linesRef = useRef([]);
  const hoveredStarRef = useRef(null);
  const clickTimeoutRef = useRef(null);
  const starTextureRef = useRef(null);
  const focusedGroupRef = useRef(null);
  const [constellationLabels, setConstellationLabels] = useState([]);
  const [planetLabels, setPlanetLabels] = useState([]);

  // Stash latest callbacks/state in refs so the long-lived animation loop
  // can always read up-to-date values without re-creating the scene.
  const callbacksRef = useRef({});
  callbacksRef.current = {
    onStarClick,
    onStarDoubleClick,
    onBackgroundClick,
    onPlanetClick,
    focusedStar,
  };

  // Lazily build the soft-glow star sprite texture once.
  if (!starTextureRef.current) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.3)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    starTextureRef.current = new THREE.CanvasTexture(canvas);
  }

  // ---- Scene init (runs once on mount) ----
  useEffect(() => {
    const mountNode = mountRef.current;
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(
      75,
      mountNode.clientWidth / mountNode.clientHeight,
      0.1,
      2000,
    );
    camera.position.z = 500;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mountNode.clientWidth, mountNode.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;
    mountNode.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 50;
    controls.maxDistance = 1000;
    controlsRef.current = controls;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    let frameId;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const { focusedStar: liveFocused } = callbacksRef.current;
      const focusedStarData = liveFocused ? starsRef.current.get(liveFocused.id) : null;
      if (focusedStarData) {
        const offset = new THREE.Vector3(0, 0, 80);
        const targetPosition = focusedStarData.position.clone().add(offset);
        camera.position.lerp(targetPosition, 0.04);
        controls.target.lerp(focusedStarData.position, 0.04);
      }
      controls.update();

      starsRef.current.forEach((star) => {
        const hovered = hoveredStarRef.current === star.userData.id;
        const pulsing = star.isPulsing && !liveFocused;
        const targetScale = hovered || pulsing ? 1.5 : 1;
        const scale =
          star.userData.baseScale *
          targetScale *
          (liveFocused ? (liveFocused.id === star.userData.id ? 1.8 : 0.2) : 1);
        star.scale.x = THREE.MathUtils.lerp(star.scale.x, scale, 0.1);
        star.scale.y = THREE.MathUtils.lerp(star.scale.y, scale, 0.1);
      });

      if (focusedGroupRef.current) {
        focusedGroupRef.current.rotation.y += 0.005;
        setPlanetLabels((prev) =>
          prev.map((p) => ({ ...p, position: p.object.getWorldPosition(new THREE.Vector3()) })),
        );
      }
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = mountNode.clientWidth / mountNode.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountNode.clientWidth, mountNode.clientHeight);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mountNode);

    const handleMouseMove = (event) => {
      if (!renderer.domElement || !tooltipRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera); // (corrected from original)
      const intersects = raycaster.intersectObjects(Array.from(starsRef.current.values()));

      if (intersects.length > 0 && !callbacksRef.current.focusedStar) {
        const intersectedStar = intersects[0].object;
        hoveredStarRef.current = intersectedStar.userData.id;
        const tooltip = tooltipRef.current;
        tooltip.style.opacity = '1';
        tooltip.style.left = `${event.clientX}px`;
        tooltip.style.top = `${event.clientY}px`;
        tooltip.innerHTML = `<strong>${intersectedStar.userData.title}</strong><br/>${intersectedStar.userData.authors} (${intersectedStar.userData.year})`;
        mountNode.style.cursor = 'pointer';
      } else {
        hoveredStarRef.current = null;
        tooltipRef.current.style.opacity = '0';
        mountNode.style.cursor = 'auto';
      }
    };

    const handlePointerDown = (event) => {
      event.preventDefault();
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(Array.from(starsRef.current.values()));

      const cbs = callbacksRef.current;
      if (clickTimeoutRef.current) {
        // Double click
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
        if (intersects.length > 0) cbs.onStarDoubleClick(intersects[0].object.userData);
      } else {
        // Single click — defer 250ms so we can detect double-clicks.
        clickTimeoutRef.current = setTimeout(() => {
          if (intersects.length > 0) {
            cbs.onStarClick(intersects[0].object.userData);
          } else if (!event.target.classList.contains('planet-label')) {
            cbs.onBackgroundClick();
          }
          clickTimeoutRef.current = null;
        }, 250);
      }
    };

    mountNode.addEventListener('pointerdown', handlePointerDown);
    mountNode.addEventListener('mousemove', handleMouseMove);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.unobserve(mountNode);
      mountNode.removeEventListener('pointerdown', handlePointerDown);
      mountNode.removeEventListener('mousemove', handleMouseMove);
      if (mountNode.contains(renderer.domElement)) mountNode.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  // ---- Scene update (runs whenever data / filters / focus change) ----
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !publications) return;

    // Tear down previous frame's content.
    starsRef.current.forEach((star) => scene.remove(star));
    starsRef.current.clear();
    linesRef.current.forEach((line) => scene.remove(line));
    linesRef.current = [];
    if (focusedGroupRef.current) {
      scene.remove(focusedGroupRef.current);
      focusedGroupRef.current = null;
    }
    setPlanetLabels([]);

    const constellationCenters =
      lens === 'mission'
        ? MISSION_CENTERS
        : CONSTELLATION_KEYWORDS.reduce((acc, key, i) => {
            const angle = (i / CONSTELLATION_KEYWORDS.length) * Math.PI * 2;
            acc[key] = {
              x: 350 * Math.cos(angle),
              y: 100 * Math.sin(i * Math.PI),
              z: 350 * Math.sin(angle),
            };
            return acc;
          }, {});

    const dynamicConstellationInfo = {};
    Object.keys(constellationCenters).forEach((key) => {
      dynamicConstellationInfo[key] = { center: new THREE.Vector3(), count: 0 };
    });

    const validYears = publications.map((p) => p.year).filter((y) => y > 1900);
    const minPubYear = Math.min(...validYears);
    const maxPubYear = Math.max(...validYears);

    publications.forEach((p) => {
      const { citation_count, year, organism } = p;
      const luminosity = 0.8 + Math.min(citation_count / 500, 1) * 0.7;
      const baseScale = 15 + ((year - minPubYear) / (maxPubYear - minPubYear || 1)) * 15;

      const material = new THREE.SpriteMaterial({
        map: starTextureRef.current,
        color: getStarColor(organism),
        opacity: luminosity,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const star = new THREE.Sprite(material);

      const key =
        lens === 'mission'
          ? p.mission
          : CONSTELLATION_KEYWORDS.find((k) => k === p.organism) || 'Microbe';
      const center = constellationCenters[key] || { x: 0, y: 0, z: 0 };
      star.position.set(
        center.x + (Math.random() - 0.5) * 250,
        center.y + (Math.random() - 0.5) * 250,
        center.z + (Math.random() - 0.5) * 250,
      );
      star.scale.set(baseScale, baseScale, 1);
      star.userData = { ...p, baseScale };

      const isVisibleByYear = p.year >= temporalFilter.min && p.year <= temporalFilter.max;
      const isFilteredOut = filters.filteredIds !== null && !filters.filteredIds.has(p.id);
      star.visible = isVisibleByYear && !isFilteredOut;
      star.isPulsing = Boolean(pulsingConcept && p.keywords.includes(pulsingConcept));

      starsRef.current.set(p.id, star);
      scene.add(star);

      if (star.visible && dynamicConstellationInfo[key]) {
        dynamicConstellationInfo[key].center.add(star.position);
        dynamicConstellationInfo[key].count++;
      }
    });

    const newConstellationLabels = Object.entries(dynamicConstellationInfo).map(([name, info]) => {
      const isLabelVisible = info.count > 0 && lens !== 'mission' && !focusedStar;
      const position = isLabelVisible
        ? info.center.divideScalar(info.count)
        : new THREE.Vector3(0, 0, -2000);
      return { name, position, visible: isLabelVisible };
    });
    setConstellationLabels(newConstellationLabels);

    if (focusedStar) {
      const focusedStarData = starsRef.current.get(focusedStar.id);
      if (focusedStarData) {
        const group = new THREE.Group();
        group.position.copy(focusedStarData.position);
        const newPlanetLabels = [];
        focusedStar.concepts.forEach((concept, i) => {
          const radius = 25 + i * 10;
          const angle = (i / focusedStar.concepts.length) * Math.PI * 2 + Math.random();
          const planet = new THREE.Mesh(
            new THREE.SphereGeometry(2, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xa5b4fc }),
          );
          planet.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
          group.add(planet);
          newPlanetLabels.push({
            name: concept.name,
            type: concept.type,
            object: planet,
            position: planet.getWorldPosition(new THREE.Vector3()),
          });
        });
        scene.add(group);
        focusedGroupRef.current = group;
        setPlanetLabels(newPlanetLabels);
      }
    } else {
      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x4f46e5,
        opacity: 0.1,
        transparent: true,
        depthWrite: false,
      });
      publications.forEach((p) => {
        const sourceStar = starsRef.current.get(p.id);
        if (!sourceStar || !sourceStar.visible || !p.related_papers) return;
        p.related_papers.forEach((relatedId) => {
          const targetStar = starsRef.current.get(relatedId);
          if (!targetStar || !targetStar.visible) return;
          const points = [sourceStar.position.clone(), targetStar.position.clone()];
          const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(points),
            lineMaterial,
          );
          scene.add(line);
          linesRef.current.push(line);
        });
      });
    }
  }, [publications, filters, temporalFilter, lens, focusedStar, pulsingConcept]);

  const projectToScreen = useCallback((positionVec, camera) => {
    if (!positionVec || !camera || !mountRef.current) return { x: 0, y: 0 };
    const rect = mountRef.current.getBoundingClientRect();
    const vector = positionVec.clone().project(camera);
    return {
      x: ((vector.x + 1) / 2) * rect.width,
      y: ((-vector.y + 1) / 2) * rect.height,
    };
  }, []);

  return (
    <div className="w-full h-full relative">
      <div ref={mountRef} id="galaxy-canvas"></div>
      <div ref={tooltipRef} className="tooltip glass-effect"></div>
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        {constellationLabels.map((label) => (
          <WorldUILabel
            key={label.name}
            labelData={label}
            camera={cameraRef.current}
            canvasRef={mountRef}
          />
        ))}
        {planetLabels.map((label) => {
          const screenPos = projectToScreen(label.position, cameraRef.current);
          return (
            <div
              key={label.name}
              className="planet-label"
              style={{ left: `${screenPos.x}px`, top: `${screenPos.y}px` }}
              onClick={(e) => {
                e.stopPropagation();
                onPlanetClick(label.name);
              }}
            >
              {label.name}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default GalaxyView;
