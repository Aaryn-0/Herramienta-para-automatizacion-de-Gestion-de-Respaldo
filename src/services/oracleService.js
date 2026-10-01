const { execSync, spawn } = require('child_process');
const fs = require('fs');
const config = require('../config');

class OracleService {
  constructor() {
    this.sqlplusPath = config.ORACLE_BIN.SQLPLUS;
    this.rmanPath = config.ORACLE_BIN.RMAN;
  }

  /**
   * Verifica si los binarios de Oracle existen localmente
   */
  checkBinaries() {
    const hasSqlPlus = fs.existsSync(this.sqlplusPath);
    const hasRman = fs.existsSync(this.rmanPath);
    return {
      hasSqlPlus,
      hasRman,
      sqlplusPath: this.sqlplusPath,
      rmanPath: this.rmanPath,
      isAvailable: hasSqlPlus && hasRman
    };
  }

  /**
   * Consulta el estado de una base de datos Oracle local usando sqlplus
   */
  queryLocalDatabase(sid = 'XE') {
    if (!this.checkBinaries().hasSqlPlus) {
      return {
        connected: false,
        error: 'Binario sqlplus.exe no encontrado en la ruta especificada'
      };
    }

    try {
      const sqlScript = `
SET HEADING OFF FEEDBACK OFF LINESIZE 500 PAGESIZE 0
SELECT LOG_MODE || '|' || OPEN_MODE || '|' || NAME FROM V$DATABASE;
EXIT;
      `.trim();

      // Ejecutar sqlplus como sysdba local
      const env = { ...process.env, ORACLE_SID: sid };
      const output = execSync(`"${this.sqlplusPath}" -S / as sysdba`, {
        input: sqlScript,
        env,
        encoding: 'utf-8',
        timeout: 10000
      }).trim();

      const parts = output.split('|');
      if (parts.length >= 3) {
        const logMode = parts[0].trim();
        const openMode = parts[1].trim();
        const dbName = parts[2].trim();

        // Consultar tablespaces
        const tsScript = `
SET HEADING OFF FEEDBACK OFF LINESIZE 200 PAGESIZE 0
SELECT TABLESPACE_NAME FROM DBA_TABLESPACES;
EXIT;
        `.trim();
        const tsOutput = execSync(`"${this.sqlplusPath}" -S / as sysdba`, {
          input: tsScript,
          env,
          encoding: 'utf-8',
          timeout: 10000
        }).trim();
        const tablespaces = tsOutput.split(/\r?\n/).map(t => t.trim()).filter(Boolean);

        // Consultar datafiles
        const dfScript = `
SET HEADING OFF FEEDBACK OFF LINESIZE 400 PAGESIZE 0
SELECT FILE_NAME FROM DBA_DATA_FILES;
EXIT;
        `.trim();
        const dfOutput = execSync(`"${this.sqlplusPath}" -S / as sysdba`, {
          input: dfScript,
          env,
          encoding: 'utf-8',
          timeout: 10000
        }).trim();
        const datafiles = dfOutput.split(/\r?\n/).map(d => d.trim()).filter(Boolean);

        return {
          connected: true,
          sid,
          dbName,
          logMode, // ARCHIVELOG o NOARCHIVELOG
          openMode,
          tablespaces,
          datafiles,
          isNoArchiveLog: logMode === 'NOARCHIVELOG',
          isArchiveLog: logMode === 'ARCHIVELOG'
        };
      } else {
        return {
          connected: false,
          error: 'Respuesta inesperada de SQL*Plus: ' + output
        };
      }
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Genera instrucciones para pasar una BD a ARCHIVELOG (Procedimiento DBA)
   */
  getEnableArchiveLogCommands() {
    return [
      '-- Procedimiento seguro para habilitar modo ARCHIVELOG (Requiere parada controlada de 2 minutos)',
      'SHUTDOWN IMMEDIATE;',
      'STARTUP MOUNT;',
      'ALTER DATABASE ARCHIVELOG;',
      'ALTER DATABASE OPEN;',
      '-- Verificar nuevo estado:',
      'ARCHIVE LOG LIST;'
    ].join('\n');
  }

  /**
   * Genera procedimiento para volver a NOARCHIVELOG si se requiere pruebas de Escenario 2
   */
  getDisableArchiveLogCommands() {
    return [
      '-- Procedimiento para volver a modo NOARCHIVELOG (Escenario 2 de Pruebas)',
      'SHUTDOWN IMMEDIATE;',
      'STARTUP MOUNT;',
      'ALTER DATABASE NOARCHIVELOG;',
      'ALTER DATABASE OPEN;',
      '-- Verificar nuevo estado:',
      'ARCHIVE LOG LIST;'
    ].join('\n');
  }
}

module.exports = new OracleService();
