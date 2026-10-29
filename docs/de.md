# Aufzüge in SNCF-Bahnhöfen

Der **Zustand der Aufzüge, Rolltreppen und Fahrsteige** der SNCF-Bahnhöfe (Frankreich), in Betrieb
oder außer Betrieb, gelesen aus dem Open-Data-Portal der SNCF. Rund 2.500 Anlagen in etwa 600
Bahnhöfen, die SNCF Gares & Connexions betreibt. **Kein Konto, kein Schlüssel.**

Inoffizielle Integration, ohne Verbindung zur SNCF. Ohne die Hardware entwickelt (und ohne eigenen
Datenstrom): die Daten wurden am 29.10.2026 live geprüft, Rückmeldungen sind willkommen.

## Was du bekommst

- Ein **Gerät pro Bahnhof**, den du hinzufügst: ein Sensor pro Aufzug, Rolltreppe oder Fahrsteig
  (1 = in Betrieb, 0 = außer Betrieb), dazu drei Übersichtssensoren: Anlagen außer Betrieb, Anlagen
  mit unbekanntem Zustand und „Alles in Betrieb“.
- Ein **Widget** „Aufzüge im Bahnhof“: die Anlagen eines Bahnhofs, gestörte zuerst, in Rot, Grau
  oder Grün.
- Zwei **Szenen-Auslöser**: ein Aufzug oder eine Rolltreppe fällt aus, eine Anlage ist wieder in
  Betrieb, für jeden Bahnhof oder die gewählten, und auf Wunsch für eine Art von Anlage.
- Eine **Szenen-Aktion**: eine Zusammenfassung in einem Satz („Toulouse Matabiau: 1 von 25 Aufzügen
  und Rolltreppen außer Betrieb (…)“), fertig für eine Nachricht oder einen Lautsprecher, mit den
  Zählern.

## Voraussetzungen

- Gladys Assistant **5.3.0** oder neuer.
- Internetzugang für Gladys: die Daten kommen von `ressources.data.sncf.com`.
- Kein Konto, kein API-Schlüssel.

## Installation

1. Öffne in Gladys **Integrationen → Von GitHub installieren**.
2. Füge die Adresse des Repositorys ein: `https://github.com/guim31/gladys-ascenseurs-gares`.
3. Bestätige und öffne die Integration nach der Installation.

## Konfiguration

### Einstellungen

| Einstellung                       | Wirkung                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Bahnhöfe                          | Die Namen deiner Bahnhöfe, durch `;` getrennt (höchstens 10), z. B. `Toulouse Matabiau; Paris Saint-Lazare`. |
| Aktualisierung                    | Alle 10, 15 (Standard) oder 30 Minuten. Die SNCF berechnet die Zustände stündlich neu.                       |
| Sprache der Namen und Nachrichten | Sprache der Übersichtssensoren, des Widgets und des Szenensatzes. Standard: Französisch.                     |

Ein Name wird ohne Akzente, Groß-/Kleinschreibung und Bindestriche verglichen (`paris st lazare`
funktioniert). Ein Teilname, zum Beispiel eine Stadt, listet ihre Bahnhöfe mit Anlagen auf
(`Marseille` ergibt Marseille Saint-Charles und Marseille Blancarde), höchstens zehn. Ein
8-stelliger UIC-Code funktioniert auch.

### Bahnhöfe hinzufügen

1. Gib deine Bahnhöfe ein und speichere.
2. Öffne den Tab **Entdecken** der Integration: jeder gefundene Bahnhof steht dort, mit allen
   seinen Anlagen.
3. Füge die gewünschten zu Gladys hinzu.

Ein hinzugefügter Bahnhof bleibt verfolgt, auch wenn du seinen Namen später aus den Einstellungen
entfernst.

### Prüfen

Die Schaltfläche **Status** der Konfiguration zeigt für jeden eingegebenen Namen die gefundenen
Bahnhöfe (oder warum keiner gefunden wurde), die Zeit der letzten Abfrage und den letzten Fehler.

## Geräte

Ein Bahnhof ist ein Gerät mit dem Namen „<Bahnhof> · Aufzüge und Rolltreppen“, nur lesbar:

| Funktion                    | Typ    | Wert                                                   |
| --------------------------- | ------ | ------------------------------------------------------ |
| Außer Betrieb               | Zähler | Anzahl der Anlagen außer Betrieb                       |
| Zustand unbekannt           | Zähler | Anzahl der Anlagen, deren Zustand die SNCF nicht kennt |
| Alles in Betrieb            | binär  | 1, wenn alle Anlagen funktionieren, sonst 0            |
| Eine pro Anlage (SNCF-Name) | binär  | 1 = in Betrieb, 0 = außer Betrieb                      |

Die Funktionen der Anlagen behalten den SNCF-Namen („Ascenseur - 11 Sortie Londres“) auf
Französisch: so steht er im Bahnhof. Kennt die SNCF den Zustand einer Anlage nicht, behält ihr
Sensor den letzten bekannten Wert und der Zähler „Zustand unbekannt“ zeigt es an. Fügt die SNCF dem
Bahnhof eine Anlage hinzu, bietet der Tab „Entdecken“ an, das Gerät zu **aktualisieren**.

## Dashboard-Widget

„Aufzüge im Bahnhof“ zeigt die Anlagen eines Bahnhofs (den ersten verfolgten, wenn keiner gewählt
ist): gestörte zuerst (Rot), unbekannte (Grau), dann die in Betrieb (Grün). Höchstens zehn Zeilen,
die übrigen werden darunter gezählt. Die Einstellung „Anlagen in Betrieb ausblenden“ zeigt nur die
Probleme.

## Szenen-Auslöser

| Auslöser                                 | Wann                                            |
| ---------------------------------------- | ----------------------------------------------- |
| Aufzug oder Rolltreppe gestört           | eine Anlage eines verfolgten Bahnhofs fällt aus |
| Aufzug oder Rolltreppe wieder in Betrieb | eine gestörte Anlage funktioniert wieder        |

Filter: die Bahnhöfe (leer = alle) und die Art der Anlage: Aufzug, Rolltreppe oder Fahrsteig
(leer = alle). Variablen: Bahnhof, Anlage, Standort, Anzahl außer Betrieb im Bahnhof, Anzahl der
Anlagen. Um **eine** Anlage zu überwachen, nutze ihre Funktion in einem Gladys-Auslöser
„Gerätezustand“.

Eine Anlage, deren Zustand unbekannt wird, löst nichts aus; eine, die von unbekannt zu in Betrieb
wechselt, auch nicht.

## Szenen-Aktion

„Aufzüge und Rolltreppen zusammenfassen“, für alle verfolgten Bahnhöfe oder die gewählten.
Ausgaben: `sentence` (Satz), `out_of_order` (außer Betrieb), `unknown` (unbekannt), `total`
(Anlagen), `all_ok` (1 = ja, 0 = nein, für einen Schritt „Nur fortfahren, wenn“).

## Szenen-Beispiele

- Jeden Morgen vor dem Losgehen: die Zusammenfassung deines Bahnhofs ausführen und den Satz per
  Telegram senden.
- Wenn ein Aufzug deines Bahnhofs ausfällt: eine Benachrichtigung mit der Anlage und ihrem Standort.
- Wenn „Alles in Betrieb“ wieder 1 ist: es über den Lautsprecher im Flur ansagen.

## Daten und Aktualisierung

- Quelle: der Datensatz „Etat de fonctionnement des équipements d'élévatique en gare“ des
  Open-Data-Portals der SNCF (Zustände OK, KO und INCONNU) und die Liste „Gares de voyageurs“ für
  die Namen.
- Die SNCF berechnet die Zustände **stündlich** neu, aus den Anlagen und den Wartungsteams; sie sind
  nicht verbindlich.
- Die Integration liest die Zustände aller deiner Bahnhöfe mit **einer Anfrage** pro Zyklus,
  gefiltert auf sie, und die Bahnhofsliste einmal pro Tag. Die anonyme Nutzung ist vom Portal
  begrenzt (einige Tausend Anfragen pro Tag): die Integration bleibt weit darunter.

## Fehlerbehebung

- **Kein Bahnhof im Tab „Entdecken“**: drücke **Status**. „Kein Bahnhof gefunden“: prüfe die
  Schreibweise oder gib einen Teil des Namens ein. „Kein Aufzug und keine Rolltreppe erfasst“: der
  Bahnhof hat keine Anlage im Datensatz.
- **Bahnhofsliste nicht verfügbar**: das SNCF-Portal hat nicht geantwortet; die Integration
  versucht es im nächsten Zyklus erneut.
- **Ein Sensor ändert sich nie**: manche Anlagen bleiben lange im unbekannten Zustand; der Zähler
  „Zustand unbekannt“ zeigt es.
- Protokolle: **Integrationen → Ascenseurs en gare SNCF → Protokolle**; `LOG_LEVEL=debug` für
  jede Abfrage.

## Einschränkungen

- Nur die Bahnhöfe von SNCF Gares & Connexions, die ihre Anlagen veröffentlichen (etwa 600).
- Metro- und RER-Stationen der RATP sind nicht abgedeckt. Der Zustand der Aufzüge von
  Île-de-France Mobilités erfordert ein Konto: nicht genutzt.
- Ein Zustand kann eine Stunde alt sein, manchmal mehr: prüfe vor der Reise, wenn es wichtig ist.
- Die Namen der Anlagen sind die der SNCF, auf Französisch.

## Danksagung

- Daten: SNCF Gares & Connexions, Open-Data-Portal der SNCF (`ressources.data.sncf.com`), unter der
  ODbL-Lizenz.
- Gebaut auf dem Integrations-SDK von Gladys Assistant. Ohne Verbindung zur SNCF.
