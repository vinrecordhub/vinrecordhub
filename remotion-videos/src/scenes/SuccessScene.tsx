import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

const NAVY = "#0b0d1c";
const GOLD = "#d4a832";
const GREEN = "#22c55e";

export const SuccessScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Big checkmark spring
  const checkScale = spring({ frame: frame - 5, fps, config: { damping: 10, stiffness: 100 } });
  const checkOpacity = interpolate(frame, [5, 25], [0, 1], { extrapolateRight: "clamp" });

  // Ripple rings
  const ripple1 = interpolate(frame - 20, [0, 60], [0.5, 2.5], { extrapolateRight: "clamp" });
  const ripple1Opacity = interpolate(frame - 20, [0, 60], [0.6, 0], { extrapolateRight: "clamp" });
  const ripple2 = interpolate(frame - 35, [0, 60], [0.5, 2.5], { extrapolateRight: "clamp" });
  const ripple2Opacity = interpolate(frame - 35, [0, 60], [0.6, 0], { extrapolateRight: "clamp" });

  const titleOpacity = interpolate(frame, [35, 60], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [35, 60], [30, 0], { extrapolateRight: "clamp" });

  const subOpacity = interpolate(frame, [50, 75], [0, 1], { extrapolateRight: "clamp" });

  // VINny mascot springs in
  const vinnyScale = spring({ frame: frame - 70, fps, config: { damping: 12, stiffness: 80 } });
  const vinnyOpacity = interpolate(frame, [70, 95], [0, 1], { extrapolateRight: "clamp" });
  const vinnyY = interpolate(
    Math.sin(((frame - 70) / 60) * Math.PI * 2),
    [-1, 1],
    [-6, 6]
  );

  const bubbleOpacity = interpolate(frame, [90, 115], [0, 1], { extrapolateRight: "clamp" });
  const bubbleScale = spring({ frame: frame - 90, fps, config: { damping: 14 } });

  // Confetti dots
  const confettiOpacity = interpolate(frame, [20, 50], [0, 1], { extrapolateRight: "clamp" });

  const detailsOpacity = interpolate(frame, [100, 130], [0, 1], { extrapolateRight: "clamp" });

  const overlayOpacity = interpolate(frame, [115, 140], [0, 1], { extrapolateRight: "clamp" });
  const overlayX = interpolate(frame, [115, 140], [-60, 0], { extrapolateRight: "clamp" });

  const CONFETTI = [
    { x: 200, y: 180, color: GOLD, size: 12 },
    { x: 350, y: 120, color: GREEN, size: 8 },
    { x: 500, y: 200, color: "#60a5fa", size: 10 },
    { x: 1420, y: 160, color: GOLD, size: 14 },
    { x: 1570, y: 100, color: "#f472b6", size: 9 },
    { x: 1700, y: 220, color: GREEN, size: 11 },
    { x: 280, y: 800, color: "#a78bfa", size: 8 },
    { x: 1650, y: 780, color: GOLD, size: 12 },
    { x: 900, y: 80, color: "#f97316", size: 10 },
    { x: 1100, y: 900, color: GREEN, size: 8 },
  ];

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
      {/* Background glow — green tint for success */}
      <div
        style={{
          position: "absolute",
          top: "40%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(34,197,94,0.06) 0%, transparent 65%)`,
          pointerEvents: "none",
        }}
      />

      {/* Confetti dots */}
      {CONFETTI.map((dot, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: dot.x,
            top: dot.y + Math.sin(((frame + i * 20) / 40) * Math.PI * 2) * 8,
            width: dot.size,
            height: dot.size,
            borderRadius: "50%",
            background: dot.color,
            opacity: confettiOpacity * 0.7,
          }}
        />
      ))}

      {/* Ripple rings behind checkmark */}
      {frame > 20 && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: `translate(-50%, -56%) scale(${ripple1})`,
            width: 120,
            height: 120,
            borderRadius: "50%",
            border: `3px solid ${GREEN}`,
            opacity: Math.max(0, ripple1Opacity),
          }}
        />
      )}
      {frame > 35 && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: `translate(-50%, -56%) scale(${ripple2})`,
            width: 120,
            height: 120,
            borderRadius: "50%",
            border: `3px solid ${GREEN}`,
            opacity: Math.max(0, ripple2Opacity),
          }}
        />
      )}

      {/* Checkmark */}
      <div
        style={{
          opacity: checkOpacity,
          transform: `scale(${checkScale})`,
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: `linear-gradient(135deg, #16a34a 0%, ${GREEN} 100%)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 60,
          marginBottom: 32,
          boxShadow: `0 0 60px rgba(34,197,94,0.4)`,
          flexShrink: 0,
        }}
      >
        ✓
      </div>

      {/* Title */}
      <div
        style={{
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          textAlign: "center",
          marginBottom: 12,
        }}
      >
        <h1
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: "#ffffff",
            margin: 0,
            letterSpacing: "-1px",
          }}
        >
          Report{" "}
          <span style={{ color: GREEN }}>Delivered!</span>
        </h1>
      </div>

      {/* Subtitle */}
      <p
        style={{
          opacity: subOpacity,
          fontSize: 20,
          color: "rgba(255,255,255,0.6)",
          textAlign: "center",
          maxWidth: 600,
          marginBottom: 40,
        }}
      >
        Your full vehicle history report has been sent to your inbox
      </p>

      {/* VINny mascot + bubble */}
      <div
        style={{
          opacity: vinnyOpacity,
          transform: `scale(${vinnyScale}) translateY(${vinnyY}px)`,
          display: "flex",
          alignItems: "flex-end",
          gap: 20,
          marginBottom: 20,
        }}
      >
        {/* VINny SVG inline */}
        <svg
          width="100"
          height="112"
          viewBox="0 0 180 200"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Body */}
          <ellipse cx="90" cy="130" rx="55" ry="58" fill="#d4a832" />
          {/* Head */}
          <ellipse cx="90" cy="72" rx="48" ry="44" fill="#e8b830" />
          {/* Ear left */}
          <ellipse cx="46" cy="60" rx="12" ry="14" fill="#c49020" />
          <ellipse cx="46" cy="60" rx="7" ry="9" fill="#e8a828" />
          {/* Ear right */}
          <ellipse cx="134" cy="60" rx="12" ry="14" fill="#c49020" />
          <ellipse cx="134" cy="60" rx="7" ry="9" fill="#e8a828" />
          {/* Eyes - happy squint */}
          <path d="M68 64 Q75 58 82 64" stroke="#0b1c44" strokeWidth="4" strokeLinecap="round" fill="none" />
          <path d="M98 64 Q105 58 112 64" stroke="#0b1c44" strokeWidth="4" strokeLinecap="round" fill="none" />
          {/* Cheek blush */}
          <ellipse cx="66" cy="78" rx="10" ry="6" fill="rgba(220,100,80,0.3)" />
          <ellipse cx="114" cy="78" rx="10" ry="6" fill="rgba(220,100,80,0.3)" />
          {/* Big smile */}
          <path d="M70 84 Q90 100 110 84" stroke="#0b1c44" strokeWidth="4" strokeLinecap="round" fill="none" />
          {/* Tummy patch */}
          <ellipse cx="90" cy="138" rx="30" ry="28" fill="#f0c840" />
          {/* Car badge */}
          <rect x="76" y="126" width="28" height="20" rx="3" fill="#0b1c44" />
          <text x="90" y="141" textAnchor="middle" fontSize="10" fill="#d4a832" fontWeight="bold">VIN</text>
          {/* Thumbs up arm */}
          <ellipse cx="150" cy="118" rx="18" ry="14" fill="#e8b830" transform="rotate(-20 150 118)" />
          <ellipse cx="158" cy="100" rx="10" ry="18" fill="#e8b830" transform="rotate(-5 158 100)" />
          <ellipse cx="155" cy="88" rx="8" ry="10" fill="#d4a832" />
          {/* Left arm down */}
          <ellipse cx="33" cy="128" rx="14" ry="18" fill="#d4a832" transform="rotate(15 33 128)" />
          {/* Feet */}
          <ellipse cx="68" cy="183" rx="18" ry="12" fill="#c49020" />
          <ellipse cx="112" cy="183" rx="18" ry="12" fill="#c49020" />
          {/* Star sparkles */}
          <text x="30" y="40" fontSize="14" fill="#fff" opacity="0.9">✦</text>
          <text x="148" y="55" fontSize="10" fill="#fff" opacity="0.7">✦</text>
          <text x="158" y="80" fontSize="8" fill="#fff" opacity="0.5">✦</text>
        </svg>

        {/* Speech bubble */}
        <div
          style={{
            opacity: bubbleOpacity,
            transform: `scale(${bubbleScale})`,
            background: "#ffffff",
            borderRadius: 14,
            padding: "16px 22px",
            position: "relative",
            maxWidth: 260,
            boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              position: "absolute",
              bottom: -10,
              left: 20,
              width: 0,
              height: 0,
              borderLeft: "10px solid transparent",
              borderRight: "10px solid transparent",
              borderTop: "10px solid #ffffff",
            }}
          />
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#0b0d1c",
              lineHeight: 1.4,
            }}
          >
            Your report is on its way! 🎉
          </div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            Check your inbox in seconds
          </div>
        </div>
      </div>

      {/* Details row */}
      <div
        style={{
          opacity: detailsOpacity,
          display: "flex",
          gap: 32,
          justifyContent: "center",
        }}
      >
        {[
          { icon: "📧", text: "Report emailed instantly" },
          { icon: "🔒", text: "Secured transaction" },
          { icon: "⭐", text: "30-day money-back guarantee" },
        ].map(({ icon, text }) => (
          <div
            key={text}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 14,
              color: "rgba(255,255,255,0.6)",
            }}
          >
            <span style={{ fontSize: 18 }}>{icon}</span>
            {text}
          </div>
        ))}
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
        Step 3: Instant delivery
      </div>
    </div>
  );
};
