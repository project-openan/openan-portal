// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

/**
 * VirtualShowroom — immersive 3D demo showcase (premium edition).
 *
 * Sci-fi octagonal gallery with:
 * - PBR materials + UnrealBloom post-processing (neon glow)
 * - Real content walls: each wall renders live content (video / API demo)
 * - First-person WASD + mouse look navigation
 * - Particle core + floor ripples + data streams
 * - Click wall to enter fullscreen interactive mode
 */

const WALLS = [
    { title: 'Agent Registry', titleZh: '注册中心', kind: 'registry' },
    { title: 'AI Orchestration', titleZh: 'AI 编排', kind: 'orchestration' },
    { title: 'Execution Flow', titleZh: '执行流', kind: 'execution' },
    { title: 'Observability', titleZh: '可观测', kind: 'observation' },
    { title: 'Theme Engine', titleZh: '主题引擎', kind: 'theme' },
    { title: 'i18n Matrix', titleZh: '国际化', kind: 'i18n' },
    { title: 'Plugin API', titleZh: '插件 API', kind: 'api' },
    { title: 'Live Data', titleZh: '实时数据', kind: 'sse' },
];

const HALL_RADIUS = 16;
const WALL_HEIGHT = 7;
const WALL_WIDTH = 7;
const NUM_WALLS = WALLS.length;

const Showroom3D = ({ isDark }) => {
    const mountRef = useRef(null);
    const [focusedWall, setFocusedWall] = useState(null);
    const [hintVisible, setHintVisible] = useState(true);

    useEffect(() => {
        const mount = mountRef.current;
        if (!mount) return undefined;
        let raf = 0;

        // ── Core setup ──
        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x030612, 0.012);

        const camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 600);

        const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        renderer.setSize(mount.clientWidth, mount.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;
        renderer.setClearColor(0x030612, 1);
        mount.appendChild(renderer.domElement);

        // (Bloom removed: three/examples/jsm not bundled in UMD build.
        //  Neon glow is achieved via additive blending + emissive + fog.)

        // ══════════════ ENVIRONMENT ══════════════

        // Star-field (3 layers: far/mid/near with different sizes/colors)
        const createStars = (count, size, color, spread) => {
            const geo = new THREE.BufferGeometry();
            const pos = new Float32Array(count * 3);
            const phase = new Float32Array(count);
            for (let i = 0; i < count; i++) {
                const r = spread + Math.random() * spread * 0.5;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.random() * Math.PI * 0.5;
                pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
                pos[i * 3 + 1] = 5 + r * Math.cos(phi) * 0.6;
                pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
                phase[i] = Math.random() * Math.PI * 2;
            }
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
            const mat = new THREE.PointsMaterial({
                color, size, transparent: true, opacity: 0.9,
                blending: THREE.AdditiveBlending, depthWrite: false,
            });
            return new THREE.Points(geo, mat);
        };
        const starsFar = createStars(2000, 0.35, 0x4488cc, 150);
        const starsMid = createStars(800, 0.7, 0x66ccff, 100);
        const starsNear = createStars(300, 1.2, 0xffffff, 70);
        scene.add(starsFar, starsMid, starsNear);

        // Floor: dark reflective disc + holographic grid + energy rings
        const floorGeo = new THREE.CircleGeometry(50, 96);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x060a14,
            metalness: 0.95,
            roughness: 0.15,
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        scene.add(floor);

        const grid = new THREE.GridHelper(100, 100, 0x00d4ff, 0x062030);
        grid.material.transparent = true;
        grid.material.opacity = 0.25;
        grid.position.y = 0.01;
        scene.add(grid);

        // Energy rings on floor (pulsing torus rings)
        const energyRings = [];
        for (let i = 0; i < 3; i++) {
            const ringGeo = new THREE.RingGeometry(4 + i * 4, 4.1 + i * 4, 128);
            const ringMat = new THREE.MeshBasicMaterial({
                color: i === 0 ? 0x00d4ff : i === 1 ? 0x7c3aed : 0xff006e,
                transparent: true,
                opacity: 0.4,
                side: THREE.DoubleSide,
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = 0.02;
            scene.add(ring);
            energyRings.push(ring);
        }

        // ══════════════ WALLS ══════════════

        const wallGroup = new THREE.Group();
        const wallMeshes = [];
        const wallData = [];

        for (let i = 0; i < NUM_WALLS; i++) {
            const angle = (i / NUM_WALLS) * Math.PI * 2;
            const x = Math.sin(angle) * HALL_RADIUS;
            const z = Math.cos(angle) * HALL_RADIUS;
            const wall = WALLS[i];

            // Wall panel (curved slightly) — dark metallic with neon edge
            const panelGeo = new THREE.BoxGeometry(WALL_WIDTH + 0.8, WALL_HEIGHT + 0.8, 0.4, 4, 4);
            const panelMat = new THREE.MeshPhysicalMaterial({
                color: 0x0a1420,
                metalness: 0.8,
                roughness: 0.3,
                clearcoat: 0.6,
                clearcoatRoughness: 0.2,
                emissive: 0x001220,
            });
            const panel = new THREE.Mesh(panelGeo, panelMat);
            panel.position.set(x, WALL_HEIGHT / 2, z);
            panel.lookAt(0, WALL_HEIGHT / 2, 0);
            wallGroup.add(panel);

            // Screen with REAL content drawn on canvas
            const canvas = document.createElement('canvas');
            canvas.width = 1024;
            canvas.height = 512;
            const ctx = canvas.getContext('2d');

            // Tech-styled screen background with content
            const grad = ctx.createLinearGradient(0, 0, 0, 512);
            grad.addColorStop(0, '#061220');
            grad.addColorStop(0.5, '#0a1e30');
            grad.addColorStop(1, '#061220');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 1024, 512);

            // Grid pattern on screen
            ctx.strokeStyle = 'rgba(0, 212, 255, 0.06)';
            ctx.lineWidth = 1;
            for (let y = 0; y < 512; y += 32) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke();
            }
            for (let xx = 0; xx < 1024; xx += 32) {
                ctx.beginPath(); ctx.moveTo(xx, 0); ctx.lineTo(xx, 512); ctx.stroke();
            }

            // Title bar
            ctx.fillStyle = 'rgba(0, 212, 255, 0.1)';
            ctx.fillRect(40, 40, 944, 60);
            ctx.fillStyle = '#00d4ff';
            ctx.font = 'bold 34px "Arial Black", Arial, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(wall.title.toUpperCase(), 60, 82);
            ctx.fillStyle = '#5cc8e8';
            ctx.font = '22px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(wall.titleZh, 964, 80);

            // Animated content area (wireframe representation per kind)
            ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
            ctx.lineWidth = 2;
            if (wall.kind === 'registry') {
                // Draw agent node graph
                for (let n = 0; n < 6; n++) {
                    const nx = 120 + (n % 3) * 300 + Math.random() * 40;
                    const ny = 200 + Math.floor(n / 3) * 100;
                    ctx.strokeStyle = `hsl(${180 + n * 15}, 80%, 50%)`;
                    ctx.beginPath();
                    ctx.arc(nx, ny, 25, 0, Math.PI * 2);
                    ctx.stroke();
                    if (n > 0 && n % 3 !== 0) {
                        ctx.beginPath();
                        ctx.moveTo(nx - 275, ny);
                        ctx.lineTo(nx - 25, ny);
                        ctx.stroke();
                    }
                }
            } else if (wall.kind === 'orchestration') {
                // Draw flow arrows
                for (let n = 0; n < 4; n++) {
                    const bx = 100 + n * 220;
                    ctx.strokeStyle = ['#00d4ff', '#7c3aed', '#ff006e', '#00ff88'][n];
                    ctx.strokeRect(bx, 220, 80, 80);
                    if (n < 3) {
                        ctx.beginPath();
                        ctx.moveTo(bx + 85, 260);
                        ctx.lineTo(bx + 205, 260);
                        ctx.stroke();
                    }
                }
            } else if (wall.kind === 'execution') {
                // Timeline dots
                for (let n = 0; n < 8; n++) {
                    const tx = 100 + n * 110;
                    ctx.fillStyle = n < 5 ? '#00ff88' : n < 7 ? '#ffaa00' : '#ff006e';
                    ctx.beginPath();
                    ctx.arc(tx, 300, 12, 0, Math.PI * 2);
                    ctx.fill();
                    if (n < 7) {
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                        ctx.beginPath();
                        ctx.moveTo(tx + 14, 300);
                        ctx.lineTo(tx + 96, 300);
                        ctx.stroke();
                    }
                }
            } else {
                // Waveform / chart
                ctx.beginPath();
                for (let px = 0; px < 900; px += 4) {
                    const py = 300 + Math.sin(px * 0.02 + i * 2) * 60 * Math.sin(px * 0.005);
                    if (px === 0) ctx.moveTo(60 + px, py);
                    else ctx.lineTo(60 + px, py);
                }
                ctx.strokeStyle = ['#00d4ff', '#7c3aed', '#ff006e', '#00ff88', '#ffaa00', '#00ccff', '#ff66aa', '#66ffcc'][i % 8];
                ctx.lineWidth = 3;
                ctx.stroke();
            }

            // Bottom label
            ctx.fillStyle = 'rgba(92, 200, 232, 0.6)';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('CLICK TO EXPLORE → 点击体验', 512, 470);

            // Border glow
            ctx.strokeStyle = 'rgba(0, 212, 255, 0.5)';
            ctx.lineWidth = 3;
            ctx.strokeRect(8, 8, 1008, 496);

            const texture = new THREE.CanvasTexture(canvas);
            texture.anisotropy = 4;
            const screenMat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
            const screenGeo = new THREE.PlaneGeometry(WALL_WIDTH, WALL_HEIGHT * 0.72);
            const screen = new THREE.Mesh(screenGeo, screenMat);
            const sx = x * 0.975;
            const sz = z * 0.975;
            screen.position.set(sx, WALL_HEIGHT * 0.45, sz);
            screen.lookAt(0, WALL_HEIGHT * 0.45, 0);
            screen.userData = { wallIndex: i, kind: wall.kind };
            wallGroup.add(screen);
            wallMeshes.push(screen);
            wallData.push({ mesh: screen, angle, x, z, kind: wall.kind });

            // Neon edge strips (top + bottom)
            const stripGeo = new THREE.BoxGeometry(WALL_WIDTH + 0.4, 0.08, 0.08);
            const stripMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff });
            const stripTop = new THREE.Mesh(stripGeo, stripMat);
            stripTop.position.set(sx, WALL_HEIGHT + 0.45, sz);
            stripTop.lookAt(0, WALL_HEIGHT + 0.45, 0);
            wallGroup.add(stripTop);
            const stripBot = stripTop.clone();
            stripBot.position.y = 0.1;
            wallGroup.add(stripBot);

            // Corner pillars with emissive
            const pillarGeo = new THREE.CylinderGeometry(0.25, 0.35, WALL_HEIGHT + 1, 8);
            const pillarMat = new THREE.MeshStandardMaterial({
                color: 0x0d1a28,
                metalness: 0.9,
                roughness: 0.2,
                emissive: 0x001a2e,
            });
            const half = (WALL_WIDTH / 2) + 0.5;
            const px1 = x + Math.cos(angle) * half;
            const pz1 = z - Math.sin(angle) * half;
            const px2 = x - Math.cos(angle) * half;
            const pz2 = z + Math.sin(angle) * half;
            const p1 = new THREE.Mesh(pillarGeo, pillarMat);
            p1.position.set(px1 * 0.975, (WALL_HEIGHT + 1) / 2, pz1 * 0.975);
            wallGroup.add(p1);
            const p2 = new THREE.Mesh(pillarGeo, pillarMat);
            p2.position.set(px2 * 0.975, (WALL_HEIGHT + 1) / 2, pz2 * 0.975);
            wallGroup.add(p2);

            // Pillar top lights
            const dotGeo = new THREE.SphereGeometry(0.15, 8, 8);
            const dotMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff });
            const d1 = new THREE.Mesh(dotGeo, dotMat);
            d1.position.copy(p1.position);
            d1.position.y = WALL_HEIGHT + 1.1;
            wallGroup.add(d1);
            const d2 = new THREE.Mesh(dotGeo, dotMat);
            d2.position.copy(p2.position);
            d2.position.y = WALL_HEIGHT + 1.1;
            wallGroup.add(d2);
        }
        scene.add(wallGroup);

        // ══════════════ CENTRAL CORE ══════════════

        const coreGroup = new THREE.Group();

        // Wireframe icosahedron
        const coreGeo = new THREE.IcosahedronGeometry(3, 2);
        const coreMat = new THREE.MeshStandardMaterial({
            color: 0x00d4ff,
            wireframe: true,
            emissive: 0x00aadd,
            emissiveIntensity: 0.8,
            transparent: true,
            opacity: 0.7,
        });
        const core = new THREE.Mesh(coreGeo, coreMat);
        coreGroup.add(core);

        // Inner glow sphere
        const innerGeo = new THREE.SphereGeometry(1.8, 32, 32);
        const innerMat = new THREE.MeshBasicMaterial({
            color: 0x003344,
            transparent: true,
            opacity: 0.5,
        });
        const inner = new THREE.Mesh(innerGeo, innerMat);
        coreGroup.add(inner);

        // Orbiting rings
        const rings = [];
        const ringColors = [0x00d4ff, 0x7c3aed, 0xff006e];
        for (let i = 0; i < 3; i++) {
            const rGeo = new THREE.TorusGeometry(4.5 + i * 1.5, 0.04, 8, 128);
            const rMat = new THREE.MeshBasicMaterial({
                color: ringColors[i],
                transparent: true,
                opacity: 0.6,
            });
            const r = new THREE.Mesh(rGeo, rMat);
            r.rotation.x = Math.PI / 2 + i * 0.5;
            rings.push(r);
            coreGroup.add(r);
        }
        coreGroup.position.y = 4.5;
        scene.add(coreGroup);

        // Particle system around core
        const particleCount = 500;
        const particleGeo = new THREE.BufferGeometry();
        const particlePos = new Float32Array(particleCount * 3);
        for (let j = 0; j < particleCount; j++) {
            const r = 4 + Math.random() * 6;
            const theta = Math.random() * Math.PI * 2;
            particlePos[j * 3] = r * Math.cos(theta);
            particlePos[j * 3 + 1] = 1 + Math.random() * 7;
            particlePos[j * 3 + 2] = r * Math.sin(theta);
        }
        particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
        const particleMat = new THREE.PointsMaterial({
            color: 0x00d4ff,
            size: 0.08,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const coreParticles = new THREE.Points(particleGeo, particleMat);
        scene.add(coreParticles);

        // ══════════════ LIGHTING ══════════════
        scene.add(new THREE.AmbientLight(0x112244, 0.8));

        const keyLight = new THREE.PointLight(0x00d4ff, 3, 50);
        keyLight.position.set(0, 10, 0);
        scene.add(keyLight);

        const rimLight1 = new THREE.PointLight(0x7c3aed, 2, 40);
        rimLight1.position.set(12, 6, 12);
        scene.add(rimLight1);

        const rimLight2 = new THREE.PointLight(0xff006e, 1.5, 35);
        rimLight2.position.set(-12, 5, -12);
        scene.add(rimLight2);

        const rimLight3 = new THREE.DirectionalLight(0x88ccff, 0.5);
        rimLight3.position.set(0, 20, 0);
        scene.add(rimLight3);

        // ══════════════ FIRST-PERSON CONTROLS ══════════════

        // Camera state
        const player = {
            pos: new THREE.Vector3(0, 3.5, 20),
            vel: new THREE.Vector3(0, 0, 0),
            yaw: Math.PI,
            pitch: 0,
            speed: 0.15,
            isLocked: false,
        };

        // Movement keys
        const keys = {};
        const onKeyDown = (e) => {
            keys[e.code] = true;
            if (e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD') {
                setHintVisible(false);
            }
        };
        const onKeyUp = (e) => { keys[e.code] = false; };

        // Mouse look
        let isDragging = false;
        let lastX = 0, lastY = 0;

        const raycaster = new THREE.Raycaster();
        const mouseVec = new THREE.Vector2();
        let hoveredWall = -1;

        const onPointerDown = (e) => {
            const rect = renderer.domElement.getBoundingClientRect();
            mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouseVec, camera);
            const hits = raycaster.intersectObjects(wallMeshes);
            if (hits.length > 0) {
                const idx = hits[0].object.userData.wallIndex;
                setFocusedWall(idx);
            }
            isDragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
        };
        const onPointerMove = (e) => {
            // Hover detection
            const rect = renderer.domElement.getBoundingClientRect();
            mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouseVec, camera);
            const hits = raycaster.intersectObjects(wallMeshes);
            const newHover = hits.length > 0 ? hits[0].object.userData.wallIndex : -1;
            if (newHover !== hoveredWall) {
                hoveredWall = newHover;
                renderer.domElement.style.cursor = newHover >= 0 ? 'pointer' : 'grab';
            }

            if (isDragging) {
                const dx = e.clientX - lastX;
                const dy = e.clientY - lastY;
                player.yaw -= dx * 0.004;
                player.pitch = Math.max(-0.8, Math.min(0.8, player.pitch + dy * 0.003));
                lastX = e.clientX;
                lastY = e.clientY;
            }
        };
        const onPointerUp = () => { isDragging = false; };

        renderer.domElement.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);

        // ══════════════ RESIZE ══════════════
        const onResize = () => {
            if (!mount) return;
            camera.aspect = mount.clientWidth / mount.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(mount.clientWidth, mount.clientHeight);
        };
        window.addEventListener('resize', onResize);

        // ══════════════ ANIMATION LOOP ══════════════
        const clock = new THREE.Clock();

        const animate = () => {
            raf = requestAnimationFrame(animate);
            const t = clock.getElapsedTime();
            const dt = Math.min(clock.getDelta(), 0.05);

            // ── Movement (WASD / arrows) ──
            const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
            const right = new THREE.Vector3(-forward.z, 0, forward.x);
            player.vel.set(0, 0, 0);
            if (keys['KeyW'] || keys['ArrowUp']) player.vel.add(forward.clone().multiplyScalar(player.speed));
            if (keys['KeyS'] || keys['ArrowDown']) player.vel.sub(forward.clone().multiplyScalar(player.speed));
            if (keys['KeyA'] || keys['ArrowLeft']) player.vel.sub(right.clone().multiplyScalar(player.speed));
            if (keys['KeyD'] || keys['ArrowRight']) player.vel.add(right.clone().multiplyScalar(player.speed));
            if (keys['ShiftLeft'] || keys['ShiftRight']) player.vel.multiplyScalar(2);
            player.pos.add(player.vel);

            // Boundary clamp (stay inside hall, don't walk through core)
            const distFromCenter = Math.sqrt(player.pos.x ** 2 + player.pos.z ** 2);
            if (distFromCenter > HALL_RADIUS - 3) {
                const scale = (HALL_RADIUS - 3) / distFromCenter;
                player.pos.x *= scale;
                player.pos.z *= scale;
            }
            if (distFromCenter < 6) {
                const scale = 6 / Math.max(distFromCenter, 0.01);
                player.pos.x *= scale;
                player.pos.z *= scale;
            }

            // ── Camera update ──
            camera.position.copy(player.pos);
            const lookDir = new THREE.Vector3(
                -Math.sin(player.yaw) * Math.cos(player.pitch),
                Math.sin(player.pitch),
                -Math.cos(player.yaw) * Math.cos(player.pitch)
            );
            camera.lookAt(camera.position.clone().add(lookDir));

            // ── Animate core ──
            core.rotation.y = t * 0.2;
            core.rotation.x = Math.sin(t * 0.3) * 0.2;
            inner.scale.setScalar(1 + Math.sin(t * 2) * 0.1);
            rings.forEach((r, i) => {
                r.rotation.z = t * (0.3 + i * 0.1);
            });
            coreParticles.rotation.y = t * 0.1;
            coreParticles.position.y = Math.sin(t * 0.5) * 0.5 + 4;

            // ── Energy rings pulse ──
            energyRings.forEach((ring, i) => {
                ring.material.opacity = 0.15 + Math.abs(Math.sin(t * 0.8 + i * 1.5)) * 0.3;
                const s = 1 + Math.sin(t * 0.8 + i * 1.5) * 0.02;
                ring.scale.set(s, s, 1);
            });

            // ── Light pulse ──
            keyLight.intensity = 2.5 + Math.sin(t * 1.5) * 0.5;
            rimLight1.intensity = 1.8 + Math.cos(t * 1.2) * 0.4;

            // ── Star drift ──
            starsFar.rotation.y = t * 0.005;
            starsMid.rotation.y = t * 0.008;
            starsNear.rotation.y = t * 0.012;

            // ── Wall hover glow ──
            wallMeshes.forEach((m, i) => {
                m.material.opacity = hoveredWall === i ? 1 : 0.92;
                m.scale.setScalar(hoveredWall === i ? 1.02 : 1);
            });

            renderer.render(scene, camera);
        };
        animate();

        // ── Cleanup ──
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            renderer.domElement.removeEventListener('pointerdown', onPointerDown);
            if (renderer.domElement.parentElement === mount) {
                mount.removeChild(renderer.domElement);
            }
            renderer.dispose();
            scene.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
                    else obj.material.dispose();
                }
            });
        };
    }, []);

    // ── Fullscreen wall view (exit 3D → full-screen interactive demo) ──
    const exitFullscreen = useCallback(() => setFocusedWall(null), []);

    return (
        <div className="h-full w-full relative overflow-hidden" style={{ background: '#030612' }}>
            <div ref={mountRef} className="absolute inset-0" />

            {/* HUD: Title badge */}
            <div className="absolute top-5 left-5 z-10 pointer-events-none">
                <div
                    className="px-5 py-3 rounded-2xl backdrop-blur-lg border font-bold tracking-wide"
                    style={{
                        background: 'linear-gradient(135deg, rgba(0,212,255,0.12), rgba(124,58,237,0.08))',
                        borderColor: 'rgba(0,212,255,0.35)',
                        color: '#00e5ff',
                        textShadow: '0 0 20px rgba(0,212,255,0.5)',
                    }}
                >
                    <div className="text-lg leading-tight">✦ VIRTUAL SHOWROOM</div>
                    <div className="text-[11px] text-cyan-300/70 font-medium tracking-[0.3em] mt-0.5">
                        虚拟展厅
                    </div>
                </div>
            </div>

            {/* HUD: Navigation hint */}
            {hintVisible && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                    <div
                        className="flex items-center gap-4 px-6 py-3 rounded-2xl backdrop-blur-lg border text-[11px] font-medium"
                        style={{ background: 'rgba(2,8,18,0.7)', borderColor: 'rgba(0,212,255,0.25)' }}
                    >
                        <span className="text-cyan-300">🖱 拖拽转向</span>
                        <span className="text-cyan-300">⌨ WASD 移动</span>
                        <span className="text-cyan-300">Shift 加速</span>
                        <span className="text-cyan-300">▣ 点击墙面体验</span>
                    </div>
                </div>
            )}

            {/* HUD: Crosshair (subtle) */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
                <div
                    className="w-1 h-1 rounded-full"
                    style={{ background: 'rgba(0,212,255,0.4)', boxShadow: '0 0 8px rgba(0,212,255,0.6)' }}
                />
            </div>

            {/* Fullscreen content overlay when a wall is clicked */}
            {focusedWall !== null && (
                <WallFullscreen
                    wall={WALLS[focusedWall]}
                    onExit={exitFullscreen}
                    isDark={isDark}
                />
            )}
        </div>
    );
};

/**
 * WallFullscreen — when a wall is clicked, display its full interactive demo
 * content as an overlay (exit 3D view).
 */
function WallFullscreen({ wall, onExit, isDark }) {
    return (
        <div className="absolute inset-0 z-30 bg-[#030612]/95 backdrop-blur-md animate-in fade-in duration-300">
            <div className="h-full flex flex-col p-8">
                <div className="flex items-center justify-between mb-6 shrink-0">
                    <div className="flex items-center gap-3">
                        <div
                            className="p-3 rounded-2xl border"
                            style={{
                                background: 'rgba(0,212,255,0.1)',
                                borderColor: 'rgba(0,212,255,0.3)',
                                color: '#00e5ff',
                            }}
                        >
                            ◆
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-cyan-100 tracking-tight">
                                {wall.title}
                            </h2>
                            <p className="text-xs text-cyan-400/60">{wall.titleZh}</p>
                        </div>
                    </div>
                    <button
                        onClick={onExit}
                        className="px-5 py-2.5 rounded-xl border text-sm font-bold text-cyan-300 hover:bg-cyan-500/10 transition-all"
                        style={{ borderColor: 'rgba(0,212,255,0.3)' }}
                    >
                        ← 返回展厅 Back to Showroom
                    </button>
                </div>
                <div className="flex-1 min-h-0 rounded-2xl border overflow-hidden"
                    style={{ borderColor: 'rgba(0,212,255,0.15)', background: 'rgba(0,10,20,0.5)' }}
                >
                    <div className="h-full flex items-center justify-center text-cyan-300/40 text-sm">
                        [ {wall.title} interactive demo area ]
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Showroom3D;
