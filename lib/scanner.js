const fetch = require('node-fetch');

// List of files/paths to check for exposure
const SENSITIVE_PATHS = [
  '.git/config',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'config.json',
  'credentials.json',
  'id_rsa',
  'id_rsa.pub',
  '.htpasswd',
  'composer.json',
  'package.json',
  'Dockerfile',
  'docker-compose.yml',
  '.aws/credentials',
  'firebase-key.json',
  'serviceAccountKey.json'
];

// Regex patterns for secrets
const SECRET_PATTERNS = [
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'GitHub Token', regex: /ghp_[a-zA-Z0-9]{36}/g },
  { name: 'GitHub OAuth', regex: /gho_[a-zA-Z0-9]{36}/g },
  { name: 'Slack Token', regex: /xox[baprs]-[0-9a-zA-Z]{10,48}/g },
  { name: 'Private Key', regex: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'Firebase URL', regex: /https:\/\/[a-z0-9-]+\.firebaseio\.com/g },
  { name: 'Google API Key', regex: /AIza[0-9A-Za-z_-]{35}/g },
  { name: 'Heroku API Key', regex: /[hH]eroku.*[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/g },
  { name: 'JWT Token', regex: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g },
  { name: 'Password Assignment', regex: /(password|passwd|pwd)\s*=\s*["'][^"']{4,}["']/gi },
  { name: 'DB Connection String', regex: /(mongodb|mysql|postgres|redis):\/\/[^\s"']+/g },
  { name: 'API Key Assignment', regex: /(api[_-]?key|apikey)\s*=\s*["'][^"']{8,}["']/gi }
];

async function checkPath(repoUrl, path) {
  const rawUrl = repoUrl
    .replace('github.com', 'raw.githubusercontent.com')
    .replace('/blob/', '/') + '/' + path;
  
  try {
    const res = await fetch(rawUrl, { timeout: 5000 });
    if (res.status === 200) {
      const text = await res.text();
      return { found: true, url: rawUrl, size: text.length, snippet: text.substring(0, 500) };
    }
  } catch (e) {}
  
  // Try GitHub Pages / raw direct
  const pagesUrl = repoUrl.replace('github.com', 'raw.githubusercontent.com').replace('/tree/', '/') + '/' + path;
  if (pagesUrl !== rawUrl) {
    try {
      const res = await fetch(pagesUrl, { timeout: 5000 });
      if (res.status === 200) {
        const text = await res.text();
        return { found: true, url: pagesUrl, size: text.length, snippet: text.substring(0, 500) };
      }
    } catch (e) {}
  }
  
  return { found: false };
}

async function scanFileForSecrets(content) {
  const findings = [];
  for (const pattern of SECRET_PATTERNS) {
    const matches = content.match(pattern.regex);
    if (matches) {
      findings.push({
        type: pattern.name,
        count: matches.length,
        examples: matches.slice(0, 3).map(m => m.substring(0, 60) + (m.length > 60 ? '...' : ''))
      });
    }
  }
  return findings;
}

async function scanRepo(repoUrl, fullScan = false) {
  const result = {
    repo: repoUrl,
    scanned_at: new Date().toISOString(),
    exposed_files: [],
    secrets_found: [],
    misconfigs: [],
    risk_score: 0,
    summary: ''
  };

  // Normalize URL
  let normalized = repoUrl.replace(/\/+$/, '');
  if (normalized.endsWith('.git')) normalized = normalized.slice(0, -4);
  
  // Check sensitive paths
  const pathsToCheck = fullScan ? SENSITIVE_PATHS : SENSITIVE_PATHS.slice(0, 4);
  
  for (const path of pathsToCheck) {
    const check = await checkPath(normalized, path);
    if (check.found) {
      result.exposed_files.push({
        file: path,
        url: check.url,
        size: check.size
      });
      
      // Scan content for secrets
      if (fullScan || path.includes('.env') || path.includes('config')) {
        const secrets = await scanFileForSecrets(check.snippet);
        result.secrets_found.push(...secrets);
      }
    }
  }

  // Check for common misconfigs (full scan only)
  if (fullScan) {
    // Check if .git/config exposes remote origin with token
    const gitConfig = result.exposed_files.find(f => f.file === '.git/config');
    if (gitConfig) {
      result.misconfigs.push({
        issue: 'Exposed .git directory',
        severity: 'CRITICAL',
        detail: 'Entire .git repo is accessible. Attackers can extract full source history, including deleted secrets.',
        reference: 'https://stackoverflow.com/questions/15887611/how-do-i-remove-a-git-repository-entirely-from-a-web-server'
      });
      result.risk_score += 50;
    }

    // Check .env exposure
    const envFile = result.exposed_files.find(f => f.file.includes('.env'));
    if (envFile) {
      result.misconfigs.push({
        issue: 'Exposed environment file',
        severity: 'CRITICAL',
        detail: '.env file contains sensitive configuration visible to anyone.',
        reference: 'https://12factor.net/config'
      });
      result.risk_score += 40;
    }

    // Check for hardcoded secrets
    if (result.secrets_found.length > 0) {
      result.misconfigs.push({
        issue: 'Hardcoded secrets in source',
        severity: 'HIGH',
        detail: `Found ${result.secrets_found.length} type(s) of secrets hardcoded in repository files.`,
        reference: 'https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html'
      });
      result.risk_score += 30;
    }

    // Check for exposed package.json (dependency info)
    const pkgJson = result.exposed_files.find(f => f.file === 'package.json');
    if (pkgJson) {
      result.misconfigs.push({
        issue: 'Exposed package.json',
        severity: 'LOW',
        detail: 'Attackers can enumerate dependencies and find known vulnerabilities.',
        reference: 'https://snyk.io/vuln'
      });
      result.risk_score += 5;
    }
  }

  // Deduplicate secrets
  const seen = new Set();
  result.secrets_found = result.secrets_found.filter(s => {
    if (seen.has(s.type)) return false;
    seen.add(s.type);
    return true;
  });

  // Summary
  if (result.risk_score >= 50) {
    result.summary = `CRITICAL: ${result.exposed_files.length} exposed files, ${result.secrets_found.length} secret type(s). Immediate action required.`;
  } else if (result.risk_score >= 20) {
    result.summary = `HIGH: ${result.exposed_files.length} exposed files found. Review recommended.`;
  } else if (result.exposed_files.length > 0) {
    result.summary = `MEDIUM: ${result.exposed_files.length} exposed file(s).`;
  } else {
    result.summary = 'No obvious exposures found in quick scan.';
  }

  return result;
}

module.exports = { scanRepo };
