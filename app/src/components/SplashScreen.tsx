import { useState, useEffect, useRef, useCallback } from 'react';
import AuthModal from './AuthModal.tsx';
import './SplashScreen.css';

interface SplashScreenProps {
  onAuthenticated: () => void;
}

export default function SplashScreen({ onAuthenticated }: SplashScreenProps) {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  // ── Aurora Canvas Animation ──
  const initAurora = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    let time = 0;

    const blobs = [
      { x: 0.3, y: 0.4, r: 350, color: [30, 50, 120], speed: 0.15 },
      { x: 0.6, y: 0.5, r: 300, color: [80, 40, 140], speed: 0.12 },
      { x: 0.5, y: 0.6, r: 280, color: [140, 60, 180], speed: 0.18 },
      { x: 0.4, y: 0.3, r: 200, color: [255, 140, 0], speed: 0.08 },
      { x: 0.7, y: 0.4, r: 220, color: [20, 60, 100], speed: 0.1 },
    ];

    function draw() {
      time += 0.003; // Slow speed ~0.3x
      const w = canvas!.width;
      const h = canvas!.height;

      // Dark base
      ctx!.fillStyle = '#0A0A0F';
      ctx!.fillRect(0, 0, w, h);

      // Draw aurora blobs
      for (const blob of blobs) {
        const bx = w * (blob.x + Math.sin(time * blob.speed * 2) * 0.15);
        const by = h * (blob.y + Math.cos(time * blob.speed * 1.5) * 0.1);
        const radius = blob.r + Math.sin(time * blob.speed) * 60;

        const gradient = ctx!.createRadialGradient(bx, by, 0, bx, by, radius);
        gradient.addColorStop(0, `rgba(${blob.color.join(',')}, 0.25)`);
        gradient.addColorStop(0.5, `rgba(${blob.color.join(',')}, 0.08)`);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');

        ctx!.fillStyle = gradient;
        ctx!.fillRect(0, 0, w, h);
      }

      // Subtle overlay noise
      ctx!.globalAlpha = 0.03;
      for (let i = 0; i < 80; i++) {
        const nx = Math.random() * w;
        const ny = Math.random() * h;
        ctx!.fillStyle = `rgba(255,255,255,${Math.random() * 0.5})`;
        ctx!.fillRect(nx, ny, 1, 1);
      }
      ctx!.globalAlpha = 1;

      animFrameRef.current = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  useEffect(() => {
    const cleanup = initAurora();
    return cleanup;
  }, [initAurora]);

  const handleOpenAuth = (mode: 'login' | 'signup') => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  return (
    <div className="splash-screen">
      <canvas ref={canvasRef} className="splash-canvas" />

      {/* ── Nav Bar ── */}
      <nav className="splash-nav">
        <div className="splash-nav-left">
          <div className="splash-logo">
            <div className="splash-logo-icon">N</div>
            <span className="splash-logo-text">Nami</span>
          </div>
        </div>
        <div className="splash-nav-center">
          <a href="#product" className="splash-nav-link">Product</a>
          <a href="#features" className="splash-nav-link">Features</a>
          <a href="#about" className="splash-nav-link">About</a>
          <a href="#pricing" className="splash-nav-link">Pricing</a>
        </div>
        <div className="splash-nav-right">
          <button
            className="splash-btn-signup"
            onClick={() => handleOpenAuth('signup')}
          >
            Sign Up
          </button>
          <button
            className="splash-btn-login"
            onClick={() => handleOpenAuth('login')}
          >
            Login
          </button>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <main className="splash-hero">
        <span className="splash-eyebrow">AI-POWERED VIDEO EDITING</span>
        <h1 className="splash-headline">Edit smarter, create faster</h1>
        <p className="splash-subtitle">
          An AI-powered desktop video editor with smart cutting, auto-subtitles,
          and intelligent scene detection.
        </p>
        <div className="splash-input-wrapper">
          <input
            type="email"
            className="splash-email-input"
            placeholder="Enter your email to get started"
          />
        </div>
        <a href="#" className="splash-cta" onClick={(e) => { e.preventDefault(); handleOpenAuth('signup'); }}>
          Get early access →
        </a>
      </main>

      {/* ── Bottom ── */}
      <div className="splash-bottom">
        <span className="splash-demo-text">Watch demo ↓</span>
      </div>

      {/* ── Auth Modal ── */}
      {showAuthModal && (
        <AuthModal
          mode={authMode}
          onClose={() => setShowAuthModal(false)}
          onAuthenticated={onAuthenticated}
          onToggleMode={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
        />
      )}
    </div>
  );
}
