/* Interfaz del seguimiento GDAI. La lógica de datos está en datos.js y el catálogo de guías en catalogo.js. */

const CONFIG = {
  // Pegue aquí la URL de la aplicación web de Apps Script (termina en /exec). Vacía = solo este navegador.
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbx8WoWJC1aDg9MRGwjNh8tPFLgUTOKravexVsi1CHUp1q2dttvJiNEYjBKtjz3SdAowaQ/exec',
  FICHAS: { '3466323': {}, '3466324': {} }
};

const CAT = Datos.CAT;
const CLAVE_LOCAL = 'gdai_seguimiento_v1';
const CLAVE_EXCL = 'gdai_excluidos_v1'; // solo en el navegador del instructor: documentos y nombres reportados para deserción
const E = { ficha: Object.keys(CONFIG.FICHAS)[0], guia: 'todas', vista: 'resumen', busca: '', guiaMatriz: null, crudo: {}, fichas: {} };

const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = id => document.getElementById(id);
const fichaActual = () => E.fichas[E.ficha];
const guiasActivas = () => Datos.guiasDe(E.guia);
const pc = v => v === null ? '—' : v + '%';

/* ---------------- Carga y guardado ---------------- */
function recalcular() {
  Object.keys(CONFIG.FICHAS).forEach(f => {
    const c = E.crudo[f] || {};
    E.fichas[f] = Datos.armarFicha(c.zajuna, c.sofia);
    E.fichas[f].actualizado = c.actualizado || {};
  });
}
function guardarLocal() { try { localStorage.setItem(CLAVE_LOCAL, JSON.stringify(E.crudo)); } catch (e) { /* sin espacio: se ignora */ } }
function leerLocal() { try { E.crudo = JSON.parse(localStorage.getItem(CLAVE_LOCAL)) || {}; } catch (e) { E.crudo = {}; } }

async function sincronizar() {
  if (!CONFIG.SCRIPT_URL) return;
  try {
    const r = await fetch(CONFIG.SCRIPT_URL);
    const d = await r.json();
    if (!d || !d.fichas) throw new Error('respuesta sin datos');
    E.crudo = d.fichas; guardarLocal(); recalcular(); pintar();
  } catch (e) {
    $('estadoDatos').textContent = 'Sin conexión con la hoja de Google; se muestran los últimos datos guardados en este navegador.';
  }
}

/* ---------------- Piezas ---------------- */
function medidor(etq, v, clase, detalle) {
  return `<div class="medidor" title="${esc(detalle || '')}"><span>${etq}</span><div class="pista"><span class="${clase}" style="width:${v === null ? 0 : v}%"></span></div><b>${pc(v)}</b></div>`;
}
function medidores(v) {
  return medidor('Zajuna', v.zajuna, 'z', v.evT !== undefined ? `${v.evA} de ${v.evT} evidencias aprobadas` : '')
    + medidor('SOFIA', v.sofia, 's', v.rapT !== undefined ? `${v.rapA} de ${v.rapT} juicios aprobados` : '');
}
const LEYENDA = `<div class="leyenda"><span><i style="background:var(--zajuna)"></i>Zajuna: evidencias aprobadas</span><span><i style="background:var(--sofia)"></i>SOFIA Plus: resultados de aprendizaje aprobados</span></div>`;
function pildEv(v) {
  return v === 'A' ? '<span class="pild ok">✓ Aprobada</span>' : v === 'D' ? '<span class="pild mal">✕ No aprobada</span>' : '<span class="pild neutro">• Pendiente</span>';
}
function pildJuicio(j) {
  return j === 'APROBADO' ? '<span class="pild ok">✓ Aprobado</span>' : j === 'NO APROBADO' ? '<span class="pild mal">✕ No aprobado</span>' : '<span class="pild neutro">• Por evaluar</span>';
}
function pildEstado(v, f) {
  if (!f.hayZ && !f.hayS) return '';
  const z = v.zajuna === null || v.zajuna === 100, s = v.sofia === null || v.sofia === 100;
  if (z && s) return '<span class="pild ok">✓ Al día</span>';
  if (v.zajuna !== null && v.zajuna < 60) return '<span class="pild mal">! Crítico</span>';
  return '<span class="pild aviso">• Con pendientes</span>';
}
function sinDatos() {
  return `<div class="card vacio"><b>Aún no hay datos cargados para la ficha ${esc(E.ficha)}</b>Use «Actualizar datos» para subir el reporte de calificaciones de Zajuna y el reporte de juicios de SOFIA Plus.<br>Mientras tanto puede consultar las guías y sus evidencias en «Guías y competencias».</div>`;
}

/* ---------------- Vistas ---------------- */
function vistaResumen() {
  const f = fichaActual(), gs = guiasActivas();
  if (!f.hayZ && !f.hayS) return sinDatos() + comparativa();
  const t = Datos.avanceGrupo(f, gs);
  let h = `<div class="kpis">
    <div class="kpi"><div class="et">Aprendices en formación</div><div class="val">${t.n}</div><div class="nota">${f.retirados ? f.retirados + ' retirados o cancelados no se cuentan' : 'Ficha ' + esc(E.ficha)}</div></div>
    <div class="kpi"><div class="et">Evidencias aprobadas (Zajuna)</div><div class="val">${pc(t.zajuna)}</div><div class="nota">${f.hayZ ? t.evA + ' de ' + t.evT + ' entregas' : 'Falta cargar Zajuna'}</div></div>
    <div class="kpi"><div class="et">Juicios aprobados (SOFIA)</div><div class="val">${pc(t.sofia)}</div><div class="nota">${f.hayS ? t.rapA + ' de ' + t.rapT + ' juicios' : 'Falta cargar SOFIA'}</div></div>
    <div class="kpi"><div class="et">Aprendices al día</div><div class="val">${t.alDia}</div><div class="nota">100 % en lo cargado</div></div>
    <div class="kpi"><div class="et">En estado crítico</div><div class="val">${f.hayZ ? t.criticos : '—'}</div><div class="nota">Menos del 60 % de evidencias</div></div>
  </div>`;
  h += `<div class="rejilla"><div class="card"><h2>Avance por guía</h2><div class="sub">Promedio del grupo en cada guía de aprendizaje</div>${LEYENDA}`;
  Datos.guiasDe('todas').forEach(g => {
    const v = Datos.avanceGrupo(f, [g]);
    h += `<div class="fila-m clic" data-ir-guia="${g}"><div class="nom">Guía ${g}<small>Fase ${esc(CAT.guias[g].fase)}</small></div><div>${medidores(v)}</div></div>`;
  });
  h += `</div><div class="card"><h2>Avance por competencia</h2><div class="sub">${E.guia === 'todas' ? 'Todas las guías' : 'Guía ' + E.guia} · clic para ver el detalle</div>${LEYENDA}`;
  competenciasDe(gs).forEach(c => {
    const v = Datos.avanceGrupo(f, gs, c);
    h += `<div class="fila-m clic" data-comp="${c}"><div class="nom">${esc(CAT.competencias[c].corto)}<small>${c}</small></div><div>${medidores(v)}</div></div>`;
  });
  h += `</div></div>` + comparativa();
  return h;
}
function competenciasDe(gs) {
  const out = [];
  gs.forEach(g => CAT.guias[g].competencias.forEach(c => { if (!out.includes(c)) out.push(c); }));
  return out;
}
function comparativa() {
  const gs = guiasActivas();
  let filas = '';
  Object.keys(CONFIG.FICHAS).forEach(n => {
    const f = E.fichas[n], t = Datos.avanceGrupo(f, gs);
    filas += `<tr><td><b>${n}</b></td><td class="num">${(f.hayZ || f.hayS) ? t.n : '—'}</td><td class="num">${pc(t.zajuna)}</td><td class="num">${pc(t.sofia)}</td><td class="num">${(f.hayZ || f.hayS) ? t.alDia : '—'}</td><td>${fechas(f)}</td></tr>`;
  });
  return `<div class="card"><h2>Comparativa de fichas</h2><div class="sub">${E.guia === 'todas' ? 'Todas las guías' : 'Guía ' + E.guia}</div><div class="tabla-caja"><table><thead><tr><th>Ficha</th><th class="num">En formación</th><th class="num">Zajuna</th><th class="num">SOFIA</th><th class="num">Al día</th><th>Última carga</th></tr></thead><tbody>${filas}</tbody></table></div></div>`;
}
function fechas(f) {
  const a = f.actualizado || {}, fmt = d => d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : 'sin cargar';
  return `<span style="color:var(--texto-3);font-size:12px">Zajuna: ${fmt(a.zajuna)} · SOFIA: ${fmt(a.sofia)}</span>`;
}

function vistaGuias() {
  const f = fichaActual();
  let h = '';
  guiasActivas().forEach(g => {
    const G = CAT.guias[g], tg = Datos.avanceGrupo(f, [g]);
    h += `<div class="card guia-bloque"><h3>Guía ${g} · Fase ${esc(G.fase)}</h3><div class="sub">${G.competencias.length} competencias · ${Datos.evidencias(f, [g]).length} evidencias · Zajuna ${pc(tg.zajuna)} · SOFIA ${pc(tg.sofia)} · clic en una competencia para ver sus evidencias</div>`;
    G.competencias.forEach(c => {
      const v = Datos.avanceGrupo(f, [g], c), evs = Datos.evidencias(f, [g], c);
      h += `<details><summary><div class="fila-m" style="border:0;padding:0"><div class="nom">${esc(CAT.competencias[c].corto)}<small>${c} · ${evs.length} evidencias · ${Datos.raps([g], c).length} RAP</small></div><div>${medidores(v)}</div></div></summary>
        <div class="tabla-caja" style="margin:4px 0 14px"><table><thead><tr><th>Evidencia</th><th class="num">Aprobadas</th><th class="num">No aprobadas</th><th class="num">Pendientes</th></tr></thead><tbody>`;
      evs.forEach(e => {
        const k = f.hayZ ? Datos.conteoEvidencia(f, e) : null;
        h += `<tr class="clic" data-ev="${e}"><td>${esc(Datos.nombreEvidencia(f, e))}<code style="display:block;font-size:11px;color:var(--texto-3)">${e}</code></td><td class="num">${k ? k.A : '—'}</td><td class="num">${k ? k.D : '—'}</td><td class="num">${k ? k.P : '—'}</td></tr>`;
      });
      if (!evs.length) h += `<tr><td colspan="4" style="color:var(--texto-3)">Esta competencia no tiene evidencias en el reporte de Zajuna cargado.</td></tr>`;
      h += `</tbody></table></div><button class="btn" data-comp="${c}" data-guia="${g}" style="margin-bottom:14px">Ver aprendices pendientes</button></details>`;
    });
    h += `</div>`;
  });
  return h;
}

function vistaAprendices() {
  const f = fichaActual(), gs = guiasActivas();
  if (!f.hayZ && !f.hayS) return sinDatos();
  const q = Datos.norm(E.busca);
  let filas = '';
  f.aprendices.filter(a => !q || Datos.norm(a.nombre).includes(q)).forEach((a, i) => {
    const v = Datos.avanceAprendiz(f, a, gs);
    filas += `<tr class="clic" data-apr="${esc(a.nombre)}"><td class="num" style="color:var(--texto-3)">${i + 1}</td><td><b>${esc(a.nombre)}</b></td><td style="min-width:230px">${medidores(v)}</td><td class="num">${f.hayZ ? v.evP + v.evD : '—'}</td><td>${pildEstado(v, f)}</td></tr>`;
  });
  return `<div style="margin-bottom:12px"><input class="buscador" id="buscar" placeholder="Buscar por nombre…" value="${esc(E.busca)}" aria-label="Buscar aprendiz"></div>
  <div class="tabla-caja"><table><thead><tr><th class="num">#</th><th>Aprendiz</th><th>Avance</th><th class="num">Evidencias por aprobar</th><th>Estado</th></tr></thead><tbody>${filas || '<tr><td colspan="5" class="vacio">Ningún aprendiz coincide con la búsqueda.</td></tr>'}</tbody></table></div>`;
}

function vistaMatriz() {
  const f = fichaActual();
  if (!f.hayZ) return `<div class="card vacio"><b>La matriz necesita el reporte de Zajuna</b>Cargue las calificaciones de la ficha ${esc(E.ficha)} con «Actualizar datos».</div>`;
  const todas = Datos.guiasDe('todas');
  if (!E.guiaMatriz) E.guiaMatriz = E.guia !== 'todas' ? Number(E.guia) : todas[todas.length - 1];
  const g = E.guiaMatriz, evs = Datos.evidencias(f, [g]);
  let grupos = '', cab = '', previo = null, cuenta = 0;
  const cierra = () => { if (previo) grupos += `<th class="grupo" colspan="${cuenta}" title="${esc(CAT.competencias[previo] ? CAT.competencias[previo].corto : previo)}">${previo}</th>`; };
  evs.forEach(e => {
    const p = Datos.partes(e);
    if (p.competencia !== previo) { cierra(); previo = p.competencia; cuenta = 0; }
    cuenta++;
    cab += `<th class="ev" title="${esc(e + ' · ' + Datos.nombreEvidencia(f, e))}">AA${p.aa}-EV${String(p.ev).padStart(2, '0')}</th>`;
  });
  cierra();
  let cuerpo = '';
  f.aprendices.forEach(a => {
    let ok = 0;
    const celdas = evs.map(e => { const v = a.ev[e] === 'A' ? 'A' : a.ev[e] === 'D' ? 'D' : 'P'; if (v === 'A') ok++; return `<td><span class="cel ${v}" title="${esc(Datos.nombreEvidencia(f, e))}: ${v === 'A' ? 'aprobada' : v === 'D' ? 'no aprobada' : 'pendiente'}">${v === 'A' ? '✓' : v === 'D' ? '✕' : '·'}</span></td>`; }).join('');
    cuerpo += `<tr><td class="clic" data-apr="${esc(a.nombre)}">${esc(a.nombre)}</td>${celdas}<td class="num"><b>${ok}/${evs.length}</b></td></tr>`;
  });
  return `<div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap"><label for="selGuiaM" style="font-weight:600">Guía</label><select class="buscador" id="selGuiaM">${todas.map(x => `<option value="${x}" ${x === g ? 'selected' : ''}>Guía ${x} · ${esc(CAT.guias[x].fase)}</option>`).join('')}</select>
  <span class="leyenda" style="margin:0"><span><span class="cel A">✓</span> Aprobada</span><span><span class="cel D">✕</span> No aprobada</span><span><span class="cel P">·</span> Pendiente</span></span></div>
  <div class="tabla-caja" style="max-height:72vh"><table class="matriz"><thead><tr><th rowspan="2">Aprendiz</th>${grupos}<th rowspan="2" class="num">Total</th></tr><tr>${cab}</tr></thead><tbody>${cuerpo}</tbody></table></div>`;
}

/* ---------------- Ventanas de detalle ---------------- */
const pila = [];
function abrir(fn) { pila.push(fn); pintarModal(); }
function cerrar() { pila.length = 0; $('modalFondo').classList.remove('abierto'); }
function pintarModal() {
  if (!pila.length) return cerrar();
  const { titulo, sub, cuerpo } = pila[pila.length - 1]();
  $('modal').innerHTML = `<header><div>${pila.length > 1 ? '<button class="btn" data-volver style="margin-bottom:8px;padding:4px 10px">← Volver</button>' : ''}<h2>${titulo}</h2><div class="sub" style="color:var(--texto-3);font-size:13px">${sub || ''}</div></div><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>${cuerpo}`;
  $('modalFondo').classList.add('abierto');
}

function detalleAprendiz(nombre) {
  return () => {
    const f = fichaActual(), a = f.aprendices.find(x => x.nombre === nombre);
    if (!a) return { titulo: esc(nombre), cuerpo: '<p>Sin datos.</p>' };
    const v = Datos.avanceAprendiz(f, a, Datos.guiasDe('todas'));
    let h = `<div style="max-width:420px;margin-bottom:14px">${medidores(v)}</div>`;
    Datos.guiasDe('todas').forEach(g => {
      h += `<h3 style="font-size:14px;margin:14px 0 6px">Guía ${g} · Fase ${esc(CAT.guias[g].fase)}</h3>`;
      CAT.guias[g].competencias.forEach(c => {
        const evs = Datos.evidencias(f, [g], c), rs = Datos.raps([g], c);
        h += `<div style="font-weight:600;font-size:13px;margin-top:8px">${esc(CAT.competencias[c].corto)} <span style="color:var(--texto-3);font-weight:400">· ${c}</span></div><div class="lista-ev">`;
        if (f.hayZ) evs.forEach(e => { h += `<div><span>${esc(Datos.nombreEvidencia(f, e))}<code>${e}</code></span>${pildEv(a.ev[e])}</div>`; });
        if (f.hayS) rs.forEach(r => { h += `<div><span>RAP ${r.split('-')[1]} · ${esc(CAT.raps[r] || '')}<code>Juicio en SOFIA Plus</code></span>${pildJuicio(a.rap[r])}</div>`; });
        h += `</div>`;
      });
    });
    return { titulo: esc(a.nombre), sub: `Ficha ${esc(E.ficha)} · ${v.evA} de ${v.evT} evidencias aprobadas · ${v.rapA} de ${v.rapT} juicios aprobados`, cuerpo: h };
  };
}
function detalleCompetencia(c, guia) {
  return () => {
    const f = fichaActual(), gs = guia ? [Number(guia)] : guiasActivas();
    const evs = Datos.evidencias(f, gs, c), rs = Datos.raps(gs, c);
    const filas = f.aprendices.map(a => ({ a, v: Datos.avanceAprendiz(f, a, gs, c) }))
      .filter(x => (f.hayZ && x.v.evA < x.v.evT) || (f.hayS && x.v.rapA < x.v.rapT))
      .sort((x, y) => (x.v.evA / (x.v.evT || 1)) - (y.v.evA / (y.v.evT || 1)));
    let h = `<div class="sub" style="color:var(--texto-3);margin-bottom:10px">${esc(CAT.competencias[c].nombre)}.</div>`;
    h += `<h3 style="font-size:14px;margin-bottom:6px">Resultados de aprendizaje</h3><div class="lista-ev">${rs.map(r => {
      const ok = f.aprendices.filter(a => a.rap[r] === 'APROBADO').length;
      return `<div><span>RAP ${r.split('-')[1]} · ${esc(CAT.raps[r] || '')}</span><span class="pild neutro">${f.hayS ? ok + ' de ' + f.aprendices.length + ' aprobados' : 'sin datos de SOFIA'}</span></div>`;
    }).join('')}</div>`;
    h += `<h3 style="font-size:14px;margin-bottom:6px">Aprendices con pendientes (${filas.length})</h3>`;
    h += filas.length ? `<div class="tabla-caja"><table><thead><tr><th>Aprendiz</th><th class="num">Evidencias</th><th class="num">Juicios</th><th>Falta en Zajuna</th></tr></thead><tbody>${filas.map(({ a, v }) => `<tr class="clic" data-apr="${esc(a.nombre)}"><td><b>${esc(a.nombre)}</b></td><td class="num">${f.hayZ ? v.evA + '/' + v.evT : '—'}</td><td class="num">${f.hayS ? v.rapA + '/' + v.rapT : '—'}</td><td style="font-size:12px;color:var(--texto-2)">${f.hayZ ? evs.filter(e => a.ev[e] !== 'A').map(e => { const p = Datos.partes(e); return 'AA' + p.aa + '-EV' + String(p.ev).padStart(2, '0') + (a.ev[e] === 'D' ? ' (no aprobada)' : ''); }).join(', ') : ''}</td></tr>`).join('')}</tbody></table></div>`
      : `<p style="color:var(--texto-3)">${(f.hayZ || f.hayS) ? 'Todo el grupo está al día en esta competencia.' : 'Aún no hay datos cargados.'}</p>`;
    return { titulo: esc(CAT.competencias[c].corto), sub: `${c} · ${gs.length === 1 ? 'Guía ' + gs[0] : 'Guías ' + gs.join(', ')} · Ficha ${esc(E.ficha)}`, cuerpo: h };
  };
}
function detalleEvidencia(e) {
  return () => {
    const f = fichaActual();
    const grupo = (v, t) => { const l = f.aprendices.filter(a => (a.ev[e] === 'A' ? 'A' : a.ev[e] === 'D' ? 'D' : 'P') === v); return `<h3 style="font-size:14px;margin:12px 0 6px">${t} (${l.length})</h3><div class="lista-ev">${l.map(a => `<div class="clic" data-apr="${esc(a.nombre)}"><span>${esc(a.nombre)}</span></div>`).join('') || '<span style="color:var(--texto-3)">Ninguno</span>'}</div>`; };
    return { titulo: esc(Datos.nombreEvidencia(f, e)), sub: `${e} · Ficha ${esc(E.ficha)}`, cuerpo: f.hayZ ? grupo('D', '✕ No aprobada') + grupo('P', '• Pendiente') + grupo('A', '✓ Aprobada') : '<p style="color:var(--texto-3)">Aún no hay datos de Zajuna cargados.</p>' };
  };
}

/* ---------------- Actualizar datos (solo instructor) ---------------- */
function formularioCarga() {
  return () => ({
    titulo: 'Actualizar datos', sub: 'Los archivos se procesan en este equipo. A la hoja de Google solo se envían nombres, evidencias y juicios: nunca documentos, usuarios ni correos.',
    cuerpo: `<label class="campo">Ficha<select id="cFicha">${Object.keys(CONFIG.FICHAS).map(n => `<option ${n === E.ficha ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="campo">Reporte de calificaciones de Zajuna (.xlsx, en letra)<input type="file" id="cZajuna" accept=".xlsx,.xls,.csv,.ods"></label>
    <label class="campo">Reporte de juicios evaluativos de SOFIA Plus (.xls / .xlsx)<input type="file" id="cSofia" accept=".xlsx,.xls"></label>
    <label class="campo">Listado de deserción de la ficha (Ficha_&lt;n&gt;_desercion.md) <span style="font-weight:400;color:var(--texto-3)">· opcional si ya lo cargó antes</span><input type="file" id="cDeser" accept=".md,.txt"></label>
    <label class="campo">Clave de administrador<input type="password" id="cClave" autocomplete="off" ${CONFIG.SCRIPT_URL ? '' : 'disabled placeholder="No hay hoja de Google conectada: se guardará solo en este navegador"'}></label>
    <p style="font-size:12.5px;color:var(--texto-3)">Suba los dos reportes de la misma ficha a la vez: así los aprendices se cruzan por documento en memoria y no por nombre. Los aprendices del listado de deserción quedan fuera del seguimiento; ese listado solo se guarda en este navegador.</p>
    <div class="aviso-caja" id="cAviso"></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px"><button class="btn" data-cerrar>Cancelar</button><button class="btn primario" id="cProcesar">Procesar y guardar</button></div>`
  });
}
function exclusionesGuardadas(ficha) {
  try {
    const d = (JSON.parse(localStorage.getItem(CLAVE_EXCL)) || {})[ficha];
    return d ? { documentos: new Set(d.documentos), nombres: new Set(d.nombres) } : null;
  } catch (e) { return null; }
}
function guardarExclusiones(ficha, excl) {
  let todo = {};
  try { todo = JSON.parse(localStorage.getItem(CLAVE_EXCL)) || {}; } catch (e) { todo = {}; }
  todo[ficha] = { documentos: Array.from(excl.documentos), nombres: Array.from(excl.nombres) };
  try { localStorage.setItem(CLAVE_EXCL, JSON.stringify(todo)); } catch (e) { /* sin espacio */ }
}
function leerTexto(archivo) {
  return new Promise((ok, mal) => {
    const fr = new FileReader();
    fr.onerror = () => mal(new Error('No se pudo leer ' + archivo.name));
    fr.onload = ev => ok(String(ev.target.result));
    fr.readAsText(archivo, 'utf-8');
  });
}
function leerHoja(archivo) {
  return new Promise((ok, mal) => {
    const fr = new FileReader();
    fr.onerror = () => mal(new Error('No se pudo leer ' + archivo.name));
    fr.onload = ev => {
      try { const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' }); ok(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' })); }
      catch (e) { mal(new Error('El archivo ' + archivo.name + ' no es una hoja de cálculo válida.')); }
    };
    fr.readAsArrayBuffer(archivo);
  });
}
async function procesarCarga() {
  const aviso = $('cAviso'), decir = (t, c) => { aviso.className = 'aviso-caja ver ' + c; aviso.innerHTML = t; };
  const ficha = $('cFicha').value, aZ = $('cZajuna').files[0], aS = $('cSofia').files[0], aD = $('cDeser').files[0], clave = $('cClave').value;
  if (!aZ && !aS && !aD) return decir('Seleccione al menos un reporte, o el listado de deserción para limpiar los datos ya cargados.', 'mal');
  if (CONFIG.SCRIPT_URL && !clave) return decir('Escriba la clave de administrador.', 'mal');
  $('cProcesar').disabled = true; decir('Procesando…', 'info');
  try {
    const previo = E.crudo[ficha] || {}, avisos = [];
    let excl = null;
    if (aD) {
      excl = Datos.parsearDesercion(await leerTexto(aD));
      if (!excl.documentos.size) throw new Error('No encontré aprendices en el listado de deserción. Use el archivo Ficha_' + ficha + '_desercion.md (tabla «Lista para excluir»).');
      guardarExclusiones(ficha, excl);
    } else excl = exclusionesGuardadas(ficha);
    if (!excl) avisos.push('Sin listado de deserción: se incluyen todos los aprendices que SOFIA reporta «EN FORMACION». Cargue Ficha_' + ficha + '_desercion.md para excluir a quienes van para deserción.');
    let sofia = null, zajuna = null, porDoc = null, nombres = {};
    if (aS) {
      const filasS = await leerHoja(aS);
      const fichaEnArchivo = filasS.slice(0, 12).map(r => r.join(' ')).join(' ');
      if (/Ficha de Caracterizaci/i.test(fichaEnArchivo) && !fichaEnArchivo.includes(ficha)) throw new Error('El reporte de SOFIA no corresponde a la ficha ' + ficha + '.');
      const r = Datos.limpiarSofia(filasS, excl);
      sofia = r.matriz; porDoc = r.porDocumento; nombres = r.nombres; avisos.push(...r.avisos);
      if (r.excluidos) avisos.push(r.excluidos + ' aprendices del listado de deserción se excluyeron de SOFIA.');
    } else if (previo.sofia) previo.sofia.slice(1).forEach(f => { nombres[f[0]] = f[1]; });
    if (aZ) { const r = Datos.limpiarZajuna(await leerHoja(aZ), porDoc, nombres, excl); zajuna = r.matriz; avisos.push(...r.avisos);
      if (r.excluidos) avisos.push(r.excluidos + ' aprendices del listado de deserción se excluyeron de Zajuna.'); }

    const ahora = new Date().toISOString();
    E.crudo[ficha] = {
      zajuna: zajuna || Datos.quitarExcluidos(previo.zajuna, excl) || null, sofia: sofia || Datos.quitarExcluidos(previo.sofia, excl) || null,
      actualizado: Object.assign({}, previo.actualizado, zajuna ? { zajuna: ahora } : {}, sofia ? { sofia: ahora } : {})
    };
    guardarLocal(); recalcular(); E.ficha = ficha; pintar();
    const n = E.fichas[ficha].aprendices.length;
    let msj = `Listo: ${n} aprendices en formación en la ficha ${ficha}.` + (avisos.length ? '<br>• ' + avisos.map(esc).join('<br>• ') : '');
    if (CONFIG.SCRIPT_URL) {
      decir('Guardando en la hoja de Google…', 'info');
      const resp = await fetch(CONFIG.SCRIPT_URL, { method: 'POST', body: JSON.stringify({ clave, ficha, zajuna: zajuna || (excl ? E.crudo[ficha].zajuna : null), sofia: sofia || (excl ? E.crudo[ficha].sofia : null) }) });
      const d = await resp.json();
      if (d.estado !== 'ok') throw new Error('La hoja de Google rechazó la carga: ' + (d.mensaje || 'error desconocido') + '. Los datos quedaron solo en este navegador.');
      msj += '<br>Guardado en la hoja de Google: ya lo ven los aprendices.';
    } else msj += '<br>Guardado solo en este navegador (falta conectar la hoja de Google en app.js).';
    decir(msj, 'ok');
  } catch (e) { decir(esc(e.message), 'mal'); }
  $('cProcesar').disabled = false;
}

/* ---------------- Pintado y eventos ---------------- */
const TITULOS = {
  resumen: ['Resumen', 'Avance del grupo en evidencias (Zajuna) y juicios evaluativos (SOFIA Plus)'],
  guias: ['Guías y competencias', 'Evidencias y resultados de aprendizaje de cada guía'],
  aprendices: ['Aprendices', 'Clic en un nombre para ver su detalle'],
  matriz: ['Matriz de entregas', 'Estado de cada evidencia por aprendiz']
};
function pintar() {
  const f = fichaActual();
  $('titulo').textContent = TITULOS[E.vista][0];
  $('subtitulo').textContent = TITULOS[E.vista][1] + ' · Ficha ' + E.ficha;
  $('selFicha').innerHTML = Object.keys(CONFIG.FICHAS).map(n => `<button data-ficha="${n}" class="${n === E.ficha ? 'activo' : ''}">Ficha ${n}</button>`).join('');
  $('filtros').innerHTML = E.vista === 'matriz' ? '' : '<span class="rot">Guía:</span>' + ['todas'].concat(Datos.guiasDe('todas')).map(g => `<button class="chip ${String(E.guia) === String(g) ? 'activo' : ''}" data-guia-f="${g}">${g === 'todas' ? 'Todas' : 'Guía ' + g}</button>`).join('');
  document.querySelectorAll('.nav').forEach(b => b.classList.toggle('activo', b.dataset.vista === E.vista));
  $('vista').innerHTML = ({ resumen: vistaResumen, guias: vistaGuias, aprendices: vistaAprendices, matriz: vistaMatriz })[E.vista]();
  const a = f.actualizado || {}, ult = [a.zajuna, a.sofia].filter(Boolean).sort().pop();
  $('estadoDatos').textContent = ult ? 'Datos al ' + new Date(ult).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Sin datos cargados';
}

document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-vista],[data-ficha],[data-guia-f],[data-ir-guia],[data-apr],[data-comp],[data-ev],[data-cerrar],[data-volver],#btnActualizar,#cProcesar');
  if (ev.target === $('modalFondo')) return cerrar();
  if (!t) return;
  const d = t.dataset;
  if (t.id === 'btnActualizar') return abrir(formularioCarga());
  if (t.id === 'cProcesar') return procesarCarga();
  if ('cerrar' in d) return cerrar();
  if ('volver' in d) { pila.pop(); return pintarModal(); }
  if (d.apr) return abrir(detalleAprendiz(d.apr));
  if (d.ev) return abrir(detalleEvidencia(d.ev));
  if (d.comp) return abrir(detalleCompetencia(d.comp, d.guia));
  if (d.vista) E.vista = d.vista;
  if (d.ficha) { E.ficha = d.ficha; }
  if (d.guiaF) { E.guia = d.guiaF; E.guiaMatriz = null; }
  if (d.irGuia) { E.guia = d.irGuia; E.vista = 'guias'; E.guiaMatriz = null; }
  pintar();
});
document.addEventListener('input', ev => {
  if (ev.target.id !== 'buscar') return;
  E.busca = ev.target.value; const pos = ev.target.selectionStart;
  pintar(); const b = $('buscar'); b.focus(); b.setSelectionRange(pos, pos);
});
document.addEventListener('change', ev => { if (ev.target.id === 'selGuiaM') { E.guiaMatriz = Number(ev.target.value); pintar(); } });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') cerrar(); });

leerLocal(); recalcular(); pintar(); sincronizar();
