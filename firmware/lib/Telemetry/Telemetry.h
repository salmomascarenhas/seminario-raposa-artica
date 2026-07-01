#pragma once

#include <string>

#include "FieldMath.h"

// Estado completo a transmitir num tick de telemetria, espelha o contrato JSON.
struct TelemetryState {
  unsigned long t;     // millis() do ESP
  MagField field;      // bx, by, bz (µT, já calibrado)
  float magnitude;     // µT
  float inclination;   // graus
  float heading;       // graus
  bool calibrated;
  bool calibrating;
};

namespace Telemetry {

// Serializa o estado no contrato JSON acordado com a camada web.
std::string toJson(const TelemetryState& s);

}  // namespace Telemetry
