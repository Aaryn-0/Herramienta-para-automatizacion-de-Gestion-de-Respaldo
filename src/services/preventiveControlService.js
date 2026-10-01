const db = require('../database/db');
const storageService = require('./storageService');
const config = require('../config');

class PreventiveControlService {
  /**
   * Analiza todas las bases de datos, estrategias y ejecuciones para detectar riesgos preventivos
   * @returns {Object} { alerts, summary, healthScore, riskMatrix }
   */
  evaluateControls() {
    const databases = db.getDatabases();
    const strategies = db.getStrategies();
    const executions = db.getExecutions();

    const alerts = [];
    let availabilityRiskCount = 0;
    let integrityRiskCount = 0;

    // 1. Control: Base de datos en NOARCHIVELOG (Escenario 2 No Archive)
    databases.forEach(database => {
      if (database.logMode === 'NOARCHIVELOG') {
        availabilityRiskCount++;
        integrityRiskCount++;

        // Mensaje textual exacto requerido en el PDF página 4:
        alerts.push({
          id: `alert-noarchive-${database.id}`,
          databaseId: database.id,
          databaseName: database.name,
          category: 'ARCHIVELOG_MODE',
          level: 'ADVERTENCIA', // Nivel Advertencia según PDF
          riskType: 'DISPONIBILIDAD_E_INTEGRIDAD',
          title: `Base de datos en modo NOARCHIVELOG (${database.name})`,
          message: 'Advertencia: La base de datos se encuentra en modo NOARCHIVELOG. Las posibilidades de recuperación son más limitadas. Revise la estrategia de respaldo y los requerimientos de recuperación antes de continuar.',
          technicalDetail: 'En NOARCHIVELOG no es posible realizar respaldos en caliente (hot backup) de la base abierta ni recuperación hasta un punto en el tiempo (PITR). Solo permite respaldos en frío (Cold Backup consistente con parada de servicio).',
          recommendation: database.is24x7 
            ? 'CRÍTICO: La base de datos está marcada como 24/7. Habilite ARCHIVELOG inmediatamente para evitar paradas forzadas.'
            : 'Si requiere recuperación ante fallos de disco sin pérdida de datos, programe el cambio a ARCHIVELOG.',
          actionableScript: `SHUTDOWN IMMEDIATE;\nSTARTUP MOUNT;\nALTER DATABASE ARCHIVELOG;\nALTER DATABASE OPEN;`,
          createdAt: new Date().toISOString()
        });
      } else {
        // En ARCHIVELOG: Generar Recomendación preventiva según PDF página 5
        const relatedStrategies = strategies.filter(s => s.databaseId === database.id && s.status === 'ACTIVA');
        const hasArchivelogBackup = relatedStrategies.some(s => s.scope && s.scope.archivedRedoLogs);

        if (!hasArchivelogBackup && relatedStrategies.length > 0) {
          integrityRiskCount++;
          alerts.push({
            id: `rec-archivelog-${database.id}`,
            databaseId: database.id,
            databaseName: database.name,
            category: 'ARCHIVED_REDO_LOGS',
            level: 'RECOMENDACION', // Nivel Recomendación según PDF
            riskType: 'INTEGRIDAD',
            title: `Incorporar Respaldo de Archived Redo Logs (${database.name})`,
            message: 'Recomendación: La base de datos se encuentra en modo ARCHIVELOG. Considere incorporar el respaldo periódico de los archived redo logs dentro de la estrategia para mejorar las posibilidades de recuperación.',
            technicalDetail: 'Respaldar los redo logs archivados permite restaurar hasta la última transacción y evita que el área de FRA (Fast Recovery Area) se llene y detenga la base de datos.',
            recommendation: 'Active la opción de archived redo logs con "DELETE ALL INPUT" para liberar espacio.',
            createdAt: new Date().toISOString()
          });
        }
      }

      // 2. Control: Espacio disponible en almacenamiento de destino
      const sampleStrat = strategies.find(s => s.databaseId === database.id);
      const destPath = (sampleStrat && sampleStrat.destination) || config.BACKUPS_DIR;
      const diskInfo = storageService.getDiskSpace(destPath);
      
      if (diskInfo.freeGB < config.THRESHOLDS.MIN_DISK_FREE_GB || diskInfo.freePercentage < config.THRESHOLDS.WARNING_DISK_PERCENT) {
        availabilityRiskCount++;
        alerts.push({
          id: `alert-disk-${database.id}`,
          databaseId: database.id,
          databaseName: database.name,
          category: 'ESPACIO_DISCO',
          level: 'ADVERTENCIA',
          riskType: 'DISPONIBILIDAD',
          title: `Espacio de Almacenamiento Crítico en Destino (${diskInfo.drive})`,
          message: `Advertencia: Quedan únicamente ${diskInfo.freeGB} GB libres (${diskInfo.freePercentage}% disponible) en el almacenamiento de respaldo.`,
          technicalDetail: `El umbral mínimo de seguridad es de ${config.THRESHOLDS.MIN_DISK_FREE_GB} GB o ${config.THRESHOLDS.WARNING_DISK_PERCENT}%. Un respaldo interrumpido por disco lleno deja la base desprotegida.`,
          recommendation: 'Configure políticas de retención con DELETE OBSOLETE o traslade respaldos históricos a almacenamiento secundario.',
          createdAt: new Date().toISOString()
        });
      }
    });

    // 3. Control: Estrategias sin programación o Inactivas
    strategies.forEach(strategy => {
      const dbObj = databases.find(d => d.id === strategy.databaseId);
      const dbName = dbObj ? dbObj.name : 'Desconocida';

      if (strategy.status === 'INACTIVA') {
        alerts.push({
          id: `alert-inactive-${strategy.id}`,
          strategyId: strategy.id,
          strategyName: strategy.name,
          category: 'ESTRATEGIA_INACTIVA',
          level: 'CONDICION_INFORMATIVA', // Condición Informativa según PDF
          riskType: 'DISPONIBILIDAD',
          title: `Estrategia Inactiva (${strategy.name})`,
          message: `La estrategia de respaldo "${strategy.name}" se encuentra en estado INACTIVA.`,
          technicalDetail: 'Una estrategia inactiva no será disparada automáticamente por el planificador.',
          recommendation: 'Active la estrategia si la base de datos asociada está en producción.',
          createdAt: new Date().toISOString()
        });
      }

      if (!strategy.schedule || !strategy.schedule.frequency || !strategy.schedule.time) {
        availabilityRiskCount++;
        alerts.push({
          id: `alert-nosched-${strategy.id}`,
          strategyId: strategy.id,
          strategyName: strategy.name,
          category: 'SIN_PROGRAMACION',
          level: 'ADVERTENCIA',
          riskType: 'DISPONIBILIDAD',
          title: `Estrategia sin Programación Automática (${strategy.name})`,
          message: `La estrategia "${strategy.name}" no cuenta con horario ni frecuencia de ejecución definida.`,
          technicalDetail: 'Depender de ejecuciones manuales viola el principio de automatización y control preventivo.',
          recommendation: 'Defina la ventana horaria (CUÁNDO) y los días de ejecución en el programador.',
          createdAt: new Date().toISOString()
        });
      }

      // 4. Control: Script sin aprobación del administrador
      if (!strategy.isApproved) {
        integrityRiskCount++;
        alerts.push({
          id: `alert-noapproval-${strategy.id}`,
          strategyId: strategy.id,
          strategyName: strategy.name,
          category: 'PENDIENTE_APROBACION',
          level: 'CONDICION_INFORMATIVA',
          riskType: 'INTEGRIDAD',
          title: `Estrategia Pendiente de Aprobación de Administrador`,
          message: `El script RMAN de "${strategy.name}" requiere ser revisado y aprobado antes de habilitar su automatización.`,
          technicalDetail: 'El administrador debe validar los parámetros técnicos antes de su paso a producción.',
          recommendation: 'Ingrese al módulo de RMAN, revise el script generado y presione "Aprobar Estrategia".',
          createdAt: new Date().toISOString()
        });
      }

      // 5. Control: Estrategia sin respaldo reciente
      const stratExecs = executions.filter(e => e.strategyId === strategy.id && e.result === 'EXITOSO');
      const lastExec = stratExecs[0];
      const maxHoursAllowed = strategy.priority === 'ALTA' ? config.THRESHOLDS.MAX_HOURS_WITHOUT_BACKUP_HIGH : (config.THRESHOLDS.MAX_DAYS_WITHOUT_BACKUP_MED * 24);

      if (!lastExec) {
        integrityRiskCount++;
        alerts.push({
          id: `alert-nobackup-ever-${strategy.id}`,
          strategyId: strategy.id,
          strategyName: strategy.name,
          category: 'SIN_RESPALDO_RECIENTE',
          level: 'ADVERTENCIA',
          riskType: 'INTEGRIDAD',
          title: `Estrategia sin Evidencia de Respaldo Histórico (${strategy.name})`,
          message: `La estrategia no registra ninguna ejecución exitosa en el historial de evidencia.`,
          technicalDetail: 'No existe línea base ni respaldo verificable para garantizar la recuperación.',
          recommendation: 'Ejecute un respaldo inmediato (Nivel 0 o Completo) para establecer el punto de partida.',
          createdAt: new Date().toISOString()
        });
      } else {
        const hoursSinceLast = (Date.now() - new Date(lastExec.finishedAt).getTime()) / (1000 * 3600);
        if (hoursSinceLast > maxHoursAllowed) {
          integrityRiskCount++;
          alerts.push({
            id: `alert-outdated-${strategy.id}`,
            strategyId: strategy.id,
            strategyName: strategy.name,
            category: 'SIN_RESPALDO_RECIENTE',
            level: 'ADVERTENCIA',
            riskType: 'INTEGRIDAD',
            title: `Respaldo Desactualizado (> ${Math.round(hoursSinceLast)} horas)`,
            message: `Han transcurrido ${Math.round(hoursSinceLast)} horas desde el último respaldo exitoso de "${strategy.name}".`,
            technicalDetail: `El SLA/RPO máximo para prioridad ${strategy.priority} es de ${maxHoursAllowed} horas.`,
            recommendation: 'Verifique si el planificador automático está en ejecución o fuerce un respaldo manual.',
            createdAt: new Date().toISOString()
          });
        }
      }
    });

    // 6. Control: Ejecución fallida reciente
    const recentFailed = executions.filter(e => e.result === 'FALLIDO').slice(0, 3);
    recentFailed.forEach(failedExec => {
      integrityRiskCount += 2;
      alerts.push({
        id: `alert-failed-exec-${failedExec.id}`,
        executionId: failedExec.id,
        category: 'EJECUCION_FALLIDA',
        level: 'ADVERTENCIA',
        riskType: 'INTEGRIDAD',
        title: `Fallo Crítico en Respaldo: ${failedExec.strategyName}`,
        message: `La ejecución del ${new Date(failedExec.startedAt).toLocaleString()} falló: ${failedExec.errorMessage || 'Error en RMAN'}`,
        technicalDetail: 'Un respaldo fallido interrumpe la cadena de recuperación incremental y expone la base a pérdidas irreversibles.',
        recommendation: 'Revise el log de RMAN en el Centro de Evidencias, corrija la causa raíz y repita el respaldo.',
        createdAt: failedExec.startedAt
      });
    });

    // Actualizar alertas en memoria persistente
    db.setAlerts(alerts);

    // Cálculo del Índice de Salud Preventiva (0 a 100%)
    const penalty = (availabilityRiskCount * 12) + (integrityRiskCount * 15);
    const healthScore = Math.max(10, Math.min(100, 100 - penalty));

    // Matriz de Control Preventivo (Requerida por el documento de análisis)
    const riskMatrix = [
      {
        control: 'Planificación de Respaldos (QUÉ - CÓMO - CUÁNDO)',
        dimRiesgo: 'Disponibilidad e Integridad',
        objetivo: 'Evitar respaldos arbitrarios; definir alcance exacto y periodicidad según criticidad.',
        estado: strategies.length > 0 ? 'OPERATIVO' : 'EN_RIESGO'
      },
      {
        control: 'Validación de Modo ARCHIVELOG / NOARCHIVELOG',
        dimRiesgo: 'Disponibilidad (24/7) e Integridad (PITR)',
        objetivo: 'Advertir restricciones de recuperación en frío y evitar bloqueo de transacciones online.',
        estado: databases.some(d => d.logMode === 'NOARCHIVELOG') ? 'ADVERTENCIA_ACTIVA' : 'OPTIMO'
      },
      {
        control: 'Generación Automatizada de Scripts RMAN',
        dimRiesgo: 'Integridad',
        objetivo: 'Eliminar errores humanos en la sintaxis y garantizar uso de canales y compresión idónea.',
        estado: 'OPERATIVO'
      },
      {
        control: 'Verificación de Integridad (RESTORE VALIDATE)',
        dimRiesgo: 'Integridad',
        objetivo: 'Asegurar que los bloques respaldados no contengan corrupción física o lógica antes de un desastre.',
        estado: strategies.some(s => s.backupValidation) ? 'OPERATIVO' : 'RECOMENDADO'
      },
      {
        control: 'Conservación de Evidencia y Registro Inmutable',
        dimRiesgo: 'Disponibilidad e Integridad',
        objetivo: 'Demostrar que los respaldos realmente se ejecutaron y auditar existencia física de archivos.',
        estado: executions.length > 0 ? 'OPERATIVO' : 'SIN_EVIDENCIA'
      },
      {
        control: 'Monitoreo de Espacio en Almacenamiento',
        dimRiesgo: 'Disponibilidad',
        objetivo: 'Prevenir abortos de respaldos por almacenamiento insuficiente en destino.',
        estado: 'MONITOREADO'
      }
    ];

    return {
      alerts,
      summary: {
        totalAlerts: alerts.length,
        advertencias: alerts.filter(a => a.level === 'ADVERTENCIA').length,
        recomendaciones: alerts.filter(a => a.level === 'RECOMENDACION').length,
        informativas: alerts.filter(a => a.level === 'CONDICION_INFORMATIVA').length,
        availabilityRisks: availabilityRiskCount,
        integrityRisks: integrityRiskCount,
        healthScore
      },
      riskMatrix
    };
  }
}

module.exports = new PreventiveControlService();
