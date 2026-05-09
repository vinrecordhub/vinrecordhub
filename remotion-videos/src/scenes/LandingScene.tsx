import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

const NAVY = "#0b0d1c";
const GOLD = "#d4a832";
const GOLD_DIM = "rgba(212,168,50,0.15)";

export const LandingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const logoY = interpolate(frame, [0, 20], [-30, 0], { extrapolateRight: "clamp" });

  const headlineOpacity = interpolate(frame, [15, 40], [0, 1], { extrapolateRight: "clamp" });
  const headlineY = interpolate(frame, [15, 40], [40, 0], { extrapolateRight: "clamp" });

  const subOpacity = interpolate(frame, [30, 55], [0, 1], { extrapolateRight: "clamp" });

  const inputScale = spring({ frame: frame - 45, fps, config: { damping: 14 } });
  const inputOpacity = interpolate(frame, [45, 65], [0, 1], { extrapolateRight: "clamp" });

  const ctaScale = spring({ frame: frame - 65, fps, config: { damping: 12 } });
  const ctaOpacity = interpolate(frame, [65, 85], [0, 1], { extrapolateRight: "clamp" });

  const badgeOpacity = interpolate(frame, [80, 110], [0, 1], { extrapolateRight: "clamp" });

  const overlayOpacity = interpolate(frame, [100, 130], [0, 1], { extrapolateRight: "clamp" });
  const overlayX = interpolate(frame, [100, 130], [-60, 0], { extrapolateRight: "clamp" });

  // Gentle zoom-in on VIN area from frame 140
  const zoomScale = interpolate(frame, [140, 210], [1, 1.18], { extrapolateRight: "clamp" });
  const zoomY = interpolate(frame, [140, 210], [0, -40], { extrapolateRight: "clamp" });

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: NAVY,
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(212,168,50,0.07) 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      {/* Main content zoom container */}
      <div
        style={{
          transform: `scale(${zoomScale}) translateY(${zoomY}px)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
        }}
      >
        {/* Logo */}
        <div
          style={{
            opacity: logoOpacity,
            transform: `translateY(${logoY}px)`,
            marginBottom: 32,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 32, color: GOLD }}>◈</span>
          <span
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-0.5px",
            }}
          >
            VIN<span style={{ color: GOLD }}>Record</span>Hub
          </span>
        </div>

        {/* Hero headline */}
        <div
          style={{
            opacity: headlineOpacity,
            transform: `translateY(${headlineY}px)`,
            textAlign: "center",
            maxWidth: 900,
            marginBottom: 16,
          }}
        >
          <h1
            style={{
              fontSize: 64,
              fontWeight: 800,
              color: "#ffffff",
              lineHeight: 1.1,
              margin: 0,
              letterSpacing: "-1.5px",
            }}
          >
            Every accident.{" "}
            <span style={{ color: GOLD }}>Every secret.</span>
            <br />
            Know before you buy.
          </h1>
        </div>

        {/* Subtitle */}
        <p
          style={{
            opacity: subOpacity,
            fontSize: 22,
            color: "rgba(255,255,255,0.65)",
            marginBottom: 48,
            textAlign: "center",
          }}
        >
          Instant vehicle history reports — accidents, titles, odometer & more
        </p>

        {/* VIN Input */}
        <div
          style={{
            opacity: inputOpacity,
            transform: `scale(${inputScale})`,
            width: 680,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              border: `2px solid ${GOLD}`,
              borderRadius: 10,
              overflow: "hidden",
              background: "rgba(255,255,255,0.04)",
              boxShadow: `0 0 40px rgba(212,168,50,0.25)`,
            }}
          >
            <input
              readOnly
              placeholder="Enter 17-character VIN (e.g. 1HGBH41JXMN109186)"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                padding: "18px 24px",
                fontSize: 18,
                color: "rgba(255,255,255,0.5)",
                fontFamily: "inherit",
                letterSpacing: "0.5px",
              }}
            />
          </div>
        </div>

        {/* CTA Button */}
        <div
          style={{
            opacity: ctaOpacity,
            transform: `scale(${ctaScale})`,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              background: `linear-gradient(135deg, ${GOLD} 0%, #e8b830 100%)`,
              color: "#0b0d1c",
              padding: "18px 56px",
              borderRadius: 10,
              fontSize: 20,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.3px",
              boxShadow: `0 8px 32px rgba(212,168,50,0.4)`,
            }}
          >
            Check VIN →
          </div>
        </div>

        {/* Trust badges */}
        <div
          style={{
            opacity: badgeOpacity,
            display: "flex",
            gap: 24,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {["🔒 256-bit encrypted", "⚡ Instant delivery", "✓ Money-back guarantee"].map(
            (badge) => (
              <div
                key={badge}
                style={{
                  background: GOLD_DIM,
                  border: `1px solid rgba(212,168,50,0.3)`,
                  borderRadius: 20,
                  padding: "8px 18px",
                  fontSize: 14,
                  color: "#d4a832",
                  fontWeight: 600,
                }}
              >
                {badge}
              </div>
            )
          )}
        </div>
      </div>

      {/* Step overlay */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          left: 80,
          opacity: overlayOpacity,
          transform: `translateX(${overlayX}px)`,
          background: `linear-gradient(135deg, rgba(212,168,50,0.9) 0%, rgba(232,184,48,0.9) 100%)`,
          padding: "14px 28px",
          borderRadius: 8,
          color: "#0b0d1c",
          fontWeight: 700,
          fontSize: 20,
          letterSpacing: "0.3px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        }}
      >
        Step 1: Enter your VIN
      </div>
    </div>
  );
};
