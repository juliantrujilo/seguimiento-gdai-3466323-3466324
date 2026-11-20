/* Lógica de datos del seguimiento GDAI: lee los reportes de Zajuna y SOFIA Plus,
   los deja SOLO con nombres (sin cédulas, usuarios ni correos) y calcula el avance.
   No toca la página: se puede probar por separado. */

const Datos = (() => {
  const CAT = typeof CATALOGO !== 'undefined' ? CATALOGO : require('./catalogo.js');
  const RE_EV = /GA(\d+)-(\d{9})-AA(\d+)-EV(\d+)/i;

  const txt = v => (v === null || v === undefined) ? '' : String(v).trim();
  const norm = s => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const soloDigitos = s => txt(s).replace(/\D/g, '');
  const tituloNombre = s => txt(s).toLowerCase().replace(/\s+/g, ' ')
    .replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

  /* ---------- Aprendices reportados para deserción (se excluyen del seguimiento) ----------
     El listado se lee del archivo Ficha_<n>_desercion.md en el navegador del instructor;
     documentos y nombres NUNCA se envían a la hoja ni se guardan en el repositorio. */
  const claveNombre = s => norm(s).split(' ').filter(Boolean).sort().join(' ');
  function parsearDesercion(texto) {
    const documentos = new Set(), nombres = new Set();
    String(texto || '').split(/\r?\n/).forEach(l => {
      const m = l.match(/^\|\s*\d+\s*\|\s*(\d{5,12})\s*\|\s*([^|]+?)\s*\|/);   // fila «| # | documento | nombre | …»
      if (m) { documentos.add(m[1]); nombres.add(claveNombre(m[2])); }
    });
    return { documentos, nombres };
  }
  function vacio() { return { documentos: new Set(), nombres: new Set() }; }
  const estaExcluido = (excl, doc, nombre) => !!excl && ((doc && excl.documentos.has(doc)) || excl.nombres.has(claveNombre(nombre)));
  // Para matrices ya limpias (solo nombres): quita a los excluidos por nombre
  function quitarExcluidos(matriz, excl) {
    if (!matriz || !excl || !excl.nombres.size) return matriz;
    return matriz.filter((f, i) => i === 0 || !excl.nombres.has(claveNombre(f[0])));
  }

  const SOFIA_A_NORMA = {};
  Object.entries(CAT.competencias).forEach(([codigo, c]) => { SOFIA_A_NORMA[c.sofia] = codigo; });

  /* ---------- SOFIA Plus: "Reporte de Juicios Evaluativos" ---------- */
  function numeroRap(codigo, textoRap) {
    const t = txt(textoRap);
    let m = t.match(/RAP\s*0?(\d{1,2})\s*[:.\-]/i) || t.match(/-\s*0?(\d{1,2})\s+\D/);
    if (m) return String(m[1]).padStart(2, '0');
    // Sin número (pasa en Inglés): se reconoce por el inicio del texto del resultado
    const cuerpo = norm(t.replace(/^\s*\d+\s*-\s*/, ''));
    for (const [clave, etiqueta] of Object.entries(CAT.raps)) {
      if (!clave.startsWith(codigo + '-')) continue;
      if (cuerpo.startsWith(norm(etiqueta).slice(0, 28))) return clave.split('-')[1];
    }
    return null;
  }

  // Devuelve { matriz, porDocumento, nombres, avisos }. La matriz ya no trae documentos.
  function limpiarSofia(filas, excl) {
    const avisos = [];
    const iCab = filas.findIndex(f => {
      const c = (f || []).map(norm);
      return c.includes('nombre') && c.includes('apellidos') && c.some(x => x.startsWith('competencia'));
    });
    if (iCab < 0) throw new Error('El archivo de SOFIA no es el "Reporte de Juicios Evaluativos" (no se encontró la fila Nombre / Apellidos / Competencia).');
    const cab = filas[iCab].map(norm);
    const col = pref => cab.findIndex(c => c.startsWith(pref));
    const cDoc = col('numero de documento'), cNom = col('nombre'), cApe = col('apellidos'),
      cEst = col('estado'), cComp = col('competencia'), cRap = col('resultado de aprendizaje'), cJui = col('juicio');
    if ([cNom, cApe, cEst, cComp, cRap, cJui].some(i => i < 0)) throw new Error('Al reporte de SOFIA le faltan columnas (Nombre, Apellidos, Estado, Competencia, Resultado de Aprendizaje o Juicio).');

    const matriz = [['Aprendiz', 'Estado', 'Competencia', 'RAP', 'Juicio']];
    const porDocumento = {}, nombres = {}, fuera = new Set();
    let sinRap = 0;
    for (let i = iCab + 1; i < filas.length; i++) {
      const f = filas[i];
      if (!f || !txt(f[cNom])) continue;
      const nombre = tituloNombre(txt(f[cNom]) + ' ' + txt(f[cApe]));
      const estado = txt(f[cEst]).toUpperCase();
      if (estaExcluido(excl, cDoc >= 0 ? soloDigitos(f[cDoc]) : '', nombre)) { fuera.add(nombre); continue; }
      if (cDoc >= 0 && soloDigitos(f[cDoc])) porDocumento[soloDigitos(f[cDoc])] = nombre;
      nombres[nombre] = estado;
      const idSofia = (txt(f[cComp]).match(/^\s*(\d+)/) || [])[1];
      const codigo = SOFIA_A_NORMA[idSofia];
      if (!codigo) continue;                         // competencia fuera del catálogo de guías
      const rap = numeroRap(codigo, f[cRap]);
      if (!rap) { sinRap++; continue; }
      matriz.push([nombre, estado, codigo, rap, txt(f[cJui]).toUpperCase() || 'POR EVALUAR']);
    }
    // Aprendices sin ninguna fila de competencias del catálogo: se conserva su estado
    const conFilas = new Set(matriz.slice(1).map(r => r[0]));
    Object.entries(nombres).forEach(([n, e]) => { if (!conFilas.has(n)) matriz.push([n, e, '', '', '']); });
    if (sinRap) avisos.push(sinRap + ' filas de SOFIA no se pudieron asociar a un RAP y se omitieron.');
    return { matriz, porDocumento, nombres, avisos, excluidos: fuera.size };
  }

  /* ---------- Zajuna: exportación del libro de calificaciones (en letra) ---------- */
  function limpiarZajuna(filas, porDocumento, nombresSofia, excl) {
    const avisos = [];
    const iCab = filas.findIndex(f => (f || []).some(c => RE_EV.test(txt(c))));
    if (iCab < 0) throw new Error('El archivo de Zajuna no trae columnas de evidencias con el código GAx-competencia-AAy-EVzz.');
    const cabOrig = filas[iCab].map(txt), cab = cabOrig.map(norm);
    const cNom = cab.findIndex(c => c.startsWith('nombre') && !c.includes('usuario'));
    const cApe = cab.findIndex(c => c.startsWith('apellido'));
    const cUsu = cab.findIndex(c => c.includes('nombre de usuario') || c.includes('numero de id'));
    if (cNom < 0) throw new Error('El archivo de Zajuna no trae la columna "Nombre(s)".');

    // Una columna por evidencia; se prefiere la versión "(Letra)"
    const columnas = {}; let fuera = 0;
    cabOrig.forEach((h, idx) => {
      const m = h.match(RE_EV);
      if (!m || /^total/i.test(h)) return;
      const codigo = m[0].toUpperCase();
      if (!CAT.guias[parseInt(m[1], 10)]) { fuera++; return; }
      const esLetra = /\(letra\)/i.test(h);
      if (!columnas[codigo] || (esLetra && !columnas[codigo].esLetra)) {
        const titulo = h.replace(/^[^:]{0,40}:/, '').replace(RE_EV, '').replace(/\((letra|real|porcentaje)\)/ig, '')
          .replace(/calificaci[oó]n/ig, '').replace(/[\s.\-]+$/, '').replace(/^[\s.\-]+/, '').trim();
        columnas[codigo] = { idx, esLetra, titulo };
      }
    });
    const codigos = Object.keys(columnas).sort(ordenEvidencia);
    if (!codigos.length) throw new Error('Zajuna no trae evidencias de las guías configuradas en el catálogo.');
    if (fuera) avisos.push(fuera + ' columnas de Zajuna son de guías que aún no están en el catálogo y se omitieron.');
    if (codigos.some(c => !columnas[c].esLetra)) avisos.push('Algunas columnas no vienen en "Letra"; exporte Zajuna con calificación en letra (A / D).');

    const normSofia = {};
    Object.keys(nombresSofia || {}).forEach(n => { normSofia[norm(n)] = n; });
    const matriz = [['Aprendiz'].concat(codigos.map(c => c + (columnas[c].titulo ? ' | ' + columnas[c].titulo : '')))];
    let sinCruce = 0;
    const excluidosZ = new Set();
    for (let i = iCab + 1; i < filas.length; i++) {
      const f = filas[i];
      if (!f || !txt(f[cNom])) continue;
      let nombre = tituloNombre(txt(f[cNom]) + ' ' + (cApe >= 0 ? txt(f[cApe]) : ''));
      const doc = cUsu >= 0 ? soloDigitos(f[cUsu]) : '';
      if (estaExcluido(excl, doc, nombre)) { excluidosZ.add(nombre); continue; }
      if (doc && porDocumento && porDocumento[doc]) nombre = porDocumento[doc];      // cruce exacto por documento (solo en memoria)
      else if (normSofia[norm(nombre)]) nombre = normSofia[norm(nombre)];
      else if (nombresSofia && Object.keys(nombresSofia).length) sinCruce++;
      matriz.push([nombre].concat(codigos.map(c => letra(f[columnas[c].idx]))));
    }
    if (sinCruce) avisos.push(sinCruce + ' aprendices de Zajuna no aparecen en el reporte de SOFIA (se muestran solo con datos de Zajuna).');
    return { matriz, avisos, excluidos: excluidosZ.size };
  }

  function letra(v) {
    const t = txt(v).toUpperCase();
    return t === 'A' ? 'A' : (t === 'D' ? 'D' : '-');
  }
  function partes(codigo) {
    const m = codigo.match(RE_EV);
    return m ? { guia: +m[1], competencia: m[2], aa: +m[3], ev: +m[4] } : null;
  }
  function ordenEvidencia(a, b) {
    const x = partes(a), y = partes(b);
    return x.guia - y.guia || ordenComp(x.guia, x.competencia) - ordenComp(y.guia, y.competencia) || x.aa - y.aa || x.ev - y.ev;
  }
  function ordenComp(guia, comp) {
    const i = (CAT.guias[guia] ? CAT.guias[guia].competencias : []).indexOf(comp);
    return i < 0 ? 99 : i;
  }

  /* ---------- Modelo de una ficha a partir de las dos matrices ya limpias ---------- */
  function armarFicha(zajuna, sofia) {
    const aprendices = {};
    const de = n => (aprendices[n] = aprendices[n] || { nombre: n, estado: '', enSofia: false, enZajuna: false, ev: {}, rap: {} });
    const titulos = {}, columnasZ = [];
    const hayS = !!(sofia && sofia.length > 1), hayZ = !!(zajuna && zajuna.length > 1);

    if (hayS) sofia.slice(1).forEach(r => {
      const a = de(txt(r[0])); a.enSofia = true; a.estado = txt(r[1]).toUpperCase();
      if (txt(r[2])) a.rap[txt(r[2]) + '-' + String(txt(r[3])).padStart(2, '0')] = txt(r[4]).toUpperCase();
    });
    if (hayZ) {
      zajuna[0].slice(1).forEach(h => {
        const [codigo, ...resto] = txt(h).split('|');
        const c = codigo.trim().toUpperCase();
        columnasZ.push(c); titulos[c] = resto.join('|').trim();
      });
      zajuna.slice(1).forEach(r => {
        const a = de(txt(r[0])); a.enZajuna = true;
        columnasZ.forEach((c, i) => { a.ev[c] = letra(r[i + 1]); });
      });
    }
    // Activos: los que SOFIA reporta "EN FORMACION"; si no hay SOFIA, todos los de Zajuna
    const lista = Object.values(aprendices)
      .filter(a => a.nombre && (a.enSofia ? a.estado === 'EN FORMACION' : true))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const retirados = Object.values(aprendices).filter(a => a.enSofia && a.estado !== 'EN FORMACION').length;
    return { aprendices: lista, retirados, columnasZ: new Set(columnasZ), titulos, hayZ, hayS };
  }

  /* ---------- Alcance (qué guías se miran) y cálculos ---------- */
  function guiasDe(filtro) {
    const todas = Object.keys(CAT.guias).map(Number).sort((a, b) => a - b);
    return (filtro === 'todas' || filtro === undefined) ? todas : todas.filter(g => g === Number(filtro));
  }
  // Evidencias de una guía (y opcionalmente una competencia). Con Zajuna cargado solo cuentan las que existen allí.
  function evidencias(ficha, guias, competencia) {
    const set = new Set(Object.keys(CAT.evidencias));
    if (ficha && ficha.hayZ) ficha.columnasZ.forEach(c => set.add(c));
    return Array.from(set).filter(c => {
      const p = partes(c);
      if (!p || !guias.includes(p.guia)) return false;
      if (competencia && p.competencia !== competencia) return false;
      return !(ficha && ficha.hayZ) || ficha.columnasZ.has(c);
    }).sort(ordenEvidencia);
  }
  function raps(guias, competencia) {
    const out = [];
    guias.forEach(g => (CAT.guias[g].raps || []).forEach(r => {
      if ((!competencia || r.startsWith(competencia + '-')) && !out.includes(r)) out.push(r);
    }));
    return out.sort();
  }
  function nombreEvidencia(ficha, codigo) {
    return CAT.evidencias[codigo] || (ficha && ficha.titulos[codigo]) || 'Evidencia';
  }
  const pct = (a, b) => b ? Math.round(100 * a / b) : null;

  function avanceAprendiz(ficha, a, guias, competencia) {
    const evs = evidencias(ficha, guias, competencia), rs = raps(guias, competencia);
    const evA = evs.filter(c => a.ev[c] === 'A').length, evD = evs.filter(c => a.ev[c] === 'D').length;
    const rapA = rs.filter(r => a.rap[r] === 'APROBADO').length;
    return {
      evA, evD, evP: evs.length - evA - evD, evT: evs.length, rapA, rapT: rs.length,
      zajuna: ficha.hayZ ? pct(evA, evs.length) : null,
      sofia: ficha.hayS ? pct(rapA, rs.length) : null
    };
  }
  function avanceGrupo(ficha, guias, competencia) {
    const t = { evA: 0, evD: 0, evT: 0, rapA: 0, rapT: 0, alDia: 0, criticos: 0, n: ficha.aprendices.length };
    ficha.aprendices.forEach(a => {
      const v = avanceAprendiz(ficha, a, guias, competencia);
      t.evA += v.evA; t.evD += v.evD; t.evT += v.evT; t.rapA += v.rapA; t.rapT += v.rapT;
      const z = v.zajuna === null || v.zajuna === 100, s = v.sofia === null || v.sofia === 100;
      if (z && s && (ficha.hayZ || ficha.hayS)) t.alDia++;
      if (ficha.hayZ && v.zajuna !== null && v.zajuna < 60) t.criticos++;
    });
    t.zajuna = ficha.hayZ ? pct(t.evA, t.evT) : null;
    t.sofia = ficha.hayS ? pct(t.rapA, t.rapT) : null;
    return t;
  }
  function conteoEvidencia(ficha, codigo) {
    const c = { A: 0, D: 0, P: 0 };
    ficha.aprendices.forEach(a => { const v = a.ev[codigo]; c[v === 'A' ? 'A' : v === 'D' ? 'D' : 'P']++; });
    return c;
  }

  return { CAT, norm, partes, parsearDesercion, vacio, quitarExcluidos, limpiarSofia, limpiarZajuna, armarFicha, guiasDe, evidencias, raps,
    nombreEvidencia, avanceAprendiz, avanceGrupo, conteoEvidencia, pct };
})();
if (typeof module !== 'undefined') module.exports = Datos;
