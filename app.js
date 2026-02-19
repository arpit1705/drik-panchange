const CYCLE = ["Udveg", "Chara", "Labh", "Amrit", "Kaal", "Shubh", "Rog"];
const DAY_START_BY_WEEKDAY = {
  0: "Udveg", // Sunday
  1: "Amrit", // Monday
  2: "Rog", // Tuesday
  3: "Labh", // Wednesday
  4: "Shubh", // Thursday
  5: "Chara", // Friday
  6: "Kaal", // Saturday
};

const NIGHT_START_BY_WEEKDAY = {
  0: "Shubh", // Sunday night
  1: "Rog", // Monday night
  2: "Kaal", // Tuesday night
  3: "Labh", // Wednesday night
  4: "Udveg", // Thursday night
  5: "Amrit", // Friday night
  6: "Chara", // Saturday night
};

const TYPE = {
  Amrit: "good",
  Shubh: "good",
  Labh: "good",
  Chara: "neutral",
  Udveg: "bad",
  Kaal: "bad",
  Rog: "bad",
};

const latitudeInput = document.getElementById("latitude");
const longitudeInput = document.getElementById("longitude");
const dateInput = document.getElementById("date");
const timezoneSelect = document.getElementById("timezone");
const dayBody = document.getElementById("day-results");
const nightBody = document.getElementById("night-results");
const statusEl = document.getElementById("status");

const tzList = Intl.supportedValuesOf("timeZone");
const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

for (const tz of tzList) {
  const option = document.createElement("option");
  option.value = tz;
  option.textContent = tz;
  if (tz === localTz) option.selected = true;
  timezoneSelect.append(option);
}

dateInput.valueAsDate = new Date();

function dayOfYear(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - start) / 86400000);
}

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad) {
  return (rad * 180) / Math.PI;
}

function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

function getOffsetMinutes(tz, date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    dtf.formatToParts(date).map(({ type, value }) => [type, value]),
  );

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  return (asUtc - date.getTime()) / 60000;
}

function zonedDateAtMidnight(dateString, tz) {
  const roughUtc = new Date(`${dateString}T00:00:00Z`);
  const offset = getOffsetMinutes(tz, roughUtc);
  return new Date(roughUtc.getTime() - offset * 60000);
}

function computeSunEventUtc(date, latitude, longitude, isSunrise) {
  const zenith = 90.833;
  const N = dayOfYear(date);
  const lngHour = longitude / 15;
  const t = N + ((isSunrise ? 6 : 18) - lngHour) / 24;

  const M = 0.9856 * t - 3.289;
  let L = M + 1.916 * Math.sin(toRadians(M)) + 0.020 * Math.sin(toRadians(2 * M)) + 282.634;
  L = normalizeAngle(L);

  let RA = toDegrees(Math.atan(0.91764 * Math.tan(toRadians(L))));
  RA = normalizeAngle(RA);

  const Lquadrant = Math.floor(L / 90) * 90;
  const RAquadrant = Math.floor(RA / 90) * 90;
  RA = (RA + (Lquadrant - RAquadrant)) / 15;

  const sinDec = 0.39782 * Math.sin(toRadians(L));
  const cosDec = Math.cos(Math.asin(sinDec));

  const cosH =
    (Math.cos(toRadians(zenith)) - sinDec * Math.sin(toRadians(latitude))) /
    (cosDec * Math.cos(toRadians(latitude)));

  if (cosH > 1 || cosH < -1) {
    return null;
  }

  let H = isSunrise ? 360 - toDegrees(Math.acos(cosH)) : toDegrees(Math.acos(cosH));
  H /= 15;

  const T = H + RA - 0.06571 * t - 6.622;
  const UT = normalizeAngle(T - lngHour * 15) / 15;

  const midnightUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return new Date(midnightUtc + UT * 3600000);
}

function getSequence(startName) {
  const start = CYCLE.indexOf(startName);
  return Array.from({ length: 8 }, (_, i) => CYCLE[(start + i) % CYCLE.length]);
}

function formatTime(date, tz) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    day: "2-digit",
    month: "short",
  }).format(date);
}

function buildRanges(start, end, labels) {
  const intervalMs = (end.getTime() - start.getTime()) / 8;
  return labels.map((name, idx) => {
    const from = new Date(start.getTime() + idx * intervalMs);
    const to = new Date(start.getTime() + (idx + 1) * intervalMs);
    return { name, from, to, nature: TYPE[name] };
  });
}

function renderRows(target, ranges, tz) {
  target.innerHTML = "";
  for (const [idx, row] of ranges.entries()) {
    const tr = document.createElement("tr");
    tr.className = row.nature;
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${row.name}</td>
      <td>${row.nature}</td>
      <td>${formatTime(row.from, tz)} – ${formatTime(row.to, tz)}</td>
    `;
    target.append(tr);
  }
}

function calculate() {
  const latitude = Number(latitudeInput.value);
  const longitude = Number(longitudeInput.value);
  const date = dateInput.value;
  const tz = timezoneSelect.value;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !date) {
    statusEl.textContent = "Please provide valid latitude, longitude, and date.";
    return;
  }

  const zonedMidnight = zonedDateAtMidnight(date, tz);
  const zonedTomorrow = new Date(zonedMidnight.getTime() + 24 * 3600000);

  const sunrise = computeSunEventUtc(zonedMidnight, latitude, longitude, true);
  const sunset = computeSunEventUtc(zonedMidnight, latitude, longitude, false);
  const nextSunrise = computeSunEventUtc(zonedTomorrow, latitude, longitude, true);

  if (!sunrise || !sunset || !nextSunrise) {
    statusEl.textContent =
      "Could not compute sunrise/sunset for this input (possible polar day/night).";
    dayBody.innerHTML = "";
    nightBody.innerHTML = "";
    return;
  }

  const weekdayName = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(zonedMidnight);
  const weekdayMap = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayMap[weekdayName];

  const dayNames = getSequence(DAY_START_BY_WEEKDAY[weekday]);
  const nightNames = getSequence(NIGHT_START_BY_WEEKDAY[weekday]);

  const dayRanges = buildRanges(sunrise, sunset, dayNames);
  const nightRanges = buildRanges(sunset, nextSunrise, nightNames);

  renderRows(dayBody, dayRanges, tz);
  renderRows(nightBody, nightRanges, tz);

  statusEl.textContent = `Sunrise: ${formatTime(sunrise, tz)} | Sunset: ${formatTime(
    sunset,
    tz,
  )}`;
}

function useMyLocation() {
  if (!navigator.geolocation) {
    statusEl.textContent = "Geolocation is not supported by your browser.";
    return;
  }

  statusEl.textContent = "Getting location...";

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      latitudeInput.value = coords.latitude.toFixed(4);
      longitudeInput.value = coords.longitude.toFixed(4);
      statusEl.textContent = "Location updated.";
    },
    (error) => {
      statusEl.textContent = `Unable to fetch location: ${error.message}`;
    },
    { timeout: 10000 },
  );
}

document.getElementById("calculate").addEventListener("click", calculate);
document.getElementById("use-location").addEventListener("click", useMyLocation);
calculate();
