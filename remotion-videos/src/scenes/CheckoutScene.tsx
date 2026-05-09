import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

const NAVY = "#0b0d1c";
const GOLD = "#d4a832";

const PLANS = [
  { name: "Basic Report", price: "$9.95", desc: "Accidents · Titles · Recalls", featured: false },
  { name: "Combo Pack", price: "$19.95", desc: "Basic + Ownership · Odometer · Liens", featured: true, badge: "BEST VALUE" },
  { name: "Dealer Bundle", price: "$39.95", desc: "Combo × 3 reports", featured: false },
];

export const CheckoutScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  const headerY = interpolate(frame, [0, 25], [-30, 0], { extrapolateRight: "clamp" });

  // Plan cards stagger in
  const plan0Scale = spring({ frame: frame - 20, fps, config: { damping: 14 } });
  const plan1Scale = spring({ frame: frame - 35, fps, config: { damping: 14 } });
  const plan2Scale = spring({ frame: frame - 50, fps, config: { damping: 14 } });
  const planScales = [plan0Scale, plan1Scale, plan2Scale];
  const planOpacities = [
    interpolate(frame, [20, 40], [0, 1], { extrapolateRight: "clamp" }),
    interpolate(frame, [35, 55], [0, 1], { extrapolateRight: "clamp" }),
    interpolate(frame, [50, 70], [0, 1], { extrapolateRight: "clamp" }),
  ];

  // Combo card pulses
  const comboPulse = interpolate(
    Math.sin((frame / 30) * Math.PI * 2),
    [-1, 1],
    [0, 1]
  );
  const comboGlow = 0.2 + comboPulse * 0.15;

  const paypalOpacity = interpolate(frame, [80, 105], [0, 1], { extrapolateRight: "clamp" });
  const paypalScale = spring({ frame: frame - 80, fps, config: { damping: 12 } });

  // Zoom into Combo + PayPal area
  const zoomScale = interpolate(frame, [150, 220], [1, 1.2], { extrapolateRight: "clamp" });
  const zoomY = interpolate(frame, [150, 220], [0, -30], { extrapolateRight: "clamp" });

  const overlayOpacity = interpolate(frame, [60, 85], [0, 1], { extrapolateRight: "clamp" });
  const overlayX = interpolate(frame, [60, 85], [-60, 0], { extrapolateRight: "clamp" });

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
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 900,
          height: 900,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(212,168,50,0.05) 0%, transparent 70%)",
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
        {/* Header */}
        <div
          style={{
            opacity: headerOpacity,
            transform: `translateY(${headerY}px)`,
            textAlign: "center",
            marginBottom: 40,
          }}
        >
          <div style={{ fontSize: 16, color: GOLD, fontWeight: 600, marginBottom: 8, letterSpacing: "1px", textTransform: "uppercase" }}>
            Choose Your Report
          </div>
          <h2
            style={{
              fontSize: 42,
              fontWeight: 800,
              color: "#ffffff",
              margin: 0,
              letterSpacing: "-0.5px",
            }}
          >
            2019 Honda Civic Sport
          </h2>
          <div style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", marginTop: 8 }}>
            VIN: 1HGBH41JXMN109186
          </div>
        </div>

        {/* Plan cards */}
        <div
          style={{
            display: "flex",
            gap: 20,
            marginBottom: 36,
          }}
        >
          {PLANS.map((plan, i) => (
            <div
              key={plan.name}
              style={{
                opacity: planOpacities[i],
                transform: `scale(${planScales[i]})`,
                width: 220,
                padding: "28px 24px",
                borderRadius: 14,
                border: plan.featured
                  ? `2px solid ${GOLD}`
                  : "1px solid rgba(255,255,255,0.12)",
                background: plan.featured
                  ? `rgba(212,168,50,${comboGlow})`
                  : "rgba(255,255,255,0.04)",
                boxShadow: plan.featured
                  ? `0 0 ${40 + comboPulse * 20}px rgba(212,168,50,${0.3 + comboPulse * 0.15})`
                  : "none",
                position: "relative",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {plan.badge && (
                <div
                  style={{
                    position: "absolute",
                    top: -12,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: GOLD,
                    color: "#0b0d1c",
                    padding: "4px 14px",
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: "1px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {plan.badge}
                </div>
              )}
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: plan.featured ? GOLD : "rgba(255,255,255,0.7)",
                  marginBottom: 8,
                }}
              >
                {plan.name}
              </div>
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 800,
                  color: plan.featured ? "#ffffff" : "rgba(255,255,255,0.85)",
                  marginBottom: 12,
                  letterSpacing: "-1px",
                }}
              >
                {plan.price}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: plan.featured ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.45)",
                  lineHeight: 1.5,
                }}
              >
                {plan.desc.split(" · ").join("\n")}
              </div>
            </div>
          ))}
        </div>

        {/* PayPal button */}
        <div
          style={{
            opacity: paypalOpacity,
            transform: `scale(${paypalScale})`,
            width: 400,
          }}
        >
          <div
            style={{
              background: "#FFB400",
              borderRadius: 8,
              padding: "16px 0",
              textAlign: "center",
              cursor: "pointer",
              boxShadow: "0 4px 24px rgba(255,180,0,0.4)",
            }}
          >
            <span
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "#0b0d1c",
                letterSpacing: "0.5px",
              }}
            >
              <span style={{ fontStyle: "italic", fontWeight: 800 }}>Pay</span>
              <span style={{ fontWeight: 400 }}>Pal</span>
              {" "}— Pay securely
            </span>
          </div>
          <div
            style={{
              textAlign: "center",
              marginTop: 12,
              fontSize: 13,
              color: "rgba(255,255,255,0.35)",
            }}
          >
            🔒 Secured by PayPal · 256-bit encryption
          </div>
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
        Step 2: Choose your report
      </div>
    </div>
  );
};
