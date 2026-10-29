# Ascensores y escaleras mecánicas: estaciones SNCF y París

El **estado de los ascensores, escaleras mecánicas y pasillos rodantes** de las estaciones SNCF
(Francia), en servicio o averiados, leído del portal de datos abiertos de SNCF. Unos 2.500 equipos
en unas 600 estaciones gestionadas por SNCF Gares & Connexions. **Sin cuenta ni clave.**

Integración no oficial, sin relación con SNCF. Desarrollada sin el hardware (y sin un flujo
dedicado): los datos se comprobaron en directo el 29/10/2026, sus comentarios son bienvenidos.

También: los **ascensores y escaleras mecánicas de la vía pública de París** (parques, viaductos,
Petite Ceinture…), telesupervisados en tiempo real, por distrito. Sin relación con el Ayuntamiento
de París.

## Lo que obtiene

- Un **dispositivo por estación** que añada: un sensor por ascensor, escalera mecánica o pasillo
  rodante (1 = en servicio, 0 = fuera de servicio), más tres sensores de resumen: equipos fuera de
  servicio, equipos en estado desconocido y «Todo en servicio».
- Un **widget** «Ascensores y escaleras»: los equipos de una estación, averiados primero, en
  rojo, gris o verde.
- Dos **disparadores de escena**: un ascensor o una escalera mecánica se avería, un equipo vuelve a
  funcionar, para cualquier estación o las elegidas, y para un tipo de equipo si lo desea.
- Una **acción de escena**: un resumen en una frase («Toulouse Matabiau: 1 de 25 ascensores y
  escaleras mecánicas fuera de servicio (…)»), listo para un mensaje o un altavoz, con los
  contadores.

## Requisitos

- Gladys Assistant **5.3.0** o posterior.
- Acceso a Internet desde Gladys: los datos vienen de `ressources.data.sncf.com` y, para París, de `opendata.paris.fr`.
- Sin cuenta ni clave de API.

## Instalación

1. En Gladys, abra **Integraciones → Instalar desde GitHub**.
2. Pegue la dirección del repositorio: `https://github.com/guim31/gladys-ascenseurs-gares`.
3. Confirme y abra la integración una vez instalada.

## Configuración

### Ajustes

| Ajuste                       | Efecto                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Estaciones                   | Los nombres de sus estaciones, separados por `;` (10 como máximo), p. ej. `Toulouse Matabiau; Paris Saint-Lazare`. |
| Distritos de París           | Los distritos (arrondissements) cuyos ascensores y escaleras de la vía pública desea (casillas).                   |
| Actualización                | Cada 10, 15 (por defecto) o 30 minutos. SNCF recalcula los estados cada hora.                                      |
| Idioma de nombres y mensajes | Idioma de los sensores de resumen, del widget y de la frase de escena. Francés por defecto.                        |

Un nombre se compara sin acentos, mayúsculas ni guiones (`paris st lazare` funciona). Un nombre
parcial, una ciudad por ejemplo, lista sus estaciones equipadas (`Marseille` da Marseille
Saint-Charles y Marseille Blancarde), diez como máximo. Un código UIC de 8 cifras también funciona.

### Añadir estaciones

1. Escriba sus estaciones y guarde.
2. Abra la pestaña **Descubrir** de la integración: cada estación encontrada aparece allí, con
   todos sus equipos.
3. Añada a Gladys las que le interesen.

Una estación añadida sigue en seguimiento aunque después quite su nombre de los ajustes.

### Añadir distritos de París

1. Marque uno o varios distritos en **Distritos de París** y guarde.
2. La pestaña **Descubrir** propone un dispositivo «Paris 13e · ascensores y escaleras mecánicas»
   por distrito con equipos telesupervisados (hoy el 12, 13, 15 y 17).
3. Añada los que le interesen. El botón **Estado** indica cuántos equipos tiene cada distrito
   marcado.

Las estaciones y los distritos se pueden combinar.

### Comprobar

El botón **Estado** de la configuración muestra, para cada nombre introducido, las estaciones
encontradas (o por qué no se encontró ninguna), la hora de la última lectura y el último error.

## Dispositivos

Una estación es un dispositivo llamado «<estación> · ascensores y escaleras mecánicas», de solo
lectura:

| Función                      | Tipo     | Valor                                         |
| ---------------------------- | -------- | --------------------------------------------- |
| Fuera de servicio            | contador | número de equipos fuera de servicio           |
| Estado desconocido           | contador | número de equipos cuyo estado SNCF no conoce  |
| Todo en servicio             | binario  | 1 cuando todos los equipos funcionan, si no 0 |
| Una por equipo (nombre SNCF) | binario  | 1 = en servicio, 0 = fuera de servicio        |

Las funciones de los equipos conservan el nombre SNCF («Ascenseur - 11 Sortie Londres»), en
francés: es el que se muestra en la estación. Cuando SNCF no conoce el estado de un equipo, su
sensor conserva el último valor conocido y el contador «Estado desconocido» lo indica. Si SNCF añade
un equipo a la estación, la pestaña Descubrir propone **actualizar** el dispositivo.

Un distrito de París es un dispositivo «Paris 13e · ascensores y escaleras mecánicas», con las
mismas funciones. Cada equipo lleva el nombre de su dirección: «Ascenseur - 147 rue Cardinet (A)».
Los equipos del Ayuntamiento sin telesupervisión nunca tienen estado: no se proponen.

## Widget del panel

«Ascensores y escaleras» muestra los equipos de una estación (la primera seguida si no se elige
ninguna): averiados primero (rojo), desconocidos (gris) y luego en servicio (verde). Diez filas como
máximo, las demás se cuentan debajo. El ajuste «Ocultar los equipos en servicio» solo deja los
problemas. Cuando el portal SNCF no responde desde hace tres horas, el widget lo indica.

## Disparadores de escena

| Disparador                                        | Cuándo                                      |
| ------------------------------------------------- | ------------------------------------------- |
| Ascensor o escalera mecánica averiados            | un equipo de una estación seguida se avería |
| Ascensor o escalera mecánica de nuevo en servicio | un equipo averiado vuelve a funcionar       |

Filtros: las estaciones (vacío = todas) y el tipo de equipo: ascensor, escalera mecánica o pasillo
rodante (vacío = todos). Variables: estación, equipo, ubicación, número fuera de servicio en la
estación, número de equipos. Para vigilar **un** equipo, use su función en un disparador «estado de
un dispositivo» de Gladys.

Un estado desconocido se ignora: los disparadores comparan con el último estado conocido. Fuera de
servicio → desconocido → fuera de servicio no dispara nada; fuera de servicio → desconocido → en
servicio dispara «de nuevo en servicio».

## Acción de escena

«Resumir ascensores y escaleras mecánicas», para todas las estaciones seguidas o las elegidas.
Salidas: `sentence` (frase), `out_of_order` (fuera de servicio), `unknown` (desconocido), `total`
(equipos), `all_ok` (1 = sí, 0 = no, para un paso «Continuar solo si»).

## Ejemplos de escenas

- Cada mañana antes de salir: ejecute el resumen de su estación y envíe la frase por Telegram.
- Cuando un ascensor de su estación se avería: una notificación con el equipo y su ubicación.
- Cuando «Todo en servicio» vuelve a 1: anúncielo en el altavoz de la entrada.

## Datos y actualización

- Fuente: el conjunto «Etat de fonctionnement des équipements d'élévatique en gare» del portal de
  datos abiertos de SNCF (estados OK, KO e INCONNU) y la lista «Gares de voyageurs» para los
  nombres.
- SNCF recalcula los estados **cada hora**, a partir de los equipos y de los equipos de
  mantenimiento; no son contractuales.
- La integración lee los estados de todas sus estaciones con **una petición** por ciclo, filtrada
  sobre ellas, y la lista de estaciones una vez al día. El uso anónimo está limitado por el portal
  (algunos miles de peticiones al día): la integración se queda muy por debajo.
- París: el conjunto «Ascenseurs / Escalators - Télé-surveillance temps réel» del Ayuntamiento de
  París (`opendata.paris.fr`), alimentado por la empresa de telesupervisión en cada avería o
  reparación. Una sola petición por ciclo, de unos diez kB, para todos los distritos elegidos.

## Solución de problemas

- **Ninguna estación en la pestaña Descubrir**: pulse **Estado**. «Ninguna estación encontrada»:
  compruebe la ortografía o escriba una parte del nombre. «Ningún ascensor ni escalera mecánica
  registrados»: la estación no tiene equipos en el conjunto de datos.
- **Lista de estaciones no disponible**: el portal SNCF no respondió; la integración lo vuelve a
  intentar en el ciclo siguiente.
- **Un sensor nunca cambia**: algunos equipos permanecen mucho tiempo en estado desconocido; el
  contador «Estado desconocido» lo muestra.
- Registros: **Integraciones → Ascenseurs gares SNCF et Paris → Registros**; `LOG_LEVEL=debug` para
  cada lectura.

## Limitaciones

- Solo las estaciones gestionadas por SNCF Gares & Connexions que publican sus equipos (unas 600).
- Las estaciones de metro y RER de la RATP no están cubiertas. El estado de los ascensores de
  Île-de-France Mobilités requiere una cuenta: no se usa.
- Un estado puede tener una hora de antigüedad, a veces más: compruébelo antes de viajar si es
  importante.
- Los nombres de los equipos son los de SNCF, en francés.
- París: solo los equipos de la vía pública gestionados por el Ayuntamiento (una treintena, 25
  telesupervisados), no los del metro. Algunos siguen «averiados» desde hace meses en el conjunto
  de datos: es lo que publica el Ayuntamiento.

## Créditos

- Datos: SNCF Gares & Connexions, portal de datos abiertos de SNCF (`ressources.data.sncf.com`),
  bajo licencia ODbL.
- Construido sobre el SDK de integración de Gladys Assistant. Sin relación con SNCF.
- Datos de París: Ayuntamiento de París, `opendata.paris.fr`, bajo licencia ODbL.
