// Fit scoring for Timbre's outreach to YouTube creators.
// Unlike classic B2B BANT (which rewards big companies), Timbre converts
// SMALL-to-MID creators best, so the curve peaks in a sweet-spot band and
// falls off for channels that are too tiny or too large to need us.
//
// Four dimensions, each 0-25, composite 0-100.

// FIT: subscriber sweet spot. Peaks ~5k-200k, falls off outside.
function scoreFit(subs) {
  if (subs >= 5000 && subs <= 200000) return 25; // ideal band
  if (subs >= 2000 && subs < 5000) return 18; // promising, a bit small
  if (subs > 200000 && subs <= 500000) return 16; // bigger, may have an editor
  if (subs >= 500 && subs < 2000) return 10; // very small
  if (subs > 500000 && subs <= 1000000) return 8; // likely has a team
  if (subs > 1000000) return 3; // too big, has post-production
  return 4; // below 500
}

// REACH: can we actually contact them?
function scoreReach({ hasEmail, hasWebsite, hasLinks }) {
  let v = 0;
  if (hasEmail) v += 16; // public business email in description
  if (hasWebsite) v += 6;
  if (hasLinks) v += 3;
  return Math.min(v, 25);
}

// NEED: do they clearly have the editing/repurposing pain?
function scoreNeed({ uploadsCount, topicMatch, longForm }) {
  let v = 0;
  if (uploadsCount >= 100) v += 10;
  else if (uploadsCount >= 30) v += 7;
  else if (uploadsCount >= 10) v += 4;
  if (topicMatch) v += 9; // matches a high-intent segment
  if (longForm) v += 6; // long videos = clear repurposing pain
  return Math.min(v, 25);
}

// TIMING: are they active right now?
function scoreTiming({ daysSinceUpload }) {
  if (daysSinceUpload == null) return 6;
  if (daysSinceUpload <= 7) return 25; // posting weekly, hot
  if (daysSinceUpload <= 21) return 18;
  if (daysSinceUpload <= 60) return 10;
  if (daysSinceUpload <= 120) return 5;
  return 2; // dormant
}

export function scoreCreator(signals) {
  const fit = scoreFit(signals.subs || 0);
  const reach = scoreReach(signals);
  const need = scoreNeed(signals);
  const timing = scoreTiming(signals);
  const total = fit + reach + need + timing;
  return { fit, reach, need, timing, total };
}

export function gradeFor(total) {
  if (total >= 85) return { grade: "A+", label: "Hot lead" };
  if (total >= 70) return { grade: "A", label: "Strong" };
  if (total >= 55) return { grade: "B", label: "Qualified" };
  if (total >= 40) return { grade: "C", label: "Lukewarm" };
  return { grade: "D", label: "Poor fit" };
}
