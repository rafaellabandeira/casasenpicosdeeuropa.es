// ================= MAIN.JS - CHALETS BORES (casasenpicosdeeuropa.es) =================

function fechaLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatearLocal(fecha) { return fechaLocal(fecha); }

// ===== JSONBIN - BACKEND BORES =====
const BIN_ID = "69eefe35aaba882197405520";
const API_KEY = "$2a$10$OSt3X0LKRYNW/3u8GoYsguuf1knig5JSICRCwUusGqtyBvFsNvJ4W";
const BACKEND_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const ADMIN_PASSWORD = "8111";

async function cargarReservasBackend() {
  try {
    const res = await fetch(BACKEND_URL + "/latest", {
      headers: { "X-Master-Key": API_KEY }
    });
    if (!res.ok) throw new Error("No se pudo cargar las reservas");
    const json = await res.json();
    const data = json.record;
    return {
      rebeco:            data.rebeco?.map(f => f.slice(0, 10))            || [],
      urogallo:          data.urogallo?.map(f => f.slice(0, 10))          || [],
      armino:            data.armino?.map(f => f.slice(0, 10))            || [],
      bloqueos_rebeco:   data.bloqueados_rebeco                            || [],
      bloqueos_urogallo: data.bloqueados_urogallo                          || [],
      bloqueos_armino:   data.bloqueados_armino                            || []
    };
  } catch (err) {
    console.error(err);
    return { rebeco: [], urogallo: [], armino: [], bloqueos_rebeco: [], bloqueos_urogallo: [], bloqueos_armino: [] };
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

function esUltimoDiaBloque(fechaISO) {
  return esBloqueada(fechaISO) && !esBloqueada(sumarDias(fechaISO, 1));
}

function esDiaIntermedio(fechaISO) {
  return esBloqueada(fechaISO) && esBloqueada(sumarDias(fechaISO, -1)) && esBloqueada(sumarDias(fechaISO, 1));
}

// ================================
// CALENDARIO FLATPICKR
// ================================

function colorearDias(date) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
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

document.addEventListener("mouseup", async () => {
  if (!arrastreActivo) return;
  arrastreActivo = false;
  if (rangoSeleccionado.length === 0) return;

  for (const fecha of rangoSeleccionado) {
    if (!bloqueosFlatpickr.includes(fecha)) {
      bloqueosFlatpickr.push(fecha);
      flatpickrInstance.days.childNodes.forEach(d => {
        if (d.dateObj && fechaLocal(d.dateObj) === fecha) {
          d.classList.remove("dia-libre");
          d.classList.add("dia-bloqueado", "flatpickr-disabled");
        }
      });
    }
  }

  await guardarBloqueoEnBackend();
  flatpickrInstance.set("disable", [
    date => { const iso = fechaLocal(date); return esBloqueada(iso) && !esPrimerDiaBloque(iso); }
  ]);
  flatpickrInstance.redraw();
  rangoSeleccionado = [];
});

function inicializarFlatpickr() {
  if (flatpickrInstance) flatpickrInstance.destroy();

  flatpickrInstance = flatpickr("#calendarioVisible", {
    inline: true,
    mode: "range",
    locale: "es",
    dateFormat: "d-m-Y",

    disable: [],

    onDayCreate: function(dObj, dStr, fp, dayElem) {
      const fecha = new Date(dayElem.dateObj);
      const clase = colorearDias(fecha);
      dayElem.classList.add(clase);

      if (clase === "dia-bloqueado") {
        dayElem.classList.add("flatpickr-disabled");
      }

      dayElem.addEventListener("dblclick", async () => {
        if (!adminActivo) return;
        const fechaISO = fechaLocal(dayElem.dateObj);
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        if (dayElem.dateObj < hoy) return;

        const chalet = document.getElementById("cabaña").value;
        const clave = `bloqueados_${chalet}`;

        if (bloqueosFlatpickr.includes(fechaISO)) {
          bloqueosFlatpickr = bloqueosFlatpickr.filter(f => f !== fechaISO);
        } else if (!fechasOcupadasFlatpickr.includes(fechaISO)) {
          bloqueosFlatpickr.push(fechaISO);
        }

        datosCompletos[clave] = bloqueosFlatpickr;
        await guardarBloqueoEnBackend();
        // Reinicializar el calendario para que todos los días vecinos se repinten correctamente
        inicializarFlatpickr();
      });

      dayElem.addEventListener("mousedown", () => {
        if (!adminActivo) return;
        arrastreActivo = true;
        rangoSeleccionado = [];
      });

      dayElem.addEventListener("mouseenter", () => {
        if (!arrastreActivo || !adminActivo) return;
        const fechaISO = fechaLocal(dayElem.dateObj);
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        if (dayElem.dateObj >= hoy && !bloqueosFlatpickr.includes(fechaISO)) {
          rangoSeleccionado.push(fechaISO);
          dayElem.style.background = "rgba(0,123,255,0.4)";
        }
      });
    },

    onMonthChange: function(selectedDates, dateStr, instance) {
      // Si hay una fecha de inicio seleccionada, la preservamos al cambiar de mes
      if (selectedDates.length === 1) {
        instance.setDate(selectedDates[0], false);
      }
    },

    onChange: function(selectedDates) {
      if (selectedDates.length === 2) {
        const inicio = selectedDates[0];
        const fin = selectedDates[1];
        const isoInicio = fechaLocal(inicio);
        const isoFin = fechaLocal(fin);

        if (esBloqueada(isoInicio) && esPrimerDiaBloque(isoInicio)) {
          flatpickrInstance.clear();
          document.getElementById("fechasSeleccionadas").textContent = "";
          alert("No puedes iniciar la reserva en ese día. Elige otro día de entrada.");
          return;
        }

        let check = new Date(inicio);
        check.setDate(check.getDate() + 1);
        while (check < fin) {
          const iso = fechaLocal(check);
          if (esBloqueada(iso)) {
            flatpickrInstance.clear();
            document.getElementById("fechasSeleccionadas").textContent = "";
            alert("No puedes seleccionar un rango que incluye fechas ya reservadas.");
            return;
          }
          check.setDate(check.getDate() + 1);
        }

        if (esBloqueada(isoFin) && !esPrimerDiaBloque(isoFin)) {
          flatpickrInstance.clear();
          document.getElementById("fechasSeleccionadas").textContent = "";
          alert("No puedes terminar la reserva en ese día. Elige otro día de salida.");
          return;
        }

        const opciones = { year: "numeric", month: "long", day: "numeric" };
        document.getElementById("fechasSeleccionadas").textContent =
          `${inicio.toLocaleDateString("es-ES", opciones)} → ${fin.toLocaleDateString("es-ES", opciones)}`;
      }
    }
  });
}

async function prepararFlatpickr() {
  const reservas = await cargarReservasBackend();
  reservasGlobal = reservas;
  datosCompletos = {
    rebeco:             reservas.rebeco,
    urogallo:           reservas.urogallo,
    armino:             reservas.armino,
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
  if (!flatpickrInstance.selectedDates || flatpickrInstance.selectedDates.length < 2) {
    alert("Selecciona un rango de fechas"); return;
  }

  const inicio = flatpickrInstance.selectedDates[0];
  const fin    = flatpickrInstance.selectedDates[1];
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
    const opciones = { day: "numeric", month: "short" };
    document.getElementById("fechasSeleccionadas").innerHTML =
      `📅 ${inicio.toLocaleDateString("es-ES", opciones)} - ${fin.toLocaleDateString("es-ES", opciones)}<br>🛏 ${noches} ${noches === 1 ? "noche" : "noches"}`;

    const minNoches = esTemporadaAlta(inicio) ? 4 : 2;
    if (noches < minNoches) {
      alert(`Mínimo ${minNoches} noches en estas fechas`);
      spinner.style.display = "none";
      return;
    }

    let total = 0;
    for (let i = 0; i < noches; i++) {
      const dia = new Date(inicio);
      dia.setDate(dia.getDate() + i);
      total += esTemporadaAlta(dia) ? 130 : 85;
    }

    let descuento = 0;
    if      (noches >= 6 &&  esTemporadaAlta(inicio)) descuento = total * 0.10;
    else if (noches >= 3 && !esTemporadaAlta(inicio)) descuento = total * 0.10;
    total -= descuento;

    const nombres = { rebeco: "Chalet El Rebeco", urogallo: "Chalet El Urogallo", armino: "Chalet El Armiño" };
    document.getElementById("cabañaSeleccionada").innerText = nombres[chalet] || chalet;
    document.getElementById("total").innerText     = total.toFixed(2);
    document.getElementById("descuento").innerText = descuento.toFixed(2);
    document.getElementById("resto").innerText     = (total - 50).toFixed(2);

    spinner.style.display   = "none";
    resultado.style.display = "block";
  }, 300);
}

function esTemporadaAlta(fecha) {
  const mes = fecha.getMonth() + 1;
  const dia = fecha.getDate();
  const dow = fecha.getDay();
  return (
    mes === 7 || mes === 8 ||
    (mes === 12 && dia >= 22) ||
    (mes === 1  && dia <= 7) ||
    dow === 5 || dow === 6
  );
}

function reservar() { alert("Aquí se conectará el pago de 50 €."); }

// ================================
// URGENCIA
// ================================
function actualizarUrgencia(fechasOcupadas) {
  const mensaje = document.getElementById("mensajeUrgencia");
  if (!mensaje) return;
  const mes = new Date().getMonth() + 1;
  const ocupadas = (fechasOcupadas.rebeco?.length || 0) + (fechasOcupadas.urogallo?.length || 0) + (fechasOcupadas.armino?.length || 0);
  let texto = "";
  if (mes === 7 || mes === 8)  texto = "🔥 Verano es temporada alta. Te recomendamos reservar pronto.";
  else if (ocupadas > 20)      texto = "⚡ Quedan pocas fechas disponibles este mes.";
  else if (ocupadas > 10)      texto = "📅 Este alojamiento suele reservarse rápido.";
  else                         texto = "✨ Reserva ahora para asegurar tus fechas.";
  mensaje.innerText = texto;
}

// ================================
// CARRUSEL + MENÚ
// ================================
function initCarousel(containerSelector, slideSelector, prevSelector, nextSelector, indicatorSelector) {
  document.querySelectorAll(containerSelector).forEach(container => {
    const slides     = container.querySelectorAll(slideSelector);
    const prevBtn    = container.querySelector(prevSelector);
    const nextBtn    = container.querySelector(nextSelector);
    const indicators = container.querySelectorAll(indicatorSelector);
    let currentIndex = 0;
    if (!slides.length) return;

    function showSlide(index) {
      slides.forEach((s,i)       => { s.style.display = i === index ? "block" : "none"; });
      indicators.forEach((ind,i) => { ind.classList.toggle("active", i === index); });
    }

    nextBtn?.addEventListener("click", () => { currentIndex = (currentIndex + 1) % slides.length; showSlide(currentIndex); });
    prevBtn?.addEventListener("click", () => { currentIndex = (currentIndex - 1 + slides.length) % slides.length; showSlide(currentIndex); });
    indicators.forEach((ind,i) => { ind.addEventListener("click", () => { currentIndex = i; showSlide(currentIndex); }); });
    showSlide(currentIndex);
  });
}

function initHamburger() {
  const hamburger = document.getElementById("hamburger");
  const navMenu   = document.getElementById("navMenu");
  hamburger?.addEventListener("click", () => {
    navMenu?.classList.toggle("active");
    hamburger.classList.toggle("active");
  });
}

// ================================
// INICIALIZACIÓN
// ================================
document.addEventListener("DOMContentLoaded", async () => {
  initHamburger();
  initCarousel(".carousel-container",         ".carousel-slide",         ".prev",         ".next",         ".indicator");
  initCarousel(".carousel-container-general", ".carousel-slide-general", ".prev-general", ".next-general", ".indicator-general");

  await prepararFlatpickr();
  actualizarUrgencia(reservasGlobal);

  document.getElementById("btnCalcular")?.addEventListener("click", calcularReserva);
  document.getElementById("btnPagar")?.addEventListener("click", reservar);
  document.getElementById("cabaña")?.addEventListener("change", prepararFlatpickr);

  document.getElementById("adminButton")?.addEventListener("click", () => {
    if (adminActivo) {
      adminActivo = false;
      document.getElementById("adminButton").style.backgroundColor = "#444";
      alert("Modo administrador desactivado");
      return;
    }
    const clave = prompt("Introduce la contraseña de administrador:");
    if (clave === ADMIN_PASSWORD) {
      adminActivo = true;
      document.getElementById("adminButton").style.backgroundColor = "#2e5a6b";
      alert("Modo administrador activado");
    } else {
      alert("Contraseña incorrecta");
    }
  });

  setInterval(async () => {
    const reservas = await cargarReservasBackend();
    actualizarUrgencia(reservas);
  }, 2*60*60*1000);
});
