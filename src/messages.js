// -----------------------------------------------------------------------------
// Texts sent from the container (feature names, action messages, widget
// contents, scene outputs), in the four languages of the Gladys interface.
// Entries are strings or functions of one parameter object. German says "du",
// Spanish "usted". Station and equipment names never translate.
// -----------------------------------------------------------------------------

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

// Device suffix and summary feature names, frozen when the device is created
// (configured language).
export const NAMES = {
  en: {
    device: 'lifts and escalators',
    out_of_order: 'Out of order',
    unknown: 'Unknown state',
    all_ok: 'All in service',
  },
  fr: {
    device: 'ascenseurs et escalators',
    out_of_order: 'En panne',
    unknown: 'État inconnu',
    all_ok: 'Tout en service',
  },
  de: {
    device: 'Aufzüge und Rolltreppen',
    out_of_order: 'Außer Betrieb',
    unknown: 'Zustand unbekannt',
    all_ok: 'Alles in Betrieb',
  },
  es: {
    device: 'ascensores y escaleras mecánicas',
    out_of_order: 'Fuera de servicio',
    unknown: 'Estado desconocido',
    all_ok: 'Todo en servicio',
  },
};

/** The labels of the equipment out of order, for a sentence: three at most. */
const listOf = (labels) =>
  labels.length > 3 ? `${labels.slice(0, 3).join(' ; ')} ; …` : labels.join(' ; ');
const listEn = (labels) =>
  labels.length > 3 ? `${labels.slice(0, 3).join('; ')}; …` : labels.join('; ');

// Widget contents and scene outputs.
export const TEXT = {
  en: {
    ok: 'in service',
    ko: 'out of order',
    unknown: 'unknown state',
    waiting: 'not read yet',
    sentence: ({ name, ko, unknown, total, labels }) => {
      if (ko > 0) {
        return `${name}: ${ko} of ${total} lifts and escalators out of order (${listEn(labels)}).`;
      }
      if (unknown > 0) {
        return `${name}: none reported out of order, ${unknown} of ${total} in an unknown state.`;
      }
      return total === 1
        ? `${name}: the only lift or escalator is in service.`
        : `${name}: all ${total} lifts and escalators are in service.`;
    },
    noData: ({ name }) => `${name}: state of the equipment not known yet.`,
    stale: 'Data more than 3 hours old: SNCF portal unreachable.',
    staleParis: 'Data more than 3 hours old: City of Paris portal unreachable.',
    allOk: 'Every lift and escalator is in service.',
    more: ({ count }) => `+ ${count} more`,
    pickStation:
      'Add a station or a district of Paris in the Discover tab of the integration, then pick it here.',
    gone: 'This station is no longer followed.',
    noStation:
      'No station nor district of Paris is followed: add one in the Discover tab of the integration.',
  },
  fr: {
    ok: 'en service',
    ko: 'en panne',
    unknown: 'état inconnu',
    waiting: 'pas encore lu',
    sentence: ({ name, ko, unknown, total, labels }) => {
      if (ko > 0) {
        return `${name} : ${ko} équipement${ko > 1 ? 's' : ''} sur ${total} en panne (${listOf(labels)}).`;
      }
      if (unknown > 0) {
        return `${name} : aucune panne signalée, ${unknown} équipement${unknown > 1 ? 's' : ''} sur ${total} à l'état inconnu.`;
      }
      return total === 1
        ? `${name} : le seul équipement est en service.`
        : `${name} : les ${total} équipements sont en service.`;
    },
    noData: ({ name }) => `${name} : état des équipements pas encore connu.`,
    stale: 'Données de plus de 3 h : portail SNCF injoignable.',
    staleParis: 'Données de plus de 3 h : portail de la Ville de Paris injoignable.',
    allOk: 'Tous les ascenseurs et escalators sont en service.',
    more: ({ count }) => `+ ${count} autre${count > 1 ? 's' : ''}`,
    pickStation:
      "Ajoutez une gare ou un arrondissement de Paris dans l'onglet Découverte de l'intégration, puis choisissez-le ici.",
    gone: "Cette gare n'est plus suivie.",
    noStation:
      "Aucune gare ni aucun arrondissement de Paris n'est suivi : ajoutez-en un dans l'onglet Découverte de l'intégration.",
  },
  de: {
    ok: 'in Betrieb',
    ko: 'außer Betrieb',
    unknown: 'Zustand unbekannt',
    waiting: 'noch nicht abgefragt',
    sentence: ({ name, ko, unknown, total, labels }) => {
      if (ko > 0) {
        return `${name}: ${ko} von ${total} Aufzügen und Rolltreppen außer Betrieb (${listEn(labels)}).`;
      }
      if (unknown > 0) {
        return `${name}: keine Störung gemeldet, Zustand von ${unknown} der ${total} Anlagen unbekannt.`;
      }
      return total === 1
        ? `${name}: die einzige Anlage ist in Betrieb.`
        : `${name}: alle ${total} Aufzüge und Rolltreppen sind in Betrieb.`;
    },
    noData: ({ name }) => `${name}: Zustand der Anlagen noch nicht bekannt.`,
    stale: 'Daten älter als 3 Stunden: SNCF-Portal nicht erreichbar.',
    staleParis: 'Daten älter als 3 Stunden: Portal der Stadt Paris nicht erreichbar.',
    allOk: 'Alle Aufzüge und Rolltreppen sind in Betrieb.',
    more: ({ count }) => `+ ${count} weitere`,
    pickStation:
      'Füge einen Bahnhof oder ein Pariser Arrondissement im Tab „Entdecken“ der Integration hinzu und wähle es hier.',
    gone: 'Dieser Bahnhof wird nicht mehr verfolgt.',
    noStation:
      'Weder Bahnhof noch Pariser Arrondissement wird verfolgt: füge eines im Tab „Entdecken“ der Integration hinzu.',
  },
  es: {
    ok: 'en servicio',
    ko: 'fuera de servicio',
    unknown: 'estado desconocido',
    waiting: 'aún no leído',
    sentence: ({ name, ko, unknown, total, labels }) => {
      if (ko > 0) {
        return `${name}: ${ko} de ${total} ascensores y escaleras mecánicas fuera de servicio (${listEn(labels)}).`;
      }
      if (unknown > 0) {
        return `${name}: ninguna avería señalada, estado desconocido para ${unknown} de ${total}.`;
      }
      return total === 1
        ? `${name}: el único equipo está en servicio.`
        : `${name}: los ${total} ascensores y escaleras mecánicas están en servicio.`;
    },
    noData: ({ name }) => `${name}: estado de los equipos aún desconocido.`,
    stale: 'Datos de más de 3 horas: portal SNCF inaccesible.',
    staleParis: 'Datos de más de 3 horas: portal del Ayuntamiento de París inaccesible.',
    allOk: 'Todos los ascensores y escaleras mecánicas están en servicio.',
    more: ({ count }) => `+ ${count} más`,
    pickStation:
      'Añada una estación o un distrito de París en la pestaña Descubrir de la integración y luego elíjalo aquí.',
    gone: 'Esta estación ya no se sigue.',
    noStation:
      'No se sigue ninguna estación ni distrito de París: añada uno en la pestaña Descubrir de la integración.',
  },
};

// Answer of the "Status" configuration action.
export const REPORTS = {
  en: {
    noStation:
      'No station typed nor district chosen: type the name of a station or tick a district of Paris above, then save.',
    found: ({ query, names }) => `■ "${query}": ${names}`,
    none: ({ query }) => `■ "${query}": no station found.`,
    noEquipment: ({ query }) => `■ "${query}": no lift or escalator listed by SNCF.`,
    more: 'Only the first 10: type a more precise name.',
    listError: ({ error }) => `Station list unavailable: ${error}`,
    read: ({ age }) => `Last reading ${age} min ago.`,
    waiting: 'Not read yet.',
    error: ({ error }) => `Last error: ${error}`,
    watched: ({ count }) => `${count} device${count === 1 ? '' : 's'} added to Gladys.`,
    district: ({ name, count }) =>
      `■ ${name}: ${count} remotely monitored lift${count === 1 ? '' : 's'} or escalator${count === 1 ? '' : 's'}`,
    noDistrictEquipment: ({ name }) =>
      `■ ${name}: no remotely monitored lift or escalator listed by the City of Paris.`,
    parisRead: ({ age }) => `City of Paris: last reading ${age} min ago.`,
    parisWaiting: 'City of Paris: not read yet.',
    parisError: ({ error }) => `City of Paris, last error: ${error}`,
  },
  fr: {
    noStation:
      "Aucune gare saisie ni arrondissement choisi : tapez le nom d'une gare ou cochez un arrondissement de Paris ci-dessus, puis enregistrez.",
    found: ({ query, names }) => `■ « ${query} » : ${names}`,
    none: ({ query }) => `■ « ${query} » : aucune gare trouvée.`,
    noEquipment: ({ query }) => `■ « ${query} » : aucun ascenseur ni escalator recensé par SNCF.`,
    more: 'Les 10 premières seulement : précisez le nom.',
    listError: ({ error }) => `Liste des gares indisponible : ${error}`,
    read: ({ age }) => `Dernière lecture il y a ${age} min.`,
    waiting: 'Pas encore lu.',
    error: ({ error }) => `Dernière erreur : ${error}`,
    watched: ({ count }) =>
      `${count} appareil${count > 1 ? 's' : ''} ajouté${count > 1 ? 's' : ''} à Gladys.`,
    district: ({ name, count }) =>
      `■ ${name} : ${count} ascenseur${count > 1 ? 's' : ''} ou escalator${count > 1 ? 's' : ''} télésurveillé${count > 1 ? 's' : ''}`,
    noDistrictEquipment: ({ name }) =>
      `■ ${name} : aucun ascenseur ni escalator télésurveillé recensé par la Ville de Paris.`,
    parisRead: ({ age }) => `Ville de Paris : dernière lecture il y a ${age} min.`,
    parisWaiting: 'Ville de Paris : pas encore lu.',
    parisError: ({ error }) => `Ville de Paris, dernière erreur : ${error}`,
  },
  de: {
    noStation:
      'Kein Bahnhof eingegeben und kein Arrondissement gewählt: gib oben einen Bahnhof ein oder wähle ein Pariser Arrondissement und speichere.',
    found: ({ query, names }) => `■ „${query}“: ${names}`,
    none: ({ query }) => `■ „${query}“: kein Bahnhof gefunden.`,
    noEquipment: ({ query }) => `■ „${query}“: kein Aufzug und keine Rolltreppe bei SNCF erfasst.`,
    more: 'Nur die ersten 10: gib einen genaueren Namen ein.',
    listError: ({ error }) => `Bahnhofsliste nicht verfügbar: ${error}`,
    read: ({ age }) => `Letzte Abfrage vor ${age} min.`,
    waiting: 'Noch nicht abgefragt.',
    error: ({ error }) => `Letzter Fehler: ${error}`,
    watched: ({ count }) => `${count} ${count === 1 ? 'Gerät' : 'Geräte'} zu Gladys hinzugefügt.`,
    district: ({ name, count }) =>
      `■ ${name}: ${count} fernüberwachte ${count === 1 ? 'Anlage' : 'Anlagen'} (Aufzüge, Rolltreppen)`,
    noDistrictEquipment: ({ name }) =>
      `■ ${name}: kein fernüberwachter Aufzug und keine Rolltreppe bei der Stadt Paris erfasst.`,
    parisRead: ({ age }) => `Stadt Paris: letzte Abfrage vor ${age} min.`,
    parisWaiting: 'Stadt Paris: noch nicht abgefragt.',
    parisError: ({ error }) => `Stadt Paris, letzter Fehler: ${error}`,
  },
  es: {
    noStation:
      'Ninguna estación introducida ni distrito elegido: escriba una estación o marque un distrito de París arriba y guarde.',
    found: ({ query, names }) => `■ «${query}»: ${names}`,
    none: ({ query }) => `■ «${query}»: ninguna estación encontrada.`,
    noEquipment: ({ query }) =>
      `■ «${query}»: ningún ascensor ni escalera mecánica registrados por SNCF.`,
    more: 'Solo las 10 primeras: escriba un nombre más preciso.',
    listError: ({ error }) => `Lista de estaciones no disponible: ${error}`,
    read: ({ age }) => `Última lectura hace ${age} min.`,
    waiting: 'Aún no leído.',
    error: ({ error }) => `Último error: ${error}`,
    watched: ({ count }) =>
      `${count} dispositivo${count === 1 ? '' : 's'} añadido${count === 1 ? '' : 's'} a Gladys.`,
    district: ({ name, count }) =>
      `■ ${name}: ${count} ${count === 1 ? 'equipo telesupervisado' : 'equipos telesupervisados'} (ascensores, escaleras mecánicas)`,
    noDistrictEquipment: ({ name }) =>
      `■ ${name}: ningún ascensor ni escalera mecánica telesupervisados registrados por el Ayuntamiento de París.`,
    parisRead: ({ age }) => `Ayuntamiento de París: última lectura hace ${age} min.`,
    parisWaiting: 'Ayuntamiento de París: aún no leído.',
    parisError: ({ error }) => `Ayuntamiento de París, último error: ${error}`,
  },
};

/** One text of a table, in a language (English when missing). */
export function say(table, language, key, params = {}) {
  const entry = table[language]?.[key] ?? table.en[key];
  return typeof entry === 'function' ? entry(params) : entry;
}

/** The same text in every language of the table: `{ en, fr, de, es }`. */
export function render(table, key, params = {}) {
  return Object.fromEntries(
    Object.keys(table).map((language) => [language, say(table, language, key, params)]),
  );
}

/** Joins rendered messages (or plain strings), language by language, one per line. */
export function lines(...messages) {
  const languages = Object.keys(messages.find((m) => typeof m === 'object' && m) ?? { en: '' });
  return Object.fromEntries(
    languages.map((language) => [
      language,
      messages
        .filter((message) => message !== null && message !== undefined)
        .map((message) => (typeof message === 'string' ? message : message[language]))
        .join('\n'),
    ]),
  );
}
