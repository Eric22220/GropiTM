# Formatul exportului Sensor Logger (verificat pe exporturile reale din `sample-data/sensorlogger/`)

Aplicație: Sensor Logger 1.68.1 (iOS 18.7.8 pe iPhone 14; Android 37 pe SM-S948B). Export: **ZIP (CSV)**.

## Arhiva
- Fișierele CSV sunt la rădăcină (importul le caută după nume, indiferent de subfolder).
- **ZIP64:** antetele locale și centrale au dimensiunile `0xFFFFFFFF`, iar valorile reale sunt în câmpul extra `0x0001` (8 octeți dimensiunea necomprimată, 8 octeți cea comprimată). Flag `0x080c` (data descriptor + UTF-8). `unzipSync` din fflate încearcă să aloce 4 GB în browser pe aceste fișiere; ShockGrid citește singur directorul central (`src/core/io/zip.ts`) și folosește fflate doar pentru inflate.
- Fișierele senzorilor neactivați sau goi au 0 octeți (ex. `Accelerometer.csv`, `Gravity.csv`, `Gyroscope.csv`, `Annotation.csv` pe iPhone) deși `Metadata.csv` îi listează ca activi. Un fișier gol = senzor absent.

## Timpul
- `time` = **nanosecunde epoch** (ex. `1794612229287261400`), peste 2^53: se convertește în ms separând ultimele 6 cifre (`src/core/time.ts`).
- `seconds_elapsed` = secunde relative la start (poate fi negativ la primul fix GPS).

## Accelerația și giroscopul
| Fișier | iPhone (iOS) | Samsung (Android) | Folosit |
|---|---|---|---|
| `AccelerometerUncalibrated.csv` | **g**, cu gravitație, 100 Hz, fără goluri | m/s², identic cu TotalAcceleration, ~58,5 Hz | iOS: da (× 9,80665) |
| `TotalAcceleration.csv` | — | **m/s²**, cu gravitație, ~58,5 Hz | Android: da |
| `Accelerometer.csv` | gol | fără gravitație, pas fix 10,0 ms (virtual) | nu pentru RVI |
| `Gravity.csv` | gol | pas fix 10,0 ms (virtual) | nu (rezervă cu avertisment) |
| `Gyroscope.csv` | gol | rad/s, ~58,5 Hz | da dacă are date |
| `GyroscopeUncalibrated.csv` | rad/s, 100 Hz | rad/s | rezervă |

Coloane: `time,seconds_elapsed,z,y,x` (citite după nume). Unitatea se detectează din mediana modulului: ~1 → g, ~9,81 → m/s², altceva → eroare explicită.

## Location.csv
- iOS: `time,seconds_elapsed,altitude,speedAccuracy,bearingAccuracy,latitude,altitudeAboveMeanSeaLevel,bearing,horizontalAccuracy,verticalAccuracy,longitude,speed`, ~1 Hz.
- Android: `time,seconds_elapsed,mslAltitudeAccuracy,bearingAccuracy,speedAccuracy,verticalAccuracy,horizontalAccuracy,speed,altitudeAboveMeanSeaLevel,bearing,altitude,longitude,latitude`, ~1,3–1,6 Hz, câmpuri goale posibile.
- `speed`, `bearing`, `speedAccuracy`, `bearingAccuracy` = **−1 când sunt invalide** → `null`. Câmp gol → `null`.

## Metadata.csv
`version,device name,recording epoch time,recording time,recording timezone,platform,appVersion,device id,sensors,sampleRateMs,standardisation,platform version`. `ride_id` = hash(`device id` + `recording epoch time`); `device id` nu se publică niciodată.

## Annotation.csv
Pe exporturile disponibile e gol. Importul ia coloana `time` și concatenează celelalte coloane ca text al adnotării (eveniment `annotation`). **Formatul exact trebuie verificat pe un export cu adnotări.**

## Rezultatul `npm run inspect` pe exporturile reale
```
iphone14-2026-11-13_23-23-49.zip: ios, iPhone 14, unitate g, AccelerometerUncalibrated + GyroscopeUncalibrated
  238,4 s, 23877 mostre, 100,2 Hz, 0 goluri > 100 ms (maxim 14 ms), 237 fixuri (0,99 Hz),
  precizie mediană 6,8 m, 169 fixuri ≤ 20 m, distanță 6,0 m (din viteză), gravitație estimată 9,810 m/s²
samsung-2026-11-14_00-10-08.zip: android, SM-S948B, unitate m/s², TotalAcceleration + Gyroscope
  49,5 s, 2894 mostre, 58,5 Hz, 0 goluri, 72 fixuri (1,55 Hz), precizie mediană 4,0 m, 68 fixuri ≤ 20 m,
  distanță 0,0 m (viteze < 0,5 m/s), gravitație estimată 9,766 m/s²
```
