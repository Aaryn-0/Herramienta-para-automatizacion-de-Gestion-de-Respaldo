const path = require('path');
const config = require('../config');

class StrategyRecommender {
  /**
   * Genera automáticamente una estrategia recomendada según el perfil de la base de datos y negocio
   * @param {Object} options
   * @param {Object} options.database - Objeto de la base de datos
   * @param {string} options.targetProfile - '24X7_CRITICA' | 'ESCENARIO_2_NOARCHIVE' | 'ESTANDAR_DIURNA' | 'DESARROLLO_QA'
   * @param {string} options.priority - 'ALTA' | 'MEDIA' | 'BAJA'
   * @param {string} options.backupWindow - Hora preferida (ej. '23:00')
   * @param {string} options.responsible - Nombre del responsable DBA
   */
  generateAutomaticStrategy({ database, targetProfile, priority, backupWindow = '23:00', responsible = 'DBA Automatizado' }) {
    const isNoArchive = database.logMode === 'NOARCHIVELOG';
    const destDir = path.join(config.BACKUPS_DIR, database.sid || database.name);

    let recommendedStrategy = null;

    if (targetProfile === '24X7_CRITICA' || (database.is24x7 && !targetProfile)) {
      // PERFIL 1: 24/7 ALTA DISPONIBILIDAD
      recommendedStrategy = {
        name: `Estrategia 24/7 MAA - ${database.name}`,
        description: `Estrategia automática 24/7 de Máxima Disponibilidad (MAA). Incremental Nivel 0 dominical + Nivel 1 acumulativo diario + Redo logs cada 2 horas para RPO mínimo.`,
        databaseId: database.id,
        responsible,
        priority: priority || 'ALTA',
        status: 'ACTIVA',
        isApproved: false, // Requiere aprobación explícita del administrador (requisito del PDF)
        approvedBy: null,
        approvedAt: null,
        scope: {
          database: true,
          tablespaces: [],
          datafiles: [],
          controlfile: true,
          spfile: true,
          archivedRedoLogs: !isNoArchive
        },
        backupType: 'INCREMENTAL_NIVEL_1_ACUMULATIVO', // Nivel 1 acumulativo optimiza tiempo de recuperación (RTO)
        level: 1,
        mode: 'ACUMULATIVO',
        compression: true,
        compressionAlgorithm: 'BASIC',
        parallelism: 2,
        backupValidation: true,
        crosscheck: true,
        deleteExpired: true,
        tag: `AUTO_24X7_${database.sid || 'DB'}`,
        destination: destDir,
        retentionDays: 14,
        retentionRedundancy: 2,
        schedule: {
          startDate: new Date().toISOString().split('T')[0],
          time: backupWindow,
          frequency: 'DIARIA',
          daysOfWeek: ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'],
          backupWindowMinutes: 120,
          archivelogIntervalHours: isNoArchive ? null : 2
        },
        rationale: {
          whyWhat: 'Se respalda la base completa, controlfile, spfile y archived redo logs para permitir recuperación completa hasta la última transacción sin pérdida.',
          whyHow: 'Se utiliza Incremental Nivel 1 Acumulativo para balancear tamaño diario y garantizar una restauración más rápida que el diferencial (solo requiere Nivel 0 + último Acumulativo).',
          whyWhen: 'Ejecución en ventana nocturna a las ' + backupWindow + ' con respaldos frecuentes de logs cada 2 horas para acotar el RPO (Recovery Point Objective).'
        }
      };
    } else if (targetProfile === 'ESCENARIO_2_NOARCHIVE' || isNoArchive) {
      // PERFIL 2: ESCENARIO 2 NO ARCHIVE (NOARCHIVELOG)
      recommendedStrategy = {
        name: `Estrategia Escenario 2 No Archive - ${database.name}`,
        description: `Estrategia de respaldo consistente en frío (Cold Backup) para base en NOARCHIVELOG con ventana de mantenimiento.`,
        databaseId: database.id,
        responsible,
        priority: priority || 'MEDIA',
        status: 'ACTIVA',
        isApproved: false,
        approvedBy: null,
        approvedAt: null,
        scope: {
          database: true,
          tablespaces: [],
          datafiles: [],
          controlfile: true,
          spfile: true,
          archivedRedoLogs: false // No se puede en NOARCHIVELOG
        },
        backupType: 'COMPLETO',
        level: null,
        mode: 'OFFLINE_CONSISTENTE',
        compression: true,
        compressionAlgorithm: 'BASIC',
        parallelism: 1,
        backupValidation: true,
        crosscheck: true,
        deleteExpired: true,
        tag: `ESCENARIO2_COLD_${database.sid || 'DB'}`,
        destination: destDir,
        retentionDays: 7,
        retentionRedundancy: 1,
        schedule: {
          startDate: new Date().toISOString().split('T')[0],
          time: backupWindow || '01:00',
          frequency: 'SEMANAL',
          daysOfWeek: ['DOMINGO'],
          backupWindowMinutes: 180,
          archivelogIntervalHours: null
        },
        rationale: {
          whyWhat: 'Se respalda la base de datos completa más control file y spfile. No se incluyen archivelogs ya que la BD opera en NOARCHIVELOG.',
          whyHow: 'Se realiza un respaldo consistente mediante parada controlada (SHUTDOWN IMMEDIATE -> STARTUP MOUNT -> BACKUP -> OPEN). Es la única forma válida de respaldar una base en NOARCHIVELOG sin inconsistencias de bloques.',
          whyWhen: 'Se programa en ventana de bajo tráfico (fin de semana o madrugada) debido a que requiere interrupción del servicio.'
        }
      };
    } else {
      // PERFIL ESTÁNDAR / GENERAL
      recommendedStrategy = {
        name: `Estrategia Estándar Diferencial - ${database.name}`,
        description: `Estrategia balanceada con Incremental Nivel 0 semanal y Nivel 1 Diferencial diario.`,
        databaseId: database.id,
        responsible,
        priority: priority || 'MEDIA',
        status: 'ACTIVA',
        isApproved: false,
        approvedBy: null,
        approvedAt: null,
        scope: {
          database: true,
          tablespaces: [],
          datafiles: [],
          controlfile: true,
          spfile: true,
          archivedRedoLogs: !isNoArchive
        },
        backupType: 'INCREMENTAL_NIVEL_1_DIFERENCIAL',
        level: 1,
        mode: 'DIFERENCIAL',
        compression: true,
        compressionAlgorithm: 'BASIC',
        parallelism: 1,
        backupValidation: true,
        crosscheck: true,
        deleteExpired: true,
        tag: `AUTO_STD_${database.sid || 'DB'}`,
        destination: destDir,
        retentionDays: 7,
        retentionRedundancy: 1,
        schedule: {
          startDate: new Date().toISOString().split('T')[0],
          time: backupWindow,
          frequency: 'DIARIA',
          daysOfWeek: ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'],
          backupWindowMinutes: 90,
          archivelogIntervalHours: isNoArchive ? null : 4
        },
        rationale: {
          whyWhat: 'Protección integral de base de datos y archivos de control.',
          whyHow: 'Incremental Nivel 1 Diferencial minimiza el consumo diario de almacenamiento y el tiempo de respaldo diario.',
          whyWhen: 'Ejecución diaria en horario fuera de oficina a las ' + backupWindow + '.'
        }
      };
    }

    return recommendedStrategy;
  }
}

module.exports = new StrategyRecommender();
