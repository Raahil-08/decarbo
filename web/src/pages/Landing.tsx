import { Link, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import { DecarboLogo } from "../components/common/DecarboLogo";
import {
  Zap,
  Activity,
  Flame,
  Factory,
  TrendingDown,
  ShieldCheck,
  Layers,
  Cpu,
  Coins,
  Crosshair,
  Sliders,
  Sparkles,
  Radio,
  FileText,
  CheckCircle2,
  Volume2,
  VolumeX,
  ArrowRight,
  Search,
  Check,
  RotateCcw,
  Target,
  Server,
  Atom,
  ChevronDown
} from "lucide-react";

/* ═══════════════════════════════════════════
   MATH & INTERPOLATION UTILITIES
   ═══════════════════════════════════════════ */
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (t: number) => t * t * (3 - 2 * t);

type KF = { at: number; v: number };
function lerpKF(t: number, kfs: KF[]): number {
  if (t <= kfs[0].at) return kfs[0].v;
  if (t >= kfs[kfs.length - 1].at) return kfs[kfs.length - 1].v;
  for (let i = 0; i < kfs.length - 1; i++) {
    if (t >= kfs[i].at && t <= kfs[i + 1].at) {
      const lt = (t - kfs[i].at) / (kfs[i + 1].at - kfs[i].at);
      return lerp(kfs[i].v, kfs[i + 1].v, smoothstep(lt));
    }
  }
  return kfs[kfs.length - 1].v;
}

/* ═══════════════════════════════════════════
   AUDIO EFFECTS (Subtle Sci-Fi Micro-Haptics)
   ═══════════════════════════════════════════ */
class SoundEngine {
  private ctx: AudioContext | null = null;
  public enabled: boolean = false;

  private init() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  }

  public click() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(320, this.ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
    } catch {
      // AudioContext policy fallback
    }
  }

  public hover() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(1400, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.015, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.02);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.02);
    } catch {
      // AudioContext policy fallback
    }
  }

  public ping() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(520, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1040, this.ctx.currentTime + 0.09);
      gain.gain.setValueAtTime(0.035, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.12);
    } catch {
      // AudioContext policy fallback
    }
  }
}

const sounds = new SoundEngine();

/* ═══════════════════════════════════════════
   SMOOTH LENIS HOOK
   ═══════════════════════════════════════════ */
function useLenis() {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      touchMultiplier: 1.8
    });
    const raf = (time: number) => {
      lenis.raf(time);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);

    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a[href^='#']") as HTMLAnchorElement | null;
      if (a) {
        e.preventDefault();
        const targetId = a.getAttribute("href")!.slice(1);
        const el = document.getElementById(targetId);
        if (el) {
          sounds.click();
          lenis.scrollTo(el, { offset: -70 });
        }
      }
    };
    document.addEventListener("click", onClick);
    return () => {
      lenis.destroy();
      document.removeEventListener("click", onClick);
    };
  }, []);
}

/* ═══════════════════════════════════════════
   INTERSECTION REVEAL HOOK
   ═══════════════════════════════════════════ */
function useReveal(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          obs.unobserve(el);
        }
      },
      { threshold, rootMargin: "0px 0px -40px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, isVisible };
}

/* ═══════════════════════════════════════════
   3D TILT CARD WRAPPER
   ═══════════════════════════════════════════ */
function TiltCard({
  children,
  className = "",
  glowColor = "rgba(45,122,87,0.15)"
}: {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState("");
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -7;
    const rotateY = ((x - centerX) / centerX) * 7;
    setTransform(`perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.01, 1.01, 1.01)`);
    setGlare({
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
      opacity: 0.25
    });
  };

  const onMouseLeave = () => {
    setTransform("perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)");
    setGlare(g => ({ ...g, opacity: 0 }));
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onMouseEnter={() => sounds.hover()}
      className={`relative transition-transform duration-200 ease-out will-change-transform ${className}`}
      style={{ transform, transformStyle: "preserve-3d" }}
    >
      {/* Glare effect */}
      <div
        className="pointer-events-none absolute inset-0 rounded-lg transition-opacity duration-300 z-20"
        style={{
          opacity: glare.opacity,
          background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, ${glowColor} 0%, transparent 60%)`
        }}
      />
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════
   CORNER ACCENTS (Industrial Blueprint Style)
   ═══════════════════════════════════════════ */
function Corners({ color = "bg-white/20" }: { color?: string }) {
  return (
    <>
      <div className="absolute top-0 left-0 w-2.5 h-2.5 pointer-events-none z-10">
        <div className={`absolute top-0 left-0 h-px w-full ${color}`} />
        <div className={`absolute top-0 left-0 w-px h-full ${color}`} />
      </div>
      <div className="absolute top-0 right-0 w-2.5 h-2.5 pointer-events-none z-10">
        <div className={`absolute top-0 right-0 h-px w-full ${color}`} />
        <div className={`absolute top-0 right-0 w-px h-full ${color}`} />
      </div>
      <div className="absolute bottom-0 left-0 w-2.5 h-2.5 pointer-events-none z-10">
        <div className={`absolute bottom-0 left-0 h-px w-full ${color}`} />
        <div className={`absolute bottom-0 left-0 w-px h-full ${color}`} />
      </div>
      <div className="absolute bottom-0 right-0 w-2.5 h-2.5 pointer-events-none z-10">
        <div className={`absolute bottom-0 right-0 h-px w-full ${color}`} />
        <div className={`absolute bottom-0 right-0 w-px h-full ${color}`} />
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════
   BACKGROUND: INTERACTIVE PARTICLE FIELD
   (Reacts to mouse & click shockwaves)
   ═══════════════════════════════════════════ */
function InteractiveParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shockwavesRef = useRef<{ x: number; y: number; r: number; maxR: number; alpha: number }[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);
    let mouseX = -1000;
    let mouseY = -1000;

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    const N = Math.min(100, Math.floor((w * h) / 18000));
    const particles = Array.from({ length: N }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.6 + 0.6,
      baseAlpha: Math.random() * 0.2 + 0.08
    }));

    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const onClick = (e: MouseEvent) => {
      sounds.ping();
      shockwavesRef.current.push({
        x: e.clientX,
        y: e.clientY,
        r: 5,
        maxR: 240,
        alpha: 0.4
      });
      if (shockwavesRef.current.length > 5) shockwavesRef.current.shift();
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("click", onClick);

    let frameId: number;
    const render = () => {
      ctx.clearRect(0, 0, w, h);

      // Render & expand shockwaves
      for (let i = shockwavesRef.current.length - 1; i >= 0; i--) {
        const sw = shockwavesRef.current[i];
        sw.r += 4.5;
        sw.alpha *= 0.94;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(45, 122, 87, ${sw.alpha})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Push nearby particles
        for (const p of particles) {
          const dx = p.x - sw.x;
          const dy = p.y - sw.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (Math.abs(dist - sw.r) < 30 && dist > 0) {
            p.vx += (dx / dist) * 0.6;
            p.vy += (dy / dist) * 0.6;
          }
        }

        if (sw.alpha < 0.01 || sw.r > sw.maxR) {
          shockwavesRef.current.splice(i, 1);
        }
      }

      // Draw particles & connect lines
      for (let i = 0; i < N; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.99;
        p.vy *= 0.99;

        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        const dx = mouseX - p.x;
        const dy = mouseY - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 180) {
          p.vx -= (dx / dist) * 0.02;
          p.vy -= (dy / dist) * 0.02;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = dist < 140 ? "rgba(45, 122, 87, 0.5)" : `rgba(255, 255, 255, ${p.baseAlpha})`;
        ctx.fill();

        for (let j = i + 1; j < N; j++) {
          const p2 = particles[j];
          const dxx = p.x - p2.x;
          const dyy = p.y - p2.y;
          const d = Math.sqrt(dxx * dxx + dyy * dyy);
          if (d < 120) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.04 * (1 - d / 120)})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      frameId = requestAnimationFrame(render);
    };

    render();
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("click", onClick);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" />;
}

/* ═══════════════════════════════════════════
   THE CONTINUOUS TRAVELING 3D CARBON REACTOR
   (Travels through sections, morphs & changes colors)
   ═══════════════════════════════════════════ */
// Scroll trajectories across sections (0 to 1)
const reactorXKF: KF[] = [
  { at: 0.0, v: 0 },      // Hero: Dead center
  { at: 0.12, v: 0 },     // Hero bottom: Center
  { at: 0.22, v: 28 },    // Metrics band: Moves right
  { at: 0.35, v: -26 },   // Simulator: Shifts left to anchor panel
  { at: 0.52, v: 24 },    // Hotspot map: Anchors right
  { at: 0.68, v: -20 },   // Process steps: Anchors left
  { at: 0.82, v: 22 },    // About / Engine: Anchors right
  { at: 0.94, v: 0 },     // Scope Radar / CTA: Centers inside reticle
  { at: 1.0, v: 0 }
];

const reactorYKF: KF[] = [
  { at: 0.0, v: 0 },
  { at: 0.12, v: -2 },
  { at: 0.22, v: 6 },
  { at: 0.35, v: 2 },
  { at: 0.52, v: 5 },
  { at: 0.68, v: -2 },
  { at: 0.82, v: 4 },
  { at: 0.94, v: 8 },
  { at: 1.0, v: 10 }
];

const reactorScaleKF: KF[] = [
  { at: 0.0, v: 1.05 },
  { at: 0.12, v: 0.9 },
  { at: 0.22, v: 0.65 },
  { at: 0.35, v: 0.72 },
  { at: 0.52, v: 0.75 },
  { at: 0.68, v: 0.65 },
  { at: 0.82, v: 0.7 },
  { at: 0.94, v: 0.85 },
  { at: 1.0, v: 0.8 }
];

// RGB color morphing:
// Hero: Ice-Blue/Silver -> Metrics: Mint -> Simulator: Leaf Green -> Process: Warm Brass -> Engine: Violet -> CTA: Ember/Leaf
const colorRKF: KF[] = [
  { at: 0.0, v: 170 },
  { at: 0.15, v: 150 },
  { at: 0.28, v: 52 },
  { at: 0.42, v: 45 },
  { at: 0.60, v: 169 },
  { at: 0.78, v: 129 },
  { at: 0.92, v: 181 },
  { at: 1.0, v: 45 }
];
const colorGKF: KF[] = [
  { at: 0.0, v: 205 },
  { at: 0.15, v: 215 },
  { at: 0.28, v: 211 },
  { at: 0.42, v: 122 },
  { at: 0.60, v: 122 },
  { at: 0.78, v: 140 },
  { at: 0.92, v: 67 },
  { at: 1.0, v: 122 }
];
const colorBKF: KF[] = [
  { at: 0.0, v: 250 },
  { at: 0.15, v: 235 },
  { at: 0.28, v: 153 },
  { at: 0.42, v: 87 },
  { at: 0.60, v: 43 },
  { at: 0.78, v: 248 },
  { at: 0.92, v: 44 },
  { at: 1.0, v: 87 }
];

function TravelingCarbonReactor({ scrollProgress }: { scrollProgress: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current.targetX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseRef.current.targetY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = 360;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const radius = 120;
    const numPts = 2400;
    const goldenRatio = (1 + Math.sqrt(5)) / 2;

    // Fibonacci sphere points
    const points = Array.from({ length: numPts }, (_, i) => ({
      theta: Math.acos(1 - (2 * (i + 0.5)) / numPts),
      phi: (2 * Math.PI * i) / goldenRatio
    }));
    const projected = new Array(numPts);

    let time = 0;
    let frameId: number;

    const render = () => {
      ctx.clearRect(0, 0, size, size);
      time += 0.005;

      // Mouse smoothing
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.05;

      const p = scrollProgress;
      const r = Math.round(lerpKF(p, colorRKF));
      const g = Math.round(lerpKF(p, colorGKF));
      const b = Math.round(lerpKF(p, colorBKF));

      // 3D Rotations influenced by time + mouse tilt
      const rotY = time * 0.5 + mouseRef.current.x * 0.6;
      const rotX = time * 0.2 + mouseRef.current.y * 0.6;
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);

      // Inner glowing core
      const coreGrad = ctx.createRadialGradient(cx, cy, 5, cx, cy, radius * 0.7);
      coreGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.22)`);
      coreGrad.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.06)`);
      coreGrad.addColorStop(1, "transparent");
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.8, 0, Math.PI * 2);
      ctx.fill();

      // Project 3D points
      for (let i = 0; i < numPts; i++) {
        const pt = points[i];
        // Harmonic deformation wave
        const wave = 1 + 0.08 * Math.sin(pt.theta * 5 + time * 2) * Math.cos(pt.phi * 4 + time * 1.5);
        const curR = radius * wave;

        let px = curR * Math.sin(pt.theta) * Math.cos(pt.phi);
        let py = curR * Math.sin(pt.theta) * Math.sin(pt.phi);
        let pz = curR * Math.cos(pt.theta);

        // Y rotation
        const x1 = px * cosY - pz * sinY;
        const z1 = px * sinY + pz * cosY;
        // X rotation
        const y1 = py * cosX - z1 * sinX;
        const z2 = py * sinX + z1 * cosX;

        // Perspective scale
        const fov = 500;
        const scale = fov / (fov + z2);
        projected[i] = {
          x: cx + x1 * scale,
          y: cy + y1 * scale,
          z: z2,
          scale
        };
      }

      // Sort by depth for correct atmospheric haze
      projected.sort((a, b) => a.z - b.z);

      // Draw particles
      for (let i = 0; i < numPts; i++) {
        const pt = projected[i];
        const alpha = 0.06 + 0.82 * ((pt.z + radius) / (2 * radius));
        const dotSize = Math.max(0.4, 1.4 * pt.scale);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, dotSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.fill();
      }

      // Draw orbiting equatorial latitude rings
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotY * 0.4);
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 1.35, radius * 0.42, time * 0.3, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.18)`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 12]);
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 1.55, radius * 0.5, -time * 0.25, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 255, 255, 0.08)`;
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2, 8]);
      ctx.stroke();
      ctx.restore();

      frameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(frameId);
  }, [scrollProgress]);

  // Compute interpolated transform for container
  const posX = lerpKF(scrollProgress, reactorXKF);
  const posY = lerpKF(scrollProgress, reactorYKF);
  const scale = lerpKF(scrollProgress, reactorScaleKF);
  const r = Math.round(lerpKF(scrollProgress, colorRKF));
  const g = Math.round(lerpKF(scrollProgress, colorGKF));
  const b = Math.round(lerpKF(scrollProgress, colorBKF));

  return (
    <div
      ref={containerRef}
      className="fixed top-1/2 left-1/2 z-[3] pointer-events-none transition-transform duration-300 ease-out will-change-transform flex items-center justify-center"
      style={{
        transform: `translate(calc(-50% + ${posX}vw), calc(-50% + ${posY}vh)) scale(${scale})`
      }}
    >
      <canvas ref={canvasRef} />

      {/* Floating HUD reticle surrounding reactor */}
      <div
        className="absolute inset-0 rounded-full border border-dashed transition-colors duration-500 pointer-events-none"
        style={{
          borderColor: `rgba(${r}, ${g}, ${b}, 0.16)`,
          animation: "spin 35s linear infinite"
        }}
      />
      <div
        className="absolute -inset-4 rounded-full border pointer-events-none"
        style={{
          borderColor: `rgba(${r}, ${g}, ${b}, 0.06)`,
          animation: "spin 50s linear infinite reverse"
        }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════
   TRAVELING TELEMETRY SATELLITES
   (Hero modules that travel with user down the page)
   ═══════════════════════════════════════════ */
function TravelingSatellites({ scrollProgress }: { scrollProgress: number }) {
  // Satellite 1: Leak Flux Telemetry
  const s1X = lerpKF(scrollProgress, [
    { at: 0.0, v: -36 },
    { at: 0.25, v: -32 },
    { at: 0.45, v: 28 },
    { at: 0.7, v: -34 },
    { at: 1.0, v: -28 }
  ]);
  const s1Y = lerpKF(scrollProgress, [
    { at: 0.0, v: -24 },
    { at: 0.25, v: -18 },
    { at: 0.45, v: -10 },
    { at: 0.7, v: 12 },
    { at: 1.0, v: 22 }
  ]);

  // Satellite 2: Grid Tariff & Carbon Factor
  const s2X = lerpKF(scrollProgress, [
    { at: 0.0, v: 36 },
    { at: 0.25, v: 30 },
    { at: 0.45, v: -28 },
    { at: 0.7, v: 32 },
    { at: 1.0, v: 26 }
  ]);
  const s2Y = lerpKF(scrollProgress, [
    { at: 0.0, v: -24 },
    { at: 0.25, v: -12 },
    { at: 0.45, v: 16 },
    { at: 0.7, v: -8 },
    { at: 1.0, v: 18 }
  ]);

  // Satellite 3: Payback & ROI Engine
  const s3X = lerpKF(scrollProgress, [
    { at: 0.0, v: -34 },
    { at: 0.25, v: 2 },
    { at: 0.45, v: 30 },
    { at: 0.7, v: -26 },
    { at: 1.0, v: -4 }
  ]);
  const s3Y = lerpKF(scrollProgress, [
    { at: 0.0, v: 28 },
    { at: 0.25, v: 24 },
    { at: 0.45, v: -20 },
    { at: 0.7, v: 24 },
    { at: 1.0, v: 30 }
  ]);

  const p = scrollProgress;
  const activeColor =
    p < 0.25
      ? "text-blue-300 border-blue-500/20"
      : p < 0.55
      ? "text-leaf border-leaf/30"
      : p < 0.8
      ? "text-brass border-brass/30"
      : "text-ember border-ember/30";

  return (
    <div className="pointer-events-none fixed inset-0 z-[4] overflow-hidden hidden md:block">
      {/* Satellite 1: Leak Sensor */}
      <div
        className={`absolute top-1/2 left-1/2 border backdrop-blur-md px-3.5 py-2 rounded transition-all duration-300 ${activeColor} bg-black/50 shadow-xl`}
        style={{
          transform: `translate(calc(-50% + ${s1X}vw), calc(-50% + ${s1Y}vh))`,
          opacity: Math.max(0.4, 1 - Math.abs(p - 0.5) * 0.6)
        }}
      >
        <div className="flex items-center gap-2 mb-0.5">
          <Activity className="w-3.5 h-3.5 animate-pulse" />
          <span className="text-[9px] tracking-[0.2em] uppercase font-mono text-white/50">LEAK DETECTOR 01</span>
        </div>
        <div className="text-[12px] font-mono text-white font-medium">
          142.4 <span className="text-[9px] text-white/40">kgCO₂e/h</span>
        </div>
      </div>

      {/* Satellite 2: Grid Factor */}
      <div
        className={`absolute top-1/2 left-1/2 border backdrop-blur-md px-3.5 py-2 rounded transition-all duration-300 ${activeColor} bg-black/50 shadow-xl`}
        style={{
          transform: `translate(calc(-50% + ${s2X}vw), calc(-50% + ${s2Y}vh))`,
          opacity: Math.max(0.4, 1 - Math.abs(p - 0.3) * 0.5)
        }}
      >
        <div className="flex items-center gap-2 mb-0.5">
          <Zap className="w-3.5 h-3.5" />
          <span className="text-[9px] tracking-[0.2em] uppercase font-mono text-white/50">CEA GRID EF</span>
        </div>
        <div className="text-[12px] font-mono text-white font-medium">
          0.716 <span className="text-[9px] text-white/40">kgCO₂e/kWh</span>
        </div>
      </div>

      {/* Satellite 3: Payback Horizon */}
      <div
        className={`absolute top-1/2 left-1/2 border backdrop-blur-md px-3.5 py-2 rounded transition-all duration-300 ${activeColor} bg-black/50 shadow-xl`}
        style={{
          transform: `translate(calc(-50% + ${s3X}vw), calc(-50% + ${s3Y}vh))`,
          opacity: Math.max(0.4, 1 - Math.abs(p - 0.7) * 0.5)
        }}
      >
        <div className="flex items-center gap-2 mb-0.5">
          <Coins className="w-3.5 h-3.5" />
          <span className="text-[9px] tracking-[0.2em] uppercase font-mono text-white/50">OPTIMIZED ROI</span>
        </div>
        <div className="text-[12px] font-mono text-white font-medium">
          14 MO <span className="text-[9px] text-white/40">• ₹12.3L/yr</span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   VERTICAL QUANTUM SCROLL TRACKER
   (Rides alongside left margin showing journey)
   ═══════════════════════════════════════════ */
function QuantumScrollTracker({ scrollProgress }: { scrollProgress: number }) {
  const waypoints = [
    { id: "hero", label: "HERO" },
    { id: "simulator", label: "SIMULATOR" },
    { id: "solution", label: "SOLUTION" },
    { id: "hotspots", label: "HOTSPOTS" },
    { id: "process", label: "PROCESS" },
    { id: "about", label: "ABOUT" },
    { id: "contact", label: "AUDIT" }
  ];

  return (
    <div className="fixed left-4 top-1/2 -translate-y-1/2 z-40 hidden xl:flex flex-col items-center gap-4 pointer-events-auto select-none">
      <div className="h-44 w-[2px] bg-white/10 relative rounded-full overflow-hidden">
        <div
          className="w-full bg-gradient-to-b from-leaf via-brass to-ember transition-all duration-150"
          style={{ height: `${Math.min(100, Math.max(2, scrollProgress * 100))}%` }}
        />
      </div>
      <div className="flex flex-col gap-2.5">
        {waypoints.map(wp => (
          <a
            key={wp.id}
            href={`#${wp.id}`}
            onClick={() => sounds.click()}
            className="group flex items-center gap-2 text-[9px] font-mono tracking-widest text-white/25 hover:text-white transition-colors"
          >
            <div className="w-1.5 h-1.5 rounded-full border border-white/30 group-hover:border-leaf group-hover:bg-leaf transition-colors" />
            <span className="opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-black/80 px-1.5 py-0.5 rounded border border-white/10">
              {wp.label}
            </span>
          </a>
        ))}
      </div>
      <div className="text-[10px] font-mono text-white/30 tabular-nums">
        {Math.round(scrollProgress * 100)}%
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   INTERACTIVE COMPONENT 1:
   FACTORY DECARBONISATION & ROI SIMULATOR
   (Hands-on playground right on landing page)
   ═══════════════════════════════════════════ */
function InteractiveRoiSimulator() {
  const [elecBillLakhs, setElecBillLakhs] = useState<number>(14);
  const [dieselLiters, setDieselLiters] = useState<number>(2500);
  const [reductionTarget, setReductionTarget] = useState<number>(30);
  const [selectedFixes, setSelectedFixes] = useState<{ [key: string]: boolean }>({
    solar: true,
    vfd: true,
    recuperator: true,
    motors: false,
    biomass: false
  });

  const availableFixes = [
    { id: "solar", name: "100 kW Rooftop Solar PV", capex: 42, cutTco2: 120, annualSavings: 9.6, scope: "Scope 2" },
    { id: "vfd", name: "VFD on Compressor & Blowers", capex: 6.5, cutTco2: 45, annualSavings: 4.2, scope: "Scope 2" },
    { id: "recuperator", name: "Boiler Flue Heat Recuperator", capex: 12, cutTco2: 82, annualSavings: 8.8, scope: "Scope 1" },
    { id: "motors", name: "IE4 Super-Premium Motors", capex: 8, cutTco2: 32, annualSavings: 3.4, scope: "Scope 2" },
    { id: "biomass", name: "Biomass Briquette Shift", capex: 18, cutTco2: 140, annualSavings: 11.5, scope: "Scope 1" }
  ];

  const toggleFix = (id: string) => {
    sounds.click();
    setSelectedFixes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Live calculations
  const baselineElectricityKwh = (elecBillLakhs * 100000) / 8.2; // approx ₹8.2/kWh
  const baselineElecTco2 = (baselineElectricityKwh * 0.716) / 1000;
  const baselineDieselTco2 = (dieselLiters * 12 * 2.68) / 1000;
  const totalBaselineTco2 = baselineElecTco2 + baselineDieselTco2;

  const totalCapex = availableFixes
    .filter(f => selectedFixes[f.id])
    .reduce((acc, f) => acc + f.capex, 0);

  const totalAnnualSavings = availableFixes
    .filter(f => selectedFixes[f.id])
    .reduce((acc, f) => acc + f.annualSavings, 0);

  const totalCutTco2 = availableFixes
    .filter(f => selectedFixes[f.id])
    .reduce((acc, f) => acc + f.cutTco2, 0);

  const achievedReductionPct = totalBaselineTco2 > 0 ? Math.min(100, (totalCutTco2 / totalBaselineTco2) * 100) : 0;
  const paybackMonths = totalAnnualSavings > 0 ? ((totalCapex / totalAnnualSavings) * 12).toFixed(1) : "0";

  return (
    <div className="relative border border-white/[0.08] bg-[#0c101a]/90 backdrop-blur-xl p-6 md:p-8 rounded-xl shadow-2xl overflow-hidden">
      <Corners color="bg-leaf/40" />

      {/* Top Header Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sliders className="w-4 h-4 text-leaf" />
            <span className="text-[10px] tracking-[0.25em] uppercase text-leaf font-mono font-medium">LIVE FACTORY PLANNER // OR-TOOLS ENGINE</span>
          </div>
          <h3 className="text-xl md:text-2xl font-light text-white tracking-wide">
            Interactive Carbon &amp; Capex Simulator
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              sounds.ping();
              setElecBillLakhs(18);
              setDieselLiters(3500);
              setReductionTarget(35);
              setSelectedFixes({ solar: true, vfd: true, recuperator: true, motors: true, biomass: false });
            }}
            className="flex items-center gap-1.5 text-[11px] font-mono tracking-wider uppercase px-3 py-1.5 border border-white/10 rounded hover:bg-white/[0.04] text-white/60 hover:text-white transition-all"
          >
            <RotateCcw className="w-3 h-3" /> Reset Sample
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-6">
        {/* Sliders Column */}
        <div className="lg:col-span-6 space-y-6">
          {/* Slider 1: Electricity */}
          <div className="bg-white/[0.02] border border-white/[0.04] p-4 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[12px] font-mono text-white/70 flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-blue-400" /> Monthly Electricity Spend
              </span>
              <span className="text-sm font-mono text-white font-semibold">
                ₹{elecBillLakhs.toFixed(1)} Lakhs/mo
              </span>
            </div>
            <input
              type="range"
              min={2}
              max={50}
              step={0.5}
              value={elecBillLakhs}
              onChange={e => {
                setElecBillLakhs(parseFloat(e.target.value));
                sounds.hover();
              }}
              className="w-full accent-[#2D7A57] bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-[9px] font-mono text-white/30 mt-1">
              <span>₹2L (Small Workshop)</span>
              <span>₹50L (Heavy Foundry)</span>
            </div>
          </div>

          {/* Slider 2: Diesel Consumption */}
          <div className="bg-white/[0.02] border border-white/[0.04] p-4 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[12px] font-mono text-white/70 flex items-center gap-2">
                <Flame className="w-3.5 h-3.5 text-ember" /> Monthly Diesel Consumption
              </span>
              <span className="text-sm font-mono text-white font-semibold">
                {dieselLiters.toLocaleString("en-IN")} Litres/mo
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={10000}
              step={200}
              value={dieselLiters}
              onChange={e => {
                setDieselLiters(parseInt(e.target.value));
                sounds.hover();
              }}
              className="w-full accent-[#B5432C] bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-[9px] font-mono text-white/30 mt-1">
              <span>0 Litres (Grid Only)</span>
              <span>10,000 Litres (High Backup)</span>
            </div>
          </div>

          {/* Slider 3: Reduction Goal */}
          <div className="bg-white/[0.02] border border-white/[0.04] p-4 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[12px] font-mono text-white/70 flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-brass" /> Target CO₂ Reduction
              </span>
              <span className="text-sm font-mono text-white font-semibold">
                -{reductionTarget}% Target
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={60}
              step={5}
              value={reductionTarget}
              onChange={e => {
                setReductionTarget(parseInt(e.target.value));
                sounds.hover();
              }}
              className="w-full accent-[#A97A2B] bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-[9px] font-mono text-white/30 mt-1">
              <span>-10% Quick Wins</span>
              <span>-60% Deep Decarbonisation</span>
            </div>
          </div>

          {/* Interactive Fixes Checklist */}
          <div>
            <div className="text-[11px] tracking-[0.2em] uppercase font-mono text-white/50 mb-2.5">
              Available Interventions (Toggle to Recalculate):
            </div>
            <div className="space-y-2">
              {availableFixes.map(fix => {
                const active = selectedFixes[fix.id];
                return (
                  <button
                    key={fix.id}
                    onClick={() => toggleFix(fix.id)}
                    className={`w-full flex items-center justify-between p-2.5 rounded border transition-all text-left ${
                      active
                        ? "bg-leaf/10 border-leaf/40 text-white"
                        : "bg-white/[0.01] border-white/[0.05] text-white/40 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                          active ? "bg-leaf border-leaf text-white" : "border-white/20"
                        }`}
                      >
                        {active && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <span className="text-xs font-medium">{fix.name}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/50">
                        {fix.scope}
                      </span>
                    </div>
                    <div className="text-right font-mono text-[11px]">
                      <span className="text-leaf">+{fix.cutTco2} tCO₂</span>
                      <span className="text-white/30 mx-1.5">|</span>
                      <span className="text-brass">₹{fix.annualSavings}L/yr</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Real-Time Calculated ROI Results Column */}
        <div className="lg:col-span-6 flex flex-col justify-between bg-black/40 border border-white/[0.06] p-6 rounded-xl relative">
          <Corners color="bg-white/10" />

          <div>
            <div className="text-[10px] tracking-[0.25em] uppercase font-mono text-white/40 mb-4">
              DETERMINISTIC SIMULATION REPORT
            </div>

            {/* Top Scorecard Grid */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white/[0.02] border border-white/[0.05] p-3.5 rounded">
                <div className="text-[10px] uppercase font-mono text-white/40 mb-1">Baseline Emissions</div>
                <div className="text-2xl font-light text-white tabular-nums">
                  {Math.round(totalBaselineTco2)} <span className="text-xs text-white/40">tCO₂e/yr</span>
                </div>
              </div>
              <div className="bg-white/[0.02] border border-white/[0.05] p-3.5 rounded">
                <div className="text-[10px] uppercase font-mono text-white/40 mb-1">CO₂ Cut Achieved</div>
                <div className="text-2xl font-light text-leaf tabular-nums">
                  -{achievedReductionPct.toFixed(1)}%{" "}
                  <span className="text-xs text-leaf/60">({Math.round(totalCutTco2)} t)</span>
                </div>
              </div>
              <div className="bg-white/[0.02] border border-white/[0.05] p-3.5 rounded">
                <div className="text-[10px] uppercase font-mono text-white/40 mb-1">Capital Expenditure</div>
                <div className="text-2xl font-light text-brass tabular-nums">
                  ₹{totalCapex.toFixed(1)} <span className="text-xs text-brass/60">Lakhs</span>
                </div>
              </div>
              <div className="bg-white/[0.02] border border-white/[0.05] p-3.5 rounded">
                <div className="text-[10px] uppercase font-mono text-white/40 mb-1">Simple Payback</div>
                <div className="text-2xl font-light text-blue-300 tabular-nums">
                  {paybackMonths} <span className="text-xs text-blue-300/60">Months</span>
                </div>
              </div>
            </div>

            {/* Target Gauge Progress Bar */}
            <div className="mb-6">
              <div className="flex justify-between text-xs font-mono mb-1.5">
                <span className="text-white/60">Reduction Target Progress:</span>
                <span
                  className={`font-semibold ${
                    achievedReductionPct >= reductionTarget ? "text-leaf" : "text-ember"
                  }`}
                >
                  {achievedReductionPct.toFixed(0)}% / {reductionTarget}% Target{" "}
                  {achievedReductionPct >= reductionTarget ? "[MET]" : "[GAP DETECTED]"}
                </span>
              </div>
              <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden border border-white/10 p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-leaf via-brass to-leaf rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (achievedReductionPct / reductionTarget) * 100)}%`
                  }}
                />
              </div>
            </div>

            {/* Annual Savings Highlight Box */}
            <div className="bg-gradient-to-r from-leaf/10 via-brass/5 to-transparent border border-leaf/30 p-4 rounded-lg flex items-center justify-between">
              <div>
                <div className="text-[10px] font-mono uppercase text-leaf tracking-wider">
                  Net Annual Operating Savings
                </div>
                <div className="text-xl md:text-2xl font-semibold text-white mt-0.5">
                  ₹{totalAnnualSavings.toFixed(2)} Lakhs <span className="text-xs font-normal text-white/50">/ year</span>
                </div>
              </div>
              <Link
                to="/login"
                className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider bg-leaf hover:bg-leaf-light text-white px-4 py-2 rounded transition-colors"
              >
                Generate Plan <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          <div className="text-[10px] font-mono text-white/30 pt-4 border-t border-white/[0.04] mt-4 flex items-center justify-between">
            <span>Traceability: CEA v20.0 &amp; IPCC Guidelines</span>
            <span>Deterministic Math • No LLM Hal</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   INTERACTIVE COMPONENT 2:
   FACTORY FLOORPLAN HOTSPOT LEAK FINDER
   (Interactive 3D/Isometric Leak Map)
   ═══════════════════════════════════════════ */
function InteractiveHotspotFinder() {
  const [activeZone, setActiveZone] = useState<number>(0);
  const [fixedZones, setFixedZones] = useState<{ [key: number]: boolean }>({});

  const zones = [
    {
      id: 0,
      title: "Boiler & Furnace Flue Stack",
      category: "Scope 1 Thermal Leak",
      leakTco2: 184,
      dailyLossInr: 2840,
      formula: "12,400 kg Fuel Oil × 3.12 kgCO₂/kg = 38.6 tCO₂/mo",
      rootCause: "High exhaust gas temperature (280°C) with unrecovered sensible heat.",
      fix: "Install Waste Heat Recuperator + Air Preheater to lower stack to 140°C.",
      roi: "₹9.2 Lakhs Capex • 11.2 Months Payback",
      badgeColor: "text-ember border-ember/40 bg-ember/10"
    },
    {
      id: 1,
      title: "Compressed Air Ring-Main",
      category: "Scope 2 Auxiliary Leak",
      leakTco2: 52,
      dailyLossInr: 1220,
      formula: "145 kWh/day line loss × 0.716 kgCO₂/kWh = 38 tCO₂/yr",
      rootCause: "Multiple 3mm orifice fittings leaking at 7.2 bar manifold pressure.",
      fix: "Ultrasonic acoustic leak detection + automatic isolation solenoid valves.",
      roi: "₹1.4 Lakhs Capex • 3.2 Months Payback",
      badgeColor: "text-brass border-brass/40 bg-brass/10"
    },
    {
      id: 2,
      title: "Diesel Generator Peak Shaving",
      category: "Scope 1 Backup Leak",
      leakTco2: 110,
      dailyLossInr: 3400,
      formula: "3,200 L HSD/mo × 2.68 kgCO₂/L = 8.57 tCO₂/mo",
      rootCause: "Running 250 kVA DG set during peak tariff hours (18:00–22:00).",
      fix: "Shift to Grid TOD tariff optimization + 50 kWh Battery Energy Storage (BESS).",
      roi: "₹16.5 Lakhs Capex • 16 Months Payback",
      badgeColor: "text-ember border-ember/40 bg-ember/10"
    },
    {
      id: 3,
      title: "Induction Motor Drive Line",
      category: "Scope 2 Mechanical Leak",
      leakTco2: 74,
      dailyLossInr: 1650,
      formula: "45 kW Motor running at 48% load factor with throttling valve friction.",
      rootCause: "Oversized legacy IE1 motors with mechanical damper throttling.",
      fix: "Direct retrofit with IE4 Super-Premium motors & Closed-loop VFDs.",
      roi: "₹5.8 Lakhs Capex • 13 Months Payback",
      badgeColor: "text-blue-400 border-blue-400/40 bg-blue-400/10"
    },
    {
      id: 4,
      title: "Shed Rooftop Solar Opportunity",
      category: "Scope 2 Decarbonisation",
      leakTco2: 240,
      dailyLossInr: 4500,
      formula: "1,200 m² unused shed area = 150 kWp Rooftop Solar capacity",
      rootCause: "Zero onsite renewable generation; 100% reliant on grid fossil mix.",
      fix: "150 kWp Grid-tied Onsite Solar PV with Net Metering.",
      roi: "₹62 Lakhs Capex • 38 Months Payback • 25 Year Asset",
      badgeColor: "text-leaf border-leaf/40 bg-leaf/10"
    }
  ];

  const toggleFixZone = (id: number) => {
    sounds.ping();
    setFixedZones(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const cur = zones[activeZone];
  const isFixed = !!fixedZones[cur.id];

  return (
    <div className="relative border border-white/[0.08] bg-[#0c101a]/80 backdrop-blur-xl p-6 md:p-8 rounded-xl shadow-2xl">
      <Corners color="bg-ember/40" />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6 pb-4 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Crosshair className="w-4 h-4 text-ember animate-spin-slow" />
            <span className="text-[10px] tracking-[0.25em] uppercase font-mono text-ember">
              HOTSPOT INSPECTOR // LEAK MAPPING
            </span>
          </div>
          <h3 className="text-xl md:text-2xl font-light text-white">
            Factory Leak-Point Diagnostic Map
          </h3>
        </div>
        <span className="text-xs font-mono text-white/40">
          Click zones to inspect physics &amp; formula
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Visual Interactive Factory Schematic Layout */}
        <div className="lg:col-span-7 bg-black/60 border border-white/[0.06] rounded-xl p-5 relative overflow-hidden min-h-[360px] flex flex-col justify-between">
          {/* Blueprint grid lines */}
          <div
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)",
              backgroundSize: "32px 32px"
            }}
          />

          <div className="flex justify-between items-center z-10 text-[10px] font-mono text-white/40">
            <span>FACTORY LAYOUT: RAJKOT ENGINEERING CLUSTER</span>
            <span>GRID REF: 22.3039° N, 70.8022° E</span>
          </div>

          {/* Interactive Clickable Nodes on Floorplan */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-4 z-10">
            {zones.map(z => {
              const selected = activeZone === z.id;
              const fixed = fixedZones[z.id];
              return (
                <button
                  key={z.id}
                  onClick={() => {
                    sounds.click();
                    setActiveZone(z.id);
                  }}
                  className={`p-3.5 rounded-lg border text-left transition-all relative overflow-hidden group ${
                    selected
                      ? "border-white/40 bg-white/[0.08] shadow-lg"
                      : "border-white/[0.06] bg-black/40 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-mono text-white/40">ZONE 0{z.id + 1}</span>
                    <span
                      className={`w-2.5 h-2.5 rounded-full transition-all ${
                        fixed
                          ? "bg-leaf animate-none"
                          : selected
                          ? "bg-ember animate-ping"
                          : "bg-ember/60"
                      }`}
                    />
                  </div>
                  <div className="text-xs font-medium text-white line-clamp-1 mb-1">{z.title}</div>
                  <div className="text-[11px] font-mono text-white/60">
                    {fixed ? (
                      <span className="text-leaf flex items-center gap-1">
                        <Check className="w-3 h-3" /> RESOLVED
                      </span>
                    ) : (
                      <span className="text-ember">+{z.leakTco2} tCO₂/yr</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Bottom telemetry line */}
          <div className="z-10 flex items-center justify-between text-[10px] font-mono text-white/30 pt-2 border-t border-white/[0.06]">
            <span>Sensors Active: 5/5</span>
            <span>Total Identified Leaks: 658 tCO₂e/yr</span>
          </div>
        </div>

        {/* Diagnostic Panel for Active Zone */}
        <div className="lg:col-span-5 bg-white/[0.02] border border-white/[0.06] p-5 rounded-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${cur.badgeColor}`}>
                {cur.category}
              </span>
              <span className="text-[11px] font-mono text-ember font-semibold">
                Loss: ₹{cur.dailyLossInr}/day
              </span>
            </div>

            <h4 className="text-lg font-light text-white mb-2">{cur.title}</h4>

            <div className="space-y-3.5 my-4">
              <div className="bg-black/40 p-3 rounded border border-white/[0.04]">
                <div className="text-[9px] font-mono uppercase text-white/40 mb-1">Traceable Formula</div>
                <div className="text-xs font-mono text-brass">{cur.formula}</div>
              </div>

              <div>
                <div className="text-[10px] font-mono uppercase text-white/40 mb-1">Root Cause Detection</div>
                <p className="text-xs text-white/70 font-light leading-relaxed">{cur.rootCause}</p>
              </div>

              <div>
                <div className="text-[10px] font-mono uppercase text-white/40 mb-1">Recommended Fix</div>
                <p className="text-xs text-leaf font-light leading-relaxed">{cur.fix}</p>
              </div>

              <div className="bg-white/[0.03] p-3 rounded border border-white/[0.04]">
                <div className="text-[9px] font-mono uppercase text-white/40 mb-1">Capital &amp; Payback</div>
                <div className="text-xs font-mono text-white">{cur.roi}</div>
              </div>
            </div>
          </div>

          <button
            onClick={() => toggleFixZone(cur.id)}
            className={`w-full py-2.5 px-4 rounded text-xs font-mono uppercase tracking-wider font-semibold transition-all flex items-center justify-center gap-2 ${
              isFixed
                ? "bg-leaf/20 border border-leaf text-leaf hover:bg-leaf/30"
                : "bg-ember hover:bg-ember-light text-white"
            }`}
          >
            {isFixed ? (
              <>
                <CheckCircle2 className="w-4 h-4" /> Leak Mitigated in Simulation (Click to Undo)
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" /> Simulate Fix &amp; Recalculate
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   INTERACTIVE COMPONENT 3:
   EMISSION FACTOR SEARCH & CONVERTER SANDBOX
   ═══════════════════════════════════════════ */
function InteractiveFactorExplorer() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFactorId, setSelectedFactorId] = useState("elec");
  const [inputQuantity, setInputQuantity] = useState<number>(5000);

  const factors = [
    {
      id: "elec",
      name: "CEA Indian Grid (WR)",
      fuel: "Electricity",
      value: 0.716,
      unit: "kgCO₂e / kWh",
      source: "CEA CO2 Baseline Database v20.0 (2024)",
      verified: true
    },
    {
      id: "diesel",
      name: "Diesel / High Speed Diesel (HSD)",
      fuel: "Stationary Fuel",
      value: 2.68,
      unit: "kgCO₂e / Litre",
      source: "IPCC 2006 Guidelines Vol 2 Table 2.2",
      verified: true
    },
    {
      id: "gas",
      name: "Natural Gas (PNG)",
      fuel: "Piped Gas",
      value: 1.92,
      unit: "kgCO₂e / m³",
      source: "CEA / BEE Standard Thermal Conversion",
      verified: true
    },
    {
      id: "coal",
      name: "Non-Coking Coal Grade G11",
      fuel: "Solid Fuel",
      value: 1.85,
      unit: "kgCO₂e / kg",
      source: "Ministry of Coal & IPCC Guidelines",
      verified: true
    },
    {
      id: "biomass",
      name: "Agro-Waste Biomass Briquettes",
      fuel: "Renewable Biofuel",
      value: 0.05,
      unit: "kgCO₂e / kg (Net biogenic)",
      source: "BEE Energy Conservation Norms",
      verified: true
    }
  ];

  const filtered = factors.filter(
    f =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.fuel.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeFactor = factors.find(f => f.id === selectedFactorId) || factors[0];
  const calculatedEmissionsKg = inputQuantity * activeFactor.value;
  const calculatedEmissionsTons = calculatedEmissionsKg / 1000;

  return (
    <div className="border border-white/[0.06] bg-black/40 backdrop-blur-xl p-6 rounded-xl relative">
      <Corners color="bg-brass/30" />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Server className="w-4 h-4 text-brass" />
            <span className="text-[10px] tracking-[0.25em] uppercase font-mono text-brass">
              TRACEABILITY ENGINE // PINT UNIT CONVERTER
            </span>
          </div>
          <h3 className="text-xl font-light text-white">Verified Emission Factor Database</h3>
        </div>

        {/* Search input */}
        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="Filter factors..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/10 rounded pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-brass/50 font-mono"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Factor list */}
        <div className="lg:col-span-7 space-y-2">
          {filtered.map(f => (
            <button
              key={f.id}
              onClick={() => {
                sounds.hover();
                setSelectedFactorId(f.id);
              }}
              className={`w-full p-3 rounded border text-left transition-all flex items-center justify-between ${
                selectedFactorId === f.id
                  ? "bg-brass/10 border-brass/40 text-white"
                  : "bg-white/[0.01] border-white/[0.04] text-white/60 hover:border-white/15"
              }`}
            >
              <div>
                <div className="text-xs font-medium text-white flex items-center gap-2">
                  {f.name}
                  {f.verified && (
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-leaf/20 text-leaf border border-leaf/30">
                      verified
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-mono text-white/40 mt-0.5">{f.source}</div>
              </div>
              <div className="text-right font-mono">
                <div className="text-xs font-semibold text-brass">{f.value}</div>
                <div className="text-[9px] text-white/40">{f.unit}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Instant Sandbox Calculator */}
        <div className="lg:col-span-5 bg-white/[0.02] border border-white/[0.05] p-5 rounded-lg flex flex-col justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase text-white/40 mb-3">
              LIVE UNIT CONVERSION CALCULATOR
            </div>
            <div className="text-sm font-medium text-white mb-2">{activeFactor.name}</div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-mono uppercase text-white/50 block mb-1">
                  Enter Consumed Quantity:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={inputQuantity}
                    onChange={e => setInputQuantity(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full bg-black/60 border border-white/10 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-leaf"
                  />
                  <span className="text-xs font-mono text-white/40 whitespace-nowrap">
                    {activeFactor.unit.split("/")[1] || "Units"}
                  </span>
                </div>
              </div>

              {/* Conversion Output */}
              <div className="bg-black/50 p-3.5 rounded border border-white/[0.06] space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-white/40">Math Equation:</span>
                  <span className="text-white/70">
                    {inputQuantity.toLocaleString()} × {activeFactor.value}
                  </span>
                </div>
                <div className="flex justify-between items-baseline pt-2 border-t border-white/[0.06]">
                  <span className="text-xs font-mono text-white/60">Total Emissions:</span>
                  <div className="text-right">
                    <span className="text-xl font-mono font-bold text-leaf">
                      {calculatedEmissionsTons.toFixed(2)}
                    </span>
                    <span className="text-xs text-white/40 ml-1">tCO₂e</span>
                    <div className="text-[10px] font-mono text-white/40">
                      ({calculatedEmissionsKg.toLocaleString()} kgCO₂e)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="text-[9px] font-mono text-white/30 pt-3 border-t border-white/[0.04] mt-3">
            Source Version: 2026.04 • Stored in PostgreSQL with RLS
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   HERO CLUSTER SWITCHER & TELEMETRY STRIP
   ═══════════════════════════════════════════ */
function HeroClusterBar({
  currentCluster,
  setCluster
}: {
  currentCluster: string;
  setCluster: (c: string) => void;
}) {
  const clusters = [
    { id: "rajkot", label: "Rajkot Forging", baselineTco2: 847, gridIntensity: 716 },
    { id: "jamnagar", label: "Jamnagar Brass", baselineTco2: 612, gridIntensity: 712 },
    { id: "surat", label: "Surat Textiles", baselineTco2: 1240, gridIntensity: 720 },
    { id: "peenya", label: "Peenya CNC & Machining", baselineTco2: 430, gridIntensity: 698 },
    { id: "vapi", label: "Vapi Chemical Processing", baselineTco2: 1890, gridIntensity: 718 }
  ];

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 my-5 z-20">
      <span className="text-[10px] font-mono uppercase text-white/30 mr-2 flex items-center gap-1.5">
        <Factory className="w-3 h-3 text-leaf" /> INDUSTRIAL CLUSTERS:
      </span>
      {clusters.map(c => (
        <button
          key={c.id}
          onClick={() => {
            sounds.click();
            setCluster(c.id);
          }}
          className={`text-[11px] font-mono px-3 py-1 rounded transition-all flex items-center gap-1.5 ${
            currentCluster === c.id
              ? "bg-leaf/20 border border-leaf text-white font-medium shadow-[0_0_15px_rgba(45,122,87,0.3)]"
              : "bg-white/[0.03] border border-white/[0.06] text-white/40 hover:text-white hover:border-white/20"
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════
   HERO 3D FLOATING HUD WIDGETS
   (Flanks the hero title so it NEVER feels empty)
   ══════════════════════════════════════ */
function HeroTelemetrySidebars() {
  return (
    <>
      {/* Left HUD Panel */}
      <div className="hidden lg:flex flex-col gap-3 absolute left-6 xl:left-12 top-1/2 -translate-y-1/2 z-10 w-64 pointer-events-none">
        <div className="border border-white/[0.08] bg-[#0c101a]/80 backdrop-blur-md p-4 rounded-lg relative overflow-hidden">
          <Corners color="bg-blue-400/40" />
          <div className="flex items-center justify-between text-[10px] font-mono text-white/40 mb-2">
            <span className="flex items-center gap-1 text-blue-400">
              <Radio className="w-3 h-3 animate-pulse" /> LIVE TELEMETRY
            </span>
            <span>WR-GRID</span>
          </div>
          <div className="text-xl font-mono text-white font-light mb-1">
            716.2 <span className="text-xs text-white/40">gCO₂/kWh</span>
          </div>
          <div className="text-[10px] text-white/40 font-mono">
            CEA Central Grid v20.0 • Coal &amp; Gas weighted
          </div>
          {/* Animated visual waveform */}
          <div className="mt-3 flex items-end gap-1 h-6">
            {[40, 65, 30, 85, 90, 45, 60, 75, 50, 95, 80, 40].map((h, i) => (
              <div
                key={i}
                className="flex-1 bg-blue-400/30 rounded-t"
                style={{
                  height: `${h}%`,
                  animation: `pulse 1.8s ease-in-out infinite ${i * 0.1}s`
                }}
              />
            ))}
          </div>
        </div>

        <div className="border border-white/[0.08] bg-[#0c101a]/80 backdrop-blur-md p-4 rounded-lg relative">
          <Corners color="bg-leaf/40" />
          <div className="text-[10px] font-mono text-leaf uppercase mb-1">AUDIT PIPELINE STATUS</div>
          <div className="text-sm font-mono text-white">OR-TOOLS 9.8 READY</div>
          <div className="text-[10px] text-white/40 font-mono mt-0.5">Solve time: ~0.45s for 15 fixes</div>
        </div>
      </div>

      {/* Right HUD Panel */}
      <div className="hidden lg:flex flex-col gap-3 absolute right-6 xl:right-12 top-1/2 -translate-y-1/2 z-10 w-64 pointer-events-none">
        <div className="border border-white/[0.08] bg-[#0c101a]/80 backdrop-blur-md p-4 rounded-lg relative overflow-hidden">
          <Corners color="bg-ember/40" />
          <div className="flex items-center justify-between text-[10px] font-mono text-white/40 mb-2">
            <span className="flex items-center gap-1 text-ember">
              <Activity className="w-3 h-3" /> HOTSPOT RANKING
            </span>
            <span>TOP LEAKS</span>
          </div>
          <div className="space-y-2 mt-1">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-white/80">01. Boiler Exhaust</span>
              <span className="text-ember font-medium">42% CO₂</span>
            </div>
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-white/80">02. Diesel Peak DG</span>
              <span className="text-brass font-medium">28% CO₂</span>
            </div>
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-white/80">03. Air Compressors</span>
              <span className="text-blue-300 font-medium">18% CO₂</span>
            </div>
          </div>
        </div>

        <div className="border border-white/[0.08] bg-[#0c101a]/80 backdrop-blur-md p-4 rounded-lg relative">
          <Corners color="bg-brass/40" />
          <div className="text-[10px] font-mono text-brass uppercase mb-1">ESTIMATED INDIAN ROI</div>
          <div className="text-sm font-mono text-white">₹14.2 LAKHS / YR</div>
          <div className="text-[10px] text-white/40 font-mono mt-0.5">Avg payback: 13.8 Months</div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════
   ANIMATED COUNTER WITH THOUSAND SEPARATORS
   ═══════════════════════════════════════════ */
function AnimatedCounter({
  target,
  suffix = "",
  label,
  icon: Icon
}: {
  target: number;
  suffix?: string;
  label: string;
  icon: React.FC<{ className?: string }>;
}) {
  const { ref, isVisible } = useReveal(0.2);
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!isVisible) return;
    const start = performance.now();
    const duration = 1800;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setVal(Math.floor(target * ease));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [isVisible, target]);

  return (
    <div
      ref={ref}
      className="p-5 border border-white/[0.06] bg-white/[0.01] rounded-lg hover:border-white/20 transition-all group cursor-default"
    >
      <div className="flex items-center justify-between mb-2">
        <Icon className="w-4 h-4 text-white/40 group-hover:text-leaf transition-colors" />
        <span className="text-[9px] font-mono uppercase tracking-widest text-white/25">VERIFIED</span>
      </div>
      <div className="text-2xl md:text-3xl font-light text-white font-mono tabular-nums group-hover:text-white transition-colors">
        {val.toLocaleString("en-IN")}
        <span className="text-lg text-white/50">{suffix}</span>
      </div>
      <div className="text-[11px] font-mono uppercase text-white/40 mt-1 tracking-wider">{label}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN LANDING COMPONENT
   ═══════════════════════════════════════════ */
export function Landing() {
  useLenis();
  const [scrollProgress, setScrollProgress] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [currentCluster, setCurrentCluster] = useState("rajkot");

  // Track scroll smoothly for reactor & satellites
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const totalH = document.documentElement.scrollHeight - window.innerHeight;
          const current = totalH > 0 ? window.scrollY / totalH : 0;
          setScrollProgress(current);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const toggleSound = () => {
    sounds.enabled = !soundEnabled;
    setSoundEnabled(!soundEnabled);
    if (!soundEnabled) sounds.ping();
  };

  const navigate = useNavigate();
  const launchJamnagarDemo = () => {
    sounds.ping();
    const DEV_TOKEN =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZW1haWwiOiJvd25lckBqYW1uYWdhcmJyYXNzLmNvbSJ9.eS12sK2y2X-86M-64jH_9k_9p17YJ_Ovd90E3YfX6iY";
    localStorage.setItem("decarbo_dev_token", DEV_TOKEN);
    navigate("/dashboard");
  };

  return (
    <div className="relative min-h-screen bg-[#07090e] text-white overflow-x-hidden selection:bg-leaf/30 selection:text-white">
      {/* ─── Background FX ─── */}
      <InteractiveParticleField />

      {/* Grid line blueprint overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-[1]"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
          backgroundSize: "70px 70px"
        }}
      />

      {/* ─── Traveling Hero Core & Satellites (Smooth Continuity Across All Sections) ─── */}
      <TravelingCarbonReactor scrollProgress={scrollProgress} />
      <TravelingSatellites scrollProgress={scrollProgress} />
      <QuantumScrollTracker scrollProgress={scrollProgress} />

      {/* ════════════ FIXED NAVBAR ════════════ */}
      <header className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 md:px-12 py-4 bg-[#07090e]/80 backdrop-blur-xl border-b border-white/[0.05]">
        <div className="flex items-center gap-6">
          <Link
            to="/"
            onClick={() => sounds.click()}
            className="flex items-center gap-3 text-sm tracking-[0.35em] uppercase font-bold text-white group"
          >
            <DecarboLogo size={26} withGlow={true} />
            <span className="font-mono"><span className="text-leaf">DE</span>CARBO</span>
          </Link>
          <span className="text-[10px] font-mono tracking-widest text-white/30 hidden md:inline border-l border-white/10 pl-4">
            PS10 • SME FACTORY DECARBONISATION PLANNER
          </span>
        </div>

        <nav className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-6">
            <a
              href="#simulator"
              onClick={() => sounds.click()}
              className="text-[11px] tracking-[0.2em] uppercase text-white/40 hover:text-white transition-colors"
            >
              Simulator
            </a>
            <a
              href="#solution"
              onClick={() => sounds.click()}
              className="text-[11px] tracking-[0.2em] uppercase text-white/40 hover:text-white transition-colors"
            >
              Solution
            </a>
            <a
              href="#hotspots"
              onClick={() => sounds.click()}
              className="text-[11px] tracking-[0.2em] uppercase text-white/40 hover:text-white transition-colors"
            >
              Hotspots
            </a>
            <a
              href="#process"
              onClick={() => sounds.click()}
              className="text-[11px] tracking-[0.2em] uppercase text-white/40 hover:text-white transition-colors"
            >
              Pipeline
            </a>
          </div>

          {/* Sound Synthesizer Toggle */}
          <button
            onClick={toggleSound}
            title={soundEnabled ? "Mute audio feedback" : "Enable sci-fi audio feedback"}
            className={`p-2 rounded border transition-colors ${
              soundEnabled
                ? "bg-leaf/20 border-leaf text-leaf"
                : "bg-white/[0.03] border-white/10 text-white/40 hover:text-white"
            }`}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={launchJamnagarDemo}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded border border-leaf/40 bg-leaf/15 hover:bg-leaf/25 text-leaf text-[11px] font-mono uppercase tracking-wider font-semibold transition-all shadow-[0_0_15px_rgba(45,122,87,0.25)]"
          >
            <Sparkles className="w-3.5 h-3.5 text-leaf" />
            <span className="hidden sm:inline">Jamnagar</span> Demo
          </button>

          <Link
            to="/login"
            onClick={() => sounds.click()}
            className="text-[11px] tracking-[0.2em] uppercase px-5 py-2 rounded btn-white-solid font-bold transition-all shadow-[0_0_20px_rgba(255,255,255,0.3)]"
          >
            Launch Terminal
          </Link>
        </nav>
      </header>

      {/* ════════════ SECTION 1: HERO ════════════ */}
      <section
        id="hero"
        className="relative min-h-screen flex flex-col items-center justify-center pt-24 pb-16 px-6 z-10"
      >
        {/* Top Status HUD Badge */}
        <div className="flex items-center gap-3 px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.02] backdrop-blur-md mb-6 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-leaf" />
          <span className="text-[10px] font-mono tracking-widest text-white/60 uppercase">
            OR-TOOLS 9.8 OPTIMIZER • CEA 2024 EMISSION FACTORS LOADED
          </span>
        </div>

        {/* Cluster Switcher Pills */}
        <HeroClusterBar currentCluster={currentCluster} setCluster={setCurrentCluster} />

        {/* Hero Flanking Telemetry HUD Sidebars */}
        <HeroTelemetrySidebars />

        {/* Hero Headline (Flanking the central traveling 3D Carbon Orb) */}
        <div className="w-full max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 my-8 z-20">
          <div className="text-center md:text-right flex-1">
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extralight tracking-tight text-white leading-[1.05]">
              FINDING
            </h1>
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-serif italic text-white/40 tracking-normal mt-1">
              Leak Points
            </h2>
          </div>

          {/* Reserved space for the traveling 3D canvas orb in center */}
          <div className="w-64 h-64 md:w-80 md:h-80 flex-shrink-0 pointer-events-none" />

          <div className="text-center md:text-left flex-1">
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extralight tracking-tight text-white leading-[1.05]">
              CUTTING
            </h1>
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-serif italic text-leaf tracking-normal mt-1">
              Emissions
            </h2>
          </div>
        </div>

        {/* Subtitle & Mission Statement */}
        <p className="max-w-2xl text-center text-sm md:text-base font-light text-white/50 leading-relaxed mb-8 z-20">
          Decarbo turns electricity bills and purchase data into an auditable carbon breakdown and a
          costed decarbonisation roadmap for Indian factories.{" "}
          <span className="text-white/80">
            No guesswork, no consultants, 100% mathematically grounded.
          </span>
        </p>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4 z-20">
          <button
            onClick={launchJamnagarDemo}
            className="flex items-center gap-2.5 px-7 py-3 rounded border border-leaf/40 bg-leaf/15 hover:bg-leaf/25 text-white text-xs font-mono uppercase tracking-wider font-semibold transition-all shadow-[0_0_30px_rgba(45,122,87,0.3)] group"
          >
            <Sparkles className="w-4 h-4 text-leaf group-hover:scale-110 transition-transform" />
            <span>Explore Jamnagar Demo Unit</span>
          </button>
          <Link
            to="/login"
            onClick={() => sounds.click()}
            className="flex items-center gap-2.5 px-6 py-3 rounded bg-leaf hover:bg-leaf-light text-white text-xs font-mono uppercase tracking-wider font-semibold transition-all shadow-[0_0_20px_rgba(45,122,87,0.2)]"
          >
            Start Factory Audit <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="#simulator"
            onClick={() => sounds.click()}
            className="flex items-center gap-2 px-6 py-3 rounded border border-white/15 bg-white/[0.02] hover:bg-white/[0.08] text-white text-xs font-mono uppercase tracking-wider transition-all"
          >
            <Sliders className="w-4 h-4 text-leaf" /> Test Live Simulator
          </a>
        </div>

        {/* Bottom scroll hint */}
        <div className="absolute bottom-6 flex flex-col items-center gap-1.5 text-white/30 text-[10px] font-mono tracking-widest uppercase animate-bounce">
          <span>Scroll to explore</span>
          <ChevronDown className="w-3.5 h-3.5" />
        </div>
      </section>

      {/* ════════════ SECTION 2: VERIFIED METRICS BAND ════════════ */}
      <section className="relative z-10 py-12 border-y border-white/[0.06] bg-[#0c101a]/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          <AnimatedCounter
            target={716}
            suffix=" g"
            label="CO₂ per kWh (CEA Indian Grid)"
            icon={Zap}
          />
          <AnimatedCounter
            target={42}
            suffix="%"
            label="Average Scope 1 Diesel Share"
            icon={Flame}
          />
          <AnimatedCounter
            target={14}
            suffix=" Mo"
            label="Typical Intervention Payback"
            icon={Coins}
          />
          <AnimatedCounter
            target={34}
            suffix="%"
            label="Average Factory CO₂ Reduction"
            icon={TrendingDown}
          />
        </div>
      </section>

      {/* ════════════ SECTION 3: INTERACTIVE SIMULATOR PLAYGROUND ════════════ */}
      <section id="simulator" className="relative z-10 py-24 px-6 max-w-6xl mx-auto">
        <div className="mb-10 text-center md:text-left">
          <div className="flex items-center justify-center md:justify-start gap-2 text-[10px] font-mono tracking-[0.25em] text-leaf uppercase mb-2">
            <Atom className="w-4 h-4 text-leaf animate-spin-slow" /> STAGE 01 // HANDS-ON TEST BENCH
          </div>
          <h2 className="text-3xl md:text-5xl font-extralight tracking-tight text-white">
            Simulate Your Factory’s <span className="font-serif italic text-leaf">Carbon &amp; ROI</span>
          </h2>
          <p className="text-sm text-white/40 max-w-xl mt-2">
            Drag the sliders to see how your factory’s electricity bills and diesel usage compound into
            carbon emissions — and test real interventions with live ₹ payback.
          </p>
        </div>

        <InteractiveRoiSimulator />
      </section>

      {/* ════════════ SECTION 4: THE SOLUTION ARCHITECTURE ════════════ */}
      <section id="solution" className="relative z-10 py-24 px-6 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <div className="flex items-center gap-2 text-[10px] font-mono tracking-[0.25em] text-brass uppercase mb-2">
              <ShieldCheck className="w-4 h-4 text-brass" /> STAGE 02 // ARCHITECTURE
            </div>
            <h2 className="text-3xl md:text-5xl font-extralight tracking-tight text-white">
              Deterministic Engine. <span className="font-serif italic text-brass">Zero Hallucinations.</span>
            </h2>
            <p className="text-sm text-white/40 max-w-xl mt-2">
              The LLM never calculates or invents numbers. All calculations are executed by our Python
              engine with Pint canonical units and OR-Tools linear programming.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <TiltCard glowColor="rgba(56, 189, 248, 0.15)">
              <div className="border border-white/[0.06] bg-[#0c101a]/80 p-6 rounded-xl h-full flex flex-col justify-between">
                <Corners color="bg-blue-400/30" />
                <div>
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4 text-blue-400">
                    <FileText className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-light text-white mb-2">Pint Unit Conversion</h3>
                  <p className="text-xs text-white/40 leading-relaxed font-light">
                    Every invoice line item (litres, gallons, kWh, tonnes, BTU) is converted through Pint into
                    canonical SI units before multiplying with verified emission factors.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-white/[0.04] text-[10px] font-mono text-blue-300">
                  Strict Dimensional Analysis
                </div>
              </div>
            </TiltCard>

            <TiltCard glowColor="rgba(45, 122, 87, 0.15)">
              <div className="border border-white/[0.06] bg-[#0c101a]/80 p-6 rounded-xl h-full flex flex-col justify-between">
                <Corners color="bg-leaf/30" />
                <div>
                  <div className="w-10 h-10 rounded-lg bg-leaf/10 border border-leaf/20 flex items-center justify-center mb-4 text-leaf">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-light text-white mb-2">OR-Tools Optimizer</h3>
                  <p className="text-xs text-white/40 leading-relaxed font-light">
                    Google OR-Tools branch-and-bound solver identifies the Pareto frontier: the exact set of
                    energy efficiency and renewable fixes that maximize CO₂ cut for your budget.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-white/[0.04] text-[10px] font-mono text-leaf">
                  Mixed-Integer Programming
                </div>
              </div>
            </TiltCard>

            <TiltCard glowColor="rgba(181, 67, 44, 0.15)">
              <div className="border border-white/[0.06] bg-[#0c101a]/80 p-6 rounded-xl h-full flex flex-col justify-between">
                <Corners color="bg-ember/30" />
                <div>
                  <div className="w-10 h-10 rounded-lg bg-ember/10 border border-ember/20 flex items-center justify-center mb-4 text-ember">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-light text-white mb-2">Traceable Audit Trail</h3>
                  <p className="text-xs text-white/40 leading-relaxed font-light">
                    Every number shown in reports stores its exact provenance: bill row → unit conversion →
                    emission factor version (CEA 2024, IPCC AR6) → formula string.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-white/[0.04] text-[10px] font-mono text-ember">
                  Bank-Ready Compliance
                </div>
              </div>
            </TiltCard>
          </div>
        </div>
      </section>

      {/* ════════════ SECTION 5: INTERACTIVE HOTSPOTS MAP ════════════ */}
      <section id="hotspots" className="relative z-10 py-24 px-6 max-w-6xl mx-auto">
        <div className="mb-10 text-center md:text-left">
          <div className="flex items-center justify-center md:justify-start gap-2 text-[10px] font-mono tracking-[0.25em] text-ember uppercase mb-2">
            <Crosshair className="w-4 h-4 text-ember" /> STAGE 03 // HOTSPOT DETECTION
          </div>
          <h2 className="text-3xl md:text-5xl font-extralight tracking-tight text-white">
            Pinpoint Every <span className="font-serif italic text-ember">Leak Point</span>
          </h2>
          <p className="text-sm text-white/40 max-w-xl mt-2">
            Explore typical SME factory leak points: furnace thermal exhaust, compressed air line losses,
            peak diesel generator hours, and throttling motor valves.
          </p>
        </div>

        <InteractiveHotspotFinder />
      </section>

      {/* ════════════ SECTION 6: THE 4-STEP PIPELINE ════════════ */}
      <section id="process" className="relative z-10 py-24 px-6 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <div className="flex items-center gap-2 text-[10px] font-mono tracking-[0.25em] text-leaf uppercase mb-2">
              <Layers className="w-4 h-4 text-leaf" /> STAGE 04 // PIPELINE
            </div>
            <h2 className="text-3xl md:text-5xl font-extralight tracking-tight text-white">
              Data in. Decisions out. <span className="font-serif italic text-leaf">In 4 steps.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              {
                step: "01",
                name: "Ingest",
                desc: "Upload electricity bills, fuel invoices, or Tally CSV logs. Automatic column mapping with manual override.",
                icon: FileText
              },
              {
                step: "02",
                name: "Calculate",
                desc: "Every record mapped to CEA and IPCC factors. Full unit conversion via Pint. Deterministic formula strings stored.",
                icon: Cpu
              },
              {
                step: "03",
                name: "Plan",
                desc: "Budget-constrained OR-Tools optimizer matches interventions to your top leak points with ₹ payback periods.",
                icon: Target
              },
              {
                step: "04",
                name: "Track",
                desc: "Upload bills monthly to track real emissions against target. Automatic drift alerts if factory slips off track.",
                icon: TrendingDown
              }
            ].map(s => (
              <div
                key={s.step}
                className="border border-white/[0.06] bg-[#0c101a]/70 p-5 rounded-xl hover:border-white/20 transition-all relative"
              >
                <Corners color="bg-white/10" />
                <div className="text-[10px] font-mono text-white/30 mb-3">STEP {s.step}</div>
                <s.icon className="w-6 h-6 text-leaf mb-3" />
                <h3 className="text-lg font-light text-white mb-2">{s.name}</h3>
                <p className="text-xs text-white/40 leading-relaxed font-light">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════ SECTION 7: EMISSION FACTOR DATABASE SANDBOX ════════════ */}
      <section id="about" className="relative z-10 py-24 px-6 max-w-6xl mx-auto">
        <div className="mb-10">
          <div className="flex items-center gap-2 text-[10px] font-mono tracking-[0.25em] text-brass uppercase mb-2">
            <Server className="w-4 h-4 text-brass" /> STAGE 05 // TRANSPARENCY
          </div>
          <h2 className="text-3xl md:text-5xl font-extralight tracking-tight text-white">
            Verified Factor <span className="font-serif italic text-brass">Database &amp; Sandbox</span>
          </h2>
          <p className="text-sm text-white/40 max-w-xl mt-2">
            Test any quantity of fuel or electricity against Indian CEA and IPCC emission factors right
            now. Every calculation is completely open and inspectable.
          </p>
        </div>

        <InteractiveFactorExplorer />
      </section>

      {/* ════════════ SECTION 8: CALL TO ACTION ════════════ */}
      <section id="contact" className="relative z-10 py-28 px-6 border-t border-white/[0.06] bg-[#05070a]">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-leaf/30 bg-leaf/10 text-leaf text-xs font-mono mb-6">
            <Sparkles className="w-3.5 h-3.5" /> READY FOR HACKOUT '26 EVALUATION
          </div>

          <h2 className="text-4xl sm:text-5xl md:text-6xl font-extralight tracking-tight text-white mb-6">
            Start Your Factory’s <br />
            <span className="font-serif italic text-leaf">Carbon Transition</span>
          </h2>

          <p className="text-base text-white/50 max-w-xl mx-auto mb-10 leading-relaxed font-light">
            Upload your first bill and receive an automated carbon footprint, hotspot diagnosis, and
            OR-Tools optimized plan in under 60 seconds.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={launchJamnagarDemo}
              className="flex items-center gap-2.5 px-8 py-4 rounded border border-leaf/40 bg-leaf/20 hover:bg-leaf/30 text-white font-semibold text-xs font-mono uppercase tracking-wider transition-all shadow-[0_0_30px_rgba(45,122,87,0.3)]"
            >
              <Sparkles className="w-4 h-4 text-leaf" /> Instant Jamnagar Demo Access
            </button>
            <Link
              to="/login"
              onClick={() => sounds.click()}
              className="flex items-center gap-2.5 px-8 py-4 rounded btn-white-solid font-bold text-xs font-mono uppercase tracking-wider transition-all shadow-[0_0_40px_rgba(255,255,255,0.35)]"
            >
              Launch Terminal <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#simulator"
              onClick={() => sounds.click()}
              className="px-8 py-4 rounded border border-white/20 bg-white/[0.02] text-white text-xs font-mono uppercase tracking-wider hover:bg-white/10 transition-all"
            >
              Back to Simulator
            </a>
          </div>
        </div>
      </section>

      {/* ════════════ FOOTER ════════════ */}
      <footer className="relative z-10 py-8 px-6 md:px-12 border-t border-white/[0.04] bg-[#040608] text-xs font-mono text-white/30 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-leaf font-bold">DECARBO</span>
          <span>•</span>
          <span>SME Factory Carbon Planner</span>
          <span>•</span>
          <span>HackOut '26 PS10</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="#hero" onClick={() => sounds.click()} className="hover:text-white transition-colors">
            Top
          </a>
          <a href="#simulator" onClick={() => sounds.click()} className="hover:text-white transition-colors">
            Simulator
          </a>
          <a href="#hotspots" onClick={() => sounds.click()} className="hover:text-white transition-colors">
            Hotspots
          </a>
          <Link to="/login" onClick={() => sounds.click()} className="hover:text-white transition-colors">
            Login
          </Link>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
