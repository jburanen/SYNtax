/**
 * fw-zdebug.js — Check Point fw ctl zdebug drop command builder.
 *
 * Generates a fw ctl zdebug drop command with chained grep filter pipelines.
 * Each filter adds a grep stage: all active filters must match (AND logic).
 *
 * IP/CIDR filters are converted to grep -E patterns:
 *   10.0.0.1      → grep '10\.0\.0\.1'
 *   10.0.0.0/24   → grep -E '10\.0\.0\.[0-9]+'
 *   10.0.0.0/16   → grep -E '10\.0\.[0-9]+\.[0-9]+'
 *
 * Port filters match sport=/dport= tokens in zdebug output (R80+).
 * Drop reason filter uses grep -i for case-insensitive substring matching.
 */

'use strict';

const $ = id => document.getElementById(id);

// ── DOM refs ──────────────────────────────────────────────────

const optExtended   = $('optExtended');
const optOutputFile = $('optOutputFile');

const protoSelect  = $('proto');
const srcHostInput = $('srcHost');
const srcPortInput = $('srcPort');
const dstHostInput = $('dstHost');
const dstPortInput = $('dstPort');
const hostInput    = $('host');
const portInput    = $('port');
const dropReason   = $('dropReason');
const ifaceInput   = $('iface');

const cmdText      = $('cmdText');
const cmdOutput    = document.querySelector('.cmd-output');
const copyBtn      = $('copyBtn');
const copyFeedback = $('copyFeedback');
const autoCopyNote = $('autoCopyNote');

// ── Validation ────────────────────────────────────────────────

// Returns { valid, type: 'host'|'net'|null, ip?, octets?, prefix?, network?, warning?, error? }
function parseHostInput(raw) {
  const s = (raw || '').trim();
  if (!s) return { valid: true, type: null };

  if (s.includes('/')) {
    const slash     = s.lastIndexOf('/');
    const ipStr     = s.slice(0, slash);
    const prefixStr = s.slice(slash + 1);

    if (!/^\d+$/.test(prefixStr))
      return { valid: false, error: 'Prefix must be a number (0–32)' };
    const prefix = parseInt(prefixStr, 10);
    if (prefix < 0 || prefix > 32)
      return { valid: false, error: 'Prefix length must be 0–32' };
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ipStr))
      return { valid: false, error: 'Enter a valid IPv4 address before the /' };
    const octets = ipStr.split('.').map(Number);
    if (octets.some(o => o < 0 || o > 255))
      return { valid: false, error: 'IP octet out of range (0–255)' };

    const ipInt   = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
    const maskInt = prefix === 0 ? 0 : ((0xFFFFFFFF << (32 - prefix)) >>> 0);
    const netInt  = (ipInt & maskInt) >>> 0;
    const netOctets = [
      (netInt >>> 24) & 0xFF,
      (netInt >>> 16) & 0xFF,
      (netInt >>>  8) & 0xFF,
       netInt         & 0xFF,
    ];
    const network = netOctets.join('.');

    return {
      valid: true,
      type: 'net',
      network,
      prefix,
      octets: netOctets,
      warning: ipInt !== netInt ? `Host bits cleared — using network address ${network}/${prefix}` : null,
    };
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) {
    const octets = s.split('.').map(Number);
    if (octets.some(o => o < 0 || o > 255))
      return { valid: false, error: 'IP octet out of range (0–255)' };
    return { valid: true, type: 'host', ip: s };
  }

  if (/^\d+(\.\d+){1,2}$/.test(s))
    return { valid: false, error: 'Partial IP — use CIDR notation, e.g. 10.0.0.0/8' };

  return { valid: false, error: 'Enter a valid IPv4 address or CIDR range (e.g. 10.0.0.0/24)' };
}

// Returns { valid, value, error? }
function parsePortInput(raw) {
  const s = (raw || '').trim();
  if (!s) return { valid: true, value: null };
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    if (n < 1 || n > 65535) return { valid: false, error: 'Port must be 1–65535' };
    return { valid: true, value: String(n) };
  }
  return { valid: false, error: 'Enter a port number (1–65535)' };
}

// ── IP → grep pattern conversion ─────────────────────────────

// Converts a parsed host result into a grep pattern.
// Returns null if no filter, or { pattern: string, extended: boolean }.
//
// For CIDR ranges, generates a regex covering the octet-aligned portion of the
// prefix. For non-octet-aligned prefixes (e.g. /17) this may be slightly
// over-broad — engineers should verify with a host filter for precision.
function hostToGrepInfo(parsed) {
  if (!parsed.valid || !parsed.type) return null;

  if (parsed.type === 'host') {
    // Escape dots for a literal IP match
    return { pattern: parsed.ip.replace(/\./g, '\\.'), extended: false };
  }

  // CIDR — match based on how many octets are fully determined by the prefix
  const { octets, prefix } = parsed;

  if (prefix >= 24) {
    // First three octets fixed, fourth is a wildcard
    return {
      pattern: `${octets[0]}\\.${octets[1]}\\.${octets[2]}\\.[0-9]+`,
      extended: true,
    };
  }
  if (prefix >= 16) {
    return {
      pattern: `${octets[0]}\\.${octets[1]}\\.[0-9]+\\.[0-9]+`,
      extended: true,
    };
  }
  if (prefix >= 8) {
    return {
      pattern: `${octets[0]}\\.[0-9]+\\.[0-9]+\\.[0-9]+`,
      extended: true,
    };
  }
  // /0–/7 is too broad to be a useful grep filter — skip
  return null;
}

// ── Field message display ─────────────────────────────────────

function setFieldMsg(inputEl, msgId, result) {
  const msgEl = $(msgId);
  if (!msgEl) return;
  if (!result.valid) {
    inputEl.classList.add('error');
    msgEl.textContent = `⚠ ${result.error}`;
    msgEl.className = 'field-msg error';
  } else if (result.warning) {
    inputEl.classList.remove('error');
    msgEl.textContent = `→ ${result.warning}`;
    msgEl.className = 'field-msg warning';
  } else {
    inputEl.classList.remove('error');
    msgEl.textContent = '';
    msgEl.className = 'field-msg';
  }
}

// ── Command builder ───────────────────────────────────────────

function buildCommand() {
  const srcHostR = parseHostInput(srcHostInput.value);
  const srcPortR = parsePortInput(srcPortInput.value);
  const dstHostR = parseHostInput(dstHostInput.value);
  const dstPortR = parsePortInput(dstPortInput.value);
  const hostR    = parseHostInput(hostInput.value);
  const portR    = parsePortInput(portInput.value);

  setFieldMsg(srcHostInput, 'srcHostMsg', srcHostR);
  setFieldMsg(srcPortInput, 'srcPortMsg', srcPortR);
  setFieldMsg(dstHostInput, 'dstHostMsg', dstHostR);
  setFieldMsg(dstPortInput, 'dstPortMsg', dstPortR);
  setFieldMsg(hostInput,    'hostMsg',    hostR);
  setFieldMsg(portInput,    'portMsg',    portR);

  const hasErrors = [srcHostR, srcPortR, dstHostR, dstPortR, hostR, portR].some(r => !r.valid);

  // ── Base command ──
  const base = optExtended.checked ? 'fw ctl zdebug + drop' : 'fw ctl zdebug drop';

  // ── Build grep pipeline stages ──
  // Each stage: { flag: string, pattern: string }
  // flag is the grep flag(s) string (e.g. '-E', '-i', '')
  const stages = [];

  // Protocol — zdebug R80+ outputs "proto=N"
  const proto = protoSelect.value;
  if (proto) {
    stages.push({ flag: '', pattern: `proto=${proto}` });
  }

  // Source host
  const srcInfo = hostToGrepInfo(srcHostR);
  if (srcInfo) {
    stages.push({ flag: srcInfo.extended ? '-E' : '', pattern: srcInfo.pattern });
  }

  // Source port — zdebug outputs "sport=N"
  if (srcPortR.valid && srcPortR.value) {
    stages.push({ flag: '', pattern: `sport=${srcPortR.value}` });
  }

  // Destination host
  const dstInfo = hostToGrepInfo(dstHostR);
  if (dstInfo) {
    stages.push({ flag: dstInfo.extended ? '-E' : '', pattern: dstInfo.pattern });
  }

  // Destination port — zdebug outputs "dport=N"
  if (dstPortR.valid && dstPortR.value) {
    stages.push({ flag: '', pattern: `dport=${dstPortR.value}` });
  }

  // Either-direction host — same grep as directional; combining src+dst gives AND logic
  const eitherInfo = hostToGrepInfo(hostR);
  if (eitherInfo) {
    stages.push({ flag: eitherInfo.extended ? '-E' : '', pattern: eitherInfo.pattern });
  }

  // Either-direction port — match sport or dport with alternation
  if (portR.valid && portR.value) {
    stages.push({ flag: '-E', pattern: `sport=${portR.value}|dport=${portR.value}` });
  }

  // Drop reason — case-insensitive substring match
  const reason = (dropReason.value || '').trim();
  if (reason) {
    // Escape single quotes for shell safety
    const safeReason = reason.replace(/'/g, "'\\''");
    stages.push({ flag: '-i', pattern: safeReason });
  }

  // Interface — match the interface name in zdebug output
  const iface = (ifaceInput.value || '').trim();
  if (iface) {
    stages.push({ flag: '', pattern: iface });
  }

  // Assemble full pipeline
  let cmd = base;
  for (const s of stages) {
    cmd += s.flag ? ` | grep ${s.flag} '${s.pattern}'` : ` | grep '${s.pattern}'`;
  }

  // Output capture via tee (so output appears on screen and in file simultaneously)
  const outputFile = (optOutputFile.value || '').trim();
  if (outputFile) {
    const safePath = /[\s&|;<>()]/.test(outputFile) ? `"${outputFile}"` : outputFile;
    cmd += ` | tee ${safePath}`;
  }

  return { cmd, hasErrors };
}

// ── Live update + auto-copy ───────────────────────────────────

let copyTimer = null;

function updateCommand() {
  const { cmd, hasErrors } = buildCommand();
  cmdText.textContent = cmd;

  copyBtn.disabled = hasErrors;
  cmdOutput.classList.toggle('has-errors', hasErrors);

  clearTimeout(copyTimer);
  if (hasErrors) {
    autoCopyNote.textContent = '⚠ fix errors above';
  } else {
    autoCopyNote.textContent = '';
    copyTimer = setTimeout(() => {
      navigator.clipboard.writeText(cmd).then(() => {
        autoCopyNote.textContent = '⎘ auto-copied';
        setTimeout(() => { autoCopyNote.textContent = ''; }, 2000);
      }).catch(() => {});
    }, 750);
  }
}

// ── Wire all inputs ───────────────────────────────────────────

const allInputs = [
  optExtended, optOutputFile,
  protoSelect,
  srcHostInput, srcPortInput,
  dstHostInput, dstPortInput,
  hostInput, portInput,
  dropReason, ifaceInput,
];

allInputs.forEach(el => {
  el.addEventListener('input', updateCommand);
  el.addEventListener('change', updateCommand);
});

// ── Manual copy ───────────────────────────────────────────────

copyBtn.addEventListener('click', () => {
  clearTimeout(copyTimer);
  autoCopyNote.textContent = '';

  navigator.clipboard.writeText(cmdText.textContent).then(() => {
    copyFeedback.textContent = 'copied!';
    copyFeedback.classList.add('copied');
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyFeedback.textContent = '';
      copyFeedback.classList.remove('copied');
      copyBtn.textContent = 'Copy Command';
    }, 1500);
  }).catch(() => {
    copyFeedback.textContent = 'copy failed — select manually';
  });
});

// ── Output file quick actions ─────────────────────────────────

$('fillDefaultPath').addEventListener('click', () => {
  optOutputFile.value = '/var/log/fw/zdebug.log';
  updateCommand();
  optOutputFile.focus();
});

$('clearOutput').addEventListener('click', () => {
  optOutputFile.value = '';
  updateCommand();
  optOutputFile.focus();
});

// ── Initial render (no auto-copy on page load) ────────────────

cmdText.textContent = buildCommand().cmd;
