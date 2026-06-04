// Frontend Application Logic

let allData = [];
let filteredData = [];
let currentFilter = 'all';
let currentSortColumn = '';
let isAscending = true;
let currentPage = 1;
const rowsPerPage = 15;

// State for grouped view
let isGroupedView = true;
const groupsPerPage = 8;
let collapsedGroups = new Set(JSON.parse(localStorage.getItem('aktistracker_collapsed_groups') || '[]'));
let hiddenRows = new Set(JSON.parse(localStorage.getItem('aktistracker_hidden_rows') || '[]'));

// Initialize Theme & Lucide Icons
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  lucide.createIcons();
  setupEventListeners();
  loadAppConfig();
});

function setupEventListeners() {
  // Theme toggle
  document.getElementById('btn-theme-toggle').addEventListener('click', toggleTheme);

  // Scan buttons
  document.getElementById('btn-scan').addEventListener('click', triggerScan);
  document.getElementById('btn-scan-welcome').addEventListener('click', triggerScan);

  // Settings buttons
  document.getElementById('btn-settings').addEventListener('click', openSettingsModal);
  document.getElementById('modal-close-btn').addEventListener('click', closeSettingsModal);
  document.getElementById('btn-cancel-settings').addEventListener('click', closeSettingsModal);
  document.getElementById('btn-save-settings').addEventListener('click', saveAppConfig);

  // View toggle button
  const btnView = document.getElementById('btn-view-toggle');
  if (btnView) {
    btnView.addEventListener('click', toggleViewMode);
    // Set initial class/text
    if (isGroupedView) {
      btnView.classList.add('active');
      document.getElementById('view-toggle-text').innerText = 'Vista: Agrupada';
    } else {
      btnView.classList.remove('active');
      document.getElementById('view-toggle-text').innerText = 'Vista: Plana';
    }
  }

  // Tab filter buttons
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      tabBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.getAttribute('data-filter');
      applyFilters();
    });
  });

  // KPI card quick division filtering
  const kpiCards = document.querySelectorAll('.division-kpi');
  kpiCards.forEach(card => {
    card.addEventListener('click', () => {
      const div = card.getAttribute('data-division');
      // Highlight the corresponding tab button
      tabBtns.forEach(b => {
        if (b.getAttribute('data-filter') === div) {
          b.click();
        }
      });
    });
  });

  // Search input
  document.getElementById('search-input').addEventListener('input', applyFilters);

  // Export button
  document.getElementById('btn-export').addEventListener('click', exportToExcel);

  // Print button
  document.getElementById('btn-print').addEventListener('click', () => {
    window.print();
  });

  // Sorting columns
  const headers = document.querySelectorAll('.results-table th');
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const col = header.getAttribute('data-sort');
      if (col) {
        handleSort(col);
      }
    });
  });

  // Pagination buttons (bottom)
  document.getElementById('btn-prev-page').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderTable();
    }
  });

  document.getElementById('btn-next-page').addEventListener('click', () => {
    const totalPages = getPagesCount();
    if (currentPage < totalPages) {
      currentPage++;
      renderTable();
    }
  });

  // Pagination buttons (top)
  document.getElementById('btn-prev-page-top').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderTable();
    }
  });

  document.getElementById('btn-next-page-top').addEventListener('click', () => {
    const totalPages = getPagesCount();
    if (currentPage < totalPages) {
      currentPage++;
      renderTable();
    }
  });

  // Table row hiding event delegation
  document.getElementById('table-body').addEventListener('click', (e) => {
    const btnHide = e.target.closest('.btn-hide-row');
    if (btnHide) {
      e.stopPropagation();
      const rowId = btnHide.getAttribute('data-row-id');
      hideRow(rowId);
      return;
    }

    const btnUnhide = e.target.closest('.btn-unhide-row');
    if (btnUnhide) {
      e.stopPropagation();
      const rowId = btnUnhide.getAttribute('data-row-id');
      unhideRow(rowId);
      return;
    }
  });
}

function triggerScan() {
  // Show loading state, hide other cards
  document.getElementById('initial-state').classList.add('hidden');
  document.getElementById('dashboard-view').classList.add('hidden');
  document.getElementById('loading-state').classList.remove('hidden');
  
  // Disable scan button in header
  const btnScan = document.getElementById('btn-scan');
  btnScan.disabled = true;
  document.getElementById('scan-text').innerText = 'Escaneando...';

  // Animate loading progress bar smoothly
  const progressBar = document.getElementById('progress-bar');
  const loadingMsg = document.getElementById('loading-message');
  progressBar.style.width = '0%';
  
  let width = 0;
  const loadingSteps = [
    { limit: 25, msg: 'Conectando con el servidor local...' },
    { limit: 55, msg: 'Buscando archivos Excel en directorios de red...' },
    { limit: 80, msg: 'Extrayendo referencias pendientes de AyC, LOESS y CESA...' },
    { limit: 95, msg: 'Compilando resultados de escaneo...' }
  ];

  const interval = setInterval(() => {
    if (width < 95) {
      width += 1;
      progressBar.style.width = width + '%';
      
      const step = loadingSteps.find(s => width <= s.limit);
      if (step) {
        loadingMsg.innerText = step.msg;
      }
    }
  }, 100);

  // Call scan API
  fetch('/api/scan')
    .then(response => {
      if (!response.ok) {
        throw new Error('La conexión con el servidor falló.');
      }
      return response.json();
    })
    .then(data => {
      clearInterval(interval);
      progressBar.style.width = '100%';
      loadingMsg.innerText = '¡Proceso completado!';
      
      setTimeout(() => {
        // Store data
        allData = data.results || [];
        filteredData = [...allData];
        
        // Update KPIs (with safety null checks)
        const kpiFiles = document.getElementById('kpi-files-scanned');
        if (kpiFiles) kpiFiles.innerText = data.filesScanned || 0;
        const kpiTotal = document.getElementById('kpi-total-pending');
        if (kpiTotal) kpiTotal.innerText = data.totalPending || 0;
        
        // Division counts
        const aycCount = allData.filter(i => i.division === '02-AyC').length;
        const loessCount = allData.filter(i => i.division === '03-LOESS').length;
        const cesaCount = allData.filter(i => i.division === '04-CESA').length;
        
        const kpiAyc = document.getElementById('kpi-ayc');
        if (kpiAyc) kpiAyc.innerText = aycCount;
        const kpiLoess = document.getElementById('kpi-loess');
        if (kpiLoess) kpiLoess.innerText = loessCount;
        const kpiCesa = document.getElementById('kpi-cesa');
        if (kpiCesa) kpiCesa.innerText = cesaCount;

        // Reset filter view
        currentFilter = 'all';
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(b => b.classList.remove('active'));
        document.querySelector('.tab-btn[data-filter="all"]').classList.add('active');
        document.getElementById('search-input').value = '';
        currentPage = 1;

        // Sort by default by closest "fechaConfirmada" (Fecha Confirmada OF)
        currentSortColumn = '';
        handleSort('fechaConfirmada');

        // Switch screens
        document.getElementById('loading-state').classList.add('hidden');
        document.getElementById('dashboard-view').classList.remove('hidden');
        
        // Re-enable scan button
        btnScan.disabled = false;
        document.getElementById('scan-text').innerText = 'Volver a Escanear';
      }, 500);
    })
    .catch(error => {
      clearInterval(interval);
      console.error(error);
      alert('Error en el escaneo: ' + error.message);
      
      // Reset views
      document.getElementById('loading-state').classList.add('hidden');
      document.getElementById('initial-state').classList.remove('hidden');
      btnScan.disabled = false;
      document.getElementById('scan-text').innerText = 'Iniciar Escaneo';
    });
}

function applyFilters() {
  const searchText = document.getElementById('search-input').value.toLowerCase().trim();
  
  filteredData = allData.filter(item => {
    // 1. Division filter
    const matchesDiv = currentFilter === 'all' || item.division === currentFilter;
    
    // 2. Search Text filter
    const matchesSearch = searchText === '' ||
      item.code.toLowerCase().includes(searchText) ||
      item.file.toLowerCase().includes(searchText) ||
      item.folder.toLowerCase().includes(searchText) ||
      item.sheet.toLowerCase().includes(searchText) ||
      item.plazo.toLowerCase().includes(searchText) ||
      (item.fechaConfirmada && item.fechaConfirmada.toLowerCase().includes(searchText));
      
    return matchesDiv && matchesSearch;
  });

  currentPage = 1;
  renderTable();
}

function toggleViewMode() {
  isGroupedView = !isGroupedView;
  currentPage = 1; // Reset to page 1 to avoid pagination bugs
  
  const btn = document.getElementById('btn-view-toggle');
  const textSpan = document.getElementById('view-toggle-text');
  
  if (btn && textSpan) {
    if (isGroupedView) {
      btn.classList.add('active');
      textSpan.innerText = 'Vista: Agrupada';
    } else {
      btn.classList.remove('active');
      textSpan.innerText = 'Vista: Plana';
    }
  }
  
  renderTable();
}

function getVisibleRows() {
  const groupsMap = new Map();
  const groupsList = [];
  filteredData.forEach(item => {
    const key = item.filePath;
    if (!groupsMap.has(key)) {
      const newGroup = {
        filePath: item.filePath,
        folder: item.folder,
        file: item.file,
        division: item.division,
        items: []
      };
      groupsMap.set(key, newGroup);
      groupsList.push(newGroup);
    }
    groupsMap.get(key).items.push(item);
  });

  const visibleRows = [];
  groupsList.forEach((group, groupIdx) => {
    visibleRows.push({
      type: 'header',
      group: group,
      groupIdx: groupIdx
    });
    
    if (!collapsedGroups.has(group.filePath) && !hiddenRows.has(group.filePath)) {
      group.items.forEach((item, idx) => {
        visibleRows.push({
          type: 'subrow',
          item: item,
          group: group,
          groupIdx: groupIdx,
          idx: idx,
          isLast: idx === group.items.length - 1
        });
      });
    }
  });
  return visibleRows;
}

function getPagesCount() {
  if (isGroupedView) {
    return Math.ceil(getVisibleRows().length / rowsPerPage) || 1;
  } else {
    return Math.ceil(filteredData.length / rowsPerPage) || 1;
  }
}

function getDivisionClass(division) {
  if (division === '02-AyC') return 'ayc';
  if (division === '03-LOESS') return 'loess';
  if (division === '04-CESA') return 'cesa';
  return '';
}

function toggleGroupCollapse(filePath) {
  if (collapsedGroups.has(filePath)) {
    collapsedGroups.delete(filePath);
  } else {
    collapsedGroups.add(filePath);
  }
  localStorage.setItem('aktistracker_collapsed_groups', JSON.stringify([...collapsedGroups]));
  renderTable();
}

function hideRow(rowId) {
  hiddenRows.add(rowId);
  localStorage.setItem('aktistracker_hidden_rows', JSON.stringify([...hiddenRows]));
  renderTable();
}

function unhideRow(rowId) {
  hiddenRows.delete(rowId);
  localStorage.setItem('aktistracker_hidden_rows', JSON.stringify([...hiddenRows]));
  renderTable();
}

function updatePaginationUI(totalPages) {
  const paginationControls = document.getElementById('pagination-controls');
  const paginationControlsTop = document.getElementById('pagination-controls-top');

  if (totalPages > 1) {
    paginationControls.classList.remove('hidden');
    paginationControlsTop.classList.remove('hidden');
    
    document.getElementById('page-info').innerText = `Página ${currentPage} de ${totalPages}`;
    document.getElementById('btn-prev-page').disabled = (currentPage === 1);
    document.getElementById('btn-next-page').disabled = (currentPage === totalPages);

    document.getElementById('page-info-top').innerText = `Página ${currentPage} de ${totalPages}`;
    document.getElementById('btn-prev-page-top').disabled = (currentPage === 1);
    document.getElementById('btn-next-page-top').disabled = (currentPage === totalPages);
  } else {
    paginationControls.classList.add('hidden');
    paginationControlsTop.classList.add('hidden');
  }
}

function renderTable() {
  const tbody = document.getElementById('table-body');
  const noResults = document.getElementById('no-results');
  const paginationControls = document.getElementById('pagination-controls');
  const paginationControlsTop = document.getElementById('pagination-controls-top');
  tbody.innerHTML = '';

  if (filteredData.length === 0) {
    noResults.classList.remove('hidden');
    paginationControls.classList.add('hidden');
    paginationControlsTop.classList.add('hidden');
    return;
  }
  
  noResults.classList.add('hidden');

  if (isGroupedView) {
    const visibleRows = getVisibleRows();
    const totalPages = Math.ceil(visibleRows.length / rowsPerPage) || 1;
    if (currentPage > totalPages) {
      currentPage = totalPages;
    }

    updatePaginationUI(totalPages);

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageRows = visibleRows.slice(start, end);

    pageRows.forEach(row => {
      if (row.type === 'header') {
        const group = row.group;
        const groupIdx = row.groupIdx;
        const isCollapsed = collapsedGroups.has(group.filePath);
        const isHidden = hiddenRows.has(group.filePath);
        
        const headerTr = document.createElement('tr');
        headerTr.setAttribute('data-group-id', `group-${groupIdx}`);
        
        if (isHidden) {
          headerTr.className = `group-header group-header-${getDivisionClass(group.division)} row-hidden-collapsed`;
          headerTr.innerHTML = `
            <td colspan="8" style="padding: 4px 12px !important;">
              <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; line-height: 1.2;">
                <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted); opacity: 0.65;">
                  <i data-lucide="eye-off" style="width: 12px; height: 12px;"></i>
                  <span>Línea oculta: <strong>${group.folder} / ${group.file}</strong> (${group.items.length} ${group.items.length === 1 ? 'pendiente' : 'pendientes'})</span>
                </div>
                <button class="btn-unhide-row" title="Mostrar carpeta de pedido" data-row-id="${group.filePath}" style="background:transparent; border:none; color:var(--primary); cursor:pointer; font-weight:600; font-size:11px; display:flex; align-items:center; gap:4px;">
                  <i data-lucide="eye" style="width:12px;height:12px;"></i> Mostrar
                </button>
              </div>
            </td>
          `;

          headerTr.addEventListener('click', (e) => {
            if (e.target.closest('.btn-unhide-row')) {
              return;
            }
          });
        } else {
          headerTr.className = `group-header group-header-${getDivisionClass(group.division)}`;
          
          let divText = '';
          if (group.division === '02-AyC') divText = '<span style="color: var(--ayc-color); font-weight: 700; margin-right: 4px; font-size: 12px; letter-spacing: 0.5px;">AYC</span>';
          else if (group.division === '03-LOESS') divText = '<span style="color: var(--loess-color); font-weight: 700; margin-right: 4px; font-size: 12px; letter-spacing: 0.5px;">LOESS</span>';
          else if (group.division === '04-CESA') divText = '<span style="color: var(--cesa-color); font-weight: 700; margin-right: 4px; font-size: 12px; letter-spacing: 0.5px;">CESA</span>';

          headerTr.innerHTML = `
            <td colspan="8">
              <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; line-height: 1.2;">
                <div class="group-title-container" style="gap: 6px;">
                  <i data-lucide="chevron-down" class="group-chevron ${isCollapsed ? 'collapsed' : ''}" style="margin-right: 4px;"></i>
                  ${divText}
                  <span class="group-folder-link" title="${group.filePath}" style="font-weight: 500;">${group.folder}</span>
                  <span style="opacity: 0.4;">/</span>
                  <span class="group-file-link" title="${group.filePath}" style="font-weight: 600; color: var(--primary);">${group.file}</span>
                </div>
                <div class="group-info-container" style="display: flex; align-items: center; gap: 10px;">
                  <span style="font-size: 12px; color: var(--text-muted); font-weight: 500;">${group.items.length} ${group.items.length === 1 ? 'pendiente' : 'pendientes'}</span>
                  <button class="btn-hide-row" title="Ocultar línea" data-row-id="${group.filePath}">
                    <i data-lucide="eye-off" style="width:14px;height:14px;"></i>
                  </button>
                </div>
              </div>
            </td>
          `;

          headerTr.addEventListener('click', (e) => {
            if (e.target.closest('.btn-hide-row')) {
              return;
            }
            if (e.target.classList.contains('group-folder-link')) {
              openFolderOnServer(group.filePath);
            } else if (e.target.classList.contains('group-file-link')) {
              openFileOnServer(group.filePath);
            } else {
              toggleGroupCollapse(group.filePath);
            }
          });
        }

        tbody.appendChild(headerTr);
      } else {
        const item = row.item;
        const group = row.group;
        const groupIdx = row.groupIdx;
        const idx = row.idx;
        const isLast = row.isLast;

        const itemTr = document.createElement('tr');
        itemTr.className = `group-subrow group-${groupIdx}`;
        if (isLast) {
          itemTr.classList.add('last-item-in-group');
        }

        // Format Plazo cell
        let plazoCellContent = '';
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(item.plazo)) {
          plazoCellContent = `<span class="date-plazo"><i data-lucide="calendar" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i>${item.plazo}</span>`;
        } else if (item.plazo !== '') {
          plazoCellContent = `<span class="plazo-text">${item.plazo}</span>`;
        } else {
          plazoCellContent = `<span class="plazo-text" style="color:var(--text-muted); opacity:0.5;">Sin plazo</span>`;
        }

        // Format Fecha Confirmada OF cell
        let fechaConfirmadaCellContent = '';
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(item.fechaConfirmada)) {
          fechaConfirmadaCellContent = `<span class="date-confirmada"><i data-lucide="calendar-check" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i>${item.fechaConfirmada}</span>`;
        } else if (item.fechaConfirmada && item.fechaConfirmada !== '') {
          fechaConfirmadaCellContent = `<span class="plazo-text">${item.fechaConfirmada}</span>`;
        } else {
          fechaConfirmadaCellContent = `<span class="plazo-text" style="color:var(--text-muted); opacity:0.5;">Sin fecha</span>`;
        }

        itemTr.innerHTML = `
          <td></td>
          <td></td>
          <td></td>
          <td>
            <span style="opacity: 0.85;">${item.sheet}</span>
          </td>
          <td style="font-weight:600; color:var(--primary); font-family:monospace; font-size:15px;">
            ${item.code}
          </td>
          <td class="text-center">
            <span class="badge badge-pte">${item.pte}</span>
          </td>
          <td>${plazoCellContent}</td>
          <td>${fechaConfirmadaCellContent}</td>
        `;

        tbody.appendChild(itemTr);
      }
    });

  } else {
    // RENDER FLAT VIEW (Same as original)
    const totalPages = Math.ceil(filteredData.length / rowsPerPage) || 1;
    if (currentPage > totalPages) {
      currentPage = totalPages;
    }

    updatePaginationUI(totalPages);

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageData = filteredData.slice(start, end);

    pageData.forEach(item => {
      const rowId = `${item.filePath}::${item.sheet}::${item.code}`;
      const tr = document.createElement('tr');
      
      if (hiddenRows.has(rowId)) {
        tr.className = 'row-hidden-collapsed';
        tr.innerHTML = `
          <td colspan="8" style="padding: 4px 12px;">
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--text-muted); opacity: 0.65;">
              <span>
                <i data-lucide="eye-off" style="width:12px;height:12px;vertical-align:middle;margin-right:6px;"></i>
                Línea oculta: <strong>${item.code}</strong> en ${item.division.substring(3)} / ${item.file}
              </span>
              <button class="btn-unhide-row" title="Mostrar línea" data-row-id="${rowId}" style="background:transparent;border:none;color:var(--primary);cursor:pointer;font-weight:600;font-size:11px;display:flex;align-items:center;gap:4px;">
                <i data-lucide="eye" style="width:12px;height:12px;"></i> Mostrar
              </button>
            </div>
          </td>
        `;
      } else {
        let divBadge = '';
        if (item.division === '02-AyC') divBadge = '<span class="badge badge-ayc">AyC</span>';
        else if (item.division === '03-LOESS') divBadge = '<span class="badge badge-loess">LOESS</span>';
        else if (item.division === '04-CESA') divBadge = '<span class="badge badge-cesa">CESA</span>';

        let plazoCellContent = '';
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(item.plazo)) {
          plazoCellContent = `<span class="date-plazo"><i data-lucide="calendar" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i>${item.plazo}</span>`;
        } else if (item.plazo !== '') {
          plazoCellContent = `<span class="plazo-text">${item.plazo}</span>`;
        } else {
          plazoCellContent = `<span class="plazo-text" style="color:var(--text-muted); opacity:0.5;">Sin plazo</span>`;
        }

        let fechaConfirmadaCellContent = '';
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(item.fechaConfirmada)) {
          fechaConfirmadaCellContent = `<span class="date-confirmada"><i data-lucide="calendar-check" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i>${item.fechaConfirmada}</span>`;
        } else if (item.fechaConfirmada && item.fechaConfirmada !== '') {
          fechaConfirmadaCellContent = `<span class="plazo-text">${item.fechaConfirmada}</span>`;
        } else {
          fechaConfirmadaCellContent = `<span class="plazo-text" style="color:var(--text-muted); opacity:0.5;">Sin fecha</span>`;
        }

        tr.innerHTML = `
          <td>${divBadge}</td>
          <td>
            <div class="folder-name" title="${item.filePath}">${item.folder}</div>
          </td>
          <td>
            <div class="file-name" title="${item.filePath}">${item.file}</div>
          </td>
          <td>
            <span style="opacity: 0.85;">${item.sheet}</span>
          </td>
          <td style="font-weight:600; color:var(--primary); font-family:monospace; font-size:15px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; width:100%;">
              <span>${item.code}</span>
              <button class="btn-hide-row" title="Ocultar línea" data-row-id="${rowId}">
                <i data-lucide="eye-off" style="width:14px;height:14px;"></i>
              </button>
            </div>
          </td>
          <td class="text-center">
            <span class="badge badge-pte">${item.pte}</span>
          </td>
          <td>${plazoCellContent}</td>
          <td>${fechaConfirmadaCellContent}</td>
        `;

        tr.querySelector('.file-name').addEventListener('click', () => {
          openFileOnServer(item.filePath);
        });
        tr.querySelector('.folder-name').addEventListener('click', () => {
          openFolderOnServer(item.filePath);
        });
      }
      
      tbody.appendChild(tr);
    });
  }

  // Re-run Lucide to render icon dynamically
  lucide.createIcons();
}

function parseDate(str) {
  if (!str) return null;
  const match = String(str).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // 0-indexed
    const year = parseInt(match[3], 10);
    return new Date(year, month, day);
  }
  return null;
}

function handleSort(column) {
  if (currentSortColumn === column) {
    isAscending = !isAscending;
  } else {
    currentSortColumn = column;
    isAscending = true;
  }

  // Update table header arrows
  const headers = document.querySelectorAll('.results-table th');
  headers.forEach(h => {
    h.innerHTML = h.innerHTML.replace(/ ▲| ▼/g, ''); // Clear existing arrows
    if (h.getAttribute('data-sort') === column) {
      h.innerHTML += isAscending ? ' ▲' : ' ▼';
    }
  });

  filteredData.sort((a, b) => {
    // Check if column is numeric
    if (column === 'pte') {
      const numA = parseFloat(a[column]) || 0;
      const numB = parseFloat(b[column]) || 0;
      return isAscending ? numA - numB : numB - numA;
    }

    // Check if column is date
    if (column === 'plazo' || column === 'fechaConfirmada') {
      const dateA = parseDate(a[column]);
      const dateB = parseDate(b[column]);

      if (dateA && dateB) {
        return isAscending ? dateA - dateB : dateB - dateA;
      }
      if (dateA) return isAscending ? -1 : 1; // Valid dates first
      if (dateB) return isAscending ? 1 : -1;
      return 0;
    }

    let valA = String(a[column] || '').toLowerCase();
    let valB = String(b[column] || '').toLowerCase();

    if (valA < valB) return isAscending ? -1 : 1;
    if (valA > valB) return isAscending ? 1 : -1;
    return 0;
  });

  renderTable();
}

function exportToExcel() {
  if (filteredData.length === 0) {
    alert('No hay datos en la tabla para exportar.');
    return;
  }

  // Format data for Excel
  const excelRows = filteredData.map(item => ({
    'División': item.division.substring(3), // removes number prefix (e.g. '02-AyC' -> 'AyC')
    'Carpeta de Compra': item.folder,
    'Archivo Excel': item.file,
    'Pestaña / Hoja': item.sheet,
    'Código de Referencia': item.code,
    'Cantidad Pendiente (PTE)': isNaN(Number(item.pte)) ? item.pte : Number(item.pte),
    'Plazo Proveedor': item.plazo,
    'Fecha Confirmada OF': item.fechaConfirmada,
    'Ruta Completa Archivo': item.filePath
  }));

  // Create sheet
  const worksheet = XLSX.utils.json_to_sheet(excelRows);
  
  // Style and auto-fit column widths
  const maxColWidths = {};
  excelRows.forEach(row => {
    Object.keys(row).forEach(key => {
      const val = row[key];
      const valLength = val ? String(val).length : 0;
      maxColWidths[key] = Math.max(maxColWidths[key] || 0, valLength, key.length);
    });
  });
  
  worksheet['!cols'] = Object.keys(maxColWidths).map(key => ({
    wch: Math.min(maxColWidths[key] + 3, 50) // Cap column width at 50 for readability
  }));

  // Create workbook
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Pedidos Pendientes');

  // Generate filename with date
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const filename = `Reporte_Pendientes_Compras_${dd}_${mm}_${yyyy}.xlsx`;

  // Write file
  XLSX.writeFile(workbook, filename);
}

// Settings modal helper functions
let appConfig = { scanInterval: 'disabled', savePath: '', exportFormat: 'xlsx' };

function loadAppConfig() {
  fetch('/api/config')
    .then(res => res.json())
    .then(data => {
      if (data.success && data.config) {
        appConfig = data.config;
        document.getElementById('scan-interval').value = appConfig.scanInterval || 'disabled';
        document.getElementById('save-path').value = appConfig.savePath || '';
      }
    })
    .catch(err => console.error('Error al cargar la configuración:', err));
}

function openSettingsModal() {
  loadAppConfig();
  document.getElementById('settings-modal').classList.add('active');
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.remove('active');
}

function saveAppConfig() {
  const scanInterval = document.getElementById('scan-interval').value;
  const savePath = document.getElementById('save-path').value;
  
  const btnSave = document.getElementById('btn-save-settings');
  btnSave.disabled = true;
  btnSave.innerText = 'Guardando...';

  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scanInterval, savePath })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        appConfig = data.config;
        alert(data.message || 'Configuración guardada correctamente.');
        closeSettingsModal();
      } else {
        alert('Error al guardar la configuración: ' + (data.error || 'error desconocido'));
      }
    })
    .catch(err => {
      console.error(err);
      alert('Error en la conexión con el servidor.');
    })
    .finally(() => {
      btnSave.disabled = false;
      btnSave.innerText = 'Guardar Ajustes';
    });
}

// Theme handling functions
function initTheme() {
  const currentTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);
  updateThemeIcon(currentTheme);
}

function toggleTheme() {
  const newTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('btn-theme-toggle');
  if (!btn) return;
  const icon = btn.querySelector('i');
  if (theme === 'dark') {
    icon.setAttribute('data-lucide', 'sun');
    btn.title = 'Cambiar a modo claro';
  } else {
    icon.setAttribute('data-lucide', 'moon');
    btn.title = 'Cambiar a modo oscuro';
  }
  lucide.createIcons();
}

// File and folder open functions
function openFileOnServer(filepath) {
  fetch('/api/open-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filepath })
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success) {
      alert('Error al abrir el archivo: ' + data.error);
    }
  })
  .catch(err => {
    console.error('Error opening file:', err);
    alert('No se pudo conectar con el servidor para abrir el archivo.');
  });
}

function openFolderOnServer(filepath) {
  fetch('/api/open-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filepath })
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success) {
      alert('Error al abrir la carpeta: ' + data.error);
    }
  })
  .catch(err => {
    console.error('Error opening folder:', err);
    alert('No se pudo conectar con el servidor para abrir la carpeta.');
  });
}
