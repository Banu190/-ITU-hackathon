import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ENABLE_SPLASH_SCREEN } from "../config/splash";

const sessionKey = "fraud-replay:splash-seen";
const revealAt = 1.62;
const fadeDuration = 0.27;
const purple = "#8A43E7";

const nodes = [
  { x: 35, y: 76, color: "#b18ae9" },
  { x: 79, y: 40, color: "#c0a0ef" },
  { x: 111, y: 91, color: purple },
  { x: 156, y: 51, color: "#a66ce7" },
  { x: 224, y: 72, color: purple },
  { x: 181, y: 111, color: "#c0a0ef" },
];
const connections = [[0, 1], [0, 2], [1, 3], [2, 3], [2, 5], [3, 4], [4, 5]];
const pulseRoute = [0, 2, 3, 4].map((index) => nodes[index]);
const flaggedNode = nodes[4];

export function shouldShowSplashScreen() {
  if (!ENABLE_SPLASH_SCREEN) return false;
  try {
    if (sessionStorage.getItem(sessionKey)) return false;
    sessionStorage.setItem(sessionKey, "1");
  } catch {
    // Skip the intro if the browser can't remember that it was shown.
    return false;
  }
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function SplashScreen({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(false), 1000 * (revealAt + fadeDuration));
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <>
      <div className="contents" inert={visible}>{children}</div>
      {visible && (
        <motion.div
          aria-hidden="true"
          data-splash-screen
          className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-[#f8f6fc] px-6"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ delay: revealAt, duration: fadeDuration, ease: "easeInOut" }}
        >
          <motion.div
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,#fff_0%,#f4edfd_60%,#f8f6fc_100%)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
          />
          <div className="relative w-full max-w-72 text-center">
            <svg viewBox="0 0 260 140" className="mx-auto block w-full max-w-64" fill="none">
              {connections.map(([from, to], index) => (
                <motion.line
                  key={`${from}-${to}`}
                  x1={nodes[from].x} y1={nodes[from].y} x2={nodes[to].x} y2={nodes[to].y}
                  stroke="#c6a4ef" strokeWidth="1.5" strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ delay: 0.39 + index * 0.025, duration: 0.24, ease: "easeOut" }}
                />
              ))}
              {nodes.map(({ x, y, color }, index) => (
                <motion.circle
                  key={x} cx={x} cy={y} r="4.25" fill={color}
                  initial={{ opacity: 0, scale: 0.45 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.09 + index * 0.048, duration: 0.18, ease: "easeOut" }}
                />
              ))}
              <motion.circle
                r="4.5" fill={purple}
                initial={{ cx: pulseRoute[0].x, cy: pulseRoute[0].y, opacity: 0 }}
                animate={{ cx: pulseRoute.map(({ x }) => x), cy: pulseRoute.map(({ y }) => y), opacity: [0, 1, 1, 0] }}
                transition={{ delay: 0.79, duration: 0.43, ease: "linear" }}
              />
              <motion.circle
                cx={flaggedNode.x} cy={flaggedNode.y} r="4.7" fill="#e79ab8"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 1, 0] }}
                transition={{ delay: 1.15, duration: 0.43, times: [0, 0.19, 0.63, 1] }}
              />
              <motion.circle
                cx={flaggedNode.x} cy={flaggedNode.y} stroke="#e6a5be" strokeWidth="1.25"
                initial={{ r: 5, opacity: 0 }}
                animate={{ r: [5, 13], opacity: [0.75, 0] }}
                transition={{ delay: 1.2, duration: 0.36, ease: "easeOut" }}
              />
            </svg>
            <motion.p
              className="text-4xl font-bold tracking-tight text-ink"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.27, duration: 0.25, ease: "easeOut" }}
            >Fraud Replay</motion.p>
            <motion.p
              className="mt-2 text-sm text-muted"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.41, duration: 0.19 }}
            >Every transaction tells a story.</motion.p>
          </div>
        </motion.div>
      )}
    </>
  );
}
