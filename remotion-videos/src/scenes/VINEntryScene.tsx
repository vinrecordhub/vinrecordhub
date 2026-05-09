import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

const NAVY = "#0b0d1c";
const GOLD = "#d4a832";

const VIN = "1HGBH41JXMN109186";
const VEHICLE = "2019 Honda Civic Sport";

export const VINEntryScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // VIN types in character by character (frames 10-80)
  const charsVisible = Math.floor(interpolate(frame, [10, 80], [0, VIN.length], { extrapolateRight: "clamp" }));
  const typedVin = VIN.slice(0, charsVisible);

  const inputGlow = interpolate(frame, [10, 80], [0, 1], { extrapolateRight: "clamp" });

  // Result card springs in at frame 100
  const resultScale = spring({ frame: frame - 100, fps, config: { damping: 14, stiffness: 120 } });
  const resultOpacity = interpolate(frame, [100, 120], [0, 1], { extrapolateRight: "clamp" });

  // Vehicle details stagger in
  const makeOpacity = interpolate(frame, [120, 145], [0, 1], { extrapolateRight: "clamp" });
  const detailsOpacity = interpolate(frame, [140, 165], [0, 1], { extrapolateRight: "clamp" });
  const historyOpacity = interpolate(frame, [155, 180], [0, 1], { extrapolateRight: "clamp" });

  // Zoom into result card
  const zoomScale = interpolate(frame, [170, 230], [1, 1.22], { extrapolateRight: "clamp" });
  const zoomY = interpolate(frame, [170, 230], [0, -50], { extrapolateRight: "clamp" });

  const overlayOpacity = interpolate(frame, [90, 115], [0, 1], { extrapolateRight: "clamp" });
  const overlayX = interpolate(frame, [90, 115], [-60, 0], { extrapolateRight: "clamp" });

  // Cursor blink
  const cursorVisible = charsVisible < VIN.length && Math.floor(frame / 8) % 2 === 0;

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
          top: "35%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(212,168,50,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          transform: `scale(${zoomScale}) translateY(${zoomY}px)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
        }}
      >
        {/* Logo small */}
        <div style={{ marginBottom: 36, opacity: 0.7, fontSize: 18, color: "#ffffff", fontWeight: 700 }}>
          VIN<span style={{ color: GOLD }}>Record</span>Hub
        </div>

        {/* VIN input */}
        <div style={{ width: 680, marginBottom: 28 }}>
          <label
            style={{
              display: "block",
              color: "rgba(255,255,255,0.6)",
              fontSize: 14,
              marginBottom: 8,
              fontWeight: 500,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
            }}
          >
            Enter VIN — get your report instantly
          </label>
          <div
            style={{
              display: "flex",
              border: `2px solid ${inputGlow > 0.5 ? GOLD : "rgba(212,168,50,0.3)"}`,
              borderRadius: 10,
              overflow: "visible",
              background: "rgba(255,255,255,0.04)",
              boxShadow: `0 0 ${40 * inputGlow}px rgba(212,168,50,${0.35 * inputGlow})`,
              transition: "none",
            }}
          >
            <span
              style={{
                flex: 1,
                padding: "18px 24px",
                fontSize: 18,
                color: charsVisible > 0 ? "#ffffff" : "rgba(255,255,255,0.35)",
                fontFamily: "'Courier New', monospace",
                letterSpacing: "2px",
                display: "flex",
                alignItems: "center",
              }}
            >
              {charsVisible > 0 ? typedVin : "1HGBH41JXMN109186"}
              {cursorVisible && (
                <span
                  style={{
                    display: "inline-block",
                    width: 2,
                    height: 22,
                    background: GOLD,
                    marginLeft: 2,
                    verticalAlign: "middle",
                  }}
                />
              )}
            </span>
            <div
              style={{
                background: `linear-gradient(135deg, ${GOLD} 0%, #e8b830 100%)`,
                color: "#0b0d1c",
                padding: "0 28px",
                display: "flex",
                alignItems: "center",
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Check VIN →
            </div>
          </div>
          <div style={{ marginTop: 8, textAlign: "right", color: "rgba(255,255,255,0.3)", fontSize: 12 }}>
            {charsVisible}/17 characters
          </div>
        </div>

        {/* Vehicle result card */}
        {resultOpacity > 0 && (
          <div
            style={{
              width: 680,
              opacity: resultOpacity,
              transform: `scale(${resultScale})`,
              background: "rgba(255,255,255,0.05)",
              border: `1px solid rgba(212,168,50,0.4)`,
              borderRadius: 14,
              padding: "28px 32px",
              boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
            }}
          >
            {/* Vehicle header */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, opacity: makeOpacity }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  background: `linear-gradient(135deg, ${GOLD} 0%, #e8b830 100%)`,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                  flexShrink: 0,
                }}
              >
                🚗
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#ffffff", lineHeight: 1.2 }}>
                  {VEHICLE}
                </div>
                <div style={{ fontSize: 14, color: GOLD, fontWeight: 600, marginTop: 4 }}>
                  VIN: {VIN}
                </div>
              </div>
            </div>

            {/* Quick stats */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
                marginBottom: 20,
                opacity: detailsOpacity,
              }}
            >
              {[
                { label: "Accidents", value: "0 reported", ok: true },
                { label: "Owners", value: "2 owners", ok: true },
                { label: "Odometer", value: "34,218 mi", ok: true },
              ].map(({ label, value, ok }) => (
                <div
                  key={label}
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: 8,
                    padding: "12px 16px",
                    border: `1px solid rgba(255,255,255,0.08)`,
                  }}
                >
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: ok ? "#4ade80" : "#f87171" }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {/* History preview */}
            <div style={{ opacity: historyOpacity }}>
              <div
                style={{
                  background: `linear-gradient(90deg, rgba(212,168,50,0.1) 0%, transparent 100%)`,
                  border: `1px solid rgba(212,168,50,0.3)`,
                  borderRadius: 8,
                  padding: "12px 16px",
                  fontSize: 14,
                  color: GOLD,
                  fontWeight: 600,
                  textAlign: "center",
                }}
              >
                ✓ Clean title · No accidents · Airbags intact · Unlock full report →
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Step overlay */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          left: 80,
          opacity: overlayOpacity,
          transform: `translateX(${overlayX}px)`,
          background: "linear-gradient(135deg, rgba(212,168,50,0.9) 0%, rgba(232,184,48,0.9) 100%)",
          padding: "14px 28px",
          borderRadius: 8,
          color: "#0b0d1c",
          fontWeight: 700,
          fontSize: 20,
          letterSpacing: "0.3px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        }}
      >
        VIN lookup — instant results
      </div>
    </div>
  );
};
