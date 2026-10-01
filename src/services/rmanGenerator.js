const path = require('path');
const config = require('../config');

class RmanGenerator {
  /**
   * Genera el script RMAN profesional basado en una estrategia y una base de datos
   * @param {Object} strategy - Objeto de estrategia con QUÉ, CÓMO, CUÁNDO
   * @param {Object} database - Objeto de la base de datos objetivo
   * @returns {Object} { script, warnings, recommendations, explanation }
   */
  generateScript(strategy, database) {
    const warnings = [];
    const recommendations = [];
    const explanation = [];

    const isNoArchive = database.logMode === 'NOARCHIVELOG';
    const is24x7 = database.is24x7 || strategy.priority === 'ALTA';
    const destDir = strategy.destination || path.join(config.BACKUPS_DIR, database.sid || database.name);
    const tag = strategy.tag || `BKP_${database.sid || 'DB'}_${strategy.backupType}`;
    const parallelism = strategy.parallelism || 1;

    // 1. Análisis Preventivo de Compatibilidad
    if (isNoArchive) {
      warnings.push({
        code: 'WARN_NOARCHIVELOG',
        level: 'ADVERTENCIA',
        message: 'Advertencia: La base de datos se encuentra en modo NOARCHIVELOG. Las posibilidades de recuperación son más limitadas. Revise la estrategia de respaldo y los requerimientos de recuperación antes de continuar.'
      });

      if (strategy.scope && strategy.scope.archivedRedoLogs) {
        warnings.push({
          code: 'WARN_ARCHIVELOG_NOT_AVAILABLE',
          level: 'ADVERTENCIA',
          message: 'No es posible respaldar archived redo logs en modo NOARCHIVELOG. Esta opción se ha omitido automáticamente del script.'
        });
      }

      if (is24x7) {
        warnings.push({
          code: 'WARN_24X7_CONFLICT',
          level: 'ADVERTENCIA_CRITICA',
          message: 'Conflicto de arquitectura 24/7: Una base de datos 24/7 no puede respaldarse en caliente en NOARCHIVELOG. Se requiere ventana de parada (Cold Backup) o habilitar ARCHIVELOG.'
        });
      }
    } else {
      // ARCHIVELOG
      if (!strategy.scope || !strategy.scope.archivedRedoLogs) {
        recommendations.push({
          code: 'REC_ADD_ARCHIVELOGS',
          level: 'RECOMENDACION',
          message: 'Recomendación: La base de datos se encuentra en modo ARCHIVELOG. Considere incorporar el respaldo periódico de los archived redo logs dentro de la estrategia para mejorar las posibilidades de recuperación.'
        });
      }
    }

    if (!strategy.compression) {
      recommendations.push({
        code: 'REC_COMPRESSION',
        level: 'RECOMENDACION',
        message: 'Recomendación: Habilitar compresión (COMPRESSED BACKUPSET) para optimizar el consumo de almacenamiento y reducir tiempo de I/O.'
      });
    }

    // 2. Construcción del Script RMAN
    const lines = [];

    lines.push(`# ==============================================================================`);
    lines.push(`# SCRIPT RMAN GENERADO AUTOMÁTICAMENTE POR GESTOR DE ESTRATEGIAS ORACLE`);
    lines.push(`# Base de Datos : ${database.name} (SID: ${database.sid || database.name})`);
    lines.push(`# Modo Archivador: ${database.logMode}`);
    lines.push(`# Estrategia     : ${strategy.name}`);
    lines.push(`# Tipo Respaldo  : ${strategy.backupType}`);
    lines.push(`# Prioridad      : ${strategy.priority}`);
    lines.push(`# Destino        : ${destDir}`);
    lines.push(`# Generado el    : ${new Date().toISOString()}`);
    lines.push(`# ==============================================================================`);
    lines.push(``);

    // Si está en NOARCHIVELOG y el backup es de la base completa:
    // En Oracle, un backup en NOARCHIVELOG requiere que la base esté en MOUNT tras un SHUTDOWN limpio
    if (isNoArchive && strategy.scope && strategy.scope.database) {
      lines.push(`# ------------------------------------------------------------------------------`);
      lines.push(`# FLUJO DE RESPALDO CONSISTENTE EN FRÍO (COLD BACKUP - ESCENARIO 2 NO ARCHIVE)`);
      lines.push(`# En NOARCHIVELOG, la base debe desmontarse para garantizar consistencia física.`);
      lines.push(`# ------------------------------------------------------------------------------`);
      lines.push(`SQL 'SHUTDOWN IMMEDIATE';`);
      lines.push(`SQL 'STARTUP MOUNT';`);
      lines.push(``);
      explanation.push('Paso 1: Detención limpia de la base (SHUTDOWN IMMEDIATE) y montaje (STARTUP MOUNT) para garantizar consistencia.');
    }

    lines.push(`RUN {`);
    explanation.push(`Paso 2: Apertura del bloque RUN transaccional de RMAN.`);

    // Canales
    for (let i = 1; i <= parallelism; i++) {
      const channelName = `c${i}`;
      const formatStr = `${destDir.replace(/\\/g, '/')}/%d_${tag}_%T_%s_%p.bkp`;
      lines.push(`  ALLOCATE CHANNEL ${channelName} DEVICE TYPE DISK FORMAT '${formatStr}';`);
    }
    explanation.push(`Paso 3: Asignación de ${parallelism} canal(es) de disco con formato estándar parametrizado.`);

    // Compresión
    const compOption = strategy.compression ? 'AS COMPRESSED BACKUPSET' : '';

    // Determinación del tipo de respaldo
    let backupClause = '';
    if (strategy.backupType === 'INCREMENTAL_NIVEL_0') {
      backupClause = `BACKUP ${compOption} INCREMENTAL LEVEL 0 TAG '${tag}'`;
      explanation.push('Paso 4: Ejecución de Respaldo Incremental Nivel 0 (Línea base de todos los bloques con datos).');
    } else if (strategy.backupType === 'INCREMENTAL_NIVEL_1_DIFERENCIAL') {
      backupClause = `BACKUP ${compOption} INCREMENTAL LEVEL 1 TAG '${tag}'`;
      explanation.push('Paso 4: Respaldo Incremental Nivel 1 Diferencial (Bloques modificados desde el último backup incremental).');
    } else if (strategy.backupType === 'INCREMENTAL_NIVEL_1_ACUMULATIVO') {
      backupClause = `BACKUP ${compOption} INCREMENTAL LEVEL 1 CUMULATIVE TAG '${tag}'`;
      explanation.push('Paso 4: Respaldo Incremental Nivel 1 Acumulativo (Bloques modificados desde el último Nivel 0; simplifica recuperación).');
    } else {
      // COMPLETO
      backupClause = `BACKUP ${compOption} TAG '${tag}'`;
      explanation.push('Paso 4: Respaldo Completo Integral de todos los bloques asignados.');
    }

    // QUÉ RESPALDAR
    if (strategy.scope && strategy.scope.database) {
      lines.push(`  ${backupClause} DATABASE;`);
    } else if (strategy.scope && strategy.scope.tablespaces && strategy.scope.tablespaces.length > 0) {
      const tsList = strategy.scope.tablespaces.join(', ');
      lines.push(`  ${backupClause} TABLESPACE ${tsList};`);
      explanation.push(`Respaldo enfocado en Tablespace(s) específicos: ${tsList}`);
    } else if (strategy.scope && strategy.scope.datafiles && strategy.scope.datafiles.length > 0) {
      const dfList = strategy.scope.datafiles.map(d => `'${d.replace(/\\/g, '/')}'`).join(', ');
      lines.push(`  ${backupClause} DATAFILE ${dfList};`);
      explanation.push(`Respaldo enfocado en Datafile(s) específicos: ${dfList}`);
    } else {
      lines.push(`  ${backupClause} DATABASE;`);
    }

    // ARCHIVED REDO LOGS (Solo si está en ARCHIVELOG)
    if (!isNoArchive && strategy.scope && strategy.scope.archivedRedoLogs) {
      lines.push(`  SQL 'ALTER SYSTEM ARCHIVE LOG CURRENT';`);
      lines.push(`  BACKUP ${compOption} ARCHIVELOG ALL DELETE ALL INPUT TAG '${tag}_ARCH';`);
      explanation.push('Paso 5: Forzado de cambio de log actual (ALTER SYSTEM ARCHIVE LOG CURRENT) y respaldo de todos los archived redo logs con purga.');
    }

    // CONTROLFILE Y SPFILE
    if (strategy.scope && (strategy.scope.controlfile || strategy.scope.spfile)) {
      lines.push(`  BACKUP CURRENT CONTROLFILE AND SPFILE TAG '${tag}_CTL';`);
      explanation.push('Paso 6: Respaldo de Control File y SPFILE (Metadatos vitales para recuperación ante pérdida total).');
    }

    // VALIDACIÓN DE RESPALDO (RMAN RESTORE VALIDATE)
    if (strategy.backupValidation) {
      lines.push(`  # Verificación proactiva de integridad de bloques`);
      lines.push(`  RESTORE DATABASE VALIDATE;`);
      explanation.push('Paso 7: RESTORE DATABASE VALIDATE (Verifica que los backups sean legibles y no contengan bloques corruptos, sin sobreescribir datos).');
    }

    // Liberación de Canales
    for (let i = 1; i <= parallelism; i++) {
      lines.push(`  RELEASE CHANNEL c${i};`);
    }
    lines.push(`}`);
    explanation.push('Paso 8: Cierre del bloque transaccional RUN y liberación de canales.');

    // Si estaba en NOARCHIVELOG, reabrir la base
    if (isNoArchive && strategy.scope && strategy.scope.database) {
      lines.push(``);
      lines.push(`SQL 'ALTER DATABASE OPEN';`);
      explanation.push('Paso 9: Reapertura de la base de datos (ALTER DATABASE OPEN) para restaurar el servicio a usuarios.');
    }

    // Mantenimiento y Verificación de Catálogo
    if (strategy.crosscheck || strategy.deleteExpired) {
      lines.push(``);
      lines.push(`# ------------------------------------------------------------------------------`);
      lines.push(`# MANTENIMIENTO DEL REPOSITORIO Y PURGA DE RESPALDOS EXPIRADOS`);
      lines.push(`# ------------------------------------------------------------------------------`);
      if (strategy.crosscheck) {
        lines.push(`CROSSCHECK BACKUP;`);
        lines.push(`CROSSCHECK ARCHIVELOG ALL;`);
        explanation.push('Mantenimiento: CROSSCHECK verifica que los archivos físicos aún existan en disco.');
      }
      if (strategy.deleteExpired) {
        lines.push(`DELETE NOPROMPT EXPIRED BACKUP;`);
        lines.push(`DELETE NOPROMPT OBSOLETE;`);
        explanation.push('Mantenimiento: DELETE OBSOLETE purga respaldos que superen la política de retención.');
      }
    }

    return {
      script: lines.join('\n'),
      warnings,
      recommendations,
      explanation
    };
  }
}

module.exports = new RmanGenerator();
