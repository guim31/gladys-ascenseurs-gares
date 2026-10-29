# SNCF station lifts and escalators

The **state of the lifts, escalators and moving walkways** of SNCF stations (France), in service or
out of order, read from the SNCF open data portal. About 2,500 pieces of equipment in some 600
stations managed by SNCF Gares & Connexions. **No account, no key.**

Unofficial integration, not affiliated with SNCF. Developed without the hardware (and without a
dedicated feed): the data was checked live on 2026-10-29, feedback is welcome.

## What you get

- One **device per station** you add: one sensor per lift, escalator or moving walkway (1 = in
  service, 0 = out of order), plus three summary sensors: equipment out of order, equipment in an
  unknown state, and "All in service".
- A **widget** "Station lifts and escalators": the equipment of a station, out of order first, in
  red, grey or green.
- Two **scene triggers**: a lift or escalator goes out of order, and one comes back in service, for
  any station or the ones you pick, and for one kind of equipment if you want.
- A **scene action**: a one-sentence summary ("Toulouse Matabiau: 1 of 25 lifts and escalators out
  of order (…)"), ready for a message or a speaker, with the counts.

## Requirements

- Gladys Assistant **5.3.0** or later.
- Internet access from Gladys: the data comes from `ressources.data.sncf.com`.
- No account, no API key.

## Installation

1. In Gladys, open **Integrations → Install from GitHub**.
2. Paste the address of the repository: `https://github.com/guim31/gladys-ascenseurs-gares`.
3. Confirm, then open the integration once it is installed.

## Configuration

### Settings

| Setting                        | What it does                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Stations                       | The names of your stations, separated by `;` (10 at most), e.g. `Toulouse Matabiau; Paris Saint-Lazare`. |
| Refresh                        | Every 10, 15 (default) or 30 minutes. SNCF recomputes the states every hour.                             |
| Language of names and messages | Language of the summary feature names, of the widget and of the scene sentence. French by default.       |

A name is matched without accents, case or hyphens (`paris st lazare` works). A partial name, a city
for instance, lists its stations that have equipment (`Marseille` gives Marseille Saint-Charles and
Marseille Blancarde), ten at most. An 8-digit UIC code also works.

### Add stations

1. Type your stations and save.
2. Open the **Discover** tab of the integration: every station found is there, with all its
   equipment.
3. Add the ones you want to Gladys.

A station added stays followed even if you remove its name from the settings later.

### Check

The **Status** button of the configuration shows, for each name typed, the stations found (or why
none was), the time of the last reading and the last error.

## Devices

A station is a device named "<station> · lifts and escalators", read-only:

| Feature                       | Type    | Value                                              |
| ----------------------------- | ------- | -------------------------------------------------- |
| Out of order                  | counter | number of equipment out of order                   |
| Unknown state                 | counter | number of equipment whose state SNCF does not know |
| All in service                | binary  | 1 when every equipment is known to work, else 0    |
| One per equipment (SNCF name) | binary  | 1 = in service, 0 = out of order                   |

The equipment features keep the SNCF name ("Ascenseur - 11 Sortie Londres"), in French: it is the
name shown in the station. When SNCF does not know the state of an equipment, its sensor keeps the
last known value and the "Unknown state" counter says so. If SNCF adds an equipment to the station,
the Discover tab offers to **update** the device.

## Dashboard widget

"Station lifts and escalators" shows the equipment of one station (the first followed one if none is
picked): out of order first (red), unknown (grey), then in service (green). Ten rows at most, the
others are counted below. The setting "Hide equipment in service" keeps only the problems. When the
SNCF portal has not answered for three hours, the widget says so.

## Scene triggers

| Trigger                           | When                                                 |
| --------------------------------- | ---------------------------------------------------- |
| Lift or escalator out of order    | an equipment of a followed station goes out of order |
| Lift or escalator back in service | an equipment that was out of order works again       |

Filters: the stations (empty = any) and the kind of equipment: lift, escalator or moving walkway
(empty = any). Variables: station, equipment, location, number out of order in the station, number
of equipment. To watch **one** equipment, use its feature in a Gladys "device state" trigger.

An unknown state is skipped: the triggers compare with the last state known. Out of order → unknown
→ out of order fires nothing; out of order → unknown → in service fires "back in service".

## Scene action

"Summarize lifts and escalators", for every followed station or the ones picked. Outputs:
`sentence`, `out_of_order`, `unknown`, `total`, `all_ok` (1 = yes, 0 = no, for a "Continue only if"
step).

## Scene examples

- Every morning before leaving: run the summary for your station, then send the sentence by Telegram.
- When a lift of your station goes out of order: a notification with the equipment and its location.
- On "All in service" back to 1: say it on the speaker of the hall.

## Data and refresh

- Source: the dataset "Etat de fonctionnement des équipements d'élévatique en gare" of the SNCF open
  data portal (states OK, KO and INCONNU), and the station list "Gares de voyageurs" for the names.
- SNCF recomputes the states **every hour**, from the equipment and the maintenance teams; they are
  not contractual.
- The integration reads the states of all your stations in **one request** per cycle, filtered on
  them, and the station list once a day. Anonymous use is limited by the portal (a few thousand
  requests a day): the integration stays far below.

## Troubleshooting

- **No station in the Discover tab**: press **Status**. "No station found": check the spelling, or
  type part of the name. "No lift or escalator listed": the station has no equipment in the dataset.
- **Station list unavailable**: the SNCF portal did not answer; the integration tries again at the
  next cycle.
- **A sensor never changes**: some equipment stays in an unknown state for a long time; the "Unknown
  state" counter shows it.
- Logs: **Integrations → Ascenseurs en gare SNCF → Logs**; set `LOG_LEVEL=debug` for every reading.

## Limitations

- Only the stations managed by SNCF Gares & Connexions that publish their equipment (about 600).
- Metro and RER stations of the RATP are not covered. The state of the lifts of Île-de-France
  Mobilités needs an account: not used.
- A state can be up to an hour old, sometimes more: check before travelling if it matters.
- The equipment names are those of SNCF, in French.

## Credits

- Data: SNCF Gares & Connexions, SNCF open data portal (`ressources.data.sncf.com`), under the
  ODbL licence.
- Built on the Gladys Assistant integration SDK. Not affiliated with SNCF.
