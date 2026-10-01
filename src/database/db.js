const fs = require('fs');
const path = require('path');
const config = require('../config');

// Asegurar existencia de directorios base
[config.DATA_DIR, config.BACKUPS_DIR, config.SCRIPTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const defaultData = {
  databases: [
    {
      id: 'db-xe-local',
      name: 'XE_LOCAL',
      sid: 'XE',
      host: 'localhost',
      port: 1521,
      isRealOracle: true,
      logMode: 'NOARCHIVELOG', // Modo real detectado en la máquina
      status: 'OPEN',
      openMode: 'READ WRITE',
      description: 'Instancia local Oracle Database 21c Express Edition detectada en el equipo',
      criticality: 'ALTA', // Sistema productivo / 24/7 deseado
      is24x7: true,
      allocatedSpaceGB: 12.5,
      tablespaces: ['SYSTEM', 'SYSAUX', 'UNDOTBS1', 'TEMP', 'USERS'],
      datafiles: [
        'C:\\APP\\MAARO\\PRODUCT\\21C\\ORADATA\\XE\\SYSTEM01.DBF',
        'C:\\APP\\MAARO\\PRODUCT\\21C\\ORADATA\\XE\\SYSAUX01.DBF',
        'C:\\APP\\MAARO\\PRODUCT\\21C\\ORADATA\\XE\\UNDOTBS01.DBF',
        'C:\\APP\\MAARO\\PRODUCT\\21C\\ORADATA\\XE\\USERS01.DBF'
      ],
      createdAt: new Date().toISOString()
    },
    {
      id: 'db-fin-24x7',
      name: 'FINDB_PROD',
      sid: 'FINPRD',
      host: '192.168.1.100',
      port: 1521,
      isRealOracle: false,
      logMode: 'ARCHIVELOG',
      status: 'OPEN',
      openMode: 'READ WRITE',
      description: 'Base de datos Financiera Core Transaccional 24/7 (Alta Criticidad)',
      criticality: 'ALTA',
      is24x7: true,
      allocatedSpaceGB: 250.0,
      tablespaces: ['SYSTEM', 'SYSAUX', 'UNDOTBS1', 'TBS_TRANSACCIONES', 'TBS_CLIENTES', 'TBS_HISTORICO'],
      datafiles: [
        '/u01/app/oracle/oradata/FINPRD/system01.dbf',
        '/u01/app/oracle/oradata/FINPRD/sysaux01.dbf',
        '/u01/app/oracle/oradata/FINPRD/tbs_transac01.dbf',
        '/u01/app/oracle/oradata/FINPRD/tbs_clientes01.dbf'
      ],
      createdAt: new Date().toISOString()
    },
    {
      id: 'db-qa-noarchive',
      name: 'STAGE_QA_NOARCHIVE',
      sid: 'QADB',
      host: '192.168.1.105',
      port: 1521,
      isRealOracle: false,
      logMode: 'NOARCHIVELOG',
      status: 'OPEN',
      openMode: 'READ WRITE',
      description: 'Ambiente de pruebas y pre-producción operando en NOARCHIVELOG (Escenario 2)',
      criticality: 'MEDIA',
      is24x7: false,
      allocatedSpaceGB: 45.0,
      tablespaces: ['SYSTEM', 'SYSAUX', 'UNDOTBS1', 'TBS_STAGING'],
      datafiles: [
        '/u01/app/oracle/oradata/QADB/system01.dbf',
        '/u01/app/oracle/oradata/QADB/staging01.dbf'
      ],
      createdAt: new Date().toISOString()
    }
  ],
  strategies: [
    {
      id: 'strat-24x7-prod',
      name: 'Estrategia 24/7 Máxima Disponibilidad (ARCHIVELOG)',
      description: 'Estrategia integral recomendada para bases críticas 24/7: Incremental Nivel 0 semanal + Nivel 1 diario + Redo Logs continuos',
      databaseId: 'db-fin-24x7',
      responsible: 'Admin DBA - Operaciones 24/7',
      priority: 'ALTA',
      status: 'ACTIVA',
      isApproved: true,
      approvedBy: 'Ing. DBA Senior',
      approvedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      
      // QUÉ RESPALDAR
      scope: {
        database: true,
        tablespaces: ['TBS_TRANSACCIONES', 'TBS_CLIENTES'],
        datafiles: [],
        controlfile: true,
        spfile: true,
        archivedRedoLogs: true
      },
      
      // CÓMO RESPALDAR
      backupType: 'INCREMENTAL_NIVEL_1_ACUMULATIVO', // Nivel 1 Acumulativo simplifica recuperación
      level: 1,
      mode: 'ACUMULATIVO', // ACUMULATIVO vs DIFERENCIAL
      compression: true,
      compressionAlgorithm: 'BASIC',
      parallelism: 2,
      backupValidation: true,
      crosscheck: true,
      deleteExpired: true,
      tag: 'BACKUP_24X7_FINPRD',
      destination: path.join(config.BACKUPS_DIR, 'FINDB_PROD'),
      retentionDays: 14,
      retentionRedundancy: 2,
      
      // CUÁNDO RESPALDAR
      schedule: {
        startDate: '2026-09-01',
        time: '23:00',
        frequency: 'DIARIA',
        daysOfWeek: ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'],
        backupWindowMinutes: 120,
        archivelogIntervalHours: 2 // Respaldo de logs cada 2 horas para proteger RPO
      },
      
      createdAt: new Date().toISOString()
    },
    {
      id: 'strat-noarchive-cold',
      name: 'Estrategia Escenario 2: Respaldo Consistente NOARCHIVELOG',
      description: 'Estrategia de respaldo en frío consistente para base de datos sin archivado activo (requiere ventana de parada)',
      databaseId: 'db-xe-local',
      responsible: 'Admin Bases de Datos',
      priority: 'MEDIA',
      status: 'ACTIVA',
      isApproved: false, // Pendiente de revisión del administrador debido a advertencia NOARCHIVELOG
      approvedBy: null,
      approvedAt: null,
      
      // QUÉ RESPALDAR
      scope: {
        database: true,
        tablespaces: [],
        datafiles: [],
        controlfile: true,
        spfile: true,
        archivedRedoLogs: false // En NOARCHIVELOG no se puede respaldar archivelogs
      },
      
      // CÓMO RESPALDAR
      backupType: 'COMPLETO',
      level: null,
      mode: 'OFFLINE_CONSISTENTE',
      compression: true,
      compressionAlgorithm: 'BASIC',
      parallelism: 1,
      backupValidation: true,
      crosscheck: true,
      deleteExpired: true,
      tag: 'COLD_BACKUP_NOARCHIVE',
      destination: path.join(config.BACKUPS_DIR, 'XE_LOCAL'),
      retentionDays: 7,
      retentionRedundancy: 1,
      
      // CUÁNDO RESPALDAR
      schedule: {
        startDate: '2026-09-01',
        time: '02:00',
        frequency: 'SEMANAL',
        daysOfWeek: ['DOMINGO'],
        backupWindowMinutes: 240,
        archivelogIntervalHours: null
      },
      
      createdAt: new Date().toISOString()
    }
  ],
  executions: [
    {
      id: 'exec-demo-1',
      strategyId: 'strat-24x7-prod',
      databaseId: 'db-fin-24x7',
      databaseName: 'FINDB_PROD',
      strategyName: 'Estrategia 24/7 Máxima Disponibilidad (ARCHIVELOG)',
      type: 'INCREMENTAL_NIVEL_1_ACUMULATIVO',
      startedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
      finishedAt: new Date(Date.now() - 3600000 * 5 + 1000 * 60 * 18).toISOString(),
      durationSeconds: 1080,
      status: 'EXITOSO',
      result: 'EXITOSO',
      exitCode: 0,
      destination: path.join(config.BACKUPS_DIR, 'FINDB_PROD'),
      backupSizeMB: 1420.5,
      filesGenerated: [
        'bkp_FINPRD_lvl1_20260930_1001.bkp',
        'ctl_spfile_c-3123201226-20260930-01.ctl',
        'arch_FINPRD_logs_seq452_458.arc'
      ],
      filesVerified: true,
      restoreValidated: true,
      errorMessage: null,
      rmanScript: `RUN {
  ALLOCATE CHANNEL c1 DEVICE TYPE DISK;
  ALLOCATE CHANNEL c2 DEVICE TYPE DISK;
  BACKUP AS COMPRESSED BACKUPSET
    INCREMENTAL LEVEL 1 CUMULATIVE
    TAG 'BACKUP_24X7_FINPRD'
    DATABASE;
  SQL 'ALTER SYSTEM ARCHIVE LOG CURRENT';
  BACKUP AS COMPRESSED BACKUPSET
    ARCHIVELOG ALL DELETE ALL INPUT;
  BACKUP CURRENT CONTROLFILE AND SPFILE;
  RESTORE DATABASE VALIDATE;
  RELEASE CHANNEL c1;
  RELEASE CHANNEL c2;
}
CROSSCHECK BACKUP;
DELETE NOPROMPT EXPIRED BACKUP;`,
      rmanOutputLog: `Recovery Manager: Release 21.0.0.0.0 - Production on Wed Sep 30 16:30:00 2026
connected to target database: FINPRD (DBID=982341201)
using target database control file instead of recovery catalog

allocated channel: c1
channel c1: SID=142 device type=DISK
allocated channel: c2
channel c2: SID=145 device type=DISK

Starting backup at 30-SEP-26
channel c1: starting compressed incremental level 1 cumulative datafile backup set
channel c1: specifying datafile(s) in backup set
input datafile file number=00001 name=/u01/app/oracle/oradata/FINPRD/system01.dbf
channel c2: starting compressed incremental level 1 cumulative datafile backup set
input datafile file number=00003 name=/u01/app/oracle/oradata/FINPRD/tbs_transac01.dbf
channel c1: finished piece 1 at 30-SEP-26
piece handle=C:\\backups\\FINDB_PROD\\bkp_FINPRD_lvl1_20260930_1001.bkp tag=BACKUP_24X7_FINPRD comment=NONE
channel c1: backup set complete, elapsed time: 00:08:15

sql statement: ALTER SYSTEM ARCHIVE LOG CURRENT
channel c1: starting compressed archived log backup set
channel c1: specifying archived log(s) in backup set
input archived log thread=1 sequence=452 RECID=452 STAMP=11823901
input archived log thread=1 sequence=458 RECID=458 STAMP=11824100
channel c1: finished piece 1 at 30-SEP-26
piece handle=C:\\backups\\FINDB_PROD\\arch_FINPRD_logs_seq452_458.arc tag=BACKUP_24X7_FINPRD comment=NONE
deleted archived log(s)

channel c1: starting full datafile backup set
channel c1: specifying datafile(s) in backup set
including current control file in backup set
including current SPFILE in backup set
channel c1: backup set complete, elapsed time: 00:00:25

Starting restore validate at 30-SEP-26
channel c1: scanning backup set for validation
channel c1: restore validate complete, elapsed time: 00:01:10
Finished restore at 30-SEP-26

released channel: c1
released channel: c2

validation completed without errors.
Recovery Manager complete.`
    }
  ],
  preventiveAlerts: []
};

class LocalDB {
  constructor() {
    this.filePath = config.DB_FILE;
    this.data = null;
    this.init();
  }

  init() {
    if (!fs.existsSync(this.filePath)) {
      this.data = JSON.parse(JSON.stringify(defaultData));
      this.save();
    } else {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(raw);
        // Asegurar colecciones mínimas
        if (!this.data.databases) this.data.databases = defaultData.databases;
        if (!this.data.strategies) this.data.strategies = defaultData.strategies;
        if (!this.data.executions) this.data.executions = defaultData.executions;
        if (!this.data.preventiveAlerts) this.data.preventiveAlerts = [];
      } catch (err) {
        console.error('Error al leer base de datos JSON, reiniciando con default:', err);
        this.data = JSON.parse(JSON.stringify(defaultData));
        this.save();
      }
    }
  }

  save() {
    try {
      const tempPath = this.filePath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.filePath);
    } catch (e) {
      console.error('Error al guardar base de datos JSON:', e);
    }
  }

  // Métodos CRUD para Databases
  getDatabases() {
    return this.data.databases;
  }

  getDatabaseById(id) {
    return this.data.databases.find(d => d.id === id);
  }

  addDatabase(db) {
    db.id = db.id || 'db-' + Date.now();
    db.createdAt = new Date().toISOString();
    this.data.databases.push(db);
    this.save();
    return db;
  }

  updateDatabase(id, updates) {
    const idx = this.data.databases.findIndex(d => d.id === id);
    if (idx !== -1) {
      this.data.databases[idx] = { ...this.data.databases[idx], ...updates, updatedAt: new Date().toISOString() };
      this.save();
      return this.data.databases[idx];
    }
    return null;
  }

  deleteDatabase(id) {
    this.data.databases = this.data.databases.filter(d => d.id !== id);
    // Eliminar también estrategias asociadas
    this.data.strategies = this.data.strategies.filter(s => s.databaseId !== id);
    this.save();
  }

  // Métodos CRUD para Estrategias
  getStrategies() {
    return this.data.strategies;
  }

  getStrategyById(id) {
    return this.data.strategies.find(s => s.id === id);
  }

  addStrategy(strat) {
    strat.id = strat.id || 'strat-' + Date.now();
    strat.createdAt = new Date().toISOString();
    strat.isApproved = strat.isApproved || false;
    this.data.strategies.push(strat);
    this.save();
    return strat;
  }

  updateStrategy(id, updates) {
    const idx = this.data.strategies.findIndex(s => s.id === id);
    if (idx !== -1) {
      this.data.strategies[idx] = { ...this.data.strategies[idx], ...updates, updatedAt: new Date().toISOString() };
      this.save();
      return this.data.strategies[idx];
    }
    return null;
  }

  deleteStrategy(id) {
    this.data.strategies = this.data.strategies.filter(s => s.id !== id);
    this.save();
  }

  // Métodos para Ejecuciones / Evidencias
  getExecutions() {
    return this.data.executions.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  }

  getExecutionById(id) {
    return this.data.executions.find(e => e.id === id);
  }

  addExecution(exec) {
    exec.id = exec.id || 'exec-' + Date.now();
    if (!this.data.executions) this.data.executions = [];
    this.data.executions.unshift(exec); // Al inicio para orden cronológico descendente
    this.save();
    return exec;
  }

  // Métodos para Alertas
  getAlerts() {
    return this.data.preventiveAlerts || [];
  }

  setAlerts(alerts) {
    this.data.preventiveAlerts = alerts;
    this.save();
  }

  resolveAlert(alertId) {
    if (!this.data.preventiveAlerts) return;
    this.data.preventiveAlerts = this.data.preventiveAlerts.filter(a => a.id !== alertId);
    this.save();
  }
}

module.exports = new LocalDB();
