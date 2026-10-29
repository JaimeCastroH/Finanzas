/**
 * Finanzas de Jaime: puente entre la app y esta hoja de Google.
 * Pega este código en Extensiones > Apps Script de la hoja "Finanzas Jaime".
 * La CLAVE funciona como contraseña: no la compartas.
 */
const CLAVE = 'sRmPyUB-VGfhj-25ft17pIB2';
const COLS_MOV = ['id', 'fecha', 'tipo', 'monto', 'categoria', 'medio', 'a', 'concepto', 'destino', 'desde', 'pago_id', 'nota', 'creado', 'editado'];

function doGet(e) {
  try {
    if (!e || !e.parameter || e.parameter.k !== CLAVE) return salida({ ok: false, error: 'clave' });
    return salida({ ok: true, datos: leerTodo() });
  } catch (err) {
    return salida({ ok: false, error: 'servidor', detalle: String(err) });
  }
}

function doPost(e) {
  let cuerpo;
  try { cuerpo = JSON.parse(e.postData.contents); } catch (err) { return salida({ ok: false, error: 'json' }); }
  if (cuerpo.k !== CLAVE) return salida({ ok: false, error: 'clave' });
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Movimientos');
    const mov = cuerpo.mov || {};
    if (cuerpo.accion === 'agregar') {
      mov.id = String(mov.id || Utilities.getUuid().replace(/-/g, '').slice(0, 20));
      // Si la app reenvía algo que ya había llegado (se cortó la señal en la respuesta), no se duplica.
      if (!buscarFila(hoja, mov.id)) escribirFila(hoja, hoja.getLastRow() + 1, mov);
    } else if (cuerpo.accion === 'editar' || cuerpo.accion === 'borrar') {
      if (!mov.id) return salida({ ok: false, error: 'sin_id' });
      const fila = buscarFila(hoja, mov.id);
      if (!fila) return salida({ ok: false, error: 'no_encontrado', datos: leerTodo() });
      if (cuerpo.accion === 'borrar') hoja.deleteRow(fila);
      else escribirFila(hoja, fila, mov);
    } else {
      return salida({ ok: false, error: 'accion' });
    }
    SpreadsheetApp.flush();
    return salida({ ok: true, id: mov.id, datos: leerTodo() });
  } catch (err) {
    return salida({ ok: false, error: 'servidor', detalle: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ---------- Lectura ----------
function leerTodo() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const zona = libro.getSpreadsheetTimeZone();
  ponerIds(libro.getSheetByName('Movimientos'));
  const filas = (nombre) => {
    const v = libro.getSheetByName(nombre).getDataRange().getValues();
    const enc = v.shift().map(String);
    return v.filter((r) => r.some((x) => x !== '' && x !== null)).map((r) => {
      const o = {}; enc.forEach((h, i) => { o[h] = texto(r[i], zona); }); return o;
    });
  };
  const config = {};
  filas('Config').forEach((r) => { if (r.clave) config[r.clave] = r.valor; });
  const deudas = filas('Deudas').map((d) => ({ id: d.id, nombre: d.nombre, saldo_base: num(d.saldo_base), detalle: d.detalle, prioridad: d.prioridad, orden: num(d.orden) }));
  const pagos = [];
  filas('Pagos').forEach((p) => {
    let g = pagos.find((x) => x.id === p.id);
    if (!g) { g = { id: p.id, fecha: p.fecha, nombre: p.nombre, nota: p.nota, partes: [] }; pagos.push(g); }
    g.partes.push({ a: p.a, monto: num(p.monto) });
  });
  const movs = filas('Movimientos').map((m) => { m.id = String(m.id); m.monto = num(m.monto); return m; });
  return { config, deudas, pagos, movs };
}

// Un movimiento escrito a mano sin id recibe uno, para poder editarlo o borrarlo desde la app.
function ponerIds(hoja) {
  const n = hoja.getLastRow() - 1;
  if (n < 1) return;
  const v = hoja.getRange(2, 1, n, COLS_MOV.length).getValues();
  v.forEach((r, i) => {
    if (String(r[0]).trim() === '' && r.slice(1).some((x) => x !== '' && x !== null)) {
      const celda = hoja.getRange(i + 2, 1);
      celda.setNumberFormat('@');
      celda.setValue('h' + Utilities.getUuid().replace(/-/g, '').slice(0, 19));
    }
  });
}

// ---------- Utilidades ----------
function texto(v, zona) {
  if (v instanceof Date) return Utilities.formatDate(v, zona, 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : v;
}
function num(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/[$\s]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}
// Todo se escribe como texto (para que Sheets no convierta fechas, ids ni notas), menos el monto.
function escribirFila(hoja, fila, mov) {
  const rango = hoja.getRange(fila, 1, 1, COLS_MOV.length);
  rango.setNumberFormats([COLS_MOV.map((c) => (c === 'monto' ? '0.00' : '@'))]);
  rango.setValues([COLS_MOV.map((c) => {
    const v = mov[c];
    if (v === undefined || v === null) return '';
    return c === 'monto' ? num(v) : String(v);
  })]);
}
function buscarFila(hoja, id) {
  if (hoja.getLastRow() < 2) return 0;
  const ids = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}
function salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Corre esta función una vez desde el editor para dar permisos y comprobar que todo lee bien. */
function probar() {
  const d = leerTodo();
  Logger.log('Movimientos: ' + d.movs.length + ' · Deudas: ' + d.deudas.length + ' · Pagos: ' + d.pagos.length);
}
