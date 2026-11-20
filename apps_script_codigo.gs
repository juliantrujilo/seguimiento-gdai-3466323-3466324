// Apps Script del seguimiento GDAI (fichas 3466323 y 3466324).
// Pegar completo en la hoja de Google: Extensiones > Apps Script, y luego Implementar > Nueva implementación
// (tipo: Aplicación web · Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario).
//
// La hoja guarda SOLO nombres, evidencias y juicios. El dashboard quita documentos, usuarios y correos
// antes de enviar, y este script rechaza cualquier carga que los traiga.

// Cambie esta clave ÚNICAMENTE aquí, en el editor de Apps Script. No la escriba en el repositorio.
var CLAVE_ADMIN = 'CAMBIE_ESTA_CLAVE';

var FICHAS = ['3466323', '3466324'];

function doGet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var fichas = {};
  FICHAS.forEach(function (f) {
    fichas[f] = {
      zajuna: leer_(ss, 'Zajuna_' + f),
      sofia: leer_(ss, 'SOFIA_' + f),
      actualizado: {
        zajuna: props.getProperty('zajuna_' + f) || '',
        sofia: props.getProperty('sofia_' + f) || ''
      }
    };
  });
  return json_({ estado: 'ok', fichas: fichas });
}

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (CLAVE_ADMIN === 'CAMBIE_ESTA_CLAVE') return json_({ estado: 'error', mensaje: 'Falta definir la clave en el Apps Script' });
    if (d.clave !== CLAVE_ADMIN) return json_({ estado: 'error', mensaje: 'Clave incorrecta' });
    if (FICHAS.indexOf(String(d.ficha)) < 0) return json_({ estado: 'error', mensaje: 'Ficha no reconocida' });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var props = PropertiesService.getScriptProperties();
    var ahora = new Date().toISOString();
    var hecho = [];
    ['zajuna', 'sofia'].forEach(function (fuente) {
      var filas = d[fuente];
      if (!filas || filas.length < 2) return;
      validar_(filas);
      var nombre = (fuente === 'zajuna' ? 'Zajuna_' : 'SOFIA_') + d.ficha;
      escribir_(ss, nombre, filas);
      props.setProperty(fuente + '_' + d.ficha, ahora);
      hecho.push(nombre + ': ' + (filas.length - 1) + ' filas');
    });
    var reg = ss.getSheetByName('Registro') || ss.insertSheet('Registro');
    if (reg.getLastRow() === 0) reg.appendRow(['Fecha', 'Ficha', 'Detalle']);
    reg.appendRow([new Date(), String(d.ficha), hecho.join(' | ') || 'Sin cambios']);
    return json_({ estado: 'ok', detalle: hecho });
  } catch (err) {
    return json_({ estado: 'error', mensaje: String(err.message || err) });
  }
}

// Ninguna celda de aprendiz puede traer números (documento) ni correos
function validar_(filas) {
  for (var i = 1; i < filas.length; i++) {
    var nombre = String(filas[i][0] || '');
    if (/\d/.test(nombre) || nombre.indexOf('@') >= 0) throw new Error('La carga trae documentos o correos en la columna de aprendices');
    for (var j = 1; j < filas[i].length; j++) {
      if (String(filas[i][j] || '').indexOf('@') >= 0) throw new Error('La carga trae correos electrónicos');
    }
  }
}

function leer_(ss, nombre) {
  var hoja = ss.getSheetByName(nombre);
  if (!hoja || hoja.getLastRow() === 0) return [];
  return hoja.getDataRange().getDisplayValues();
}

function escribir_(ss, nombre, filas) {
  var ancho = 0;
  filas.forEach(function (r) { if (r && r.length > ancho) ancho = r.length; });
  var limpias = filas.map(function (r) {
    var out = [];
    for (var i = 0; i < ancho; i++) out.push(r && r[i] !== undefined && r[i] !== null ? String(r[i]) : '');
    return out;
  });
  var hoja = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  hoja.clearContents();
  var rango = hoja.getRange(1, 1, limpias.length, ancho);
  rango.setNumberFormat('@'); // todo como texto: evita que "01" se convierta en 1
  rango.setValues(limpias);
  hoja.setFrozenRows(1);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
