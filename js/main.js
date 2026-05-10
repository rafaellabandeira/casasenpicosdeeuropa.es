// ================= MAIN.JS - CHALETS BORES (casasenpicosdeeuropa.es) =================

function fechaLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ===== JSONBIN - BACKEND BORES =====
const BIN_ID = "69eefe35aaba882197405520";
const API_KEY = "$2a$10$OSt3X0LKRYNW/3u8GoYsguuf1knig5JSICRCwUusGqtyBvFsNvJ4W";
const BACKEND_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const ADMIN_PASSWORD = "8111";

async function cargarReservasBackend() {
  try {
    const res = await fetch(BACKEND_URL + "/latest", { headers: { "X-Master-Key": API_KEY } });
    if (!res.ok) throw new Error("Error cargando reservas");
    const data = (await res.json()).record;
    return {
      rebeco:            data.rebeco?.map(f => f.slice(0,10))   || [],
      urogallo:          data.urogallo?.map(f => f.slice(0,10)) || [],
      armino:            data.armino?.map(f => f.slice(0,10))   || [],
      bloqueos_rebeco:   data.bloqueados_rebeco   || [],
      bloqueos_urogallo: data.bloqueados_urogallo || [],
      bloqueos_armino:   data.bloqueados_armino   || []
    };
  } catch(err) {
    console.error(err);
    return { rebeco:[], urogallo:[], armino:[], bloqueos_rebeco:[], bloqueos_urogallo:[], bloqueos_armino:[] };
  }
}

async function guardarDatosBackend(datos) {
  try {
    await fetch(BACKEND_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Master-Key": API_KEY },
      body: JSON.stringify(datos)
    });
  } catch(err) { console.error(err); }
}

// ===== VARIABLES GLOBALES =====
let reservasGlobal = {};
let fechasOcupadasFlatpickr = [];
let bloqueosFlatpickr = [];
let flatpickrInstance;
let arrastreActivo = false;
let rangoSeleccionado = [];
let adminActivo = false;
let datosCompletos = {};
let rangoInicio = null;
let rangoFin = null;


// ================================
// HELPERS DE FECHAS
// ================================
function esBloqueada(fechaISO) {
  return fechasOcupadasFlatpickr.includes(fechaISO) || bloqueosFlatpickr.includes(fechaISO);
}
function sumarDias(fechaISO, dias) {
  const d = new Date(fechaISO + "T12:00:00");
  d.setDate(d.getDate() + dias);
  return fechaLocal(d);
}
function esPrimerDiaBloque(fechaISO) {
  return esBloqueada(fechaISO) && !esBloqueada(sumarDias(fechaISO, -1));
}
function esDiaIntermedio(fechaISO) {
  return esBloqueada(fechaISO) && esBloqueada(sumarDias(fechaISO, -1)) && esBloqueada(sumarDias(fechaISO, 1));
}

// ================================
// COLORES CALENDARIO
// ================================
function colorearDias(date) {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const fechaISO = fechaLocal(date);
  const fechaAyer = sumarDias(fechaISO, -1);
  const fechaManana = sumarDias(fechaISO, 1);

  if (date < hoy) return "dia-pasado";
  if (!esBloqueada(fechaISO) && esBloqueada(fechaAyer)) return "dia-salida";
  if (!esBloqueada(fechaISO) && esBloqueada(fechaManana)) return "dia-libre";
  if (!esBloqueada(fechaISO)) return "dia-libre";
  if (esPrimerDiaBloque(fechaISO)) return "dia-entrada-ocupada";
  return "dia-bloqueado";
}

// ================================
// VALIDAR RANGO
// ================================
function validarRango(inicio, fin) {
  const isoInicio = fechaLocal(inicio);
  const isoFin = fechaLocal(fin);
  if (esBloqueada(isoInicio) && esPrimerDiaBloque(isoInicio)) {
    alert("No puedes iniciar la reserva en ese día.");
    return false;
  }
  let check = new Date(inicio); check.setDate(check.getDate() + 1);
  while (check < fin) {
    if (esBloqueada(fechaLocal(check))) {
      alert("No puedes seleccionar un rango que incluye fechas ya reservadas.");
      return false;
    }
    check.setDate(check.getDate() + 1);
  }
  if (esBloqueada(isoFin) && !esPrimerDiaBloque(isoFin)) {
    alert("No puedes terminar la reserva en ese día.");
    return false;
  }
  return true;
}

// ================================
// PINTAR RANGO VISUAL
// ================================
function limpiarSeleccionVisual() {
  document.querySelectorAll(".flatpickr-day").forEach(d => {
    d.classList.remove("startRange", "inRange", "endRange", "selected");
  });
}

function pintarRangoVisual() {
  if (!rangoInicio) return;
  limpiarSeleccionVisual();
  document.querySelectorAll(".flatpickr-day").forEach(d => {
    if (!d.dateObj) return;
    const f = new Date(d.dateObj); f.setHours(0,0,0,0);
    const i = new Date(rangoInicio); i.setHours(0,0,0,0);
    if (f.getTime() === i.getTime()) {
      d.classList.add("startRange", "selected");
    }
    if (rangoFin) {
      const e = new Date(rangoFin); e.setHours(0,0,0,0);
      if (f.getTime() === e.getTime()) d.classList.add("endRange", "selected");
      else if (f > i && f < e) d.classList.add("inRange");
    }
  });
}

// ================================
// FLATPICKR - modo range nativo
// pero con navegación entre meses protegida
// ================================
document.addEventListener("mouseup", async () => {
  if (!arrastreActivo) return;
  arrastreActivo = false;
  if (rangoSeleccionado.length === 0) return;
  for (const fecha of rangoSeleccionado) {
    if (!bloqueosFlatpickr.includes(fecha)) bloqueosFlatpickr.push(fecha);
  }
  await guardarBloqueoEnBackend();
  inicializarFlatpickr();
  rangoSeleccionado = [];
});

function inicializarFlatpickr() {
  if (flatpickrInstance) flatpickrInstance.destroy();
  rangoInicio = null;
  rangoFin = null;

  // Listener delegado en el contenedor — funciona en cualquier mes sin reasignar
  const contenedor = document.getElementById("calendarioVisible");
  if (contenedor._clickHandler) contenedor.removeEventListener("click", contenedor._clickHandler);

  contenedor._clickHandler = async function(e) {
    const dayElem = e.target.closest(".flatpickr-day");
    if (!dayElem || !dayElem.dateObj) return;

    const fecha = new Date(dayElem.dateObj);
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const clase = [...dayElem.classList].find(c => c.startsWith("dia-")) || "";

    if (adminActivo) {
      if (fecha < hoy) return;
      const fechaISO = fechaLocal(fecha);
      const chalet = document.getElementById("cabaña").value;
      if (bloqueosFlatpickr.includes(fechaISO)) {
        bloqueosFlatpickr = bloqueosFlatpickr.filter(f => f !== fechaISO);
      } else if (!fechasOcupadasFlatpickr.includes(fechaISO)) {
        bloqueosFlatpickr.push(fechaISO);
      }
      datosCompletos[`bloqueados_${chalet}`] = bloqueosFlatpickr;
      await guardarBloqueoEnBackend();
      inicializarFlatpickr();
      return;
    }

    if (fecha < hoy) return;
    if (clase === "dia-bloqueado") return;

    if (!rangoInicio) {
      rangoInicio = new Date(fecha);
      rangoFin = null;
      pintarRangoVisual();
      dayElem.classList.add("startRange", "selected");
    } else if (!rangoFin) {
      if (fecha <= rangoInicio) {
        rangoInicio = new Date(fecha);
        limpiarSeleccionVisual();
        dayElem.classList.add("startRange", "selected");
        return;
      }
      if (!validarRango(rangoInicio, fecha)) {
        rangoInicio = null; rangoFin = null;
        limpiarSeleccionVisual();
        return;
      }
      rangoFin = new Date(fecha);
      pintarRangoVisual();
      const opc = { year: "numeric", month: "long", day: "numeric" };
      document.getElementById("fechasSeleccionadas").textContent =
        `${rangoInicio.toLocaleDateString("es-ES", opc)} → ${rangoFin.toLocaleDateString("es-ES", opc)}`;
    } else {
      rangoInicio = null; rangoFin = null;
      limpiarSeleccionVisual();
      document.getElementById("fechasSeleccionadas").textContent = "";
    }
  };
  contenedor.addEventListener("click", contenedor._clickHandler);

  flatpickrInstance = flatpickr("#calendarioVisible", {
    inline: true,
    mode: "range",
    locale: "es",
    dateFormat: "d-m-Y",

    onReady: function() {
      // MutationObserver: detecta cuando Flatpickr redibuja los días al cambiar de mes
      const cal = document.querySelector(".flatpickr-calendar");
      if (!cal) return;
      const observer = new MutationObserver(() => {
        pintarRangoVisual();
        asignarListenersDias();
      });
      observer.observe(cal, { childList: true, subtree: true });
    },

    onDayCreate: function(dObj, dStr, fp, dayElem) {
      const fecha = new Date(dayElem.dateObj);
      const clase = colorearDias(fecha);
      dayElem.classList.add(clase);
      // Incluir días de meses adyacentes (nextMonthDay/prevMonthDay)
      asignarListenerDia(dayElem, fecha, clase);
    },

    onChange: function() {
      // Ignorar el onChange nativo — gestionamos el rango manualmente
      flatpickrInstance.clear();
    }
  });
}

function asignarListenersDias_UNUSED() {
  // Incluir también nextMonthDay y prevMonthDay para selección entre meses
  document.querySelectorAll(".flatpickr-day, .flatpickr-day.nextMonthDay, .flatpickr-day.prevMonthDay").forEach(dayElem => {
    if (!dayElem.dateObj) return;
    const fecha = new Date(dayElem.dateObj);
    // Resetear clases de color pero preservar next/prevMonthDay
    const esNextMonth = dayElem.classList.contains("nextMonthDay");
    const esPrevMonth = dayElem.classList.contains("prevMonthDay");
    dayElem.className = "flatpickr-day";
    if (esNextMonth) dayElem.classList.add("nextMonthDay");
    if (esPrevMonth) dayElem.classList.add("prevMonthDay");
    const clase = colorearDias(fecha);
    dayElem.classList.add(clase);
    asignarListenerDia(dayElem, fecha, clase);
  });
  pintarRangoVisual();
}

function asignarListenerDia_UNUSED(dayElem, fecha, clase) {
  const hoy = new Date(); hoy.setHours(0,0,0,0);

  // Eliminar pointer-events none que Flatpickr pone en nextMonthDay
  dayElem.style.pointerEvents = "auto";
  dayElem.style.cursor = "pointer";

  // Click: modo usuario → selección de rango / modo admin → bloquear/desbloquear
  dayElem.addEventListener("click", async (e) => {
    e.stopPropagation();

    if (adminActivo) {
      // MODO ADMIN: un click bloquea o desbloquea
      if (fecha < hoy) return;
      const fechaISO = fechaLocal(fecha);
      const chalet = document.getElementById("cabaña").value;
      if (bloqueosFlatpickr.includes(fechaISO)) {
        bloqueosFlatpickr = bloqueosFlatpickr.filter(f => f !== fechaISO);
      } else if (!fechasOcupadasFlatpickr.includes(fechaISO)) {
        bloqueosFlatpickr.push(fechaISO);
      }
      datosCompletos[`bloqueados_${chalet}`] = bloqueosFlatpickr;
      await guardarBloqueoEnBackend();
      inicializarFlatpickr();
      return;
    }
        // MODO USUARIO: selección de rango en 3 clicks
    if (fecha < hoy) return;
    if (clase === "dia-bloqueado") return;

    if (!rangoInicio) {
      // Click 1: check-in
      rangoInicio = new Date(fecha);
      rangoFin = null;
      limpiarSeleccionVisual();
      dayElem.classList.add("startRange", "selected");
    } else if (!rangoFin) {
      // Click 2: check-out
      if (fecha <= rangoInicio) {
        rangoInicio = new Date(fecha);
        limpiarSeleccionVisual();
        dayElem.classList.add("startRange", "selected");
        return;
      }
      if (!validarRango(rangoInicio, fecha)) {
        rangoInicio = null;
        rangoFin = null;
        limpiarSeleccionVisual();
        return;
      }
      rangoFin = new Date(fecha);
      pintarRangoVisual();
      const opc = { year: "numeric", month: "long", day: "numeric" };
      document.getElementById("fechasSeleccionadas").textContent =
        `${rangoInicio.toLocaleDateString("es-ES", opc)} → ${rangoFin.toLocaleDateString("es-ES", opc)}`;
    } else {
      // Click 3: limpiar todo
      rangoInicio = null;
      rangoFin = null;
      limpiarSeleccionVisual();
      document.getElementById("fechasSeleccionadas").textContent = "";
    }
  });

  // Mousedown/enter: arrastre admin
  dayElem.addEventListener("mousedown", () => {
    if (!adminActivo) return;
    arrastreActivo = true;
    rangoSeleccionado = [];
  });

  dayElem.addEventListener("mouseenter", () => {
    if (!arrastreActivo || !adminActivo) return;
    const fechaISO = fechaLocal(fecha);
    if (fecha >= hoy && !bloqueosFlatpickr.includes(fechaISO)) {
      rangoSeleccionado.push(fechaISO);
      dayElem.style.background = "rgba(0,123,255,0.4)";
    }
  });
}

async function prepararFlatpickr() {
  const reservas = await cargarReservasBackend();
  reservasGlobal = reservas;
  datosCompletos = {
    rebeco:              reservas.rebeco,
    urogallo:            reservas.urogallo,
    armino:              reservas.armino,
    bloqueados_rebeco:   reservas.bloqueos_rebeco,
    bloqueados_urogallo: reservas.bloqueos_urogallo,
    bloqueados_armino:   reservas.bloqueos_armino
  };
  const chalet = document.getElementById("cabaña").value;
  fechasOcupadasFlatpickr = reservas[chalet] || [];
  bloqueosFlatpickr = reservas[`bloqueos_${chalet}`] || [];
  inicializarFlatpickr();
}

async function guardarBloqueoEnBackend() {
  const chalet = document.getElementById("cabaña").value;
  datosCompletos[`bloqueados_${chalet}`] = bloqueosFlatpickr;
  await guardarDatosBackend(datosCompletos);
}

// ================================
// CÁLCULO DE RESERVA
// ================================
function calcularReserva() {
  const chalet = document.getElementById("cabaña").value;
  if (!rangoInicio || !rangoFin) {
    alert("Selecciona un rango de fechas"); return;
  }
  const inicio = rangoInicio;
  const fin = rangoFin;
  const noches = Math.round((fin - inicio) / (1000*60*60*24));
  const nombre   = document.getElementById("nombre").value.trim();
  const telefono = document.getElementById("telefono").value.trim();
  const email    = document.getElementById("email").value.trim();

  if (!nombre || !telefono || !email) {
    if (!/\S+@\S+\.\S+/.test(email)) alert("Introduce un email válido.");
    else alert("Completa todos los datos personales");
    return;
  }

  const spinner   = document.getElementById("spinner");
  const resultado = document.getElementById("resultado");
  spinner.style.display   = "block";
  resultado.style.display = "none";

  setTimeout(() => {
    const opc = { day: "numeric", month: "short" };
    document.getElementById("fechasSeleccionadas").innerHTML =
      `📅 ${inicio.toLocaleDateString("es-ES", opc)} - ${fin.toLocaleDateString("es-ES", opc)}<br>🛏 ${noches} ${noches===1?"noche":"noches"}`;

    const minNoches = esTemporadaAlta(inicio) ? 4 : 2;
    if (noches < minNoches) {
      alert(`Mínimo ${minNoches} noches en estas fechas`);
      spinner.style.display = "none"; return;
    }

    let total = 0;
    for (let i = 0; i < noches; i++) {
      const dia = new Date(inicio); dia.setDate(dia.getDate() + i);
      total += esTemporadaAlta(dia) ? 130 : 85;
    }

    let descuento = 0;
    if      (noches>=6 &&  esTemporadaAlta(inicio)) descuento = total * 0.10;
    else if (noches>=3 && !esTemporadaAlta(inicio)) descuento = total * 0.10;
    total -= descuento;

    const nombres = { rebeco:"Chalet El Rebeco", urogallo:"Chalet El Urogallo", armino:"Chalet El Armiño" };
    document.getElementById("cabañaSeleccionada").innerText = nombres[chalet] || chalet;
    document.getElementById("total").innerText     = total.toFixed(2);
    document.getElementById("descuento").innerText = descuento.toFixed(2);
    document.getElementById("resto").innerText     = (total - 50).toFixed(2);
    spinner.style.display   = "none";
    resultado.style.display = "block";
  }, 300);
}

function esTemporadaAlta(fecha) {
  const mes = fecha.getMonth()+1, dia = fecha.getDate(), dow = fecha.getDay();
  return (mes===7||mes===8||(mes===12&&dia>=22)||(mes===1&&dia<=7)||dow===5||dow===6);
}

function reservar() { alert("Aquí se conectará el pago de 50 €."); }

// ================================
// URGENCIA
// ================================
function actualizarUrgencia(fechasOcupadas) {
  const mensaje = document.getElementById("mensajeUrgencia");
  if (!mensaje) return;
  const mes = new Date().getMonth()+1;
  const ocupadas = (fechasOcupadas.rebeco?.length||0)+(fechasOcupadas.urogallo?.length||0)+(fechasOcupadas.armino?.length||0);
  let texto = "";
  if (mes===7||mes===8)  texto = "🔥 Verano es temporada alta. Te recomendamos reservar pronto.";
  else if (ocupadas>20)  texto = "⚡ Quedan pocas fechas disponibles este mes.";
  else if (ocupadas>10)  texto = "📅 Este alojamiento suele reservarse rápido.";
  else                   texto = "✨ Reserva ahora para asegurar tus fechas.";
  mensaje.innerText = texto;
}

// ================================
// CARRUSEL + MENÚ
// ================================
function initCarousel(containerSelector, slideSelector, prevSelector, nextSelector, indicatorSelector) {
  document.querySelectorAll(containerSelector).forEach(container => {
    const slides=container.querySelectorAll(slideSelector), prevBtn=container.querySelector(prevSelector),
          nextBtn=container.querySelector(nextSelector), indicators=container.querySelectorAll(indicatorSelector);
    let currentIndex=0;
    if (!slides.length) return;
    function showSlide(index) {
      slides.forEach((s,i)=>{s.style.display=i===index?"block":"none";});
      indicators.forEach((ind,i)=>{ind.classList.toggle("active",i===index);});
    }
    nextBtn?.addEventListener("click",()=>{currentIndex=(currentIndex+1)%slides.length;showSlide(currentIndex);});
    prevBtn?.addEventListener("click",()=>{currentIndex=(currentIndex-1+slides.length)%slides.length;showSlide(currentIndex);});
    indicators.forEach((ind,i)=>{ind.addEventListener("click",()=>{currentIndex=i;showSlide(currentIndex);});});
    showSlide(currentIndex);
  });
}

function initHamburger() {
  const hamburger=document.getElementById("hamburger"), navMenu=document.getElementById("navMenu");
  hamburger?.addEventListener("click",()=>{navMenu?.classList.toggle("active");hamburger.classList.toggle("active");});
}

// ================================
// INICIALIZACIÓN
// ================================
document.addEventListener("DOMContentLoaded", async () => {
  initHamburger();
  initCarousel(".carousel-container",".carousel-slide",".prev",".next",".indicator");
  initCarousel(".carousel-container-general",".carousel-slide-general",".prev-general",".next-general",".indicator-general");

  await prepararFlatpickr();
  actualizarUrgencia(reservasGlobal);

  document.getElementById("btnCalcular")?.addEventListener("click", calcularReserva);
  document.getElementById("btnPagar")?.addEventListener("click", reservar);
  document.getElementById("cabaña")?.addEventListener("change", prepararFlatpickr);

  document.getElementById("adminButton")?.addEventListener("click", () => {
    if (adminActivo) {
      adminActivo=false;
      document.getElementById("adminButton").style.backgroundColor="#444";
      alert("Modo administrador desactivado"); return;
    }
    const clave=prompt("Introduce la contraseña de administrador:");
    if (clave===ADMIN_PASSWORD) {
      adminActivo=true;
      document.getElementById("adminButton").style.backgroundColor="#2e5a6b";
      alert("Modo administrador activado");
    } else { alert("Contraseña incorrecta"); }
  });

  setInterval(async()=>{
    const reservas=await cargarReservasBackend();
    actualizarUrgencia(reservas);
  }, 2*60*60*1000);
});
