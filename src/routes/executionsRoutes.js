const express = require('express');
const router = express.Router();
const db = require('../database/db');
const rmanExecutor = require('../services/rmanExecutor');
const storageService = require('../services/storageService');

// Consultar todo el historial de ejecuciones (Centro de Evidencias)
router.get('/', (req, res) => {
  const executions = db.getExecutions();
  res.json({ success: true, data: executions });
});

// Consultar detalle de una evidencia específica
router.get('/:id', (req, res) => {
  const execution = db.getExecutionById(req.params.id);
  if (!execution) {
    return res.status(404).json({ success: false, error: 'Evidencia de ejecución no encontrada' });
  }

  // Inspeccionar estado actual de los archivos en disco
  const diskFiles = storageService.getBackupFiles(execution.destination);
  res.json({
    success: true,
    data: execution,
    diskFilesPresent: diskFiles
  });
});

// Disparar ejecución (Manual, Real o Simulación Controlada)
router.post('/run', async (req, res) => {
  const { strategyId, isSimulation, simulationType } = req.body;
  if (!strategyId) {
    return res.status(400).json({ success: false, error: 'strategyId es requerido' });
  }

  try {
    const result = await rmanExecutor.executeStrategy({
      strategyId,
      isSimulation: isSimulation === true,
      simulationType: simulationType || 'SUCCESS'
    });

    res.json({
      success: true,
      message: `Ejecución finalizada con resultado: ${result.result}`,
      data: result
    });
  } catch (error) {
    console.error('Error al ejecutar estrategia:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Exportar evidencia en formato imprimible / informe formal de auditoría
router.get('/:id/export-evidence', (req, res) => {
  const execution = db.getExecutionById(req.params.id);
  if (!execution) return res.status(404).send('Evidencia no encontrada');

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Informe de Evidencia de Respaldo RMAN - ${execution.id}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; color: #1e293b; background: #f8fafc; }
    .card { background: white; border-radius: 8px; padding: 30px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
    h1 { color: #0f172a; margin-top: 0; border-bottom: 2px solid #0284c7; padding-bottom: 12px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-weight: bold; font-size: 13px; }
    .badge-success { background: #dcfce7; color: #15803d; }
    .badge-warning { background: #fef9c3; color: #a16207; }
    .badge-danger { background: #fee2e2; color: #b91c1c; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin: 20px 0; }
    .item label { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; }
    .item p { font-size: 15px; margin: 4px 0 0 0; font-weight: 500; }
    pre { background: #0f172a; color: #38bdf8; padding: 16px; border-radius: 6px; overflow-x: auto; font-size: 12px; font-family: Consolas, monospace; }
    .files-list { list-style: none; padding: 0; }
    .files-list li { padding: 6px 0; border-bottom: 1px solid #f1f5f9; font-family: monospace; }
    @media print {
      body { background: white; margin: 0; }
      .card { box-shadow: none; border: none; padding: 0; }
      button { display: none; }
    }
  </style>
</head>
<body>
  <div class="card">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <h1>Evidencia Formal de Respaldo de Base de Datos Oracle</h1>
      <div>
        <button onclick="window.print()" style="padding: 8px 16px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer;">Imprimir / Guardar PDF</button>
      </div>
    </div>

    <div style="margin: 15px 0;">
      Estado de Ejecución: 
      <span class="badge ${execution.result === 'EXITOSO' ? 'badge-success' : (execution.result === 'CON_ADVERTENCIAS' ? 'badge-warning' : 'badge-danger')}">
        ${execution.result}
      </span>
    </div>

    <div class="grid">
      <div class="item"><label>ID de Ejecución</label><p>${execution.id}</p></div>
      <div class="item"><label>Estrategia</label><p>${execution.strategyName}</p></div>
      <div class="item"><label>Base de Datos</label><p>${execution.databaseName}</p></div>
      <div class="item"><label>Tipo de Respaldo</label><p>${execution.type}</p></div>
      <div class="item"><label>Fecha y Hora de Inicio</label><p>${new Date(execution.startedAt).toLocaleString()}</p></div>
      <div class="item"><label>Fecha y Hora de Finalización</label><p>${new Date(execution.finishedAt).toLocaleString()}</p></div>
      <div class="item"><label>Duración Total</label><p>${execution.durationSeconds} segundos</p></div>
      <div class="item"><label>Tamaño Total de Respaldo</label><p>${execution.backupSizeMB} MB</p></div>
      <div class="item"><label>Directorio de Almacenamiento</label><p>${execution.destination}</p></div>
      <div class="item"><label>Verificación de Bloques (RESTORE VALIDATE)</label><p>${execution.restoreValidated ? 'Verificado sin corrupción' : 'No aplicada o fallida'}</p></div>
    </div>

    <h3>Archivos Físicos Generados y Verificados en Disco:</h3>
    <ul class="files-list">
      ${(execution.filesGenerated || []).map(f => `<li>✓ ${f}</li>`).join('')}
    </ul>

    ${execution.errorMessage ? `<div style="background:#fee2e2; border-left:4px solid #ef4444; padding:12px; margin:16px 0; color:#991b1b;"><strong>Mensaje de Error RMAN:</strong> ${execution.errorMessage}</div>` : ''}

    <h3>Script RMAN Ejecutado:</h3>
    <pre>${execution.rmanScript}</pre>

    <h3>Registro Completo de Salida RMAN (Log de Evidencia):</h3>
    <pre>${execution.rmanOutputLog}</pre>

    <div style="margin-top: 40px; border-top: 1px solid #cbd5e1; padding-top: 20px; font-size: 12px; color: #64748b; text-align: center;">
      Reporte de auditoría y control preventivo emitido por la Plataforma de Automatización de Respaldos Oracle. Universidad Nacional - Escuela de Informática.
    </div>
  </div>
</body>
</html>
  `;

  res.send(html);
});

module.exports = router;
