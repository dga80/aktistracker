const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Persistent configuration
const CONFIG_PATH = path.join(__dirname, 'config.json');
let appConfig = {
  scanInterval: 'disabled', // 'disabled', '1h', '4h', '8h', '24h'
  savePath: path.join(__dirname, 'reportes_automaticos'),
  exportFormat: 'xlsx'
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      appConfig = { ...appConfig, ...JSON.parse(data) };
      console.log('Configuración cargada correctamente:', appConfig);
    }
  } catch (e) {
    console.error('Error al cargar la configuración:', e.message);
  }
}

function saveConfig(newConfig) {
  try {
    appConfig = { ...appConfig, ...newConfig };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2), 'utf8');
    setupAutomaticScan();
    return true;
  } catch (e) {
    console.error('Error al guardar la configuración:', e.message);
    return false;
  }
}

// Scan caching
const CACHE_PATH = path.join(__dirname, 'scan_cache.json');
let scanCache = { files: {} };

function loadScanCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const data = fs.readFileSync(CACHE_PATH, 'utf8');
      scanCache = JSON.parse(data);
      console.log(`Caché de escaneo cargada con ${Object.keys(scanCache.files).length} archivos.`);
    }
  } catch (e) {
    console.error('Error al cargar la caché de escaneo:', e.message);
  }
}

function saveScanCache() {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(scanCache, null, 2), 'utf8');
  } catch (e) {
    console.error('Error al guardar la caché de escaneo:', e.message);
  }
}

// Target directories to scan
const TARGET_DIRECTORIES = [
  { name: '02-AyC', path: '\\\\172.30.0.10\\Compras\\02-AyC' },
  { name: '03-LOESS', path: '\\\\172.30.0.10\\Compras\\03-LOESS' },
  { name: '04-CESA', path: '\\\\172.30.0.10\\Compras\\04-CESA' }
];

// Normalizes order codes by replacing separators with dots and removing leading zeros in suborders
function normalizeOrderCode(code) {
  if (!code) return '';
  let clean = String(code).toUpperCase().trim();
  // Strip REF. or REF prefix at start
  clean = clean.replace(/^REF\.?\s*/i, '');
  // Remove any leading dots/separators
  clean = clean.replace(/^[\.\-\s_]+/g, '');
  clean = clean.replace(/[\-\s_]/g, '.').replace(/\.+/g, '.').trim();
  const parts = clean.split('.');
  if (parts.length > 1) {
    const main = parts[0];
    const sub = parts[1].replace(/^0+/, ''); // remove leading zeros in suborders
    return sub !== '' ? `${main}.${sub}` : main;
  }
  return clean;
}

// Extracts the order code from a file name (handles A0/C0/L0, PT, CNJ, SBL, REF, and digit-only orders)
function extractOrderCode(filename) {
  if (!filename) return '';
  // Strip extension
  const nameWithoutExt = filename.replace(/\.[a-zA-Z0-9]+$/, '').trim();

  // 1. Check if filename starts with A0/C0/L0/PT/CNJ/SBL followed by digits and optional separators:
  // e.g. A07351.1, L05035, PT25-023-05, CNJ03816, SBL123-45
  const matchPrefix = nameWithoutExt.match(/^([a-zA-Z]{1,5}\d+[\.\-\d]*)/i);
  if (matchPrefix) {
    return matchPrefix[1];
  }

  // 2. Check if filename starts with REF prefix:
  // e.g. REF.6193.58, REF.6193-58
  const matchRefStart = nameWithoutExt.match(/^(ref\.?\s*\d+[\.\-\d]*)/i);
  if (matchRefStart) {
    return matchRefStart[1];
  }

  // 3. Check if filename starts with digits:
  // e.g. 6193.3, 6193-3, 6420.2.3
  const matchDigitsStart = nameWithoutExt.match(/^(\d{4,}[\.\-\d]*)/);
  if (matchDigitsStart) {
    return 'REF.' + matchDigitsStart[1];
  }

  // 4. Check if contains REF in the middle:
  // e.g. "... ref. 6193.58 ..."
  const matchRefMid = nameWithoutExt.match(/ref\.?\s*(\d+[\.\-\d]*)/i);
  if (matchRefMid) {
    return 'REF.' + matchRefMid[1];
  }

  return '';
}

// Helper to check if a date is within 1 month from today (including past dates)
function isWithinOneMonth(val) {
  if (val === undefined || val === null || String(val).trim() === '') {
    return false;
  }
  let dateObj = null;
  if (typeof val === 'number') {
    if (val > 40000 && val < 60000) {
      try {
        const parsed = xlsx.SSF.parse_date_code(val);
        dateObj = new Date(parsed.y, parsed.m - 1, parsed.d);
      } catch (e) {
        // Fallback to timestamp conversion
      }
    }
  } else {
    const str = String(val).trim();
    const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const year = parseInt(match[3], 10);
      dateObj = new Date(year, month, day);
    } else {
      const parsed = Date.parse(str);
      if (!isNaN(parsed)) {
        dateObj = new Date(parsed);
      }
    }
  }

  if (!dateObj || isNaN(dateObj.getTime())) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dateObj.setHours(0, 0, 0, 0);

  const limitDate = new Date(today);
  limitDate.setMonth(today.getMonth() + 1); // 1 month in the future

  return dateObj <= limitDate;
}

// Reads the active orders from the "Listado" sheet of LISTADO PEDIDOS EN CURSO AKTIS.xlsm (Column G/SBº)
function getActiveOrders() {
  const activeMap = new Map();
  const listadoPath = '\\\\172.30.0.10\\Oficina_tecnica\\99-PEDIDOS EN CURSO AKTIS\\LISTADO PEDIDOS EN CURSO AKTIS.xlsm';
  if (!fs.existsSync(listadoPath)) {
    console.error(`Active listado file not found at ${listadoPath}`);
    return activeMap;
  }
  try {
    const wb = xlsx.readFile(listadoPath);
    const sheetName = 'Listado';
    if (wb.SheetNames.includes(sheetName)) {
      const sheet = wb.Sheets[sheetName];
      const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      
      let sbColIdx = 6; // fallback to column 6 (G)
      let fechaColIdx = 10; // fallback to column 10 (K)
      let estadoMatColIdx = 19; // fallback to column 19 (T)
      
      const searchLimit = Math.min(12, rawRows.length);
      for (let r = 0; r < searchLimit; r++) {
        const row = rawRows[r];
        if (!row) continue;
        const idx = row.findIndex(val => String(val).toLowerCase().trim() === 'sbº' || String(val).toLowerCase().trim() === 'sb');
        if (idx !== -1) {
          sbColIdx = idx;
        }
        const fIdx = row.findIndex(val => String(val).toLowerCase().trim() === 'fecha confirmada' || String(val).toLowerCase().trim() === 'fecha_confirmada');
        if (fIdx !== -1) {
          fechaColIdx = fIdx;
        }
        const emIdx = row.findIndex(val => {
          const s = String(val).toLowerCase().trim();
          return s === 'estado materiales' || s === 'estado_materiales';
        });
        if (emIdx !== -1) {
          estadoMatColIdx = emIdx;
        }
      }
      
      for (let r = 1; r < rawRows.length; r++) {
        const row = rawRows[r];
        if (row && row.length > sbColIdx) {
          const val = String(row[sbColIdx]).trim();
          if (val && val.toLowerCase() !== 'nan') {
            const norm = normalizeOrderCode(val);
            let fecha = '';
            let rawFecha = null;
            if (row.length > fechaColIdx) {
              rawFecha = row[fechaColIdx];
              fecha = formatPlazo(rawFecha);
            }
            
            // Check if order is finalized (ESTADO MATERIALES === '4-F')
            let isFinalized = false;
            if (row.length > estadoMatColIdx) {
              const statusVal = String(row[estadoMatColIdx]).toUpperCase().trim();
              if (statusVal === '4-F') {
                isFinalized = true;
              }
            }
            
            if (!isFinalized) {
              activeMap.set(norm, fecha);
            }
          }
        }
      }
      console.log(`Loaded ${activeMap.size} active order codes with their delivery dates.`);
    }
  } catch (e) {
    console.error('Error loading active orders:', e.message);
  }
  return activeMap;
}

// Utility to convert Excel serial dates to DD/MM/YYYY
function formatPlazo(val) {
  if (val === undefined || val === null) return '';
  if (typeof val === 'number') {
    if (val > 40000 && val < 60000) {
      try {
        const date = xlsx.SSF.parse_date_code(val);
        const dd = String(date.d).padStart(2, '0');
        const mm = String(date.m).padStart(2, '0');
        const yyyy = date.y;
        return `${dd}/${mm}/${yyyy}`;
      } catch (e) {
        // Fallback to number if parsing fails
      }
    }
    return String(val);
  }
  return String(val).trim();
}

// Function to get references for a file, using cache if file modification date matches
function getReferencesForFile(file, targetName, activeOrdersMap) {
  let fileRefs = [];
  try {
    const stat = fs.statSync(file.path);
    const mtime = stat.mtimeMs;
    const size = stat.size;

    // Check if cache matches
    if (scanCache.files[file.path] &&
        scanCache.files[file.path].mtime === mtime &&
        scanCache.files[file.path].size === size) {
      fileRefs = scanCache.files[file.path].references;
    } else {
      // Parse file
      const workbook = xlsx.readFile(file.path);
      const folderName = path.basename(path.dirname(file.path));

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (rawRows.length === 0) continue;

        let headerRowIndex = -1;
        let codeColIdx = -1;
        let pteColIdx = -1;
        let plazoColIdx = -1;

        const searchLimit = Math.min(12, rawRows.length);
        for (let r = 0; r < searchLimit; r++) {
          const row = rawRows[r];
          let foundCode = -1;
          let foundPte = -1;
          let foundPlazo = -1;

          for (let c = 0; c < row.length; c++) {
            const val = String(row[c]).toLowerCase().trim();
            if (val.includes('código') || val.includes('codigo') || val.includes('referencia') || val === 'ref' || val.includes('refconsum')) {
              foundCode = c;
            }
            if (val === 'pte' || val === 'pte.' || val === 'pend' || val === 'pendiente' || val === 'pendientes') {
              foundPte = c;
            }
            if (val.includes('plazo')) {
              foundPlazo = c;
            }
          }

          if (foundCode !== -1 && foundPte !== -1) {
            headerRowIndex = r;
            codeColIdx = foundCode;
            pteColIdx = foundPte;
            plazoColIdx = foundPlazo;
            break;
          }
        }

        if (headerRowIndex !== -1) {
          for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
            const row = rawRows[r];
            if (!row || row.length <= Math.max(codeColIdx, pteColIdx)) continue;

            const codeVal = String(row[codeColIdx]).trim();
            const pteVal = row[pteColIdx];
            const plazoVal = plazoColIdx !== -1 && plazoColIdx < row.length ? row[plazoColIdx] : '';
            const formattedPlazoVal = formatPlazo(plazoVal);

            if (codeVal !== '' && codeVal.toLowerCase() !== 'nan') {
              const pteNum = parseFloat(pteVal);
              const isPendingNum = !isNaN(pteNum) && pteNum !== 0;
              const isPendingStr = isNaN(pteNum) && String(pteVal).trim() !== '' && String(pteVal).trim() !== '0';

              if (isPendingNum || isPendingStr) {
                fileRefs.push({
                  division: targetName,
                  folder: folderName,
                  file: file.name,
                  sheet: sheetName,
                  code: codeVal,
                  pte: String(pteVal).trim(),
                  plazo: formattedPlazoVal,
                  filePath: file.path
                });
              }
            }
          }
        }
      }
      // Save/update cache entry
      scanCache.files[file.path] = { mtime, size, references: fileRefs };
    }
  } catch (fileError) {
    console.error(`Failed to process Excel file ${file.path}:`, fileError.message);
  }

  // Resolve with latest active order dates dynamically
  return fileRefs.map(ref => {
    const fileOrderCode = extractOrderCode(ref.file);
    const normalizedFileCode = normalizeOrderCode(fileOrderCode);
    let fechaConfirmadaOF = activeOrdersMap.get(normalizedFileCode);
    if (!fechaConfirmadaOF) {
      const baseFileCode = normalizedFileCode.split('.')[0];
      fechaConfirmadaOF = activeOrdersMap.get(baseFileCode) || '';
    }
    return { ...ref, fechaConfirmada: fechaConfirmadaOF };
  });
}

// Recursive function to search for Excel files
function scanDirectory(dir, filesList = []) {
  if (!fs.existsSync(dir)) {
    console.log(`Directory does not exist: ${dir}`);
    return filesList;
  }

  const items = fs.readdirSync(dir);
  for (const item of items) {
    const lowerItem = item.toLowerCase();
    
    // Ignore folders named "correo" or "correos"
    if (lowerItem === 'correo' || lowerItem === 'correos') {
      continue;
    }

    const fullPath = path.join(dir, item);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDirectory(fullPath, filesList);
      } else if (stat.isFile()) {
        // Skip Excel temporary files starting with ~$
        if (item.startsWith('~$')) {
          continue;
        }
        const ext = path.extname(item).toLowerCase();
        if (ext === '.xlsx' || ext === '.xls') {
          filesList.push({ name: item, path: fullPath });
        }
      }
    } catch (e) {
      console.error(`Error reading ${fullPath}:`, e.message);
    }
  }
  return filesList;
}

// Open file endpoint
app.post('/api/open-file', (req, res) => {
  const { filepath } = req.body;
  if (!filepath) {
    return res.status(400).json({ success: false, error: 'Ruta vacía' });
  }

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ success: false, error: 'El archivo no se encuentra o no está accesible.' });
  }

  try {
    const { exec } = require('child_process');
    const normalizedPath = path.normalize(filepath);
    exec(`cmd /c start "" "${normalizedPath}"`, (error) => {
      if (error) {
        console.error('Error opening file via cmd:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
      return res.json({ success: true });
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Open containing folder endpoint
app.post('/api/open-folder', (req, res) => {
  const { filepath } = req.body;
  if (!filepath) {
    return res.status(400).json({ success: false, error: 'Ruta vacía' });
  }

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ success: false, error: 'El archivo o carpeta no se encuentra.' });
  }

  try {
    const { exec } = require('child_process');
    const normalizedPath = path.normalize(filepath);
    exec(`explorer.exe /select,"${normalizedPath}"`, (error) => {
      if (error) {
        console.error('Error opening folder via explorer:', error);
        exec(`explorer.exe "${path.dirname(normalizedPath)}"`);
      }
      return res.json({ success: true });
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Config API
app.get('/api/config', (req, res) => {
  res.json({ success: true, config: appConfig });
});

app.post('/api/config', (req, res) => {
  const newConfig = req.body;
  if (newConfig) {
    const success = saveConfig(newConfig);
    if (success) {
      return res.json({ success: true, message: 'Configuración guardada correctamente.', config: appConfig });
    }
  }
  res.status(500).json({ success: false, error: 'Error al guardar la configuración.' });
});

// Scan endpoint
app.get('/api/scan', (req, res) => {
  console.log('Starting scan with smart caching...');
  const pendingReferences = [];
  let totalFilesScanned = 0;
  
  loadScanCache();
  const newCacheFiles = {};

  try {
    const activeOrdersMap = getActiveOrders();

    for (const target of TARGET_DIRECTORIES) {
      console.log(`Scanning division: ${target.name} at path: ${target.path}`);
      
      const allFiles = [];
      scanDirectory(target.path, allFiles);
      
      // Filter scanned files: they must match an active order in activeOrdersMap (Column G)
      const files = allFiles.filter(file => {
        const fileOrderCode = extractOrderCode(file.name);
        if (fileOrderCode) {
          const normalizedFileCode = normalizeOrderCode(fileOrderCode);
          let isActive = activeOrdersMap.has(normalizedFileCode);
          if (!isActive) {
            const baseFileCode = normalizedFileCode.split('.')[0];
            isActive = activeOrdersMap.has(baseFileCode);
          }
          return isActive;
        }
        return false;
      });

      totalFilesScanned += files.length;

      for (const file of files) {
        const fileRefs = getReferencesForFile(file, target.name, activeOrdersMap);
        pendingReferences.push(...fileRefs);
        
        // Copy the updated cache entry to the new cache index to preserve it
        if (scanCache.files[file.path]) {
          newCacheFiles[file.path] = scanCache.files[file.path];
        }
      }
    }

    // Save cleaned cache (only contains currently scanned/active files)
    scanCache.files = newCacheFiles;
    saveScanCache();

    res.json({
      success: true,
      filesScanned: totalFilesScanned,
      totalPending: pendingReferences.length,
      results: pendingReferences
    });
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Automatic scanning timers
let scanTimer = null;

function setupAutomaticScan() {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }

  const interval = appConfig.scanInterval;
  if (!interval || interval === 'disabled') {
    console.log('[AUTO-SCAN] Los escaneos automáticos están desactivados.');
    return;
  }

  let ms = 0;
  if (interval === '1h') ms = 60 * 60 * 1000;
  else if (interval === '4h') ms = 4 * 60 * 60 * 1000;
  else if (interval === '8h') ms = 8 * 60 * 60 * 1000;
  else if (interval === '24h') ms = 24 * 60 * 60 * 1000;
  else {
    console.log(`[AUTO-SCAN] Intervalo no reconocido: ${interval}`);
    return;
  }

  console.log(`[AUTO-SCAN] Programando escaneo automático cada ${interval} (${ms} ms)...`);
  scanTimer = setInterval(runAutomaticScan, ms);
}

async function runAutomaticScan() {
  console.log('[AUTO-SCAN] Iniciando escaneo automático programado con caché inteligente...');
  const pendingReferences = [];
  let totalFilesScanned = 0;
  
  loadScanCache();
  const newCacheFiles = {};

  try {
    const activeOrdersMap = getActiveOrders();

    for (const target of TARGET_DIRECTORIES) {
      if (!fs.existsSync(target.path)) continue;
      
      const allFiles = [];
      scanDirectory(target.path, allFiles);
      
      const files = allFiles.filter(file => {
        const fileOrderCode = extractOrderCode(file.name);
        if (fileOrderCode) {
          const normalizedFileCode = normalizeOrderCode(fileOrderCode);
          const baseFileCode = normalizedFileCode.split('.')[0];
          return activeOrdersMap.has(normalizedFileCode) || activeOrdersMap.has(baseFileCode);
        }
        return false;
      });

      totalFilesScanned += files.length;

      for (const file of files) {
        const fileRefs = getReferencesForFile(file, target.name, activeOrdersMap);
        pendingReferences.push(...fileRefs);
        
        if (scanCache.files[file.path]) {
          newCacheFiles[file.path] = scanCache.files[file.path];
        }
      }
    }

    scanCache.files = newCacheFiles;
    saveScanCache();

    if (pendingReferences.length > 0) {
      const excelRows = pendingReferences.map(item => ({
        'División': item.division.substring(3),
        'Carpeta de Compra': item.folder,
        'Archivo Excel': item.file,
        'Pestaña / Hoja': item.sheet,
        'Código de Referencia': item.code,
        'Cantidad Pendiente (PTE)': isNaN(Number(item.pte)) ? item.pte : Number(item.pte),
        'Plazo Proveedor': item.plazo,
        'Fecha Confirmada OF': item.fechaConfirmada,
        'Ruta Completa Archivo': item.filePath
      }));

      const worksheet = xlsx.utils.json_to_sheet(excelRows);
      
      const maxColWidths = {};
      excelRows.forEach(row => {
        Object.keys(row).forEach(key => {
          const val = row[key];
          const valLength = val ? String(val).length : 0;
          maxColWidths[key] = Math.max(maxColWidths[key] || 0, valLength, key.length);
        });
      });
      worksheet['!cols'] = Object.keys(maxColWidths).map(key => ({
        wch: Math.min(maxColWidths[key] + 3, 50)
      }));

      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Pedidos Pendientes');

      const saveDir = appConfig.savePath;
      if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
      }

      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const hh = String(today.getHours()).padStart(2, '0');
      const min = String(today.getMinutes()).padStart(2, '0');
      
      const filename = `Reporte_Automatico_Pendientes_${dd}_${mm}_${yyyy}_${hh}${min}.xlsx`;
      const fullSavePath = path.join(saveDir, filename);
      
      xlsx.writeFile(workbook, fullSavePath);
      console.log(`[AUTO-SCAN] Reporte automático guardado en: ${fullSavePath}`);
    } else {
      console.log('[AUTO-SCAN] No se encontraron referencias pendientes.');
    }
  } catch (error) {
    console.error('[AUTO-SCAN] Error en escaneo automático:', error.message);
  }
}

// Start server and load config
loadConfig();
loadScanCache();
setupAutomaticScan();

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
