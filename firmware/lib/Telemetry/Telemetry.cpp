#include "Telemetry.h"

#include <ArduinoJson.h>

namespace Telemetry {

std::string toJson(const TelemetryState& s) {
  JsonDocument doc;
  doc["t"] = s.t;
  doc["bx"] = s.field.bx;
  doc["by"] = s.field.by;
  doc["bz"] = s.field.bz;
  doc["magnitude"] = s.magnitude;
  doc["inclination"] = s.inclination;
  doc["heading"] = s.heading;
  doc["calibrated"] = s.calibrated;
  doc["calibrating"] = s.calibrating;
  std::string out;
  serializeJson(doc, out);
  return out;
}

}  // namespace Telemetry
