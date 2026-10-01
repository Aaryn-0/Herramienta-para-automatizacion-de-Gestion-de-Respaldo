# Herramienta para la Gestión y Automatización de Estrategias de Respaldo en Bases de Datos Oracle
### Enfoque de Control Preventivo mediante Oracle Recovery Manager (RMAN)
**Universidad Nacional de Costa Rica (UNA)**  
**Escuela de Informática**  
**Curso EIF402: Administración de Bases de Datos**  
**Estudiantes: Rafael Blanco, Aaron Guevara, David Coto**  

---

## 1. Descripción del Proyecto

Esta solución trasciende la simple ejecución de scripts RMAN aislados, implementando un **Sistema Integral de Gestión de Estrategias de Respaldo** estructurado bajo el modelo:

$$\text{QUÉ RESPALDAR} \longrightarrow \text{CÓMO RESPALDARLO} \longrightarrow \text{CUÁNDO RESPALDARLO}$$

El software actúa como una capa intermedia entre las necesidades del negocio y el motor técnico Oracle RMAN, funcionando como un **mecanismo de control preventivo** orientado a mitigar proactivamente los dos grandes riesgos de la gestión de datos:
1. **Riesgo de Disponibilidad:** Posibilidad de que la información o la base de datos no se encuentre disponible cuando sea requerida por la operación institucional.
2. **Riesgo de Integridad:** Posibilidad de pérdida, corrupción o alteración de bloques de datos que impida recuperar un estado consistente de la base.

---

## 2. Respuesta a la Pregunta Orientadora del Proyecto

> **¿Cómo puede una herramienta de gestión de estrategias de respaldo utilizar RMAN para establecer controles preventivos que permitan reducir los riesgos asociados con la disponibilidad e integridad de la información de una base de datos Oracle?**

La herramienta responde a este desafío estableciendo controles **antes, durante y después** de cada operación de respaldo:
- **Antes (Fase Preventiva):** Valida la coherencia de la estrategia antes de tocar la base de datos. Si una base está en **NOARCHIVELOG**, la herramienta emite una advertencia preventiva obligatoria impidiendo que el administrador asuma falsamente que cuenta con respaldos en caliente o recuperación puntual (PITR). Para bases críticas **24/7**, exige y recomienda la inclusión de *archived redo logs* continuos para garantizar RPO (Recovery Point Objective) mínimo.
- **Durante (Construcción y Automatización):** Genera scripts RMAN estandarizados con asignación explícita de canales (`ALLOCATE CHANNEL`), compresión básica (`AS COMPRESSED BACKUPSET`) y respaldo automático de archivos críticos de metadatos (`CURRENT CONTROLFILE` y `SPFILE`).
- **Después (Verificación y Evidencia Inmutable):** Incorpora la directiva `RESTORE DATABASE VALIDATE` para verificar físicamente que los bloques no sufran corrupción lógica o física, ejecuta `CROSSCHECK` y `DELETE OBSOLETE` para mantener la integridad del catálogo, y conserva un **registro inmutable de evidencias** auditables con el log real de RMAN, tamaño y confirmación física de archivos en disco.

---

## 3. Escenarios Clave Implementados

### Escenario 1: Base de Datos 24/7 en Modo ARCHIVELOG (Máxima Disponibilidad)
* **Objetivo:** Cero interrupción del servicio a usuarios y recuperación completa hasta la última transacción confirmada.
* **Qué se respalda:** Base de datos completa + Controlfile + SPFILE + Archived Redo Logs continuos (`ARCHIVELOG ALL DELETE ALL INPUT`).
* **Cómo se respalda:** Estrategia en dos niveles (Oracle MAA):
  - Incremental Nivel 0 (Línea base semanal en ventana dominical).
  - Incremental Nivel 1 Acumulativo o Diferencial diario en ventana nocturna (23:00).
  - Respaldo de logs cada 2 horas para acotar la pérdida potencial ante desastre a menos de 120 minutos.
* **Ventaja:** El respaldo se efectúa en caliente con la base en estado `OPEN READ WRITE` sin afectar la continuidad del negocio.

### Escenario 2: Base de Datos en Modo NOARCHIVELOG (Escenario 2 No Archive)
* **Condición Detectada:** Los grupos de Redo Log se sobreescriben cíclicamente sin archivarse.
* **Advertencia Preventiva Obligatoria del Sistema:**
  > *"Advertencia: La base de datos se encuentra en modo NOARCHIVELOG. Las posibilidades de recuperación son más limitadas. Revise la estrategia de respaldo y los requerimientos de recuperación antes de continuar."*
* **Restricción Técnica:** En Oracle, un intento de respaldo online con la base abierta genera el error `RMAN-06149: cannot BACKUP DATABASE in NOARCHIVELOG mode`.
* **Cómo lo resuelve la herramienta:**
  - Estructura automáticamente un **Cold Backup Consistente**:
    ```text
    SQL 'SHUTDOWN IMMEDIATE';
    SQL 'STARTUP MOUNT';
    RUN {
      ALLOCATE CHANNEL c1 DEVICE TYPE DISK FORMAT '...';
      BACKUP AS COMPRESSED BACKUPSET DATABASE TAG 'COLD_BKP';
      BACKUP CURRENT CONTROLFILE AND SPFILE;
      RELEASE CHANNEL c1;
    }
    SQL 'ALTER DATABASE OPEN';
    ```
  - Bloquea la inclusión de *archived redo logs* (no existen en este modo).
  - Alerta sobre la **imposibilidad de recuperación puntual (Point-in-Time Recovery)**: ante un fallo de disco, solo se recuperará el estado hasta la hora del último respaldo frío.
  - Ofrece un botón con el procedimiento oficial DBA para migrar la base a modo `ARCHIVELOG` si el negocio requiere disponibilidad 24/7.

---

## 4. Matriz de Control Preventivo y Mitigación de Riesgos

| Control Preventivo | Dimensión de Riesgo | Mecanismo de Mitigación en el Software |
| :--- | :--- | :--- |
| **Planificación Estructurada (Qué - Cómo - Cuándo)** | Disponibilidad e Integridad | Elimina la dependencia de scripts aislados y define alcance, prioridad y ventana horaria antes de ejecutar. |
| **Detección de Modo Archivador (ARCHIVELOG vs NOARCHIVELOG)** | Disponibilidad (24/7) e Integridad (PITR) | Evita bloqueos en caliente en NOARCHIVELOG y recomienda respaldar logs en ARCHIVELOG para evitar saturación de la FRA. |
| **Asistente Generador Automático de Estrategias** | Disponibilidad e Integridad | Genera planes completos óptimos con 1 clic basados en el perfil de operación y criticidad. |
| **Aprobación Formal del Administrador** | Integridad Operativa | Exige que un DBA revise y apruebe el script RMAN antes de habilitar su automatización. |
| **Verificación de Bloques (`RESTORE DATABASE VALIDATE`)** | Integridad de Datos | Comprueba que las piezas de respaldo no contengan bloques corruptos antes de que ocurra una contingencia real. |
| **Monitoreo de Almacenamiento y Espacio en Disco** | Disponibilidad | Detecta umbrales críticos (< 15% libre) para impedir que un respaldo aborte a mitad de camino por disco lleno. |
| **Planificador Automático en Segundo Plano (Scheduler)** | Disponibilidad | Garantiza la ejecución recurrente sin intervención manual y alerta si un respaldo programado no se ejecutó. |
| **Registro Inmutable de Evidencias** | Trazabilidad y Auditoría | Almacena fecha, hora de inicio/fin, duración, script, log completo RMAN y existencia física de archivos. |

---

## 5. Arquitectura del Software

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   ORACLE BACKUP STRATEGIST (WEB UI)                    │
├────────────────────────────────────────────────────────────────────────┤
│ • Dashboard Preventivo (KPIs, Salud %, Banners 24/7 y NoArchive)       │
│ • Inventario de Bases de Datos (Detección de XE local y remotas)       │
│ • Gestor de Estrategias (QUÉ - CÓMO - CUÁNDO, Prioridades)             │
│ • Asistente Automático Inteligente (Recomendador MAA)                  │
│ • Constructor y Visor RMAN (Sintaxis, Explicación técnica, Aprobación) │
│ • Motor de Automatización (Scheduler embebido + Exportación OS)        │
│ • Centro de Evidencias e Historial (Logs, Tamaños, Archivos en disco)  │
│ • Laboratorio de Simulación (Escenarios de éxito y errores controlados)│
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ REST API (JSON)
┌────────────────────────────────────▼───────────────────────────────────┐
│                          BACKEND (NODE.JS / EXPRESS)                   │
├────────────────────────────────────────────────────────────────────────┤
│ • oracleService.js       : Detección y consultas vía SQL*Plus local    │
│ • rmanGenerator.js       : Motor sintáctico de scripts RMAN            │
│ • strategyRecommender.js : Algoritmo de recomendación automática       │
│ • rmanExecutor.js        : Ejecutor RMAN real + Simulador Sandbox      │
│ • schedulerService.js    : Planificador continuo en background         │
│ • preventiveControlService: Evaluación en vivo de las 9 alertas        │
│ • storageService.js      : Monitoreo de espacio en volumen Windows     │
│ • db.js                  : Persistencia transaccional de datos y logs  │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
┌─────────────────────────────┐             ┌─────────────────────────────┐
│    ORACLE XE 21C NATIVO     │             │    ALMACENAMIENTO DISCO     │
│ • rman.exe target /         │             │ • Archivos .bkp / .ctl / .arc│
│ • sqlplus.exe / as sysdba   │             │ • Scripts generados .rman   │
└─────────────────────────────┘             └─────────────────────────────┘
```

---

## 6. Guía de Puesta en Marcha e Inicio

### Requisitos Previos:
- Node.js versión 18+ (instalado en el equipo, v24 detectado).
- Oracle Database XE 21c (opcional para ejecución real; incluye modo simulación de alta fidelidad).

### Paso 1: Iniciar la Aplicación
Abra una terminal en el directorio del proyecto cambie la carpeta a donde esté alojado el proyecto, y ejecute:
```
npm start
```
*El servidor iniciará en: `http://localhost:3000` con el planificador en segundo plano activo.*

### Paso 2: Abrir la Interfaz Web
Abra su navegador web y navegue a:
```
http://localhost:3000
```

---

## 7. Guía de Pruebas y Demostración para la Evaluación Académica

La aplicación incluye un **Laboratorio de Pruebas (Pestaña "Laboratorio de Pruebas")** diseñado específicamente para demostrar los puntos solicitados en la sección 4 y 14 del documento de cátedra:

1. **Ejecución de la Suite de Pruebas Automatizada (CLI):**
   ```powershell
   npm test
   ```
   *Ejecuta 6 pruebas unitarias y de integración validando base de datos, generador 24/7, Escenario 2 NoArchive, control preventivo y ejecuciones simuladas.*

2. **Demostración de Detección de Oracle Local:**
   - En el menú superior o pestaña **Bases de Datos**, presione **"Escanear Oracle"**.
   - El sistema se conectará a la instancia real `XE` instalada en su equipo vía `sqlplus.exe` y detectará que opera en **NOARCHIVELOG**, disparando la advertencia preventiva y registrando sus datafiles reales.

3. **Demostración del Asistente Generador Automático de Estrategias:**
   - En la pestaña **Estrategias**, presione **"Generar Automáticamente"**.
   - Seleccione la base de datos y escoja entre:
     - **Perfil 24/7 Crítica (ARCHIVELOG):** Genera Nivel 0 dominical + Nivel 1 diario + Redo logs cada 2 horas + compresión + validación.
     - **Escenario 2 No Archive (NOARCHIVELOG):** Genera Cold Backup consistente en ventana de parada, omitiendo archivelogs e incluyendo la advertencia obligatoria.

4. **Demostración del Constructor RMAN y Aprobación:**
   - En la pestaña **Constructor RMAN**, observe el coloreado del script generado y la explicación pedagógica paso a paso de cada instrucción.
   - Presione el botón **"Aprobar Estrategia"** para cumplir el ciclo de auditoría formal.
   - Exporte los comandos para **Windows Task Scheduler (schtasks)** o **Linux Cron**.

5. **Demostración de Evidencia Exitosa y Evidencia Fallida Controlada:**
   - Vaya a la pestaña **Laboratorio de Pruebas**.
   - Presione **"Ejecutar Prueba Exitosa"**: Observe la generación del backup, verificación de archivos físicos en disco y resultado `EXITOSO`.
   - Presione **"Simular Error NOARCHIVELOG"**: Observe la simulación controlada del fallo `RMAN-06149: cannot BACKUP DATABASE in NOARCHIVELOG mode` para demostrar cómo el sistema detecta y documenta fallos.
   - En la pestaña **Historial y Evidencias**, abra cualquier registro y presione **"Informe PDF"** para visualizar el reporte formal de auditoría listo para imprimir.

6. **Demostración del Panel de Alertas y Diagnóstico Preventivo:**
   - En la pestaña **Alertas y Riesgos**, revise las alertas clasificadas por severidad: *Advertencias* (NOARCHIVELOG, sin respaldo reciente), *Recomendaciones* (respaldar archivelogs, habilitar compresión) y *Condiciones Informativas* (pendientes de aprobación).
   - Presione **"Ver Script de Solución"** para consultar el procedimiento DBA interactivo.
