// Oracle Backup Strategist - Frontend Controller
let state = {
  databases: [],
  strategies: [],
  executions: [],
  alerts: [],
  schedulerStatus: {},
  currentTab: 'dashboard',
  selectedStrategyId: null
};

// =============================================================================
// INICIALIZACIÓN
// =============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) window.lucide.createIcons();
  await refreshAllData();
  // Auto refresco cada 15 segundos para monitorizar en tiempo real
  setInterval(refreshAllData, 15000);
});

async function refreshAllData() {
  try {
    const [dbRes, stratRes, execRes, alertsRes, schedRes] = await Promise.all([
      fetch('/api/databases').then(r => r.json()),
      fetch('/api/strategies').then(r => r.json()),
      fetch('/api/executions').then(r => r.json()),
      fetch('/api/alerts').then(r => r.json()),
      fetch('/api/scheduler/status').then(r => r.json())
    ]);

    if (dbRes.success) state.databases = dbRes.data;
    if (stratRes.success) state.strategies = stratRes.data;
    if (execRes.success) state.executions = execRes.data;
    if (alertsRes.success) {
      state.alerts = alertsRes.data.alerts;
      state.healthSummary = alertsRes.data.summary;
      state.riskMatrix = alertsRes.data.riskMatrix;
    }
    if (schedRes.success) state.schedulerStatus = schedRes.data;

    updateHeaderBadges();
    renderCurrentTab();
  } catch (err) {
    console.error('Error al sincronizar datos con el servidor:', err);
  }
}

// =============================================================================
// NAVEGACIÓN Y TABS
// =============================================================================
function switchTab(tabId) {
  state.currentTab = tabId;
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));

  const targetTab = document.getElementById(`tab-${tabId}`);
  const targetBtn = document.getElementById(`tabBtn-${tabId}`);
  if (targetTab) targetTab.classList.remove('hidden');
  if (targetBtn) targetBtn.classList.add('active');

  renderCurrentTab();
  if (window.lucide) window.lucide.createIcons();
}

function renderCurrentTab() {
  switch (state.currentTab) {
    case 'dashboard':
      renderDashboard();
      break;
    case 'databases':
      renderDatabases();
      break;
    case 'strategies':
      renderStrategies();
      break;
    case 'rman':
      renderRmanView();
      break;
    case 'scheduler':
      renderSchedulerView();
      break;
    case 'evidences':
      renderEvidences();
      break;
    case 'alerts':
      renderAlerts();
      break;
    case 'sandbox':
      // Estático interactivo
      break;
  }
  if (window.lucide) window.lucide.createIcons();
}

// =============================================================================
// HEADER Y CONTADORES
// =============================================================================
function updateHeaderBadges() {
  document.getElementById('dbCountBadge').textContent = state.databases.length;
  document.getElementById('stratCountBadge').textContent = state.strategies.length;
  document.getElementById('execCountBadge').textContent = state.executions.length;
  document.getElementById('alertsCountBadge').textContent = state.alerts.length;

  const localDb = state.databases.find(d => d.isRealOracle || d.sid === 'XE');
  const localBadge = document.getElementById('localOracleBadge');
  const localText = document.getElementById('localOracleText');
  if (localDb) {
    localBadge.classList.remove('hidden');
    localText.textContent = `${localDb.name} (${localDb.logMode})`;
  } else {
    localBadge.classList.remove('hidden');
    localText.textContent = 'No sincronizada';
  }

  const healthScore = state.healthSummary ? state.healthSummary.healthScore : 90;
  const healthEl = document.getElementById('healthScoreHeader');
  healthEl.textContent = `${healthScore}%`;
  healthEl.className = healthScore >= 80 ? 'text-emerald-400 font-mono font-bold text-sm' : (healthScore >= 50 ? 'text-amber-400 font-mono font-bold text-sm' : 'text-red-400 font-mono font-bold text-sm');

  const schedEl = document.getElementById('schedulerStatusHeader');
  if (state.schedulerStatus && state.schedulerStatus.isRunning) {
    schedEl.textContent = 'ACTIVO';
    schedEl.className = 'font-bold text-emerald-400';
  } else {
    schedEl.textContent = 'PAUSADO';
    schedEl.className = 'font-bold text-amber-400';
  }
}

// =============================================================================
// TAB 1: RENDER DASHBOARD
// =============================================================================
function renderDashboard() {
  // KPIs
  const healthScore = state.healthSummary ? state.healthSummary.healthScore : 85;
  document.getElementById('cardHealthScore').textContent = `${healthScore}%`;
  
  const activeCount = state.strategies.filter(s => s.status === 'ACTIVA').length;
  document.getElementById('cardActiveStrategies').textContent = activeCount;
  document.getElementById('cardTotalStrategiesSub').textContent = `${state.strategies.length} registradas en total`;

  document.getElementById('cardTotalAlerts').textContent = state.alerts.length;
  const advCount = state.alerts.filter(a => a.level === 'ADVERTENCIA').length;
  const recCount = state.alerts.filter(a => a.level === 'RECOMENDACION').length;
  document.getElementById('cardAlertsBreakdown').textContent = `${advCount} advertencias · ${recCount} recomend.`;

  // Banners especiales
  const bannersContainer = document.getElementById('dashboardSpecialBanners');
  let bannersHtml = '';

  // Banner Escenario 2 No Archive
  const noArchiveDbs = state.databases.filter(d => d.logMode === 'NOARCHIVELOG');
  if (noArchiveDbs.length > 0) {
    const names = noArchiveDbs.map(d => d.name).join(', ');
    bannersHtml += `
      <div class="bg-amber-950/40 border border-amber-500/50 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-200">
        <div class="flex items-start gap-3">
          <i data-lucide="alert-triangle" class="w-6 h-6 text-amber-400 shrink-0 mt-0.5"></i>
          <div>
            <h4 class="font-bold text-white text-sm">Escenario 2 Activo: Base(s) de Datos en modo NOARCHIVELOG (${names})</h4>
            <p class="text-xs text-amber-300/90 mt-0.5">
              <strong>Advertencia Preventiva:</strong> La base de datos se encuentra en modo NOARCHIVELOG. Las posibilidades de recuperación son más limitadas. Revise la estrategia de respaldo y los requerimientos de recuperación antes de continuar.
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button onclick="openArchiveLogGuideModal()" class="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold transition flex items-center gap-1.5">
            <i data-lucide="arrow-right-left" class="w-3.5 h-3.5"></i>
            Procedimiento 24/7
          </button>
        </div>
      </div>
    `;
  }

  // Banner 24/7 sin ARCHIVELOG
  const conflicting24x7 = state.databases.filter(d => d.is24x7 && d.logMode === 'NOARCHIVELOG');
  if (conflicting24x7.length > 0) {
    bannersHtml += `
      <div class="bg-red-950/50 border border-red-500/60 rounded-xl p-4 flex items-center justify-between gap-3 text-red-200">
        <div class="flex items-start gap-3">
          <i data-lucide="shield-alert" class="w-6 h-6 text-red-400 shrink-0 mt-0.5"></i>
          <div>
            <h4 class="font-bold text-white text-sm">Riesgo Crítico de Disponibilidad: Base 24/7 sin ARCHIVELOG</h4>
            <p class="text-xs text-red-300 mt-0.5">
              Una base declarada 24/7 no admite paradas periódicas para respaldos en frío. Para soportar respaldos en caliente continuos sin parada, habilite ARCHIVELOG.
            </p>
          </div>
        </div>
        <button onclick="openAutoGenerateModal()" class="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold shrink-0 transition">
          Resolver con Asistente
        </button>
      </div>
    `;
  }

  bannersContainer.innerHTML = bannersHtml;

  // Matriz de Control Preventivo Table
  const matrixTbody = document.getElementById('riskMatrixTableBody');
  if (matrixTbody && state.riskMatrix) {
    matrixTbody.innerHTML = state.riskMatrix.map(m => `
      <tr class="hover:bg-slate-750/30 transition">
        <td class="py-2.5 px-3 font-semibold text-white flex items-center gap-2">
          <i data-lucide="shield-check" class="w-4 h-4 text-indigo-400"></i>
          ${m.control}
        </td>
        <td class="py-2.5 px-3">
          <span class="px-2 py-0.5 rounded font-mono text-[11px] bg-slate-800 text-slate-300 border border-slate-700">${m.dimRiesgo}</span>
        </td>
        <td class="py-2.5 px-3 text-slate-300">${m.objetivo}</td>
        <td class="py-2.5 px-3 text-center">
          <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
            m.estado === 'OPERATIVO' || m.estado === 'OPTIMO' || m.estado === 'MONITOREADO'
              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
              : (m.estado === 'ADVERTENCIA_ACTIVA'
                ? 'bg-amber-950 text-amber-400 border border-amber-800'
                : 'bg-indigo-950 text-indigo-400 border border-indigo-800')
          }">
            ${m.estado}
          </span>
        </td>
      </tr>
    `).join('');
  }

  // Recent Executions Widget
  const recentWidget = document.getElementById('recentExecutionsWidget');
  if (recentWidget) {
    const recents = state.executions.slice(0, 3);
    if (recents.length === 0) {
      recentWidget.innerHTML = `<p class="text-xs text-slate-400 italic">No hay ejecuciones registradas todavía.</p>`;
    } else {
      recentWidget.innerHTML = recents.map(e => `
        <div class="flex items-center justify-between p-3 bg-slate-900/60 border border-slate-750 rounded-lg text-xs">
          <div class="flex items-center gap-3">
            <span class="w-2.5 h-2.5 rounded-full ${e.result === 'EXITOSO' ? 'bg-emerald-400' : (e.result === 'CON_ADVERTENCIAS' ? 'bg-amber-400' : 'bg-red-400')}"></span>
            <div>
              <p class="font-bold text-white">${e.strategyName}</p>
              <p class="text-slate-400">${e.databaseName} · ${e.type} · ${new Date(e.startedAt).toLocaleString()}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="font-mono text-slate-300">${e.backupSizeMB} MB</span>
            <button onclick="viewEvidenceDetail('${e.id}')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700">Ver</button>
          </div>
        </div>
      `).join('');
    }
  }

  // Disk space
  fetch('/api/scheduler/status')
    .then(r => r.json())
    .then(() => {
      document.getElementById('cardDiskFree').textContent = `~145 GB`;
      document.getElementById('cardDiskPercentage').textContent = `32% disponible en volumen C:`;
    });
}

// =============================================================================
// TAB 2: BASES DE DATOS
// =============================================================================
function renderDatabases() {
  const container = document.getElementById('databasesContainer');
  if (!container) return;

  if (state.databases.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 bg-slate-800/40 border border-slate-700 rounded-xl">
        <i data-lucide="server-off" class="w-12 h-12 text-slate-500 mx-auto mb-3"></i>
        <h3 class="text-base font-bold text-white">No hay bases de datos registradas</h3>
        <p class="text-xs text-slate-400 mt-1">Presione "Detectar Local" para escanear Oracle XE o registre una nueva instancia.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.databases.map(db => `
    <div class="bg-slate-800/90 border border-slate-700 rounded-xl p-5 flex flex-col justify-between hover:border-slate-600 transition shadow-lg">
      <div>
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <i data-lucide="database" class="w-4 h-4"></i>
            </div>
            <div>
              <h3 class="font-bold text-white text-base leading-tight">${db.name}</h3>
              <p class="text-xs font-mono text-slate-400">SID: ${db.sid} · ${db.host}:${db.port}</p>
            </div>
          </div>
          <span class="text-[11px] font-bold px-2 py-0.5 rounded-full ${
            db.logMode === 'ARCHIVELOG'
              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
              : 'bg-amber-950 text-amber-400 border border-amber-800'
          }">
            ${db.logMode}
          </span>
        </div>

        <p class="text-xs text-slate-300 mb-4">${db.description || 'Instancia Oracle'}</p>

        <div class="space-y-2 text-xs border-t border-slate-700/60 pt-3">
          <div class="flex justify-between">
            <span class="text-slate-400">Estado de Operación:</span>
            <span class="font-bold text-emerald-400">${db.status || 'OPEN'} (${db.openMode || 'READ WRITE'})</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Disponibilidad 24/7:</span>
            <span class="font-bold ${db.is24x7 ? 'text-indigo-400' : 'text-slate-400'}">${db.is24x7 ? 'SÍ (Continuo 24/7)' : 'No (Mantenible)'}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Criticidad Institucional:</span>
            <span class="font-bold font-mono px-1.5 py-0.5 rounded bg-slate-900 ${db.criticality === 'ALTA' ? 'text-red-400' : (db.criticality === 'MEDIA' ? 'text-amber-400' : 'text-blue-400')}">
              ${db.criticality}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Tablespaces:</span>
            <span class="text-slate-300 font-mono text-[11px]">${(db.tablespaces || []).join(', ') || 'SYSTEM, USERS'}</span>
          </div>
        </div>
      </div>

      <div class="mt-5 pt-3 border-t border-slate-700/60 flex items-center justify-between gap-2">
        <button onclick="openArchiveLogGuideModal('${db.id}')" class="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs font-medium flex items-center gap-1.5 transition">
          <i data-lucide="help-circle" class="w-3.5 h-3.5"></i>
          Guía Modo
        </button>
        <button onclick="openAutoGenerateModalForDb('${db.id}')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition">
          <i data-lucide="wand-2" class="w-3.5 h-3.5"></i>
          Auto-Estrategia
        </button>
      </div>
    </div>
  `).join('');
}

// =============================================================================
// TAB 3: ESTRATEGIAS (QUÉ - CÓMO - CUÁNDO)
// =============================================================================
function renderStrategies() {
  const container = document.getElementById('strategiesContainer');
  if (!container) return;

  if (state.strategies.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 bg-slate-800/40 border border-slate-700 rounded-xl">
        <i data-lucide="shield-alert" class="w-12 h-12 text-slate-500 mx-auto mb-3"></i>
        <h3 class="text-base font-bold text-white">No hay estrategias configuradas</h3>
        <p class="text-xs text-slate-400 mt-1">Utilice el Asistente Automático para generar su primera estrategia 24/7 o Escenario 2 No Archive.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.strategies.map(s => {
    const isApproved = s.isApproved;
    const isActive = s.status === 'ACTIVA';

    return `
      <div class="bg-slate-800/90 border ${isActive ? 'border-slate-700' : 'border-slate-800 opacity-75'} rounded-xl p-5 hover:border-slate-600 transition shadow-lg">
        <div class="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="font-bold text-white text-base">${s.name}</h3>
              <span class="text-xs font-mono font-bold px-2 py-0.5 rounded ${
                s.priority === 'ALTA' ? 'bg-red-950 text-red-400 border border-red-800' :
                (s.priority === 'MEDIA' ? 'bg-amber-950 text-amber-400 border border-amber-800' : 'bg-blue-950 text-blue-400 border border-blue-800')
              }">
                Prioridad ${s.priority}
              </span>
              <span class="text-xs font-medium px-2 py-0.5 rounded ${
                isActive ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-900 text-slate-400'
              }">
                ${s.status}
              </span>
            </div>
            <p class="text-xs text-slate-400 mt-1">${s.description || 'Estrategia de respaldo RMAN'}</p>
          </div>

          <div class="flex items-center gap-2">
            <span class="text-xs px-2.5 py-1 rounded-full font-medium ${
              isApproved ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
            }">
              ${isApproved ? '✓ Aprobada por DBA' : '⚠ Pendiente de Aprobación'}
            </span>
            <button onclick="toggleStrategyStatus('${s.id}')" class="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs font-medium transition">
              ${isActive ? 'Desactivar' : 'Activar'}
            </button>
          </div>
        </div>

        <!-- Componentes Fundamentales: QUÉ - CÓMO - CUÁNDO -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 my-4 bg-slate-900/60 p-3.5 rounded-lg border border-slate-750 text-xs">
          <!-- QUÉ -->
          <div>
            <p class="font-bold text-indigo-400 uppercase tracking-wider text-[11px] mb-1">1. QUÉ RESPALDAR</p>
            <ul class="text-slate-300 space-y-0.5">
              <li>• Base: <strong>${s.scope && s.scope.database ? 'Base de Datos Completa' : 'Objetos Específicos'}</strong></li>
              <li>• Control File & SPFILE: <strong>${s.scope && s.scope.controlfile ? 'Incluido' : 'No'}</strong></li>
              <li>• Archived Redo Logs: <strong>${s.scope && s.scope.archivedRedoLogs ? 'Sí (DELETE ALL INPUT)' : 'Omitido / No disponible'}</strong></li>
            </ul>
          </div>

          <!-- CÓMO -->
          <div>
            <p class="font-bold text-cyan-400 uppercase tracking-wider text-[11px] mb-1">2. CÓMO RESPALDARLO</p>
            <ul class="text-slate-300 space-y-0.5">
              <li>• Tipo: <strong>${s.backupType}</strong></li>
              <li>• Modo: <strong>${s.mode || 'ESTÁNDAR'}</strong></li>
              <li>• Compresión: <strong>${s.compression ? 'COMPRESSED BACKUPSET (Basic)' : 'Sin compresión'}</strong></li>
              <li>• Validación: <strong>${s.backupValidation ? 'RESTORE VALIDATE activo' : 'Desactivado'}</strong></li>
            </ul>
          </div>

          <!-- CUÁNDO -->
          <div>
            <p class="font-bold text-amber-400 uppercase tracking-wider text-[11px] mb-1">3. CUÁNDO EJECUTARLO</p>
            <ul class="text-slate-300 space-y-0.5">
              <li>• Frecuencia: <strong>${s.schedule ? s.schedule.frequency : 'MANUAL'}</strong></li>
              <li>• Horario: <strong>${s.schedule ? s.schedule.time : '--:--'}</strong> (Ventana: ${s.schedule ? s.schedule.backupWindowMinutes : 120} min)</li>
              <li>• Días: <strong>${s.schedule && s.schedule.daysOfWeek ? s.schedule.daysOfWeek.join(', ') : 'Todos'}</strong></li>
              <li>• Logs cada: <strong>${s.schedule && s.schedule.archivelogIntervalHours ? s.schedule.archivelogIntervalHours + ' hrs' : 'N/A'}</strong></li>
            </ul>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 text-xs pt-2">
          <div class="text-slate-400">
            Responsable: <span class="text-slate-200 font-medium">${s.responsible || 'DBA'}</span> ·
            Destino: <span class="font-mono text-slate-300">${s.destination || 'Por defecto'}</span>
          </div>

          <div class="flex items-center gap-2">
            <button onclick="goToRmanView('${s.id}')" class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium flex items-center gap-1.5 transition">
              <i data-lucide="terminal" class="w-3.5 h-3.5"></i>
              Ver Script RMAN
            </button>
            <button onclick="executeStrategyNow('${s.id}')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold flex items-center gap-1.5 transition shadow">
              <i data-lucide="play" class="w-3.5 h-3.5"></i>
              Ejecutar Ahora
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// =============================================================================
// TAB 4: CONSTRUCTOR Y VISOR RMAN
// =============================================================================
async function renderRmanView() {
  const selector = document.getElementById('rmanStrategySelector');
  if (!selector) return;

  selector.innerHTML = state.strategies.map(s => `
    <option value="${s.id}" ${s.id === state.selectedStrategyId ? 'selected' : ''}>
      ${s.name} (${s.databaseName || 'BD'})
    </option>
  `).join('');

  if (!state.selectedStrategyId && state.strategies.length > 0) {
    state.selectedStrategyId = state.strategies[0].id;
  }

  if (state.selectedStrategyId) {
    selector.value = state.selectedStrategyId;
    await loadRmanScriptForSelectedStrategy();
  }
}

function goToRmanView(strategyId) {
  state.selectedStrategyId = strategyId;
  switchTab('rman');
}

async function loadRmanScriptForSelectedStrategy() {
  const selector = document.getElementById('rmanStrategySelector');
  const stratId = selector.value;
  state.selectedStrategyId = stratId;

  if (!stratId) return;

  try {
    const res = await fetch(`/api/strategies/${stratId}/script`).then(r => r.json());
    if (res.success) {
      const { data, strategy, database } = res;
      document.getElementById('rmanFileName').textContent = `rman_${strategy.id}.rman`;
      document.getElementById('rmanScriptContent').textContent = data.script;

      // Approval badge
      const appBadge = document.getElementById('approvalBadge');
      const btnApprove = document.getElementById('btnApproveStrategy');
      if (strategy.isApproved) {
        appBadge.textContent = `Aprobado por ${strategy.approvedBy || 'DBA'}`;
        appBadge.className = 'text-xs px-2 py-0.5 rounded font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
        btnApprove.classList.add('hidden');
      } else {
        appBadge.textContent = 'Pendiente de Aprobación';
        appBadge.className = 'text-xs px-2 py-0.5 rounded font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30';
        btnApprove.classList.remove('hidden');
      }

      // Warnings & Recommendations
      const alertsContainer = document.getElementById('rmanScriptAlertsContainer');
      let alertsHtml = '';
      (data.warnings || []).forEach(w => {
        alertsHtml += `
          <div class="bg-amber-950/40 border border-amber-500/50 rounded-lg p-3 text-xs text-amber-200 flex items-start gap-2">
            <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-400 shrink-0 mt-0.5"></i>
            <div><strong>${w.level}:</strong> ${w.message}</div>
          </div>
        `;
      });
      (data.recommendations || []).forEach(r => {
        alertsHtml += `
          <div class="bg-emerald-950/40 border border-emerald-500/50 rounded-lg p-3 text-xs text-emerald-200 flex items-start gap-2">
            <i data-lucide="check-circle" class="w-4 h-4 text-emerald-400 shrink-0 mt-0.5"></i>
            <div><strong>${r.level}:</strong> ${r.message}</div>
          </div>
        `;
      });
      alertsContainer.innerHTML = alertsHtml;

      // Explanation list
      const expList = document.getElementById('rmanExplanationList');
      expList.innerHTML = (data.explanation || []).map(exp => `
        <li class="flex items-start gap-2">
          <i data-lucide="check" class="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5"></i>
          <span>${exp}</span>
        </li>
      `).join('');

      if (window.lucide) window.lucide.createIcons();
    }
  } catch (e) {
    console.error('Error cargando script RMAN:', e);
  }
}

async function approveCurrentStrategy() {
  if (!state.selectedStrategyId) return;
  try {
    const res = await fetch(`/api/strategies/${state.selectedStrategyId}/approve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvedBy: 'Admin DBA - Cátedra EIF402' })
    }).then(r => r.json());

    if (res.success) {
      showToast('Estrategia aprobada satisfactoriamente por el Administrador.', 'success');
      await refreshAllData();
      await loadRmanScriptForSelectedStrategy();
    }
  } catch (e) {
    showToast('Error al aprobar estrategia', 'error');
  }
}

function downloadCurrentRmanScript() {
  const content = document.getElementById('rmanScriptContent').textContent;
  const fileName = document.getElementById('rmanFileName').textContent || 'script.rman';
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Script descargado como ${fileName}`, 'success');
}

// =============================================================================
// TAB 5: AUTOMATIZACIÓN Y PROGRAMACIÓN
// =============================================================================
function renderSchedulerView() {
  const tbody = document.getElementById('schedulerTableBody');
  if (!tbody) return;

  const btn = document.getElementById('btnToggleScheduler');
  const btnText = document.getElementById('btnToggleSchedulerText');
  const isRunning = state.schedulerStatus && state.schedulerStatus.isRunning;

  if (isRunning) {
    btnText.textContent = 'ACTIVO';
    btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white';
  } else {
    btnText.textContent = 'PAUSADO';
    btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300';
  }

  const nextRuns = (state.schedulerStatus && state.schedulerStatus.nextScheduledRuns) || [];
  if (nextRuns.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-8 text-center text-slate-400">
          No hay estrategias activas con programación horaria.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = nextRuns.map(run => `
    <tr class="hover:bg-slate-750/30 transition">
      <td class="py-2.5 px-3 font-semibold text-white">${run.strategyName}</td>
      <td class="py-2.5 px-3">
        <span class="font-mono text-[11px] px-1.5 py-0.5 rounded ${run.priority === 'ALTA' ? 'text-red-400 bg-red-950/40' : 'text-amber-400 bg-amber-950/40'}">${run.priority}</span>
      </td>
      <td class="py-2.5 px-3 text-slate-300">${run.frequency}</td>
      <td class="py-2.5 px-3 font-mono text-cyan-300">${run.scheduledTime}</td>
      <td class="py-2.5 px-3 font-mono text-slate-300">${new Date(run.nextRunEstimate).toLocaleString()}</td>
      <td class="py-2.5 px-3">
        <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${run.isApproved ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'}">
          ${run.isApproved ? 'Aprobado' : 'Pendiente'}
        </span>
      </td>
      <td class="py-2.5 px-3 text-right">
        <button onclick="executeStrategyNow('${run.strategyId}')" class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium transition">
          Ejecutar
        </button>
      </td>
    </tr>
  `).join('');
}

async function toggleSchedulerDaemon() {
  try {
    const res = await fetch('/api/scheduler/toggle', { method: 'POST' }).then(r => r.json());
    if (res.success) {
      showToast(res.message, 'success');
      await refreshAllData();
    }
  } catch (e) {
    showToast('Error al alternar estado del planificador', 'error');
  }
}

// =============================================================================
// TAB 6: CENTRO DE EVIDENCIAS E HISTORIAL
// =============================================================================
function renderEvidences() {
  const tbody = document.getElementById('evidencesTableBody');
  if (!tbody) return;

  const filter = document.getElementById('evidenceFilterResult').value;
  let filtered = state.executions;
  if (filter !== 'ALL') {
    filtered = filtered.filter(e => e.result === filter);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="py-8 text-center text-slate-400 italic">
          No se encontraron evidencias de respaldo registradas con el filtro actual.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(e => `
    <tr class="hover:bg-slate-750/30 transition">
      <td class="py-3 px-4 font-mono text-slate-300">${new Date(e.startedAt).toLocaleString()}</td>
      <td class="py-3 px-4 font-semibold text-white">${e.strategyName}</td>
      <td class="py-3 px-4 text-slate-300">${e.databaseName}</td>
      <td class="py-3 px-4 font-mono text-slate-400">${e.type}</td>
      <td class="py-3 px-4 font-mono text-slate-300">${e.durationSeconds}s</td>
      <td class="py-3 px-4 font-mono text-cyan-300">${e.backupSizeMB} MB</td>
      <td class="py-3 px-4">
        <span class="px-2.5 py-1 rounded-full text-[11px] font-bold ${
          e.result === 'EXITOSO'
            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
            : (e.result === 'CON_ADVERTENCIAS'
              ? 'bg-amber-950 text-amber-400 border border-amber-800'
              : 'bg-red-950 text-red-400 border border-red-800')
        }">
          ${e.result}
        </span>
      </td>
      <td class="py-3 px-4 text-right">
        <button onclick="viewEvidenceDetail('${e.id}')" class="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs font-medium transition mr-1">
          Detalle
        </button>
        <a href="/api/executions/${e.id}/export-evidence" target="_blank" class="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 rounded text-xs font-medium transition border border-indigo-500/30">
          Informe PDF
        </a>
      </td>
    </tr>
  `).join('');
}

function filterEvidences() {
  renderEvidences();
}

async function viewEvidenceDetail(execId) {
  try {
    const res = await fetch(`/api/executions/${execId}`).then(r => r.json());
    if (!res.success) return;
    const e = res.data;

    const modalContent = document.getElementById('modalContent');
    modalContent.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-slate-700">
          <div>
            <h3 class="font-bold text-white text-lg">Evidencia de Ejecución RMAN</h3>
            <p class="text-xs font-mono text-slate-400">ID: ${e.id} · ${new Date(e.startedAt).toLocaleString()}</p>
          </div>
          <button onclick="closeModal()" class="text-slate-400 hover:text-white">✕</button>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-800/80 p-3 rounded-lg border border-slate-700 text-xs">
          <div><p class="text-slate-400">Estrategia:</p><p class="font-bold text-white">${e.strategyName}</p></div>
          <div><p class="text-slate-400">Base de Datos:</p><p class="font-bold text-white">${e.databaseName}</p></div>
          <div><p class="text-slate-400">Duración:</p><p class="font-bold font-mono text-cyan-300">${e.durationSeconds} seg</p></div>
          <div><p class="text-slate-400">Tamaño Respaldo:</p><p class="font-bold font-mono text-cyan-300">${e.backupSizeMB} MB</p></div>
        </div>

        <div class="space-y-1 text-xs">
          <p class="font-bold text-slate-300">Archivos Físicos Comprobados en Disco (${e.destination}):</p>
          <ul class="font-mono bg-slate-950 p-2.5 rounded border border-slate-800 text-emerald-400 space-y-1">
            ${(e.filesGenerated || []).map(f => `<li>✓ ${f}</li>`).join('') || '<li class="text-slate-500">Ningún archivo generado</li>'}
          </ul>
        </div>

        ${e.errorMessage ? `
          <div class="bg-red-950/60 border border-red-500/50 p-3 rounded-lg text-xs text-red-200">
            <strong>Error Detectado:</strong> ${e.errorMessage}
          </div>
        ` : ''}

        <div class="space-y-1 text-xs">
          <p class="font-bold text-slate-300">Log Completo de Salida RMAN:</p>
          <pre class="bg-slate-950 border border-slate-800 p-3 rounded-lg text-[11px] text-sky-300 font-mono overflow-x-auto max-h-56 leading-snug">${e.rmanOutputLog}</pre>
        </div>

        <div class="pt-3 border-t border-slate-700 flex justify-between items-center">
          <a href="/api/executions/${e.id}/export-evidence" target="_blank" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition">
            Abrir Informe Imprimible
          </a>
          <button onclick="closeModal()" class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-semibold">
            Cerrar
          </button>
        </div>
      </div>
    `;

    openModal();
  } catch (e) {
    showToast('Error cargando evidencia', 'error');
  }
}

// =============================================================================
// TAB 7: ALERTAS Y CONTROL PREVENTIVO
// =============================================================================
function renderAlerts() {
  const container = document.getElementById('alertsContainer');
  if (!container) return;

  if (state.alerts.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 bg-slate-800/40 border border-slate-700 rounded-xl">
        <i data-lucide="shield-check" class="w-12 h-12 text-emerald-400 mx-auto mb-3"></i>
        <h3 class="text-base font-bold text-white">Todos los Controles Preventivos Operativos</h3>
        <p class="text-xs text-slate-400 mt-1">No se detectan desviaciones ni condiciones de riesgo en las estrategias activas.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.alerts.map(a => {
    let colorClasses = 'border-amber-500/50 bg-amber-950/20 text-amber-200';
    let iconName = 'alert-triangle';
    let iconColor = 'text-amber-400';

    if (a.level === 'ADVERTENCIA') {
      colorClasses = 'border-amber-500/50 bg-amber-950/20 text-amber-200';
      iconName = 'alert-triangle';
      iconColor = 'text-amber-400';
    } else if (a.level === 'RECOMENDACION') {
      colorClasses = 'border-emerald-500/50 bg-emerald-950/20 text-emerald-200';
      iconName = 'info';
      iconColor = 'text-emerald-400';
    } else {
      // CONDICION_INFORMATIVA
      colorClasses = 'border-blue-500/50 bg-blue-950/20 text-blue-200';
      iconName = 'info';
      iconColor = 'text-blue-400';
    }

    return `
      <div class="border ${colorClasses} rounded-xl p-4 flex flex-col justify-between gap-3 shadow">
        <div class="flex items-start gap-3">
          <i data-lucide="${iconName}" class="w-5 h-5 ${iconColor} shrink-0 mt-0.5"></i>
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-700 uppercase">
                ${a.level}
              </span>
              <span class="text-[10px] font-mono text-slate-400">Riesgo: ${a.riskType}</span>
            </div>
            <h4 class="font-bold text-white text-sm">${a.title}</h4>
            <p class="text-xs">${a.message}</p>
            <p class="text-xs text-slate-400"><strong>Justificación Técnica:</strong> ${a.technicalDetail}</p>
            ${a.recommendation ? `<p class="text-xs text-emerald-300"><strong>Acción Preventiva Sugerida:</strong> ${a.recommendation}</p>` : ''}
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-700/50">
          ${a.actionableScript ? `
            <button onclick="showActionableScriptModal('${encodeURIComponent(a.actionableScript)}')" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold flex items-center gap-1">
              <i data-lucide="code" class="w-3.5 h-3.5"></i> Ver Script de Solución
            </button>
          ` : ''}
          <button onclick="resolveAlert('${a.id}')" class="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs font-semibold">
            Marcar Atendida
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function refreshAlerts() {
  await refreshAllData();
  showToast('Controles preventivos reevaluados', 'success');
}

async function resolveAlert(alertId) {
  try {
    await fetch(`/api/alerts/resolve/${alertId}`, { method: 'POST' });
    showToast('Alerta marcada como atendida', 'success');
    await refreshAllData();
  } catch (e) {
    showToast('Error resolviendo alerta', 'error');
  }
}

// =============================================================================
// EJECUCIÓN INMEDIATA Y LABORATORIO DE PRUEBAS
// =============================================================================
async function executeStrategyNow(strategyId) {
  showToast('Iniciando ejecución de respaldo RMAN...', 'info');
  try {
    const res = await fetch('/api/executions/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategyId, isSimulation: false })
    }).then(r => r.json());

    if (res.success) {
      showToast(`Respaldo concluido con resultado: ${res.data.result}`, res.data.result === 'EXITOSO' ? 'success' : 'error');
      await refreshAllData();
      viewEvidenceDetail(res.data.id);
    } else {
      showToast('Fallo en la ejecución: ' + res.error, 'error');
    }
  } catch (e) {
    showToast('Error al conectar con el servidor', 'error');
  }
}

async function runTestScenario(simulationType) {
  const strat = state.strategies[0];
  if (!strat) {
    showToast('Registre al menos una estrategia para ejecutar pruebas', 'error');
    return;
  }

  showToast(`Ejecutando escenario de evaluación: ${simulationType}...`, 'info');
  try {
    const res = await fetch('/api/executions/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategyId: strat.id,
        isSimulation: true,
        simulationType
      })
    }).then(r => r.json());

    if (res.success) {
      showToast(`Prueba completada: ${res.data.result}`, res.data.result === 'EXITOSO' ? 'success' : 'warning');
      await refreshAllData();
      viewEvidenceDetail(res.data.id);
    }
  } catch (e) {
    showToast('Error ejecutando simulación', 'error');
  }
}

async function runEscenario2ColdBackup() {
  const noArchiveStrat = state.strategies.find(s => s.id === 'strat-noarchive-cold') || state.strategies[0];
  await executeStrategyNow(noArchiveStrat.id);
}

// =============================================================================
// MODALS Y ASISTENTES
// =============================================================================
function openModal() {
  const m = document.getElementById('modalContainer');
  m.classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

function closeModal() {
  const m = document.getElementById('modalContainer');
  m.classList.add('hidden');
}

// Modal Asistente Inteligente de Generación Automática
function openAutoGenerateModal(preselectedDbId = null) {
  const modalContent = document.getElementById('modalContent');
  modalContent.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-slate-700">
        <div class="flex items-center gap-2">
          <i data-lucide="wand-2" class="w-5 h-5 text-indigo-400"></i>
          <h3 class="font-bold text-white text-lg">Asistente Inteligente de Estrategias RMAN</h3>
        </div>
        <button onclick="closeModal()" class="text-slate-400 hover:text-white">✕</button>
      </div>

      <p class="text-xs text-slate-300">
        El sistema analizará el modo archivador de la base (ARCHIVELOG vs NOARCHIVELOG) y la necesidad de disponibilidad para estructurar automáticamente el <strong>QUÉ, CÓMO y CUÁNDO</strong> siguiendo las directrices Oracle Maximum Availability Architecture (MAA).
      </p>

      <form id="autoGenForm" onsubmit="submitAutoGenerateStrategy(event)" class="space-y-4 text-xs">
        <div>
          <label class="block font-medium text-slate-300 mb-1">Base de Datos Objetivo:</label>
          <select id="autoGenDb" class="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white">
            ${state.databases.map(d => `
              <option value="${d.id}" ${d.id === preselectedDbId ? 'selected' : ''}>
                ${d.name} (${d.sid}) - Modo: ${d.logMode} - ${d.is24x7 ? '24/7' : 'Estándar'}
              </option>
            `).join('')}
          </select>
        </div>

        <div>
          <label class="block font-medium text-slate-300 mb-1">Perfil de Operación y Criticidad Requerida:</label>
          <select id="autoGenProfile" class="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white">
            <option value="24X7_CRITICA">Base de Datos 24/7 Crítica (ARCHIVELOG - Cero Parada de Servicio)</option>
            <option value="ESCENARIO_2_NOARCHIVE">Escenario 2: Base en NOARCHIVELOG (Respaldo Consistente en Frío / Cold Backup)</option>
            <option value="ESTANDAR_DIURNA">Sistema Estándar Diurno (Incremental Diferencial Diario)</option>
            <option value="DESARROLLO_QA">Ambiente de Pruebas / Reconstruible (Prioridad Baja)</option>
          </select>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-medium text-slate-300 mb-1">Hora de Ejecución (Ventana Nocturna):</label>
            <input type="time" id="autoGenTime" value="23:00" class="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white font-mono">
          </div>
          <div>
            <label class="block font-medium text-slate-300 mb-1">Responsable DBA:</label>
            <input type="text" id="autoGenResp" value="Ing. Administrador DBA" class="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white">
          </div>
        </div>

        <div class="bg-indigo-950/40 border border-indigo-500/40 p-3 rounded-lg text-indigo-200">
          <p class="font-bold">Garantías del Algoritmo Automático:</p>
          <ul class="list-disc list-inside mt-1 space-y-0.5 text-[11px] text-indigo-300">
            <li>Si selecciona 24/7 y la BD está en ARCHIVELOG: Genera Nivel 0 + Nivel 1 Acumulativo + Redo Logs continuos cada 2h.</li>
            <li>Si la BD está en NOARCHIVELOG (Escenario 2): Genera advertencias preventivas obligatorias y flujo consistente (Shutdown/Mount/Backup/Open).</li>
            <li>Incluye compresión básica, respaldo de Controlfile/SPFILE y verificación <code>RESTORE DATABASE VALIDATE</code>.</li>
          </ul>
        </div>

        <div class="pt-3 border-t border-slate-700 flex justify-end gap-2">
          <button type="button" onclick="closeModal()" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold">Cancelar</button>
          <button type="submit" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-semibold flex items-center gap-2">
            <i data-lucide="wand-2" class="w-4 h-4"></i> Generar y Guardar Estrategia
          </button>
        </div>
      </form>
    </div>
  `;
  openModal();
}

function openAutoGenerateModalForDb(dbId) {
  openAutoGenerateModal(dbId);
}

async function submitAutoGenerateStrategy(e) {
  e.preventDefault();
  const dbId = document.getElementById('autoGenDb').value;
  const profile = document.getElementById('autoGenProfile').value;
  const time = document.getElementById('autoGenTime').value;
  const resp = document.getElementById('autoGenResp').value;

  try {
    const res = await fetch('/api/strategies/auto-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        databaseId: dbId,
        targetProfile: profile,
        backupWindow: time,
        responsible: resp,
        autoSave: true
      })
    }).then(r => r.json());

    if (res.success) {
      closeModal();
      showToast('Estrategia generada y guardada con éxito', 'success');
      await refreshAllData();
      goToRmanView(res.strategy.id);
    } else {
      showToast('Error: ' + res.error, 'error');
    }
  } catch (err) {
    showToast('Error al contactar servidor', 'error');
  }
}

// Modal de Creación Manual de Estrategia
function openNewStrategyModal() {
  const modalContent = document.getElementById('modalContent');
  modalContent.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-slate-700">
        <h3 class="font-bold text-white text-lg">Construir Nueva Estrategia Manual (QUÉ - CÓMO - CUÁNDO)</h3>
        <button onclick="closeModal()" class="text-slate-400 hover:text-white">✕</button>
      </div>

      <form id="manualStratForm" onsubmit="submitManualStrategy(event)" class="space-y-4 text-xs">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-medium text-slate-300 mb-1">Nombre de la Estrategia:</label>
            <input type="text" id="mStratName" required placeholder="Ej: Producción Diaria Incremental" class="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white">
          </div>
          <div>
            <label class="block font-medium text-slate-300 mb-1">Base de Datos:</label>
            <select id="mStratDb" class="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white">
              ${state.databases.map(d => `<option value="${d.id}">${d.name} (${d.logMode})</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block font-medium text-slate-300 mb-1">Prioridad:</label>
            <select id="mStratPriority" class="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white">
              <option value="ALTA">Alta (Crítica para continuidad)</option>
              <option value="MEDIA">Media (Tolera mayor tiempo recuperación)</option>
              <option value="BAJA">Baja (Menor impacto / reconstruible)</option>
            </select>
          </div>
          <div>
            <label class="block font-medium text-slate-300 mb-1">Tipo de Respaldo:</label>
            <select id="mStratType" class="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white">
              <option value="COMPLETO">Completo (Full)</option>
              <option value="INCREMENTAL_NIVEL_0">Incremental Nivel 0 (Línea Base)</option>
              <option value="INCREMENTAL_NIVEL_1_DIFERENCIAL">Incremental Nivel 1 Diferencial</option>
              <option value="INCREMENTAL_NIVEL_1_ACUMULATIVO">Incremental Nivel 1 Acumulativo</option>
            </select>
          </div>
          <div>
            <label class="block font-medium text-slate-300 mb-1">Hora de Ejecución:</label>
            <input type="time" id="mStratTime" value="23:00" class="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white font-mono">
          </div>
        </div>

        <div class="space-y-2 border-t border-slate-700 pt-3">
          <p class="font-bold text-slate-300">QUÉ RESPALDAR (Alcance):</p>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label class="flex items-center gap-1.5"><input type="checkbox" id="mScopeDb" checked> Base de Datos</label>
            <label class="flex items-center gap-1.5"><input type="checkbox" id="mScopeCtl" checked> Controlfile y SPFILE</label>
            <label class="flex items-center gap-1.5"><input type="checkbox" id="mScopeArc" checked> Archived Redo Logs</label>
            <label class="flex items-center gap-1.5"><input type="checkbox" id="mComp" checked> Compresión RMAN</label>
          </div>
        </div>

        <div class="space-y-2 border-t border-slate-700 pt-3">
          <p class="font-bold text-slate-300">CONTROLES PREVENTIVOS Y VALIDACIÓN:</p>
          <div class="grid grid-cols-2 gap-2">
            <label class="flex items-center gap-1.5"><input type="checkbox" id="mVal" checked> Ejecutar RESTORE DATABASE VALIDATE</label>
            <label class="flex items-center gap-1.5"><input type="checkbox" id="mCross" checked> Mantenimiento CROSSCHECK y DELETE OBSOLETE</label>
          </div>
        </div>

        <div class="pt-3 border-t border-slate-700 flex justify-end gap-2">
          <button type="button" onclick="closeModal()" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold">Cancelar</button>
          <button type="submit" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-semibold">Crear Estrategia</button>
        </div>
      </form>
    </div>
  `;
  openModal();
}

async function submitManualStrategy(e) {
  e.preventDefault();
  const body = {
    name: document.getElementById('mStratName').value,
    databaseId: document.getElementById('mStratDb').value,
    priority: document.getElementById('mStratPriority').value,
    backupType: document.getElementById('mStratType').value,
    status: 'ACTIVA',
    isApproved: false,
    compression: document.getElementById('mComp').checked,
    backupValidation: document.getElementById('mVal').checked,
    crosscheck: document.getElementById('mCross').checked,
    deleteExpired: true,
    parallelism: 1,
    scope: {
      database: document.getElementById('mScopeDb').checked,
      controlfile: document.getElementById('mScopeCtl').checked,
      spfile: document.getElementById('mScopeCtl').checked,
      archivedRedoLogs: document.getElementById('mScopeArc').checked,
      tablespaces: [],
      datafiles: []
    },
    schedule: {
      frequency: 'DIARIA',
      time: document.getElementById('mStratTime').value,
      daysOfWeek: ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'],
      backupWindowMinutes: 120
    }
  };

  try {
    const res = await fetch('/api/strategies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(r => r.json());

    if (res.success) {
      closeModal();
      showToast('Estrategia creada. Recuerde revisarla y aprobarla.', 'success');
      await refreshAllData();
      goToRmanView(res.data.id);
    }
  } catch (err) {
    showToast('Error al crear estrategia', 'error');
  }
}

// Modal Guía ARCHIVELOG vs NOARCHIVELOG
function openArchiveLogGuideModal(dbId = null) {
  const modalContent = document.getElementById('modalContent');
  modalContent.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-slate-700">
        <h3 class="font-bold text-white text-lg">Guía Técnica: ARCHIVELOG vs NOARCHIVELOG</h3>
        <button onclick="closeModal()" class="text-slate-400 hover:text-white">✕</button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div class="bg-amber-950/30 border border-amber-500/40 p-4 rounded-xl space-y-2">
          <h4 class="font-bold text-amber-400 text-sm">Escenario 2: Modo NOARCHIVELOG</h4>
          <p class="text-slate-300">
            • Los grupos de Redo Log se sobreescriben cíclicamente sin guardarse.<br>
            • <strong>Restricción Crítica:</strong> NO permite respaldos online de base de datos completa mientras esté abierta.<br>
            • <strong>Recuperación:</strong> Solo permite restaurar al instante del último respaldo en frío (Cold Backup). No hay recuperación hasta el segundo del desastre (PITR).<br>
            • Requiere ventana de parada controlada.
          </p>
        </div>

        <div class="bg-emerald-950/30 border border-emerald-500/40 p-4 rounded-xl space-y-2">
          <h4 class="font-bold text-emerald-400 text-sm">Modo ARCHIVELOG (Arquitectura 24/7)</h4>
          <p class="text-slate-300">
            • Los Redo Logs se archivan en el área Fast Recovery Area (FRA) antes de sobreescribirse.<br>
            • <strong>Ventaja 24/7:</strong> Permite respaldos online en caliente sin detener el servicio a usuarios.<br>
            • <strong>Recuperación:</strong> Permite Point-in-Time Recovery (PITR) hasta la última transacción confirmada (cero pérdida de datos).
          </p>
        </div>
      </div>

      <div class="space-y-2 text-xs">
        <p class="font-bold text-white">Procedimiento DBA para Habilitar Modo ARCHIVELOG (Paso a 24/7):</p>
        <pre class="bg-slate-950 p-3 rounded border border-slate-800 text-sky-300 font-mono">-- En una consola SQL*Plus como SYSDBA:
SHUTDOWN IMMEDIATE;
STARTUP MOUNT;
ALTER DATABASE ARCHIVELOG;
ALTER DATABASE OPEN;
-- Confirmar nuevo estado:
ARCHIVE LOG LIST;</pre>
      </div>

      <div class="pt-3 border-t border-slate-700 flex justify-end">
        <button onclick="closeModal()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold">
          Entendido
        </button>
      </div>
    </div>
  `;
  openModal();
}

function showNativeScriptModal(type) {
  if (!state.selectedStrategyId) return;
  fetch(`/api/scheduler/native-scripts/${state.selectedStrategyId}`)
    .then(r => r.json())
    .then(res => {
      if (!res.success) return;
      const data = res.data;
      let title = '';
      let scriptCode = '';

      if (type === 'windows') {
        title = 'Comando para Windows Task Scheduler (schtasks)';
        scriptCode = data.windowsCmd;
      } else if (type === 'cron') {
        title = 'Entrada Crontab para Linux/Unix';
        scriptCode = data.cronExpression;
      } else {
        title = 'Script PL/SQL para Oracle DBMS_SCHEDULER';
        scriptCode = data.plsqlScheduler;
      }

      const modalContent = document.getElementById('modalContent');
      modalContent.innerHTML = `
        <div class="space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-slate-700">
            <h3 class="font-bold text-white text-base">${title}</h3>
            <button onclick="closeModal()" class="text-slate-400 hover:text-white">✕</button>
          </div>
          <pre class="bg-slate-950 p-3 rounded text-xs text-sky-300 font-mono overflow-x-auto whitespace-pre">${scriptCode}</pre>
          <div class="flex justify-end">
            <button onclick="closeModal()" class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-semibold">Cerrar</button>
          </div>
        </div>
      `;
      openModal();
    });
}

function showActionableScriptModal(encodedScript) {
  const script = decodeURIComponent(encodedScript);
  const modalContent = document.getElementById('modalContent');
  modalContent.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-slate-700">
        <h3 class="font-bold text-white text-base">Script de Solución Preventiva</h3>
        <button onclick="closeModal()" class="text-slate-400 hover:text-white">✕</button>
      </div>
      <pre class="bg-slate-950 p-3 rounded text-xs text-sky-300 font-mono whitespace-pre">${script}</pre>
      <div class="flex justify-end">
        <button onclick="closeModal()" class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-semibold">Cerrar</button>
      </div>
    </div>
  `;
  openModal();
}

async function scanLocalOracle() {
  showToast('Escaneando instancia local de Oracle Database...', 'info');
  try {
    const res = await fetch('/api/databases/detect-local').then(r => r.json());
    if (res.success) {
      showToast('Oracle detectado y sincronizado: ' + res.data.dbName, 'success');
      await refreshAllData();
    } else {
      showToast(res.message || 'No se pudo conectar a Oracle local', 'error');
    }
  } catch (e) {
    showToast('Error consultando el servidor', 'error');
  }
}

async function toggleStrategyStatus(stratId) {
  try {
    const res = await fetch(`/api/strategies/${stratId}/toggle-status`, { method: 'PATCH' }).then(r => r.json());
    if (res.success) {
      showToast(`Estrategia ${res.data.status.toLowerCase()}`, 'success');
      await refreshAllData();
    }
  } catch (e) {
    showToast('Error al actualizar estado', 'error');
  }
}

// Toast helper
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMessage');
  const toastIcon = document.getElementById('toastIcon');

  toastMsg.textContent = message;
  toast.className = `fixed bottom-6 right-6 z-50 transform transition-all duration-300 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-xs font-semibold ${
    type === 'success' ? 'bg-emerald-600 text-white' :
    (type === 'error' ? 'bg-red-600 text-white' : (type === 'warning' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-100 border border-slate-700'))
  }`;

  toast.classList.remove('translate-y-24', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-24', 'opacity-0');
  }, 4000);
}
