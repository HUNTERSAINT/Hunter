import admin from "./admin.js";
import ambassadors from "./ambassadors.js";
import apply from "./apply.js";
import batch from "./batch.js";
import bounties from "./bounties.js";
import compare from "./compare.js";
import content from "./content.js";
import digest from "./digest.js";
import health from "./health.js";
import help from "./help.js";
import introduce from "./introduce.js";
import jobs from "./jobs.js";
import kol from "./kol.js";
import leaderboard from "./leaderboard.js";
import match from "./match.js";
import members from "./members.js";
import menu from "./menu.js";
import opportunities from "./opportunities.js";
import profile from "./profile.js";
import projects from "./projects.js";
import reply from "./reply.js";
import research from "./research.js";
import saved from "./saved.js";
import scamcheck from "./scamcheck.js";
import share from "./share.js";
import studio from "./studio.js";
import track from "./track.js";
import trending from "./trending.js";
import type { Command } from "./types.js";
import unwatch from "./unwatch.js";
import watch from "./watch.js";

export const commands: Command[] = [
  research,
  compare,
  projects,
  opportunities,
  jobs,
  ambassadors,
  bounties,
  content,
  watch,
  unwatch,
  match,
  profile,
  apply,
  track,
  saved,
  trending,
  digest,
  scamcheck,
  share,
  introduce,
  members,
  leaderboard,
  menu,
  reply,
  kol,
  batch,
  studio,
  help,
  health,
  admin,
];
