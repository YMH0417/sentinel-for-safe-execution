// backend/src/routes/config.ts — GET /config (Dev B)
import { Router, Request, Response } from "express";
import { loadRiskConfig } from "../services/agentService.js";
import type { RiskConfig } from "../types.js";

const router = Router();

type ProfileName = keyof RiskConfig["profiles"];

function isProfileName(value: string): value is ProfileName {
  return value === "normal" || value === "conservative" || value === "aggressive";
}

router.get("/", (req: Request, res: Response) => {
  const config = loadRiskConfig();
  const requested = typeof req.query.profile === "string" ? req.query.profile : undefined;

  if (requested && !isProfileName(requested)) {
    return res.status(400).json({
      error: "Invalid profile. Use normal, conservative, or aggressive.",
    });
  }

  const activeProfile = requested ?? config.defaultProfile;
  const profile = isProfileName(activeProfile)
    ? config.profiles[activeProfile]
    : config.profiles.normal;

  res.json({
    defaultProfile: config.defaultProfile,
    activeProfile,
    paused: config.paused,
    profile,
    profiles: config.profiles,
    decisionThresholds: {
      allow: "riskScore < 40",
      fallback: "40 <= riskScore < 70 and supportsFallback",
      reject: "riskScore >= 70",
    },
  });
});

export default router;
